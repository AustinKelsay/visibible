import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { QUOTE_TTL_MS } from "../../convex/quotes";
import { modules } from "./modules";

const SECRET = "quote-test-secret";
const issuedAt = Date.parse("2026-11-13T12:00:00Z");
const terms = {
  sid: "guest", operation: "image" as "image" | "chat", fingerprint: "fp-1", policyVersion: "accepted-maximum-v1",
  estimateCredits: 2, maximumCredits: 4,
};

beforeEach(() => {
  process.env.CONVEX_SERVER_SECRET = SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(issuedAt);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("sessions", { sid: "guest", tier: "paid", credits: 100, createdAt: issuedAt, lastSeenAt: issuedAt }));
  const quote = await t.mutation(api.quotes.create, { ...terms, serverSecret: SECRET });
  const accept = (overrides: Partial<typeof terms> & { quoteId?: string; usedBy?: string } = {}) =>
    t.mutation(api.quotes.accept, { ...terms, quoteId: quote.quoteId, usedBy: "request-1", serverSecret: SECRET, ...overrides });
  const stored = () => t.run((ctx) => ctx.db.query("quotes").collect());
  const session = () => t.run((ctx) => ctx.db.query("sessions").unique());
  return { t, quote, accept, stored, session };
}

describe("quotes", () => {
  it("issues a quote with its terms, policy version and a five-minute expiry, and shows the guest only what they accept", async () => {
    const { quote, stored } = await setup();
    expect(QUOTE_TTL_MS).toBe(5 * 60 * 1000);
    expect(quote).toEqual({
      quoteId: expect.any(String), operation: "image", policyVersion: "accepted-maximum-v1",
      estimateCredits: 2, maximumCredits: 4, expiresAt: issuedAt + 5 * 60 * 1000,
    });
    expect(await stored()).toMatchObject([{ ...terms, origin: "shown", createdAt: issuedAt, expiresAt: issuedAt + QUOTE_TTL_MS }]);
    expect((await stored())[0].usedAt).toBeUndefined();
  });

  it("refuses to issue a quote whose estimate passes its maximum, or without the server secret", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.quotes.create, { ...terms, estimateCredits: 5, serverSecret: SECRET })).rejects.toThrow(/does not exceed its maximum/);
    await expect(t.mutation(api.quotes.create, { ...terms, maximumCredits: 0.5, estimateCredits: 0.5, serverSecret: SECRET })).rejects.toThrow();
    await expect(t.mutation(api.quotes.create, { ...terms, serverSecret: "wrong" })).rejects.toThrow();
    await expect(t.mutation(api.quotes.accept, { ...terms, quoteId: "x", usedBy: "r", serverSecret: "wrong" })).rejects.toThrow();
  });

  it("accepts a quote once, for the operation that presented it; the hold and the capped charge then follow its maximum", async () => {
    const { t, accept, stored, session } = await setup();
    const accepted = await accept();
    expect(accepted).toEqual({ accepted: true, replay: false, estimateCredits: 2, maximumCredits: 4 });
    expect((await stored())[0]).toMatchObject({ usedAt: issuedAt, usedBy: "request-1" });
    if (!accepted.accepted) throw new Error("unreachable");

    // Reserve exactly the accepted maximum, once.
    const hold = { sid: "guest", amount: accepted.maximumCredits, modelId: "test", generationId: "generation-1", costUsd: 0.04 };
    expect(await t.mutation(internal.sessions.reserveCreditsInternal, hold)).toMatchObject({ success: true, newBalance: 96 });
    expect(await t.mutation(internal.sessions.reserveCreditsInternal, hold)).toMatchObject({ success: true, alreadyReserved: true, newBalance: 96 });
    // Finish: a charge within the maximum returns the rest of the hold.
    expect(await t.mutation(internal.sessions.deductCreditsInternal, { ...hold, actualAmount: 3, actualCostUsd: 0.03 })).toMatchObject({ success: true, refunded: 1, newBalance: 97 });
    expect((await session())!.credits).toBe(97);
  });

  it("releases the whole hold when the work fails after acceptance, and the quote stays used", async () => {
    const { t, accept, session } = await setup();
    await accept();
    await t.mutation(internal.sessions.reserveCreditsInternal, { sid: "guest", amount: 4, modelId: "test", generationId: "generation-1", costUsd: 0.04 });
    expect(await t.mutation(internal.sessions.releaseReservationInternal, { sid: "guest", generationId: "generation-1" })).toMatchObject({ success: true, newBalance: 100 });
    expect((await session())!).toMatchObject({ credits: 100, dailySpendUsd: 0 });
    expect(await accept({ usedBy: "request-2" })).toEqual({ accepted: false, reason: "used" });
  });

  it("refuses reuse by another operation, and treats the same operation's repeat as a replay", async () => {
    const { accept, stored } = await setup();
    await accept();
    expect(await accept({ usedBy: "request-2" })).toEqual({ accepted: false, reason: "used" });
    expect(await accept()).toEqual({ accepted: true, replay: true, estimateCredits: 2, maximumCredits: 4 });
    expect((await stored())[0].usedBy).toBe("request-1");
  });

  it("refuses the same operation's repeat when the terms it presents are no longer the accepted ones", async () => {
    const { accept, stored } = await setup();
    await accept();
    // The operation accepted at most 4 credits. Retried after the price rose, it presents 8 and must not be let through.
    for (const changed of [{ maximumCredits: 8 }, { estimateCredits: 3 }, { fingerprint: "fp-2" }, { policyVersion: "other" }, { operation: "chat" as const }]) {
      expect([changed, await accept(changed)]).toEqual([changed, { accepted: false, reason: "changed" }]);
    }
    expect(await accept()).toEqual({ accepted: true, replay: true, estimateCredits: 2, maximumCredits: 4 });
    expect((await stored())[0]).toMatchObject({ usedBy: "request-1", estimateCredits: 2, maximumCredits: 4 });
  });

  it("refuses an expired quote at the five-minute mark, and accepts just before it", async () => {
    const late = await setup();
    vi.setSystemTime(issuedAt + QUOTE_TTL_MS);
    expect(await late.accept()).toEqual({ accepted: false, reason: "expired" });
    expect((await late.stored())[0].usedAt).toBeUndefined();

    vi.setSystemTime(issuedAt);
    const inTime = await setup();
    vi.setSystemTime(issuedAt + QUOTE_TTL_MS - 1);
    expect(await inTime.accept()).toMatchObject({ accepted: true });
  });

  it("refuses a tampered id and a quote that belongs to another session, without saying which", async () => {
    const { accept, quote, stored } = await setup();
    expect(await accept({ quoteId: "not-a-quote-id" })).toEqual({ accepted: false, reason: "missing" });
    expect(await accept({ quoteId: `${quote.quoteId.slice(0, -1)}${quote.quoteId.endsWith("a") ? "b" : "a"}` })).toEqual({ accepted: false, reason: "missing" });
    expect(await accept({ sid: "another-guest" })).toEqual({ accepted: false, reason: "missing" });
    expect((await stored())[0].usedAt).toBeUndefined();
  });

  it.each([
    ["the fingerprint (another prompt, setting or catalog version)", { fingerprint: "fp-2" }],
    ["the estimate (a changed price)", { estimateCredits: 3 }],
    ["the maximum (a changed price or balance)", { maximumCredits: 6 }],
    ["the policy version", { policyVersion: "accepted-maximum-v2" }],
    ["the operation", { operation: "chat" as const }],
  ])("refuses acceptance when the request no longer matches %s", async (_what, changed) => {
    const { accept, stored } = await setup();
    expect(await accept(changed)).toEqual({ accepted: false, reason: "changed" });
    expect((await stored())[0].usedAt).toBeUndefined();
    // The quote itself is still good for the request it was issued for.
    expect(await accept()).toMatchObject({ accepted: true, replay: false });
  });

  it("lets only one of two operations presenting the same quote at once accept it", async () => {
    const { accept, stored } = await setup();
    const results = await Promise.all([accept({ usedBy: "request-a" }), accept({ usedBy: "request-b" })]);
    expect(results.filter((result) => result.accepted)).toHaveLength(1);
    expect(results.find((result) => !result.accepted)).toEqual({ accepted: false, reason: "used" });
    expect(["request-a", "request-b"]).toContain((await stored())[0].usedBy);
  });

  it.each(["release", "capped charge"])("keeps the new day's spending intact when a hold of the accepted maximum ends after midnight (%s)", async (ending) => {
    vi.setSystemTime(Date.parse("2026-11-13T23:58:00Z"));
    const { t, accept, session } = await setup();
    const accepted = await accept();
    if (!accepted.accepted) throw new Error("unreachable");
    const hold = { sid: "guest", amount: accepted.maximumCredits, modelId: "test", generationId: "before-midnight", costUsd: 0.04 };
    await t.mutation(internal.sessions.reserveCreditsInternal, hold);
    vi.setSystemTime(Date.parse("2026-11-14T00:01:00Z"));
    // Today's own admission resets the daily total and counts only itself.
    await t.mutation(internal.sessions.reserveCreditsInternal, { ...hold, generationId: "after-midnight", costUsd: 0.03 });
    if (ending === "release") {
      await t.mutation(internal.sessions.releaseReservationInternal, { sid: "guest", generationId: "before-midnight" });
      expect((await session())!).toMatchObject({ credits: 96, dailySpendUsd: 0.03 });
    } else {
      // Usage came to more than the maximum: the charge is the maximum, and yesterday's work stays out of today's total.
      await t.mutation(internal.sessions.deductCreditsInternal, { ...hold, actualAmount: accepted.maximumCredits, actualCostUsd: 0.04 });
      expect((await session())!).toMatchObject({ credits: 92, dailySpendUsd: 0.03 });
    }
  });

  it("issues an automatic quote already accepted by its operation", async () => {
    const { t, stored } = await setup();
    const automatic = await t.mutation(api.quotes.create, { ...terms, usedBy: "bulk-1-0", serverSecret: SECRET });
    expect((await stored()).find((q) => q._id === automatic.quoteId)).toMatchObject({ origin: "automatic", usedAt: issuedAt, usedBy: "bulk-1-0" });
    expect(await t.mutation(api.quotes.accept, { ...terms, quoteId: automatic.quoteId, usedBy: "another", serverSecret: SECRET })).toEqual({ accepted: false, reason: "used" });
  });

  it("records a chat turn's charge and its estimated label once, only for the operation that accepted the quote", async () => {
    const { t, quote, accept, stored } = await setup();
    const record = (usedBy: string, chargedCredits: number, usedFallbackEstimate: boolean) =>
      t.mutation(api.quotes.recordSettlement, { quoteId: quote.quoteId, usedBy, chargedCredits, usedFallbackEstimate, serverSecret: SECRET });
    expect(await record("request-1", 2, true)).toEqual({ recorded: false }); // not accepted yet
    await accept();
    expect(await record("someone-else", 2, true)).toEqual({ recorded: false });
    expect(await record("request-1", 2, true)).toEqual({ recorded: true });
    expect(await record("request-1", 4, false)).toEqual({ recorded: false });
    expect((await stored())[0]).toMatchObject({ chargedCredits: 2, usedFallbackEstimate: true });
  });

  it("cleans up quotes that expired unaccepted and keeps accepted ones", async () => {
    const { t, accept, stored } = await setup();
    await accept();
    await t.mutation(api.quotes.create, { ...terms, fingerprint: "unused", serverSecret: SECRET });
    vi.setSystemTime(issuedAt + QUOTE_TTL_MS + 30 * 60 * 1000);
    await t.mutation(api.quotes.create, { ...terms, fingerprint: "recent", serverSecret: SECRET });
    vi.setSystemTime(issuedAt + QUOTE_TTL_MS + 61 * 60 * 1000);
    expect(await t.mutation(internal.cleanup.cleanupUnusedQuotes, {})).toMatchObject({ deleted: 1, hasMore: false });
    expect((await stored()).map((q) => q.fingerprint).sort()).toEqual(["fp-1", "recent"]);
  });
});
