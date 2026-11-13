import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { validateServerSecret } from "./_helpers/auth";

const MAX_CLAIM_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Control-plane only: independently verify ownership before calling this.
 * Supply SHA-256 of a random 32-byte code and a non-secret review case reference.
 * Neither an old cookie nor knowledge of a SID/payment hash proves ownership.
 */
export const issue = internalMutation({
  args: {
    walletId: v.id("sessions"),
    expectedCredits: v.number(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    verificationReference: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (!HASH_PATTERN.test(args.tokenHash) || !Number.isFinite(args.expiresAt) ||
        args.expiresAt <= now || args.expiresAt > now + MAX_CLAIM_AGE_MS ||
        args.verificationReference.trim().length < 8 || args.verificationReference.length > 200) {
      throw new Error("Invalid recovery grant");
    }
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet || wallet.revokedAt !== undefined || wallet.tier !== "paid" ||
        wallet.credits !== args.expectedCredits) {
      throw new Error("Wallet does not match the reviewed recovery plan");
    }
    const duplicate = await ctx.db.query("sessionRecovery")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash)).first();
    if (duplicate) throw new Error("Recovery code hash already used");
    const prior = await ctx.db.query("sessionRecovery")
      .withIndex("by_wallet", (q) => q.eq("walletId", args.walletId)).collect();
    if (prior.some((grant) => grant.state === "redeemed")) {
      throw new Error("Wallet already recovered; further access changes need separate review");
    }
    for (const grant of prior) {
      if (grant.state === "pending") {
        await ctx.db.patch(grant._id, { state: "revoked", revokedAt: now });
      }
    }
    return await ctx.db.insert("sessionRecovery", {
      walletId: args.walletId,
      tokenHash: args.tokenHash,
      verificationReference: args.verificationReference.trim(),
      createdAt: now,
      expiresAt: args.expiresAt,
      state: "pending",
    });
  },
});

export const revoke = internalMutation({
  args: { grantId: v.id("sessionRecovery") },
  handler: async (ctx, args) => {
    const grant = await ctx.db.get(args.grantId);
    if (!grant || grant.state !== "pending") throw new Error("Grant is not pending");
    await ctx.db.patch(grant._id, { state: "revoked", revokedAt: Date.now() });
  },
});

/** The API supplies a SID authenticated only with the current cookie signing key. */
export const redeem = mutation({
  args: {
    serverSecret: v.string(),
    tokenHash: v.string(),
    requesterSid: v.string(),
    ipHash: v.string(),
  },
  handler: async (ctx, args): Promise<
    { ok: true; sid: string } | { ok: false; reason: "invalid_claim" | "use_empty_session" }
  > => {
    validateServerSecret(args.serverSecret);
    const invalid = { ok: false, reason: "invalid_claim" } as const;
    if (!HASH_PATTERN.test(args.tokenHash)) return invalid;
    const now = Date.now();
    const grant = await ctx.db.query("sessionRecovery")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash)).unique();
    if (!grant || grant.state === "revoked" || grant.expiresAt <= now) return invalid;
    const wallet = await ctx.db.get(grant.walletId);
    if (!wallet || wallet.revokedAt !== undefined || wallet.tier !== "paid") return invalid;
    const requester = await ctx.db.query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.requesterSid)).unique();
    if (!requester || requester.revokedAt !== undefined || requester.tier !== "paid" ||
        (requester.expiresAt !== undefined && requester.expiresAt <= now)) return invalid;

    // A lost HTTP response can be retried only by the original recipient session
    // (or the restored session). A different fresh session cannot replay the code.
    if (grant.state === "redeemed") {
      if (grant.redeemedBySid !== args.requesterSid && wallet.sid !== args.requesterSid) return invalid;
    } else {
      const priorRedemption = await ctx.db.query("sessionRecovery")
        .withIndex("by_redeemer", (q) => q.eq("redeemedBySid", args.requesterSid)).first();
      if (priorRedemption) return { ok: false, reason: "use_empty_session" };
    }

    // Never strand a second balance, payment or financial history by replacing its cookie.
    if (requester.sid !== wallet.sid) {
      const invoice = await ctx.db.query("invoices")
        .withIndex("by_sid", (q) => q.eq("sid", requester.sid)).first();
      const ledger = await ctx.db.query("creditLedger")
        .withIndex("by_sid", (q) => q.eq("sid", requester.sid)).first();
      if (requester.credits !== 0 || invoice || ledger) return { ok: false, reason: "use_empty_session" };
    }

    if (grant.state === "pending") {
      await ctx.db.patch(grant._id, {
        state: "redeemed", redeemedAt: now, redeemedBySid: args.requesterSid,
      });
    }
    // No changes to credits, tier, SID, invoices or ledger. Keep their original links.
    await ctx.db.patch(wallet._id, {
      lastSeenAt: now, lastIpHash: args.ipHash, expiresAt: now + SESSION_TTL_MS,
    });
    return { ok: true, sid: wallet.sid };
  },
});
