/**
 * Integration tests for chat API stream handling.
 * Tests stream cancellation, errors, and credit settlement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fixtures, type Session } from "../shared/test-fixtures";
import { providerStream } from "../shared/chat-provider";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

// Create mock state
const mockState = {
  sessions: new Map<string, Session>(),
  callHistory: [] as Array<{ action: string; args: unknown }>,
  ledger: [] as Array<{ sid: string; delta: number; reason: string; generationId?: string }>,
};

// Set env vars before imports
process.env.OPENROUTER_API_KEY = "test-api-key";
process.env.CONVEX_URL = "https://test.convex.cloud";
process.env.CONVEX_SERVER_SECRET = "test-server-secret";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.IP_HASH_SECRET = "b".repeat(32);

// Store original env AFTER setting test vars
const originalEnv = { ...process.env };

// Mock modules
vi.mock("@/lib/validate-env", () => ({
  validateSecurityEnv: vi.fn(),
  validateSessionSecret: vi.fn(),
  validateIpHashSecret: vi.fn(),
  validateConvexSecret: vi.fn(),
  validateAdminSecret: vi.fn(),
  validateProxyConfig: vi.fn(),
}));

vi.mock("@/lib/origin", () => ({
  validateOrigin: vi.fn(() => true),
  invalidOriginResponse: vi.fn(() => new Response("Invalid origin", { status: 403 })),
}));

vi.mock("@/lib/session", () => ({
  validateSessionWithIp: vi.fn(async () => ({
    valid: true,
    sid: "test-session",
    currentIpHash: "mock-ip-hash",
  })),
  getClientIp: vi.fn(() => "127.0.0.1"),
  hashIp: vi.fn(async () => "mock-ip-hash"),
  withSessionRefreshCookie: vi.fn((response: Response) => response),
}));

const mockRequestBody: { value: unknown } = { value: null };

vi.mock("@/lib/request-body", () => ({
  readJsonBodyWithLimit: vi.fn(async () => mockRequestBody.value),
  PayloadTooLargeError: class PayloadTooLargeError extends Error {
    maxSize: number;
    constructor(maxSize: number) {
      super("Payload too large");
      this.maxSize = maxSize;
    }
  },
  InvalidJsonError: class InvalidJsonError extends Error {},
  DEFAULT_MAX_BODY_SIZE: 1024 * 1024,
}));

// Mock Convex client - uses args-based dispatch to avoid String(apiPath) error
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => ({
    query: vi.fn(async (_apiPath: unknown, args: Record<string, unknown>) => {
      // Query for session data
      const sid = args.sid as string;
      const session = mockState.sessions.get(sid);
      return session || null;
    }),
    mutation: vi.fn(async () => {
      // Rate limit always passes
      return { allowed: true, retryAfter: 0 };
    }),
    action: vi.fn(async (_apiPath: unknown, args: Record<string, unknown>) => {
      const sid = args.sid as string;
      const session = mockState.sessions.get(sid);

      // Dispatch based on args structure
      if ("endpoint" in args && "estimatedCredits" in args) {
        // logAdminUsage
        mockState.callHistory.push({ action: "logAdminUsage", args });
        return;
      }

      if ("generationId" in args && !("amount" in args)) {
        // releaseReservation
        mockState.callHistory.push({ action: "releaseReservation", args });
        if (!session) return { success: false, error: "Session not found" };
        const reservation = mockState.ledger.find(
          (e) => e.sid === sid && e.generationId === args.generationId && e.reason === "reservation"
        );
        if (reservation) {
          session.credits += Math.abs(reservation.delta);
          mockState.ledger.push({ sid, delta: Math.abs(reservation.delta), reason: "refund", generationId: args.generationId as string });
        }
        return { success: true, newBalance: session?.credits ?? 0 };
      }

      if ("modelId" in args && "generationId" in args && "amount" in args) {
        const generationId = args.generationId as string;
        const existingReservation = mockState.ledger.find(
          (e) => e.generationId === generationId && e.reason === "reservation"
        );

        if (existingReservation) {
          // deductCredits (reservation already exists for this generationId)
          mockState.callHistory.push({ action: "deductCredits", args });
          if (!session) return { success: false, error: "Session not found" };
          mockState.ledger.push({ sid, delta: -(args.amount as number), reason: "generation", generationId });
          return { success: true, newBalance: session.credits };
        } else {
          // reserveCredits (no existing reservation)
          mockState.callHistory.push({ action: "reserveCredits", args });
          if (!session) return { success: false, error: "Session not found" };

          const amount = args.amount as number;
          if (session.credits < amount) {
            return {
              success: false,
              error: "Insufficient credits",
              required: amount,
              available: session.credits,
            };
          }

          session.credits -= amount;
          mockState.ledger.push({ sid, delta: -amount, reason: "reservation", generationId });
          return { success: true, newBalance: session.credits };
        }
      }

      return;
    }),
  })),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

const mockStreamTextImpl = vi.fn();
vi.mock("@ai-sdk/openai", async () => {
  const { MockLanguageModelV3 } = await import("ai/test");
  return { createOpenAI: vi.fn(() => ({
    chat: vi.fn(() => new MockLanguageModelV3({ doStream: mockStreamTextImpl })),
  })) };
});

vi.mock("@/lib/chat-models", () => ({
  DEFAULT_CHAT_MODEL: "test/cheap-model",
  getChatModelPricing: vi.fn(async () => ({ prompt: "0.001", completion: "0.002" })),
  computeChatCreditsCost: vi.fn(() => 2),
  computeActualChatCreditsCost: vi.fn(() => 2),
  CREDIT_USD: 0.01,
}));

const { POST } = await import("../../chat/route");
const request = (signal?: AbortSignal) => new Request("http://localhost:3000/api/chat", {
  method: "POST", headers: { "Content-Type": "application/json" }, signal,
});
function calls(action: string) {
  return mockState.callHistory.filter((call) => call.action === action);
}

function pendingProvider() {
  let controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>;
  let providerSignal: AbortSignal | undefined;
  const stream = new ReadableStream<LanguageModelV3StreamPart>({
    start(c) {
      controller = c;
      c.enqueue({ type: "stream-start", warnings: [] });
      c.enqueue({ type: "text-start", id: "answer" });
      c.enqueue({ type: "text-delta", id: "answer", delta: "Partial" });
    },
  });
  mockStreamTextImpl.mockImplementation(async (options: { abortSignal?: AbortSignal }) => {
    providerSignal = options.abortSignal;
    options.abortSignal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
    return { stream };
  });
  return { signal: () => providerSignal };
}

describe("chat SDK outcomes and settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.sessions.clear();
    mockState.sessions.set("test-session", { ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 100 });
    mockState.callHistory.length = 0;
    mockState.ledger.length = 0;
    mockRequestBody.value = { messages: fixtures.messages.valid };
    mockStreamTextImpl.mockReturnValue(providerStream());
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it.each(["stop", "length"] as const)("charges nonempty %s completion once and reports settled metadata", async (reason) => {
    mockStreamTextImpl.mockReturnValue(providerStream("Answer", reason));
    const response = await POST(request());
    const body = await response.text();
    expect(calls("deductCredits")).toHaveLength(1);
    expect(calls("releaseReservation")).toHaveLength(0);
    expect(body).toContain('"creditsCharged":2');
    expect(body).toContain('"incomplete":' + (reason === "length"));
    expect(mockState.sessions.get("test-session")?.credits).toBe(98);
  });

  it.each([
    ["", "stop", false], ["Partial", "error", false], ["Partial", "stop", true],
  ] as const)("releases unusable/error output (%s, %s, embedded=%s)", async (text, reason, embedded) => {
    mockStreamTextImpl.mockReturnValue(providerStream(text, reason, embedded));
    const body = await (await POST(request())).text();
    expect(calls("releaseReservation")).toHaveLength(1);
    expect(calls("deductCredits")).toHaveLength(0);
    expect(body).toContain('"creditsCharged":0');
    expect(body).toContain('"creditsRefunded":2');
    expect(mockState.sessions.get("test-session")?.credits).toBe(100);
  });

  it("propagates response-reader cancellation to the provider and releases once", async () => {
    const provider = pendingProvider();
    const response = await POST(request());
    const reader = response.body!.getReader();
    await reader.read();
    await vi.waitFor(() => expect(provider.signal()).toBeDefined());
    await reader.cancel("User stopped");
    // Cancellation propagates asynchronously through the SDK SSE transforms.
    await vi.waitFor(() => expect(provider.signal()?.aborted).toBe(true));
    expect(calls("releaseReservation")).toHaveLength(1);
    expect(calls("deductCredits")).toHaveLength(0);
  });

  it("propagates incoming request abort and releases once", async () => {
    const provider = pendingProvider();
    const abort = new AbortController();
    const response = await POST(request(abort.signal));
    const reading = response.text();
    await vi.waitFor(() => expect(provider.signal()).toBeDefined());
    abort.abort();
    await reading;
    expect(provider.signal()?.aborted).toBe(true);
    expect(calls("releaseReservation")).toHaveLength(1);
    expect(calls("deductCredits")).toHaveLength(0);
  });

  it("does not reverse a completed settlement on late cancellation", async () => {
    const abort = new AbortController();
    await (await POST(request(abort.signal))).text();
    abort.abort();
    expect(calls("deductCredits")).toHaveLength(1);
    expect(calls("releaseReservation")).toHaveLength(0);
  });
});
