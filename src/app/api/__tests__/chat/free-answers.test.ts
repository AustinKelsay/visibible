/**
 * Free answers (#493) through the real chat and quote routes: which turns are free, that a free turn holds no credits
 * and uses its own key, and how its reservation against the free budget is settled. Convex is faked by argument
 * shape; the counting itself is tested in tests/convex/free-answers.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fixtures, type Session } from "../shared/test-fixtures";
import { providerStream } from "../shared/chat-provider";

const mockState = {
  sessions: new Map<string, Session>(),
  calls: [] as Array<{ action: string; args: Record<string, unknown> }>,
  freeAnswer: { allowed: true, remaining: 19 } as { allowed: true; remaining: number } | { allowed: false; reason: string },
  freeFails: false,
};

process.env.OPENROUTER_API_KEY = "test-api-key";
process.env.CONVEX_URL = "https://test.convex.cloud";
process.env.CONVEX_SERVER_SECRET = "test-server-secret";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.IP_HASH_SECRET = "b".repeat(32);
const originalEnv = { ...process.env };

vi.mock("@/lib/validate-env", () => ({
  validateSecurityEnv: vi.fn(), validateSessionSecret: vi.fn(), validateIpHashSecret: vi.fn(),
  validateConvexSecret: vi.fn(), validateAdminSecret: vi.fn(), validateProxyConfig: vi.fn(),
}));
vi.mock("@/lib/origin", () => ({
  validateOrigin: vi.fn(() => true),
  invalidOriginResponse: vi.fn(() => new Response("Invalid origin", { status: 403 })),
}));
const clientIp = { value: "2001:db8:1:2:3:4:5:6" };
vi.mock("@/lib/session", () => ({
  validateSessionWithIp: vi.fn(async () => ({ valid: true, sid: "test-session", currentIpHash: "mock-ip-hash" })),
  getClientIp: vi.fn(() => clientIp.value),
  hashIp: vi.fn(async (value: string) => `hash(${value})`),
  withSessionRefreshCookie: vi.fn((response: Response) => response),
}));
const mockRequestBody: { value: unknown } = { value: null };
vi.mock("@/lib/request-body", () => ({
  readJsonBodyWithLimit: vi.fn(async () => mockRequestBody.value),
  PayloadTooLargeError: class PayloadTooLargeError extends Error { maxSize = 0; },
  InvalidJsonError: class InvalidJsonError extends Error {},
  DEFAULT_MAX_BODY_SIZE: 1024 * 1024,
}));

const record = (action: string, args: Record<string, unknown>) => { mockState.calls.push({ action, args }); };
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => ({
    query: vi.fn(async (_path: unknown, args: Record<string, unknown>) => {
      if ("worstCaseUsd" in args) {
        record("freeStatus", args);
        if (mockState.freeFails) throw new Error("Convex unavailable");
        return mockState.freeAnswer.allowed
          ? { available: true, remaining: mockState.freeAnswer.remaining }
          : { available: false, reason: mockState.freeAnswer.reason };
      }
      return mockState.sessions.get(args.sid as string) ?? null;
    }),
    mutation: vi.fn(async (_path: unknown, args: Record<string, unknown> = {}) => {
      if ("worstCaseUsd" in args && "generationId" in args) {
        record("freeReserve", args);
        if (mockState.freeFails) throw new Error("Convex unavailable");
        return mockState.freeAnswer;
      }
      if ("outcome" in args) {
        record("freeSettle", args);
        return { settled: true, monthSpentUsd: 1, monthWarning: false };
      }
      if ("chargedCredits" in args) return { recorded: true };
      if ("quoteId" in args && "usedBy" in args) {
        record("acceptQuote", args);
        return { accepted: true, replay: false, estimateCredits: args.estimateCredits, maximumCredits: args.maximumCredits };
      }
      if ("fingerprint" in args) {
        record("createQuote", args);
        return { quoteId: "fresh-quote", operation: "chat", policyVersion: "v", estimateCredits: args.estimateCredits, maximumCredits: args.maximumCredits, expiresAt: 1 };
      }
      return { allowed: true, retryAfter: 0 };
    }),
    action: vi.fn(async (_path: unknown, args: Record<string, unknown>) => {
      if ("amount" in args && "modelId" in args) {
        const reserved = mockState.calls.some((call) => call.action === "reserveCredits" && call.args.generationId === args.generationId);
        record(reserved ? "deductCredits" : "reserveCredits", args);
        return { success: true, newBalance: 0 };
      }
      if ("generationId" in args) {
        record("releaseReservation", args);
        return { success: true, newBalance: 0 };
      }
      if ("endpoint" in args) record("logAdminUsage", args);
      return undefined;
    }),
  })),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

const mockStreamTextImpl = vi.fn();
const providerKeys: string[] = [];
vi.mock("@ai-sdk/openai", async () => {
  const { MockLanguageModelV3 } = await import("ai/test");
  return { createOpenAI: vi.fn((settings: { apiKey?: string }) => ({
    chat: vi.fn(() => {
      providerKeys.push(settings.apiKey ?? "");
      return new MockLanguageModelV3({ doStream: mockStreamTextImpl });
    }),
  })) };
});

vi.mock("@/lib/chat-models", () => ({
  DEFAULT_CHAT_MODEL: "test/default-model",
  getChatModelPricing: vi.fn(async () => ({ prompt: "0.000001", completion: "0.000002", contextLength: 131072 })),
  computeChatCreditsCost: vi.fn(() => 2),
  computeActualChatCreditsCost: vi.fn(() => 2),
  CREDIT_USD: 0.01,
}));
vi.mock("@/lib/scripture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scripture")>()),
  getChapter: vi.fn(async () => ({
    bookId: "JHN", bookName: "John", chapter: 1, translationId: "web", translationName: "World English Bible",
    verses: [1, 2, 3, 4, 5, 6].map((verse) => ({ bookId: "JHN", bookName: "John", chapter: 1, verse, text: `Verse ${verse}.` })),
  })),
}));

const { POST } = await import("../../chat/route");
const { POST: QUOTE } = await import("../../chat/quote/route");

const request = (path = "/api/chat") => new Request(`http://localhost:3000${path}`, { method: "POST", headers: { "Content-Type": "application/json" } });
const calls = (action: string) => mockState.calls.filter((call) => call.action === action).map((call) => call.args);
const question = (model?: string, quoteId?: string) => ({
  messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "What does this verse mean?" }] }],
  context: { book: "John", chapter: 1, verseRange: "5" },
  translation: "web",
  ...(model ? { model } : {}),
  ...(quoteId ? { quoteId } : {}),
});
async function ask(body: unknown = question()) {
  mockRequestBody.value = body;
  const response = await POST(request());
  return { response, text: response.ok ? await response.text() : "" };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FREE_ASK_ENABLED = "true";
  process.env.OPENROUTER_FREE_ASK_API_KEY = "free-key";
  mockState.sessions.clear();
  mockState.sessions.set("test-session", { ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 0 });
  mockState.calls.length = 0;
  mockState.freeAnswer = { allowed: true, remaining: 19 };
  mockState.freeFails = false;
  clientIp.value = "2001:db8:1:2:3:4:5:6";
  providerKeys.length = 0;
  mockStreamTextImpl.mockImplementation(async () => providerStream());
});
afterEach(() => { process.env = { ...originalEnv }; });

describe("a free answer", () => {
  it("answers a guest with no credits on the default model, holding no credits, on the free key", async () => {
    const { response, text } = await ask();
    expect(response.status).toBe(200);
    expect(text).toContain("Hello world!");
    expect(text).toContain('"billingStatus":"free"');

    const [reserve] = calls("freeReserve");
    // The network is the IPv6 /64, hashed; the hold is the turn's worst case at list price plus the margin.
    expect(reserve).toMatchObject({ sid: "test-session", network: "hash(2001:db8:1:2::/64)" });
    expect(reserve.worstCaseUsd).toBeGreaterThan(0);
    expect(calls("acceptQuote")).toHaveLength(0);
    expect(calls("reserveCredits")).toHaveLength(0);
    expect(providerKeys).toEqual(["free-key"]);

    // Settled at the reported usage (1,000 tokens each way) at list price, plus 10%.
    const [settle] = calls("freeSettle");
    expect(settle).toMatchObject({ generationId: reserve.generationId, outcome: "settled" });
    expect(settle.costUsd).toBeCloseTo((1000 * 0.000001 + 1000 * 0.000002) * 1.1, 10);
  });

  it("is the default model's: a guest who names another model pays for it with credits", async () => {
    mockState.sessions.get("test-session")!.credits = 100;
    const { response } = await ask(question("other/model", "accepted-quote"));
    expect(response.status).toBe(200);
    expect(calls("freeReserve")).toHaveLength(0);
    expect(calls("reserveCredits")).toHaveLength(1);
    expect(providerKeys).toEqual(["test-api-key"]);
  });

  it("gives the turn back when the call fails before any text", async () => {
    mockStreamTextImpl.mockRejectedValue(Object.assign(new Error("Provider down"), { isRetryable: true }));
    await ask();
    expect(mockStreamTextImpl).toHaveBeenCalledTimes(1); // no retry outside the reservation
    expect(calls("freeSettle")).toEqual([expect.objectContaining({ outcome: "returned" })]);
  });

  it("keeps the worst case counted when the call fails after text arrived", async () => {
    mockStreamTextImpl.mockImplementation(async () => providerStream("Partial answer", "stop", true));
    await ask();
    const settles = calls("freeSettle");
    expect(settles).toHaveLength(1);
    expect(settles[0]).toMatchObject({ outcome: "settled" });
    expect(settles[0]).not.toHaveProperty("costUsd");
  });

  it("keeps the worst case counted when the reader cancels, even before any text", async () => {
    mockStreamTextImpl.mockImplementation(async () => ({ stream: new ReadableStream({ start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
    } }) }));
    mockRequestBody.value = question();
    const response = await POST(request());
    await response.body!.cancel();
    await vi.waitFor(() => expect(calls("freeSettle")).toHaveLength(1));
    expect(calls("freeSettle")[0]).toMatchObject({ outcome: "settled" });
    expect(calls("freeSettle")[0]).not.toHaveProperty("costUsd");
  });
});

describe("when the turn is not free", () => {
  it("says why when the allowance is used up and the guest cannot pay", async () => {
    mockState.freeAnswer = { allowed: false, reason: "session" };
    const { response } = await ask();
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body).toMatchObject({ error: "Insufficient credits", free: { available: false, reason: "session" } });
    expect(body.message).toBe("You've used today's free answers. They return at midnight UTC.");
    expect(mockStreamTextImpl).not.toHaveBeenCalled();
  });

  it("goes on to the paid turn when the allowance is used up and the guest has credits", async () => {
    mockState.freeAnswer = { allowed: false, reason: "network" };
    mockState.sessions.get("test-session")!.credits = 100;
    const { response } = await ask(question(undefined, "accepted-quote"));
    expect(response.status).toBe(200);
    expect(calls("acceptQuote")).toHaveLength(1);
    expect(calls("reserveCredits")).toHaveLength(1);
    expect(providerKeys).toEqual(["test-api-key"]);
  });

  it("is never free when free answers are off, or have no key of their own", async () => {
    delete process.env.FREE_ASK_ENABLED;
    expect((await ask()).response.status).toBe(402);
    process.env.FREE_ASK_ENABLED = "true";
    delete process.env.OPENROUTER_FREE_ASK_API_KEY;
    expect((await ask()).response.status).toBe(402);
    expect(calls("freeReserve")).toHaveLength(0);
  });

  it("is never free when the client address is unknown or the count cannot be kept", async () => {
    clientIp.value = "unknown";
    expect((await ask()).response.status).toBe(402);
    expect(calls("freeReserve")).toHaveLength(0);

    clientIp.value = "203.0.113.9";
    mockState.freeFails = true;
    expect((await ask()).response.status).toBe(402);
    expect(calls("freeReserve")).toEqual([expect.objectContaining({ network: "hash(203.0.113.9)" })]);
    expect(mockStreamTextImpl).not.toHaveBeenCalled();
  });

  it("is never offered to the owner, who is not charged anyway", async () => {
    mockState.sessions.get("test-session")!.tier = "admin";
    const { response } = await ask();
    expect(response.status).toBe(200);
    expect(calls("freeReserve")).toHaveLength(0);
    expect(providerKeys).toEqual(["test-api-key"]);
  });
});

describe("the quote route", () => {
  const quote = async (body: unknown = { context: { book: "John", chapter: 1, verseRange: "5" }, translation: "web" }) => {
    mockRequestBody.value = body;
    const response = await QUOTE(request("/api/chat/quote"));
    return { status: response.status, body: await response.json() };
  };

  it("says the next answer is free instead of quoting, reserving nothing", async () => {
    expect(await quote()).toEqual({ status: 200, body: { quote: null, free: { available: true, remaining: 19 } } });
    expect(calls("freeStatus")).toHaveLength(1);
    expect(calls("freeReserve")).toHaveLength(0);
    expect(calls("createQuote")).toHaveLength(0);
  });

  it("says why beside the usual answer when free answers are used up", async () => {
    mockState.freeAnswer = { allowed: false, reason: "day" };
    expect(await quote()).toMatchObject({ status: 402, body: { error: "Insufficient credits", free: { available: false, reason: "day" } } });

    mockState.sessions.get("test-session")!.credits = 100;
    expect(await quote()).toMatchObject({ status: 200, body: { quote: { quoteId: "fresh-quote" }, free: { available: false, reason: "day" } } });
  });

  it("quotes as before for another model, or when free answers are off", async () => {
    mockState.sessions.get("test-session")!.credits = 100;
    expect((await quote({ model: "other/model" })).body).toEqual({ quote: expect.objectContaining({ quoteId: "fresh-quote" }) });
    delete process.env.FREE_ASK_ENABLED;
    expect((await quote()).body).toEqual({ quote: expect.objectContaining({ quoteId: "fresh-quote" }) });
    expect(calls("freeStatus")).toHaveLength(0);
  });
});
