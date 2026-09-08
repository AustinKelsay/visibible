import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { validateServerSecret } from "./_helpers/auth";

export async function authenticatedGuest(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.issuer !== process.env.GUEST_AUTH_ISSUER ||
      typeof identity.guestExpiresAt !== "number" ||
      identity.guestExpiresAt <= Date.now() / 1000) return null;
  const session = await ctx.db.query("sessions")
    .withIndex("by_sid", (q) => q.eq("sid", identity.subject)).unique();
  if (!session || session.revokedAt !== undefined) return null;
  return session;
}

// Used only after validating the HTTP cookie; does not trust a browser SID.
export const sessionForToken = query({
  args: { sid: v.string(), serverSecret: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const session = await ctx.db.query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid)).unique();
    return session && session.revokedAt === undefined ? { sid: session.sid } : null;
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const session = await authenticatedGuest(ctx);
    return session ? { sid: session.sid, tier: session.tier, credits: session.credits } : null;
  },
});

export async function requireGuestOwner(ctx: QueryCtx, sid: string) {
  const session = await authenticatedGuest(ctx);
  if (!session || session.sid !== sid) throw new Error("Unauthorized guest access");
  return session;
}
