/**
 * Settles credit invoices without a browser (T13, #69). Each unpaid invoice gets a chain of
 * scheduled looks at the LNURL-pay server's `/check`, so a payment made after every tab has
 * closed still credits the wallet. The browser's own polling keeps working beside it; both end
 * in `confirmPaymentInternal`, which credits an invoice once.
 *
 * A look is two steps: `tick` (a mutation, so it always runs) plans the next look before it
 * starts this one, and `check` (an action) asks the node and reports through `recordCheck`.
 * A look that never reports back therefore cannot stop the chain.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { lookupLightningInvoiceState } from "../src/lib/lightning";

/** The browser polls every three seconds while the buyer watches, so the server waits before its first look. */
const FIRST_LOOK_MS = 30_000;
/** Looks spread out as the invoice ages, to at most this far apart. */
const MAX_LOOK_GAP_MS = 15 * 60_000;
/** After its own expiry an invoice can no longer be paid; allow for clock differences before the last look. */
const EXPIRY_GRACE_MS = 2 * 60_000;
/** Past expiry, stop after this many looks in a row with no answer from the node (about two hours). */
const MAX_FAILURES_AFTER_EXPIRY = 8;
/** Invoices the hourly sweep schedules per status and run. */
const SWEEP_LIMIT = 25;

/** Convex needs `LNURL_PAY_URL` to reach the node. Without it nothing is scheduled, and the sweep catches up once it is set. */
function configured(): boolean {
  return !!process.env.LNURL_PAY_URL;
}

/** Start the chain of looks for a newly saved invoice. */
export async function scheduleFirstLook(ctx: MutationCtx, invoice: Id<"invoices">, invoiceId: string, now: number) {
  if (!configured()) return;
  await ctx.db.patch(invoice, { reconcileAt: now + FIRST_LOOK_MS });
  await ctx.scheduler.runAfter(FIRST_LOOK_MS, internal.invoiceReconciliation.tick, { invoiceId });
}

export const tick = internalMutation({
  args: { invoiceId: v.string() },
  handler: async (ctx, { invoiceId }) => {
    const invoice = await ctx.db.query("invoices")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId)).unique();
    if (!invoice || invoice.status === "paid" || invoice.reconciledAt !== undefined) return;

    const now = Date.now();
    const lastLookAt = invoice.expiresAt + EXPIRY_GRACE_MS;
    const expired = now > lastLookAt;
    const failures = invoice.checkFailures ?? 0;
    if (expired && failures >= MAX_FAILURES_AFTER_EXPIRY) {
      // The node never answered after expiry. The invoice keeps its status and its last error for the operator.
      await ctx.db.patch(invoice._id, { reconciledAt: now });
      return;
    }

    // Before expiry, double the invoice's age each time and never skip the look just after expiry.
    // After it, any answer but a held payment is final, so every look planned here is a retry.
    const gap = Math.min(Math.max(now - invoice.createdAt, FIRST_LOOK_MS), MAX_LOOK_GAP_MS);
    const next = expired ? now + MAX_LOOK_GAP_MS : Math.min(now + gap, lastLookAt + 1000);
    await ctx.db.patch(invoice._id, { reconcileAt: next, ...(expired ? { checkFailures: failures + 1 } : {}) });
    await ctx.scheduler.runAt(next, internal.invoiceReconciliation.tick, { invoiceId });
    await ctx.scheduler.runAfter(0, internal.invoiceReconciliation.check, { invoiceId });
  },
});

export const pendingCheck = internalQuery({
  args: { invoiceId: v.string() },
  handler: async (ctx, { invoiceId }) => {
    const invoice = await ctx.db.query("invoices")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId)).unique();
    if (!invoice || invoice.status === "paid" || invoice.reconciledAt !== undefined) return null;
    return { paymentHash: invoice.paymentHash ?? null };
  },
});

export const check = internalAction({
  args: { invoiceId: v.string() },
  handler: async (ctx, { invoiceId }) => {
    const invoice = await ctx.runQuery(internal.invoiceReconciliation.pendingCheck, { invoiceId });
    if (!invoice) return;
    if (!invoice.paymentHash) {
      await ctx.runMutation(internal.invoiceReconciliation.recordCheck, { invoiceId, error: "Invoice has no payment hash" });
      return;
    }
    let state: string;
    try {
      state = await lookupLightningInvoiceState(invoice.paymentHash);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lightning lookup failed";
      await ctx.runMutation(internal.invoiceReconciliation.recordCheck, { invoiceId, error: message.slice(0, 200) });
      return;
    }
    await ctx.runMutation(internal.invoiceReconciliation.recordCheck, { invoiceId, state });
  },
});

export const recordCheck = internalMutation({
  args: { invoiceId: v.string(), state: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { invoiceId, state, error }) => {
    const invoice = await ctx.db.query("invoices")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId)).unique();
    if (!invoice || invoice.status === "paid") return;
    // Once the server has finished with an invoice, only proof of payment still counts.
    if (invoice.reconciledAt !== undefined && state !== "SETTLED") return;
    if (state === undefined) {
      await ctx.db.patch(invoice._id, { lastCheckError: error ?? "Lightning lookup failed" });
      return;
    }

    const now = Date.now();
    await ctx.db.patch(invoice._id, { lastCheckedAt: now, lastCheckError: undefined });
    if (state === "SETTLED") {
      try {
        // The invoice asked for exactly amountSats and the node never settles it for less.
        await ctx.runMutation(internal.invoices.confirmPaymentInternal, {
          invoiceId, paymentHash: invoice.paymentHash!, amountPaidSats: invoice.amountSats,
        });
        await ctx.db.patch(invoice._id, { reconciledAt: now });
      } catch (confirmError) {
        // Paid on the node but not credited (for example its wallet is gone): stop and leave it for the operator.
        const message = confirmError instanceof Error ? confirmError.message : "unknown error";
        await ctx.db.patch(invoice._id, { reconciledAt: now, lastCheckError: `Settled but not credited: ${message}`.slice(0, 200) });
      }
      return;
    }
    const expired = now > invoice.expiresAt + EXPIRY_GRACE_MS;
    if (state === "ACCEPTED") {
      // The node is holding a payment, which can still settle after expiry: keep looking, within `tick`'s limit.
      if (expired) await ctx.db.patch(invoice._id, { lastCheckError: "Payment accepted by the node but not settled" });
      return;
    }
    if (state === "CANCELED" || expired) {
      await ctx.db.patch(invoice._id, { status: "expired", reconciledAt: now });
    }
  },
});

/**
 * Schedules unpaid invoices that were never scheduled: those saved before this existed, saved
 * while Convex had no `LNURL_PAY_URL`, or saved by an older release during a deploy. Hourly.
 */
export const sweepUnscheduled = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!configured()) return { configured: false, scheduled: 0 };
    const now = Date.now();
    let scheduled = 0;
    for (const status of ["pending", "expired"]) {
      const rows = await ctx.db.query("invoices")
        .withIndex("by_status_reconcileAt", (q) => q.eq("status", status).eq("reconcileAt", undefined))
        .take(SWEEP_LIMIT);
      for (const row of rows) {
        // Two seconds apart, so a backlog does not reach the node all at once.
        const at = now + scheduled * 2000;
        await ctx.db.patch(row._id, { reconcileAt: at });
        await ctx.scheduler.runAt(at, internal.invoiceReconciliation.tick, { invoiceId: row.invoiceId });
        scheduled++;
      }
    }
    return { configured: true, scheduled };
  },
});

/** Operator view: unpaid invoices the server is still watching or gave up on, with age and retry state. */
export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = [];
    for (const invoiceStatus of ["pending", "expired"]) {
      const scheduledRows = await ctx.db.query("invoices")
        .withIndex("by_status_reconcileAt", (q) => q.eq("status", invoiceStatus).gt("reconcileAt", 0))
        .order("desc").take(50);
      rows.push(...scheduledRows.filter((row) => row.reconciledAt === undefined || row.lastCheckError !== undefined));
    }
    return rows.map((row) => ({
      invoiceId: row.invoiceId,
      status: row.status,
      ageMs: now - row.createdAt,
      watching: row.reconciledAt === undefined,
      nextLookAt: row.reconciledAt === undefined ? row.reconcileAt : undefined,
      looksAfterExpiry: row.checkFailures ?? 0,
      lastAnsweredAt: row.lastCheckedAt,
      lastError: row.lastCheckError,
    }));
  },
});
