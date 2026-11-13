/**
 * Quotes (#60): the estimate and maximum charge shown to a guest before paid work, and the one acceptance of each.
 * The Next.js server computes the terms (operation, price fingerprint, policy version, estimate, maximum) from the
 * request it is about to make; this module stores them, and accepts a quote only when the terms presented at
 * acceptance are the stored ones, the quote belongs to the session, has not expired and has not been used.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { validateServerSecret } from "./_helpers/auth";

/** A quote can be accepted for five minutes after it is issued. */
export const QUOTE_TTL_MS = 5 * 60 * 1000;

const quoteTerms = {
  sid: v.string(),
  operation: v.union(v.literal("image"), v.literal("chat")),
  fingerprint: v.string(),
  policyVersion: v.string(),
  estimateCredits: v.number(),
  maximumCredits: v.number(),
};

/** What the guest's browser is given: never the session or the fingerprint. */
function publicQuote(quote: Pick<Doc<"quotes">, "_id" | "operation" | "policyVersion" | "estimateCredits" | "maximumCredits" | "expiresAt">) {
  return {
    quoteId: quote._id as string,
    operation: quote.operation,
    policyVersion: quote.policyVersion,
    estimateCredits: quote.estimateCredits,
    maximumCredits: quote.maximumCredits,
    expiresAt: quote.expiresAt,
  };
}

export type PublicQuote = ReturnType<typeof publicQuote>;

/**
 * Issue a quote. With `usedBy`, the server issues and accepts it in one step for automatic or bulk generation, which
 * has no guest to show it to.
 */
export const create = mutation({
  args: { ...quoteTerms, usedBy: v.optional(v.string()), serverSecret: v.string() },
  handler: async (ctx, args): Promise<PublicQuote> => {
    validateServerSecret(args.serverSecret);
    const whole = (credits: number) => Number.isSafeInteger(credits) && credits >= 1;
    if (!whole(args.estimateCredits) || !whole(args.maximumCredits) || args.estimateCredits > args.maximumCredits) {
      throw new Error("A quote needs a whole estimate of at least one credit that does not exceed its maximum");
    }
    const now = Date.now();
    const terms = {
      sid: args.sid, operation: args.operation, fingerprint: args.fingerprint, policyVersion: args.policyVersion,
      estimateCredits: args.estimateCredits, maximumCredits: args.maximumCredits,
      createdAt: now, expiresAt: now + QUOTE_TTL_MS,
    };
    const id = await ctx.db.insert("quotes", args.usedBy === undefined
      ? { ...terms, origin: "shown" }
      : { ...terms, origin: "automatic", usedAt: now, usedBy: args.usedBy });
    return publicQuote({ _id: id, ...terms });
  },
});

export type QuoteRefusal = "missing" | "used" | "expired" | "changed";

/**
 * Accept a quote for one operation. Refused, with nothing changed, when the quote does not exist or belongs to
 * another session ("missing" for both), was already accepted by another operation ("used"), is past its expiry
 * ("expired"), or was issued for different terms than the request about to be made ("changed"). The same operation
 * accepting again is a replay of a repeated delivery, not a second use.
 */
export const accept = mutation({
  args: { ...quoteTerms, quoteId: v.string(), usedBy: v.string(), serverSecret: v.string() },
  handler: async (ctx, args): Promise<
    | { accepted: true; replay: boolean; estimateCredits: number; maximumCredits: number }
    | { accepted: false; reason: QuoteRefusal }
  > => {
    validateServerSecret(args.serverSecret);
    const id = ctx.db.normalizeId("quotes", args.quoteId);
    const quote = id ? await ctx.db.get(id) : null;
    if (!quote || quote.sid !== args.sid) return { accepted: false, reason: "missing" };
    const accepted = { accepted: true as const, estimateCredits: quote.estimateCredits, maximumCredits: quote.maximumCredits };
    if (quote.usedAt !== undefined) {
      return quote.usedBy === args.usedBy ? { ...accepted, replay: true } : { accepted: false, reason: "used" };
    }
    if (Date.now() >= quote.expiresAt) return { accepted: false, reason: "expired" };
    if (quote.operation !== args.operation || quote.fingerprint !== args.fingerprint || quote.policyVersion !== args.policyVersion ||
        quote.estimateCredits !== args.estimateCredits || quote.maximumCredits !== args.maximumCredits) {
      return { accepted: false, reason: "changed" };
    }
    await ctx.db.patch(quote._id, { usedAt: Date.now(), usedBy: args.usedBy });
    return { ...accepted, replay: false };
  },
});

/** Record a chat turn's final charge on its accepted quote, and whether it came from the estimate. Written once. */
export const recordSettlement = mutation({
  args: { quoteId: v.string(), usedBy: v.string(), chargedCredits: v.number(), usedFallbackEstimate: v.boolean(), serverSecret: v.string() },
  handler: async (ctx, args): Promise<{ recorded: boolean }> => {
    validateServerSecret(args.serverSecret);
    const id = ctx.db.normalizeId("quotes", args.quoteId);
    const quote = id ? await ctx.db.get(id) : null;
    if (!quote || quote.usedBy !== args.usedBy || quote.chargedCredits !== undefined) return { recorded: false };
    await ctx.db.patch(quote._id, { chargedCredits: args.chargedCredits, usedFallbackEstimate: args.usedFallbackEstimate });
    return { recorded: true };
  },
});
