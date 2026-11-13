/**
 * The chat quote protocol (#60) through the real routes: the composer's quote, its acceptance by one turn, the hold of
 * exactly the accepted maximum and settlement from actual usage within it. Quotes are stored and accepted by the real
 * Convex functions (convex-test); the wallet and the provider are controlled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { getFunctionName, type FunctionReference } from "convex/server";
import { simulateReadableStream } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import schema from "../../../../../convex/schema";
import { modules } from "../../../../../tests/convex/modules";
import { fixtures, type Session } from "../shared/test-fixtures";

process.env.OPENROUTER_API_KEY = "test-api-key";
process.env.CONVEX_URL = "https://test.convex.cloud";
process.env.CONVEX_SERVER_SECRET = "test-server-secret";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.IP_HASH_SECRET = "b".repeat(32);
const originalEnv = { ...process.env };

let quoteDb = convexTest(schema, modules);
const state = {
  sessions: new Map<string, Session>(),
  calls: [] as Array<{ action: string; args: Record<string, unknown> }>,
  holds: new Map<string, number>(),
  rateLimited: [] as string[],
};
const sid = { value: "test-session" };
// $10 per million tokens each way: a typical turn (1,000 in, 1,000 out) is 3 credits, the maximum (8,000 in, 2,048 out) is 13.
const DEFAULT_PRICING = { prompt: "0.00001", completion: "0.00001", contextLength: 200_000 };
const pricing: { value: { prompt: string; completion: string; contextLength?: number } | null } = { value: DEFAULT_PRICING };
const requestBody: { value: unknown } = { value: null };
const providerStreamImpl = vi.fn();

vi.mock("@/lib/validate-env", () => ({
  validateSecurityEnv: vi.fn(), validateSessionSecret: vi.fn(), validateIpHashSecret: vi.fn(),
  validateConvexSecret: vi.fn(), validateAdminSecret: vi.fn(), validateProxyConfig: vi.fn(),
}));
vi.mock("@/lib/origin", () => ({
  validateOrigin: vi.fn(() => true),
  invalidOriginResponse: vi.fn(() => new Response("Invalid origin", { status: 403 })),
}));
vi.mock("@/lib/session", () => ({
  validateSessionWithIp: vi.fn(async () => ({ valid: true, sid: sid.value, currentIpHash: "mock-ip-hash" })),
  getClientIp: vi.fn(() => "127.0.0.1"),
  hashIp: vi.fn(async () => "mock-ip-hash"),
  withSessionRefreshCookie: vi.fn((response: Response) => response),
}));
vi.mock("@/lib/request-body", () => ({
  readJsonBodyWithLimit: vi.fn(async () => requestBody.value),
  PayloadTooLargeError: class PayloadTooLargeError extends Error {},
  InvalidJsonError: class InvalidJsonError extends Error {},
  DEFAULT_MAX_BODY_SIZE: 1024 * 1024,
}));
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => ({
    query: vi.fn(async (_ref: unknown, args: Record<string, unknown>) => state.sessions.get(args.sid as string) ?? null),
    mutation: vi.fn(async (ref: FunctionReference<"mutation">, args: Record<string, unknown>) => {
      // Quotes are the real Convex functions.
      if (getFunctionName(ref).startsWith("quotes:")) return quoteDb.mutation(ref as never, args as never);
      state.rateLimited.push(args.endpoint as string);
      return { allowed: true, retryAfter: 0 };
    }),
    action: vi.fn(async (_ref: unknown, args: Record<string, unknown>) => {
      const session = state.sessions.get(args.sid as string);
      const generationId = args.generationId as string;
      if ("endpoint" in args && "estimatedCredits" in args) { state.calls.push({ action: "logAdminUsage", args }); return; }
      if (!session) return { success: false, error: "Session not found" };
      if (!("amount" in args)) {
        state.calls.push({ action: "releaseReservation", args });
        session.credits += state.holds.get(generationId) ?? 0;
        state.holds.delete(generationId);
        return { success: true, newBalance: session.credits };
      }
      const amount = args.amount as number;
      if (state.holds.has(generationId)) {
        state.calls.push({ action: "deductCredits", args });
        // The hold converts to the actual charge; the rest returns to the balance.
        session.credits += state.holds.get(generationId)! - ((args.actualAmount as number | undefined) ?? amount);
        state.holds.delete(generationId);
        return { success: true, newBalance: session.credits };
      }
      state.calls.push({ action: "reserveCredits", args });
      if (session.credits < amount) return { success: false, error: "Insufficient credits", required: amount, available: session.credits };
      session.credits -= amount;
      state.holds.set(generationId, amount);
      return { success: true, newBalance: session.credits };
    }),
  })),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));
vi.mock("@ai-sdk/openai", async () => {
  const { MockLanguageModelV3 } = await import("ai/test");
  return { createOpenAI: vi.fn(() => ({ chat: vi.fn(() => new MockLanguageModelV3({ doStream: providerStreamImpl })) })) };
});
// Real pricing arithmetic; only the catalog lookup is controlled.
vi.mock("@/lib/chat-models", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chat-models")>()),
  DEFAULT_CHAT_MODEL: "test/model",
  getChatModelPricing: vi.fn(async () => pricing.value),
}));

const { POST: chat } = await import("../../chat/route");
const { POST: quoteRoute } = await import("../../chat/quote/route");

/** A provider answer with the usage it reports; no usage at all when `usage` is null. */
function answer(usage: { input?: number; output?: number } | null = { input: 1000, output: 1000 }, fail = false) {
  const chunks: LanguageModelV3StreamPart[] = [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "answer" }, { type: "text-delta", id: "answer", delta: "In the beginning." }, { type: "text-end", id: "answer" },
  ];
  if (fail) chunks.push({ type: "error", error: new Error("Synthetic provider failure") });
  chunks.push({ type: "finish", finishReason: { unified: fail ? "error" : "stop", raw: "stop" }, usage: {
    inputTokens: { total: usage?.input, noCache: usage?.input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: usage?.output, text: usage?.output, reasoning: 0 },
  } as never });
  return { stream: simulateReadableStream({ chunks }) };
}

const post = (route: typeof chat, path: string) => route(new Request(`http://localhost:3000${path}`, { method: "POST", headers: { "Content-Type": "application/json" } }));
async function askQuote(model?: string) {
  requestBody.value = model ? { model } : {};
  const response = await post(quoteRoute, "/api/chat/quote");
  return { status: response.status, body: await response.json() };
}
/** Send one turn; a streamed answer is read to the end, so settlement has run. */
async function send(quoteId?: string, extra: Record<string, unknown> = {}) {
  requestBody.value = { messages: fixtures.messages.valid, ...(quoteId === undefined ? {} : { quoteId }), ...extra };
  const response = await post(chat, "/api/chat");
  const text = await response.text();
  return { status: response.status, text, json: () => JSON.parse(text) as Record<string, unknown> & { quote: { quoteId: string; estimateCredits: number; maximumCredits: number; expiresAt: number } } };
}
const calls = (action: string) => state.calls.filter((call) => call.action === action).map((call) => call.args);
const credits = () => state.sessions.get(sid.value)!.credits;
const storedQuotes = () => quoteDb.run((ctx) => ctx.db.query("quotes").collect());
const setSession = (overrides: Partial<Session> = {}) => state.sessions.set("test-session", { ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 100, ...overrides });
const expectNothingStarted = () => {
  expect(calls("reserveCredits")).toHaveLength(0);
  expect(providerStreamImpl).not.toHaveBeenCalled();
};

describe("chat quotes and the maximum charge (#60)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quoteDb = convexTest(schema, modules);
    state.sessions.clear(); state.calls.length = 0; state.holds.clear(); state.rateLimited.length = 0;
    sid.value = "test-session";
    pricing.value = DEFAULT_PRICING;
    setSession();
    providerStreamImpl.mockImplementation(async () => answer());
  });
  afterEach(() => { vi.useRealTimers(); process.env = { ...originalEnv }; });

  it("quotes the composer's model without holding anything: estimate, maximum, five-minute expiry", async () => {
    const before = Date.now();
    const { status, body } = await askQuote();
    expect(status).toBe(200);
    expect(body.quote).toEqual({ quoteId: expect.any(String), operation: "chat", policyVersion: "accepted-maximum-v1", estimateCredits: 3, maximumCredits: 13, expiresAt: expect.any(Number) });
    expect(body.quote.expiresAt - before).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(await storedQuotes()).toMatchObject([{ sid: "test-session", operation: "chat", origin: "shown", estimateCredits: 3, maximumCredits: 13 }]);
    expect(state.rateLimited).toEqual(["chat-quote"]);
    expect(credits()).toBe(100);
    expectNothingStarted();
  });

  it("quote → accept → reserve → finish: holds exactly the accepted maximum once and charges actual usage", async () => {
    const { quote } = (await askQuote()).body;
    const turn = await send(quote.quoteId);
    expect(turn.status).toBe(200);
    expect(calls("reserveCredits")).toMatchObject([{ amount: 13, costUsd: 0.13 }]);
    // 1,000 tokens each way: 3 credits of the 13 held.
    expect(calls("deductCredits")).toMatchObject([{ amount: 13, actualAmount: 3, actualCostUsd: 0.03 }]);
    expect(credits()).toBe(97);
    expect(turn.text).toContain('"creditsCharged":3');
    expect(turn.text).toContain('"maximumCredits":13');
    expect(await storedQuotes()).toMatchObject([{ usedBy: expect.stringMatching(/^chat-/), chargedCredits: 3, usedFallbackEstimate: false }]);
  });

  it("quote → accept → provider failure → release: the whole hold returns and the quote cannot be used again", async () => {
    const { quote } = (await askQuote()).body;
    providerStreamImpl.mockImplementation(async () => answer({ input: 1000, output: 1000 }, true));
    const failed = await send(quote.quoteId);
    expect(failed.status).toBe(200);
    expect(calls("reserveCredits")).toMatchObject([{ amount: 13 }]);
    expect(calls("releaseReservation")).toHaveLength(1);
    expect(calls("deductCredits")).toHaveLength(0);
    expect(credits()).toBe(100);
    expect(failed.text).toContain('"creditsRefunded":13');
    expect((await storedQuotes())[0].chargedCredits).toBeUndefined();

    providerStreamImpl.mockImplementation(async () => answer());
    const again = await send(quote.quoteId);
    expect(again.status).toBe(409);
    expect(again.json()).toMatchObject({ error: "Quote stale", reason: "used", quote: { estimateCredits: 3, maximumCredits: 13 } });
    expect(calls("reserveCredits")).toHaveLength(1);
  });

  it("refuses an expired quote before any hold or provider call, and answers with a fresh one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-13T12:00:00Z"));
    const { quote } = (await askQuote()).body;
    vi.setSystemTime(Date.parse("2026-11-13T12:05:00Z"));
    const stale = await send(quote.quoteId);
    expect(stale.status).toBe(409);
    expect(stale.json()).toMatchObject({ error: "Quote stale", reason: "expired", quote: { estimateCredits: 3, maximumCredits: 13, expiresAt: Date.parse("2026-11-13T12:10:00Z") } });
    expectNothingStarted();
    expect((await send(stale.json().quote.quoteId)).status).toBe(200);
    expect(calls("reserveCredits")).toMatchObject([{ amount: 13 }]);
  });

  it("refuses a missing, tampered or other-session quote id the same way", async () => {
    const { quote } = (await askQuote()).body;
    for (const quoteId of [undefined, "not-a-quote", `${quote.quoteId.slice(0, -1)}${quote.quoteId.endsWith("a") ? "b" : "a"}`]) {
      const refused = await send(quoteId);
      expect(refused.status).toBe(409);
      expect(refused.json()).toMatchObject({ error: "Quote stale", reason: "missing", quote: { estimateCredits: 3, maximumCredits: 13 } });
    }
    state.sessions.set("other-session", { ...fixtures.sessions.paidWithCredits, sid: "other-session", credits: 100 });
    sid.value = "other-session";
    const other = await send(quote.quoteId);
    expect(other.status).toBe(409);
    expect(other.json()).toMatchObject({ error: "Quote stale", reason: "missing" });
    expectNothingStarted();
    sid.value = "test-session";
    expect((await send(quote.quoteId)).status).toBe(200);
  });

  it("refuses acceptance after the model's price changed, with a fresh quote at the new price", async () => {
    const { quote } = (await askQuote()).body;
    pricing.value = { ...DEFAULT_PRICING, completion: "0.00003" };
    const stale = await send(quote.quoteId);
    expect(stale.status).toBe(409);
    // Typical turn: $0.04 → 5 credits. Maximum: (8,000 × $0.00001 + 2,048 × $0.00003) × 1.25 → 18 credits.
    expect(stale.json()).toMatchObject({ error: "Quote stale", reason: "changed", quote: { estimateCredits: 5, maximumCredits: 18 } });
    expectNothingStarted();
    expect((await send(stale.json().quote.quoteId)).status).toBe(200);
    expect(calls("reserveCredits")).toMatchObject([{ amount: 18 }]);
  });

  it("refuses a quote issued for another model", async () => {
    const { quote } = (await askQuote("test/model")).body;
    const stale = await send(quote.quoteId, { model: "test/another-model" });
    expect(stale.status).toBe(409);
    expect(stale.json()).toMatchObject({ error: "Quote stale", reason: "changed" });
    expectNothingStarted();
  });

  it("caps settlement at the accepted maximum when usage comes in above it", async () => {
    const { quote } = (await askQuote()).body;
    providerStreamImpl.mockImplementation(async () => answer({ input: 20_000, output: 5_000 })); // 32 credits at these prices
    const turn = await send(quote.quoteId);
    expect(turn.status).toBe(200);
    // The charge is capped; the daily limit still counts what the turn was worth.
    expect(calls("deductCredits")).toMatchObject([{ amount: 13, actualAmount: 13, actualCostUsd: 0.32 }]);
    expect(credits()).toBe(87);
    expect(turn.text).toContain('"creditsCharged":13');
    expect(turn.text).toContain('"actualCredits":32');
    expect((await storedQuotes())[0]).toMatchObject({ chargedCredits: 13, usedFallbackEstimate: false });
  });

  it("charges the accepted estimate when the provider reports no usage, and records the charge as estimated", async () => {
    const { quote } = (await askQuote()).body;
    providerStreamImpl.mockImplementation(async () => answer(null));
    const turn = await send(quote.quoteId);
    expect(turn.status).toBe(200);
    expect(calls("deductCredits")).toMatchObject([{ amount: 13, actualAmount: 3 }]);
    expect(credits()).toBe(97);
    expect((await storedQuotes())[0]).toMatchObject({ chargedCredits: 3, usedFallbackEstimate: true });
  });

  it.each([
    ["only the input count", { input: 1000 }],
    ["only the output count", { output: 1000 }],
  ])("charges the accepted estimate when the provider reports %s", async (_name, usage) => {
    const { quote } = (await askQuote()).body;
    providerStreamImpl.mockImplementation(async () => answer(usage));
    expect((await send(quote.quoteId)).status).toBe(200);
    expect(calls("deductCredits")).toMatchObject([{ amount: 13, actualAmount: 3 }]);
    expect((await storedQuotes())[0]).toMatchObject({ chargedCredits: 3, usedFallbackEstimate: true });
  });

  it("charges a reported zero as actual usage, at the one-credit minimum", async () => {
    const { quote } = (await askQuote()).body;
    providerStreamImpl.mockImplementation(async () => answer({ input: 0, output: 0 }));
    expect((await send(quote.quoteId)).status).toBe(200);
    expect(calls("deductCredits")).toMatchObject([{ amount: 13, actualAmount: 1 }]);
    expect((await storedQuotes())[0]).toMatchObject({ chargedCredits: 1, usedFallbackEstimate: false });
  });

  it("refuses reuse of a quote id by a second turn", async () => {
    const { quote } = (await askQuote()).body;
    expect((await send(quote.quoteId)).status).toBe(200);
    const reused = await send(quote.quoteId);
    expect(reused.status).toBe(409);
    expect(reused.json()).toMatchObject({ error: "Quote stale", reason: "used" });
    expect(calls("reserveCredits")).toHaveLength(1);
    expect(providerStreamImpl).toHaveBeenCalledTimes(1);
    expect(credits()).toBe(97);
  });

  it("requires the whole maximum to be affordable, when quoting and when sending", async () => {
    setSession({ credits: 12 });
    const quoted = await askQuote();
    expect(quoted.status).toBe(402);
    expect(quoted.body).toMatchObject({ error: "Insufficient credits", required: 13, available: 12 });
    const turn = await send("any");
    expect(turn.status).toBe(402);
    expect(turn.json()).toMatchObject({ error: "Insufficient credits", required: 13, available: 12 });
    expect(await storedQuotes()).toHaveLength(0);
    expectNothingStarted();
  });

  it("gives the owner nothing to accept and lets the owner chat without a quote", async () => {
    setSession({ tier: "admin", credits: 0 });
    expect(await askQuote()).toEqual({ status: 200, body: { quote: null } });
    expect((await send()).status).toBe(200);
    expect(calls("reserveCredits")).toHaveLength(0);
    expect(calls("logAdminUsage")).toHaveLength(1);
    expect(await storedQuotes()).toHaveLength(0);
  });

  it("does not quote a model that cannot be priced", async () => {
    pricing.value = null;
    expect((await askQuote("test/unknown")).status).toBe(400);
    expect(await storedQuotes()).toHaveLength(0);
  });
});
