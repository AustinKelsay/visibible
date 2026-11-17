/**
 * Stored answers to suggested questions (#505) through the real chat and quote routes: which turns are served from
 * storage (no model call, no free reservation, no credit hold), which are stored, and `fresh`. Convex is faked by
 * argument shape; the store itself is tested in tests/convex/stored-answers.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fixtures, type Session } from "../shared/test-fixtures";
import { providerStream } from "../shared/chat-provider";

const mockState = {
  sessions: new Map<string, Session>(),
  calls: [] as Array<{ action: string; args: Record<string, unknown> }>,
  freeAnswer: { allowed: true, remaining: 19 } as { allowed: true; remaining: number } | { allowed: false; reason: string },
  freeFails: false,
  stored: new Map<string, string>(),
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
      if ("keys" in args) { record("storedPresent", args); return (args.keys as string[]).filter((key) => mockState.stored.has(key)); }
      if ("key" in args) { record("storedGet", args); const row = mockState.stored.get(args.key as string); return row ? { answer: row, createdAt: 1_700_000_000_000 } : null; }
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
      if ("answer" in args && "key" in args) {
        record("storedSave", args);
        mockState.stored.set(args.key as string, args.answer as string);
        return { replaced: false };
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
  chatModelReasoningEffort: vi.fn(() => undefined),
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
const passage = { book: "John", chapter: 1, verseRange: "5" };
const turn = (text: string, extra: Record<string, unknown> = {}) => ({
  messages: [{ id: "u1", role: "user", parts: [{ type: "text", text }] }], context: passage, translation: "web", ...extra,
});
async function ask(body: unknown) {
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
  mockState.freeAnswer = { allowed: false, reason: "session" };
  mockState.freeFails = false;
  mockState.stored.clear();
  clientIp.value = "203.0.113.9";
  providerKeys.length = 0;
  mockStreamTextImpl.mockImplementation(async () => providerStream("A grounded answer."));
});
afterEach(() => { process.env = { ...originalEnv }; });

describe("a suggested question", () => {
  it("is answered by the model the first time, and the complete answer is stored", async () => {
    mockState.freeAnswer = { allowed: true, remaining: 19 };
    const { response, text } = await ask(turn("What does John 1:5 mean?"));
    expect(response.status).toBe(200);
    expect(text).toContain("A grounded answer.");
    expect(calls("storedGet")).toHaveLength(1);
    expect(calls("storedSave")).toEqual([expect.objectContaining({
      key: calls("storedGet")[0].key, reference: "John 1:5", translation: "web", question: "What does John 1:5 mean?",
      model: "test/default-model", answer: "A grounded answer.",
    })]);
  });

  it("is then served from storage to anyone, with no model call, no free answer and no credits", async () => {
    mockState.freeAnswer = { allowed: true, remaining: 19 };
    await ask(turn("Summarize John 1 so far"));
    vi.clearAllMocks();
    mockState.calls.length = 0;
    mockState.freeAnswer = { allowed: false, reason: "session" }; // and no credits
    const { response, text } = await ask(turn("Summarize John 1 so far"));
    expect(response.status).toBe(200);
    expect(text).toContain("A grounded answer.");
    expect(text).toContain('"stored":true');
    expect(text).toContain('"billingStatus":"stored"');
    expect(mockStreamTextImpl).not.toHaveBeenCalled();
    expect(calls("freeReserve")).toHaveLength(0);
    expect(calls("reserveCredits")).toHaveLength(0);
    expect(calls("storedSave")).toHaveLength(0);
  });

  it("asks the model again when the reader wants a fresh answer, and replaces the stored one", async () => {
    mockState.freeAnswer = { allowed: true, remaining: 19 };
    await ask(turn("What does John 1:5 mean?"));
    const key = calls("storedSave")[0].key as string;
    mockState.calls.length = 0;
    mockStreamTextImpl.mockImplementation(async () => providerStream("A fresher answer."));
    const { text } = await ask(turn("What does John 1:5 mean?", { fresh: true }));
    expect(text).toContain("A fresher answer.");
    expect(calls("storedGet")).toHaveLength(0);
    expect(calls("freeReserve")).toHaveLength(1);
    expect(mockState.stored.get(key)).toBe("A fresher answer.");
  });

  it("is not stored when the answer was cut short or failed", async () => {
    mockState.freeAnswer = { allowed: true, remaining: 19 };
    mockStreamTextImpl.mockImplementation(async () => providerStream("Cut", "length"));
    await ask(turn("What does John 1:5 mean?"));
    mockStreamTextImpl.mockImplementation(async () => providerStream("Partial", "stop", true));
    await ask(turn("What does John 1:5 mean?"));
    expect(calls("storedSave")).toHaveLength(0);
  });
});

describe("a stored answer and the session", () => {
  it("is not served to a session the server no longer has", async () => {
    mockState.freeAnswer = { allowed: true, remaining: 19 };
    await ask(turn("What does John 1:5 mean?"));
    mockState.sessions.clear();
    mockState.calls.length = 0;
    const { response } = await ask(turn("What does John 1:5 mean?"));
    expect(response.status).toBe(401);
    expect(calls("storedGet")).toHaveLength(0);
  });
});

describe("other questions", () => {
  it("are never served from storage or stored: a typed question, another verse's suggestion, or a follow-up", async () => {
    mockState.freeAnswer = { allowed: true, remaining: 19 };
    await ask(turn("Why is the light shining?"));
    await ask(turn("What does John 1:6 mean?"));
    await ask({ ...turn("x"), messages: [
      { id: "u1", role: "user", parts: [{ type: "text", text: "What does John 1:5 mean?" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "It means…" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "What does John 1:5 mean?" }] },
    ] });
    expect(calls("storedGet")).toHaveLength(0);
    expect(calls("storedSave")).toHaveLength(0);
  });
});

describe("the quote route", () => {
  it("lists the passage's suggestions that have a stored answer", async () => {
    mockState.freeAnswer = { allowed: true, remaining: 19 };
    await ask(turn("Summarize John 1 so far"));
    mockRequestBody.value = { context: passage, translation: "web" };
    const response = await QUOTE(request("/api/chat/quote"));
    expect(await response.json()).toMatchObject({ quote: null, free: { available: true }, stored: ["Summarize John 1 so far"] });
  });
});
