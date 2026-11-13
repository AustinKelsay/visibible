import { authenticatedGuest } from "./guestAuth";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { validateServerSecret } from "./_helpers/auth";
import { recoveryReplacement } from "./sessionRecovery";

function getBundleCredits(amountUsd: number): number {
  if (amountUsd === 1 || amountUsd === 3) {
    return amountUsd * 100;
  }

  throw new Error("Unsupported credit bundle");
}

/** How long an intent may sit in "creating" before a retry stops waiting for the first attempt. */
const INTENT_IN_PROGRESS_MS = 30_000;

/**
 * Save a purchase intent before the LNURL-pay callback is asked for an invoice.
 * A repeated intent gets its saved invoice. One whose first attempt has no known outcome is
 * reported unresolved and never asks the node again: the callback has no lookup by intent,
 * so a second request could leave two invoices for one purchase.
 */
export const beginInvoice = mutation({
  args: {
    sid: v.string(),
    intentId: v.string(),
    invoiceId: v.string(),
    amountUsd: v.union(v.literal(1), v.literal(3)),
    // The sats quote for a new intent. Without it a new intent answers "quote" and saves nothing,
    // so a repeated intent can be answered while the price feed is down.
    amountSats: v.optional(v.number()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const session = await ctx.db.query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid)).first();
    if (!session || session.revokedAt !== undefined) throw new Error("Session not found");
    if (await recoveryReplacement(ctx, args.sid)) {
      throw new Error("Session replaced by recovery; reload before buying credits");
    }

    const now = Date.now();
    const intent = await ctx.db.query("invoiceIntents")
      .withIndex("by_sid_intentId", (q) => q.eq("sid", args.sid).eq("intentId", args.intentId))
      .unique();
    if (!intent) {
      if (args.amountSats === undefined) return { outcome: "quote" as const };
      await ctx.db.insert("invoiceIntents", {
        sid: args.sid, intentId: args.intentId, invoiceId: args.invoiceId,
        amountUsd: args.amountUsd, amountSats: args.amountSats,
        status: "creating", createdAt: now, updatedAt: now,
      });
      return { outcome: "create" as const, invoiceId: args.invoiceId, amountSats: args.amountSats };
    }
    if (intent.amountUsd !== args.amountUsd) return { outcome: "conflict" as const };
    if (intent.status === "created") {
      const invoice = await ctx.db.query("invoices")
        .withIndex("by_invoiceId", (q) => q.eq("invoiceId", intent.invoiceId)).unique();
      if (!invoice) throw new Error("Saved invoice unavailable");
      return {
        outcome: "existing" as const,
        invoice: {
          invoiceId: invoice.invoiceId, bolt11: invoice.bolt11, amountUsd: invoice.amountUsd,
          amountSats: invoice.amountSats, expiresAt: invoice.expiresAt,
          credits: getBundleCredits(invoice.amountUsd),
        },
      };
    }
    if (intent.status === "failed") {
      // The pay server refused the request, so no invoice exists: ask again with the same quote.
      await ctx.db.patch(intent._id, { status: "creating", updatedAt: now });
      return { outcome: "create" as const, invoiceId: intent.invoiceId, amountSats: intent.amountSats };
    }
    if (intent.status === "creating" && now - intent.updatedAt < INTENT_IN_PROGRESS_MS) {
      return { outcome: "in_progress" as const };
    }
    if (intent.status === "creating") {
      await ctx.db.patch(intent._id, { status: "unresolved", updatedAt: now });
    }
    return { outcome: "unresolved" as const };
  },
});

/** Record how an invoice request ended when no invoice was saved. */
export const closeInvoiceIntent = mutation({
  args: {
    sid: v.string(),
    intentId: v.string(),
    status: v.union(v.literal("failed"), v.literal("unresolved")),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const intent = await ctx.db.query("invoiceIntents")
      .withIndex("by_sid_intentId", (q) => q.eq("sid", args.sid).eq("intentId", args.intentId))
      .unique();
    if (intent?.status === "creating") {
      await ctx.db.patch(intent._id, { status: args.status, updatedAt: Date.now() });
    }
    return null;
  },
});

/** Operator view of purchase intents that did not end in a saved invoice (see PAYMENTS.md). */
export const listOpenInvoiceIntents = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = [];
    for (const status of ["unresolved", "creating", "failed"]) {
      rows.push(...await ctx.db.query("invoiceIntents")
        .withIndex("by_status", (q) => q.eq("status", status)).order("desc").take(50));
    }
    return rows.map((row) => ({
      intentId: row.intentId, invoiceId: row.invoiceId, sid: row.sid, status: row.status,
      amountUsd: row.amountUsd, amountSats: row.amountSats,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    }));
  },
});

/**
 * Create a new invoice for credit purchase.
 * Accepts pre-computed values from the API route (which creates the Lightning invoice).
 */
export const createInvoice = mutation({
  args: {
    invoiceId: v.string(),
    intentId: v.optional(v.string()),
    sid: v.string(),
    amountUsd: v.union(v.literal(1), v.literal(3)),
    amountSats: v.number(),
    bolt11: v.string(),
    paymentHash: v.string(),
    expiresAt: v.number(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    // Verify session exists
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (!session || session.revokedAt !== undefined) {
      throw new Error("Session not found");
    }
    // This read and insertion are atomic with redemption's grant write and
    // invoice check. Whichever commits first prevents the conflicting operation.
    if (await recoveryReplacement(ctx, args.sid)) {
      throw new Error("Session replaced by recovery; reload before buying credits");
    }

    const now = Date.now();
    const expiresAt = args.expiresAt; // from the Lightning invoice, so the UI never hides a payable invoice
    const invoiceId = args.invoiceId;
    const credits = getBundleCredits(args.amountUsd);

    // The invoice must be the one its intent asked for, and each payment hash backs one invoice.
    const intentId = args.intentId;
    const intent = intentId === undefined ? null : await ctx.db.query("invoiceIntents")
      .withIndex("by_sid_intentId", (q) => q.eq("sid", args.sid).eq("intentId", intentId))
      .unique();
    if (intentId !== undefined && (!intent || intent.status !== "creating" ||
        intent.invoiceId !== invoiceId || intent.amountUsd !== args.amountUsd ||
        intent.amountSats !== args.amountSats)) {
      throw new Error("Invoice does not match its purchase intent");
    }
    const sameHash = await ctx.db.query("invoices")
      .withIndex("by_paymentHash", (q) => q.eq("paymentHash", args.paymentHash)).first();
    if (sameHash) throw new Error("Payment hash already belongs to an invoice");
    if (intent) await ctx.db.patch(intent._id, { status: "created", updatedAt: now });

    // Create invoice record with real Lightning invoice data
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
    serverSecret: v.optional(v.string()),
    invoiceId: v.string(),
    ownerSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.serverSecret !== undefined) validateServerSecret(args.serverSecret);
    const guest = args.serverSecret === undefined ? await authenticatedGuest(ctx) : null;
    if (args.serverSecret === undefined && !guest) return null;
    if (args.ownerSid !== undefined) {
      const owner = await ctx.db.query("sessions")
        .withIndex("by_sid", (q) => q.eq("sid", args.ownerSid!)).unique();
      if (!owner || owner.revokedAt !== undefined) return null;
    }
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.invoiceId))
      .first();

    if (!invoice) return null;
    const replacement = await recoveryReplacement(ctx, invoice.sid);
    const ownerSid = replacement?.sid ?? invoice.sid;
    if ((guest && ownerSid !== guest.sid) ||
        (args.ownerSid !== undefined && ownerSid !== args.ownerSid)) {
      return null;
    }

    return {
      invoiceId: invoice.invoiceId,
      sid: ownerSid,
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
 * Internal mutation to confirm payment and grant credits.
 * Only callable from Convex actions after server secret validation.
 */
export const confirmPaymentInternal = internalMutation({
  args: {
    invoiceId: v.string(),
    paymentHash: v.string(),
    amountPaidSats: v.number(),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.invoiceId))
      .unique();

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    if (invoice.status === "paid") {
      return { success: true, alreadyPaid: true };
    }

    // Trusted settlement evidence takes precedence over a local expiry estimate.
    if (args.paymentHash !== invoice.paymentHash ||
        !Number.isSafeInteger(args.amountPaidSats) || args.amountPaidSats < invoice.amountSats) {
      throw new Error("Settlement does not match invoice");
    }
    const paidInvoice = await ctx.db.query("invoices")
      .withIndex("by_paymentHash", (q) => q.eq("paymentHash", args.paymentHash))
      .filter((q) => q.eq(q.field("status"), "paid"))
      .first();
    if (paidInvoice) throw new Error("Payment already credited");
    const purchase = await ctx.db.query("creditLedger")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.invoiceId)).first();
    if (purchase) throw new Error("Invoice purchase already recorded");
    const now = Date.now();

    // Mark invoice as paid
    await ctx.db.patch(invoice._id, {
      status: "paid",
      paidAt: now,
    });

    // Old releases could insert an invoice after its empty session was replaced.
    // Settle those into the restored wallet, retaining the original invoice SID
    // as history and recording the actual credited wallet in the new ledger row.
    const replacement = await recoveryReplacement(ctx, invoice.sid);
    const session = replacement ?? await ctx.db
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
      sid: session.sid,
      delta: creditsToAdd,
      reason: "purchase",
      invoiceId: invoice.invoiceId,
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
    paymentHash: v.string(),
    amountPaidSats: v.number(),
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
      amountPaidSats: args.amountPaidSats,
    });
  },
});

/**
 * Mark an invoice as expired or canceled.
 * Called when the receiving node reports the invoice is canceled or it has expired.
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
