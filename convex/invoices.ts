import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { validateServerSecret } from "./_helpers/auth";

function getBundleCredits(amountUsd: number): number {
  if (amountUsd === 1 || amountUsd === 3) {
    return amountUsd * 100;
  }

  throw new Error("Unsupported credit bundle");
}

/**
 * Create a new invoice for credit purchase.
 * Accepts pre-computed values from the API route (which calls LND).
 */
export const createInvoice = mutation({
  args: {
    invoiceId: v.string(),
    sid: v.string(),
    amountUsd: v.union(v.literal(1), v.literal(3)),
    amountSats: v.number(),
    bolt11: v.string(),
    paymentHash: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    // Verify session exists
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (!session) {
      throw new Error("Session not found");
    }

    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000; // 15 minutes
    const invoiceId = args.invoiceId;
    const credits = getBundleCredits(args.amountUsd);

    // Create invoice record with real LND data
    await ctx.db.insert("invoices", {
      invoiceId,
      sid: args.sid,
      amountUsd: args.amountUsd,
      amountSats: args.amountSats,
      bolt11: args.bolt11,
      paymentHash: args.paymentHash,
      status: "pending",
      createdAt: now,
      expiresAt,
    });

    return {
      invoiceId,
      bolt11: args.bolt11,
      amountUsd: args.amountUsd,
      amountSats: args.amountSats,
      expiresAt,
      credits,
    };
  },
});

/**
 * Get invoice by ID.
 */
export const getInvoice = query({
  args: {
    invoiceId: v.string(),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.invoiceId))
      .first();

    if (!invoice) {
      return null;
    }

    return {
      invoiceId: invoice.invoiceId,
      sid: invoice.sid,
      status: invoice.status,
      amountUsd: invoice.amountUsd,
      amountSats: invoice.amountSats,
      bolt11: invoice.bolt11,
      paymentHash: invoice.paymentHash,
      expiresAt: invoice.expiresAt,
      paidAt: invoice.paidAt,
    };
  },
});

/**
 * Get all invoices for a session.
 */
export const getSessionInvoices = query({
  args: {
    sid: v.string(),
  },
  handler: async (ctx, args) => {
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .order("desc")
      .collect();

    return invoices.map((inv) => ({
      invoiceId: inv.invoiceId,
      status: inv.status,
      amountUsd: inv.amountUsd,
      createdAt: inv.createdAt,
      paidAt: inv.paidAt,
    }));
  },
});

/**
 * Internal mutation to confirm payment and grant credits.
 * Only callable from Convex actions after server secret validation.
 */
export const confirmPaymentInternal = internalMutation({
  args: {
    invoiceId: v.string(),
    paymentHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.invoiceId))
      .first();

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    if (invoice.status === "paid") {
      return { success: true, alreadyPaid: true };
    }

    if (invoice.status === "expired" || invoice.status === "failed") {
      throw new Error(`Invoice is ${invoice.status}`);
    }

    const now = Date.now();

    // Check expiration
    if (now > invoice.expiresAt) {
      await ctx.db.patch(invoice._id, { status: "expired" });
      throw new Error("Invoice has expired");
    }

    // Mark invoice as paid
    await ctx.db.patch(invoice._id, {
      status: "paid",
      paidAt: now,
      ...(args.paymentHash !== undefined && { paymentHash: args.paymentHash }),
    });

    // Get session
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", invoice.sid))
      .first();

    if (!session) {
      throw new Error("Session not found");
    }

    // Add credits to session
    const creditsToAdd = getBundleCredits(invoice.amountUsd);
    const newCredits = session.credits + creditsToAdd;
    const nextTier = session.tier === "admin" ? "admin" : "paid";
    await ctx.db.patch(session._id, {
      credits: newCredits,
      tier: nextTier,
    });

    // Record in credit ledger
    await ctx.db.insert("creditLedger", {
      sid: invoice.sid,
      delta: creditsToAdd,
      reason: "purchase",
      createdAt: now,
    });

    return {
      success: true,
      newBalance: newCredits,
      creditsAdded: creditsToAdd,
    };
  },
});

/**
 * Public action to confirm payment and grant credits.
 * Validates server secret before calling internal mutation.
 */
export const confirmPayment = action({
  args: {
    invoiceId: v.string(),
    paymentHash: v.optional(v.string()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    alreadyPaid?: boolean;
    newBalance?: number;
    creditsAdded?: number;
  }> => {
    validateServerSecret(args.serverSecret);
    return ctx.runMutation(internal.invoices.confirmPaymentInternal, {
      invoiceId: args.invoiceId,
      paymentHash: args.paymentHash,
    });
  },
});

/**
 * Mark an invoice as expired or canceled.
 * Called when LND reports the invoice is canceled or has expired.
 */
export const expireInvoice = mutation({
  args: {
    invoiceId: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.invoiceId))
      .first();

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    // Only expire if still pending
    if (invoice.status === "pending") {
      await ctx.db.patch(invoice._id, { status: "expired" });
    }

    return { success: true };
  },
});
