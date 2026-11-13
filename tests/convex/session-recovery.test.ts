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
