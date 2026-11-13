import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const tokenHash = "a".repeat(64);
beforeEach(() => vi.stubEnv("CONVEX_SERVER_SECRET", "new-server-secret"));
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const walletId = await t.run((ctx) => ctx.db.insert("sessions", {
    sid: "preserved-wallet", tier: "paid", credits: 35, createdAt: now - 10_000,
    lastSeenAt: now - 10_000, expiresAt: now - 1,
  }));
  const requesterId = await t.run((ctx) => ctx.db.insert("sessions", {
    sid: "fresh-session", tier: "paid", credits: 0, createdAt: now, lastSeenAt: now,
    expiresAt: now + 100_000,
  }));
  await t.run(async (ctx) => {
    await ctx.db.insert("invoices", {
      sid: "preserved-wallet", invoiceId: "paid-invoice", amountUsd: 1, amountSats: 1000,
      bolt11: "dummy-bolt11", status: "paid", createdAt: now - 20_000, expiresAt: now - 10_000,
    });
    await ctx.db.insert("creditLedger", { sid: "preserved-wallet", delta: 35, reason: "purchase", createdAt: now - 10_000 });
  });
  const issueArgs = { walletId, expectedCredits: 35, tokenHash, expiresAt: now + 60_000, verificationReference: "verified-case-123" };
  const redeemArgs = { serverSecret: "new-server-secret", tokenHash, requesterSid: "fresh-session", ipHash: "new-ip-hash" };
  return { t, walletId, requesterId, issueArgs, redeemArgs };
}

describe("reviewed balance recovery", () => {
  const invoiceArgs = {
    invoiceId: "racing-purchase", sid: "fresh-session", amountUsd: 1 as const,
    amountSats: 1000, bolt11: "dummy-invoice", paymentHash: "test-payment-hash",
    expiresAt: Date.now() + 3_600_000, serverSecret: "new-server-secret",
  };
  const settlement = {
    invoiceId: invoiceArgs.invoiceId, paymentHash: invoiceArgs.paymentHash, amountPaidSats: 1000,
  };

  it("keeps the original session when invoice insertion wins the recovery race", async () => {
    const { t, walletId, requesterId, issueArgs, redeemArgs } = await setup();
    await t.mutation(internal.sessionRecovery.issue, issueArgs);
    await t.mutation(api.invoices.createInvoice, invoiceArgs);
    expect(await t.mutation(api.sessionRecovery.redeem, redeemArgs)).toEqual({ ok: false, reason: "use_empty_session" });
    await t.mutation(internal.invoices.confirmPaymentInternal, settlement);
    expect((await t.run((ctx) => ctx.db.get(requesterId)))?.credits).toBe(100);
    expect((await t.run((ctx) => ctx.db.get(walletId)))?.credits).toBe(35);
  });

  it("blocks late invoice insertion after recovery but permits purchases by the restored wallet", async () => {
    const { t, walletId, requesterId, issueArgs, redeemArgs } = await setup();
    await t.mutation(internal.sessionRecovery.issue, issueArgs);
    await t.mutation(api.sessionRecovery.redeem, redeemArgs);
    await expect(t.mutation(api.invoices.createInvoice, invoiceArgs)).rejects.toThrow("Session replaced by recovery");
    await t.mutation(api.invoices.createInvoice, { ...invoiceArgs, sid: "preserved-wallet" });
    await t.mutation(internal.invoices.confirmPaymentInternal, settlement);
    expect((await t.run((ctx) => ctx.db.get(walletId)))?.credits).toBe(135);
    expect((await t.run((ctx) => ctx.db.get(requesterId)))?.credits).toBe(0);
    expect(await t.mutation(api.sessionRecovery.redeem, redeemArgs)).toEqual({ ok: true, sid: "preserved-wallet" });
  });

  it("does not treat recovery to the requester's own wallet as a replacement", async () => {
    const { t, walletId, issueArgs, redeemArgs } = await setup();
    await t.run((ctx) => ctx.db.patch(walletId, { expiresAt: Date.now() + 60_000 }));
    await t.mutation(internal.sessionRecovery.issue, issueArgs);
    expect(await t.mutation(api.sessionRecovery.redeem, { ...redeemArgs, requesterSid: "preserved-wallet" }))
      .toEqual({ ok: true, sid: "preserved-wallet" });
    await t.mutation(api.invoices.createInvoice, { ...invoiceArgs, sid: "preserved-wallet" });
    await t.mutation(internal.invoices.confirmPaymentInternal, settlement);
    expect((await t.run((ctx) => ctx.db.get(walletId)))?.credits).toBe(135);
  });

  it("settles a legacy late invoice once into the restored wallet, preserving retry and invoice history", async () => {
    const { t, walletId, requesterId, issueArgs, redeemArgs } = await setup();
    const grantId = await t.mutation(internal.sessionRecovery.issue, issueArgs);
    await t.mutation(api.sessionRecovery.redeem, redeemArgs);
    // Simulate an invoice inserted by the previous implementation after recovery committed.
    await t.run((ctx) => ctx.db.insert("invoices", {
      invoiceId: invoiceArgs.invoiceId, sid: invoiceArgs.sid, amountUsd: invoiceArgs.amountUsd,
      amountSats: invoiceArgs.amountSats, bolt11: invoiceArgs.bolt11, paymentHash: invoiceArgs.paymentHash,
      expiresAt: invoiceArgs.expiresAt, createdAt: Date.now(), status: "pending",
    }));
    expect(await t.mutation(api.sessionRecovery.redeem, redeemArgs)).toEqual({ ok: true, sid: "preserved-wallet" });
    const restored = await t.query(api.invoices.getInvoice, {
      invoiceId: invoiceArgs.invoiceId, ownerSid: "preserved-wallet", serverSecret: "new-server-secret",
    });
    expect(restored).toMatchObject({ invoiceId: invoiceArgs.invoiceId, sid: "preserved-wallet" });
    expect(await t.query(api.invoices.getInvoice, {
      invoiceId: invoiceArgs.invoiceId, ownerSid: "fresh-session", serverSecret: "new-server-secret",
    })).toBeNull();
    vi.stubEnv("GUEST_AUTH_ISSUER", "test-issuer");
    const identity = { issuer: "test-issuer", guestExpiresAt: Date.now() / 1000 + 60 };
    expect(await t.withIdentity({ ...identity, subject: "fresh-session" })
      .query(api.invoices.getInvoice, { invoiceId: invoiceArgs.invoiceId })).toBeNull();
    expect(await t.withIdentity({ ...identity, subject: "preserved-wallet" })
      .query(api.invoices.getInvoice, { invoiceId: invoiceArgs.invoiceId }))
      .toMatchObject({ sid: "preserved-wallet" });
    // The durable ownership link must survive code expiry.
    await t.run((ctx) => ctx.db.patch(grantId, { expiresAt: Date.now() - 1 }));
    await t.mutation(internal.invoices.confirmPaymentInternal, settlement);
    expect(await t.mutation(internal.invoices.confirmPaymentInternal, settlement)).toMatchObject({ alreadyPaid: true });
    const saved = await t.run(async (ctx) => ({
      wallet: await ctx.db.get(walletId), requester: await ctx.db.get(requesterId),
      invoice: await ctx.db.query("invoices").withIndex("by_invoiceId", q => q.eq("invoiceId", invoiceArgs.invoiceId)).unique(),
      ledger: await ctx.db.query("creditLedger").withIndex("by_invoiceId", q => q.eq("invoiceId", invoiceArgs.invoiceId)).collect(),
    }));
    expect(saved.wallet?.credits).toBe(135);
    expect(saved.requester?.credits).toBe(0);
    expect(saved.invoice).toMatchObject({ sid: "fresh-session", status: "paid" });
    expect(saved.ledger).toEqual([expect.objectContaining({ sid: "preserved-wallet", delta: 100 })]);
  });

  it.each(["deleted", "revoked"])("holds late settlement for review if the restored wallet is %s", async (kind) => {
    const { t, walletId, requesterId, issueArgs, redeemArgs } = await setup();
    await t.mutation(internal.sessionRecovery.issue, issueArgs);
    await t.mutation(api.sessionRecovery.redeem, redeemArgs);
    const invoiceId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("invoices", {
        invoiceId: invoiceArgs.invoiceId, sid: invoiceArgs.sid, amountUsd: invoiceArgs.amountUsd,
        amountSats: invoiceArgs.amountSats, bolt11: invoiceArgs.bolt11, paymentHash: invoiceArgs.paymentHash,
        expiresAt: invoiceArgs.expiresAt, createdAt: Date.now(), status: "pending",
      });
      if (kind === "deleted") await ctx.db.delete(walletId);
      else await ctx.db.patch(walletId, { revokedAt: Date.now() });
      return id;
    });
    await expect(t.mutation(internal.invoices.confirmPaymentInternal, settlement)).rejects.toThrow("payment needs review");
    expect((await t.run((ctx) => ctx.db.get(invoiceId)))?.status).toBe("pending");
    expect((await t.run((ctx) => ctx.db.get(requesterId)))?.credits).toBe(0);
    expect(await t.run((ctx) => ctx.db.query("creditLedger").withIndex("by_invoiceId", q => q.eq("invoiceId", invoiceArgs.invoiceId)).collect())).toHaveLength(0);
  });

  it("does not replace a previously restored empty wallet or issue a grant for its replaced requester", async () => {
    const { t, requesterId, issueArgs, redeemArgs } = await setup();
    const emptyWalletId = await t.run(ctx => ctx.db.insert("sessions", {
      sid: "empty-wallet", tier: "paid", credits: 0, createdAt: Date.now(), lastSeenAt: Date.now(),
    }));
    const emptyGrant = { ...issueArgs, walletId: emptyWalletId, expectedCredits: 0 };
    await t.mutation(internal.sessionRecovery.issue, emptyGrant);
    await t.mutation(api.sessionRecovery.redeem, redeemArgs);
    await expect(t.mutation(internal.sessionRecovery.issue, {
      ...issueArgs, walletId: requesterId, expectedCredits: 0, tokenHash: "b".repeat(64),
    })).rejects.toThrow("Session replaced by recovery");
    await t.mutation(internal.sessionRecovery.issue, { ...issueArgs, tokenHash: "b".repeat(64) });
    expect(await t.mutation(api.sessionRecovery.redeem, {
      ...redeemArgs, requesterSid: "empty-wallet", tokenHash: "b".repeat(64),
    })).toEqual({ ok: false, reason: "use_empty_session" });
  });

  it("restores the existing wallet without changing credits, invoices or ledger; retries are idempotent", async () => {
    const { t, walletId, issueArgs, redeemArgs } = await setup();
    const before = await t.run(async (ctx) => ({
      invoices: await ctx.db.query("invoices").collect(), ledger: await ctx.db.query("creditLedger").collect(),
      wallet: await ctx.db.get(walletId),
    }));
    const grantId = await t.mutation(internal.sessionRecovery.issue, issueArgs);
    expect(await t.mutation(api.sessionRecovery.redeem, redeemArgs)).toEqual({ ok: true, sid: "preserved-wallet" });
    const redeemed = await t.run((ctx) => ctx.db.get(grantId));
    expect(await t.mutation(api.sessionRecovery.redeem, redeemArgs)).toEqual({ ok: true, sid: "preserved-wallet" });
    expect(await t.mutation(api.sessionRecovery.redeem, { ...redeemArgs, requesterSid: "preserved-wallet" })).toEqual({ ok: true, sid: "preserved-wallet" });
    const after = await t.run(async (ctx) => ({
      invoices: await ctx.db.query("invoices").collect(), ledger: await ctx.db.query("creditLedger").collect(),
      wallet: await ctx.db.get(walletId), grant: await ctx.db.get(grantId),
    }));
    expect(after.invoices).toEqual(before.invoices);
    expect(after.ledger).toEqual(before.ledger);
    expect(after.wallet).toMatchObject({ sid: "preserved-wallet", credits: 35, tier: "paid", createdAt: before.wallet!.createdAt });
    expect(after.grant).toEqual(redeemed);
    expect(after.grant).toMatchObject({ state: "redeemed", redeemedBySid: "fresh-session" });
  });

  it("rejects the old server secret and prevents code replay from another session", async () => {
    const { t, issueArgs, redeemArgs } = await setup();
    await t.mutation(internal.sessionRecovery.issue, issueArgs);
    await expect(t.mutation(api.sessionRecovery.redeem, { ...redeemArgs, serverSecret: "old-server-secret" })).rejects.toThrow("Unauthorized");
    await t.mutation(api.sessionRecovery.redeem, redeemArgs);
    await t.run((ctx) => ctx.db.insert("sessions", { sid: "other", tier: "paid", credits: 0, createdAt: Date.now(), lastSeenAt: Date.now() }));
    expect(await t.mutation(api.sessionRecovery.redeem, { ...redeemArgs, requesterSid: "other" })).toEqual({ ok: false, reason: "invalid_claim" });
    await expect(t.mutation(internal.sessionRecovery.issue, { ...issueArgs, tokenHash: "b".repeat(64) })).rejects.toThrow("already recovered");
  });

  it("allows only one of two competing recipient sessions to consume a claim", async () => {
    const { t, issueArgs, redeemArgs } = await setup();
    await t.mutation(internal.sessionRecovery.issue, issueArgs);
    await t.run((ctx) => ctx.db.insert("sessions", { sid: "other", tier: "paid", credits: 0, createdAt: Date.now(), lastSeenAt: Date.now() }));
    const results = await Promise.all([
      t.mutation(api.sessionRecovery.redeem, redeemArgs),
      t.mutation(api.sessionRecovery.redeem, { ...redeemArgs, requesterSid: "other" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it.each(["credits", "invoice", "ledger"])("does not strand a requester's %s", async (kind) => {
    const { t, requesterId, issueArgs, redeemArgs } = await setup();
    const grantId = await t.mutation(internal.sessionRecovery.issue, issueArgs);
    await t.run(async (ctx) => {
      if (kind === "credits") await ctx.db.patch(requesterId, { credits: 10 });
      if (kind === "invoice") await ctx.db.insert("invoices", { sid: "fresh-session", invoiceId: "pending", amountUsd: 1, amountSats: 1000, bolt11: "dummy", status: "pending", createdAt: Date.now(), expiresAt: Date.now() + 10_000 });
      if (kind === "ledger") await ctx.db.insert("creditLedger", { sid: "fresh-session", delta: 0, reason: "refund", createdAt: Date.now() });
    });
    expect(await t.mutation(api.sessionRecovery.redeem, redeemArgs)).toEqual({ ok: false, reason: "use_empty_session" });
    expect((await t.run((ctx) => ctx.db.get(grantId)))?.state).toBe("pending");
  });

  it.each(["admin", "revoked", "balance_changed"])("rejects issuing for a wallet that is %s", async (kind) => {
    const { t, walletId, issueArgs } = await setup();
    await t.run((ctx) => ctx.db.patch(walletId, kind === "admin" ? { tier: "admin" } : kind === "revoked" ? { revokedAt: Date.now() } : { credits: 36 }));
    await expect(t.mutation(internal.sessionRecovery.issue, issueArgs)).rejects.toThrow("reviewed recovery plan");
  });

  it.each(["admin", "revoked", "deleted"])("rejects a target made %s after approval", async (kind) => {
    const { t, walletId, issueArgs, redeemArgs } = await setup();
    await t.mutation(internal.sessionRecovery.issue, issueArgs);
    await t.run(async (ctx) => {
      if (kind === "deleted") await ctx.db.delete(walletId);
      else await ctx.db.patch(walletId, kind === "admin" ? { tier: "admin" } : { revokedAt: Date.now() });
    });
    expect(await t.mutation(api.sessionRecovery.redeem, redeemArgs)).toEqual({ ok: false, reason: "invalid_claim" });
  });

  it("expires grants, supports explicit revocation and revokes a replaced pending code", async () => {
    const { t, issueArgs, redeemArgs } = await setup();
    const first = await t.mutation(internal.sessionRecovery.issue, issueArgs);
    const second = await t.mutation(internal.sessionRecovery.issue, { ...issueArgs, tokenHash: "b".repeat(64) });
    expect((await t.run((ctx) => ctx.db.get(first)))?.state).toBe("revoked");
    expect((await t.mutation(api.sessionRecovery.redeem, redeemArgs)).ok).toBe(false);
    await t.mutation(internal.sessionRecovery.revoke, { grantId: second });
    expect((await t.mutation(api.sessionRecovery.redeem, { ...redeemArgs, tokenHash: "b".repeat(64) })).ok).toBe(false);
    const third = await t.mutation(internal.sessionRecovery.issue, { ...issueArgs, tokenHash: "c".repeat(64) });
    await t.run((ctx) => ctx.db.patch(third, { expiresAt: Date.now() - 1 }));
    expect((await t.mutation(api.sessionRecovery.redeem, { ...redeemArgs, tokenHash: "c".repeat(64) })).ok).toBe(false);
    await expect(t.mutation(internal.sessionRecovery.issue, { ...issueArgs, expiresAt: Date.now() + 25 * 60 * 60 * 1000 })).rejects.toThrow("Invalid recovery grant");
  });
});
