import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Validates the server secret for secure Convex action calls.
 */
const validateServerSecret = (serverSecret: string) => {
  const expectedSecret = process.env.CONVEX_SERVER_SECRET;
  if (!expectedSecret || serverSecret !== expectedSecret) {
    throw new Error("Unauthorized: Invalid server secret");
  }
};

// Fixed bundle price
const BUNDLE_USD = 3;
const BUNDLE_CREDITS = 300;

/**
 * Create a new invoice for credit purchase.
 * Accepts pre-computed values from the API route (which calls LND).
 */
export const createInvoice = mutation({
  args: {
    sid: v.string(),
    amountSats: v.number(),
    bolt11: v.string(),
    paymentHash: v.string(),
  },
  handler: async (ctx, args) => {
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
    const invoiceId = crypto.randomUUID();

    // Create invoice record with real LND data
    await ctx.db.insert("invoices", {
      invoiceId,
      sid: args.sid,
      amountUsd: BUNDLE_USD,
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
      amountUsd: BUNDLE_USD,
      amountSats: args.amountSats,
      expiresAt,
      credits: BUNDLE_CREDITS,
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
    const newCredits = session.credits + BUNDLE_CREDITS;
    const nextTier = session.tier === "admin" ? "admin" : "paid";
    await ctx.db.patch(session._id, {
      credits: newCredits,
      tier: nextTier,
    });

    // Record in credit ledger
    await ctx.db.insert("creditLedger", {
      sid: invoice.sid,
      delta: BUNDLE_CREDITS,
      reason: "purchase",
      createdAt: now,
    });

    return {
      success: true,
      newBalance: newCredits,
      creditsAdded: BUNDLE_CREDITS,
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
  },
  handler: async (ctx, args) => {
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
