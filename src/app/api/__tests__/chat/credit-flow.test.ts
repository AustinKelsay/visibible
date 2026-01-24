/**
 * Integration tests for chat API credit flow.
 * Tests the reserve → stream → deduct lifecycle and error handling.
 *
 * Note: These tests mock the Convex client at a high level to verify
 * the orchestration logic in the route handlers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fixtures, type Session } from "../shared/test-fixtures";

// Create mock state - mocks reference this at call time
const mockState = {
  sessions: new Map<string, Session>(),
  callHistory: [] as Array<{ action: string; args: Record<string, unknown> }>,
  ledger: [] as Array<{ sid: string; delta: number; reason: string }>,
  adminAuditLog: [] as Array<{ sid: string; endpoint: string }>,
};

// Set env vars before imports
process.env.OPENROUTER_API_KEY = "test-api-key";
process.env.CONVEX_URL = "https://test.convex.cloud";
process.env.CONVEX_SERVER_SECRET = "test-server-secret";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.IP_HASH_SECRET = "b".repeat(32);

// Store original env AFTER setting test vars so they're preserved
const originalEnv = { ...process.env };

// Configurable mock values
const mockCreditsCost = { value: 2 };
const mockRequestBody: { value: unknown } = { value: null };
const mockStreamTextImpl = vi.fn();

// Mock modules - these run once at module load time but read from mockState at call time
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
}));

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

// Mock Convex client - reads from mockState at call time
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => ({
    query: vi.fn(async (_apiPath: unknown, args: Record<string, unknown>) => {
      const sid = args.sid as string;
      const session = mockState.sessions.get(sid);
      return session || null;
    }),
    mutation: vi.fn(async () => {
      return { allowed: true, retryAfter: 0 };
    }),
    action: vi.fn(async (_apiPath: unknown, args: Record<string, unknown>) => {
      const sid = args.sid as string;
      const session = mockState.sessions.get(sid);

      // Determine which action based on args
      if ("endpoint" in args && "estimatedCredits" in args) {
        // logAdminUsage
        mockState.callHistory.push({ action: "logAdminUsage", args });
        mockState.adminAuditLog.push({ sid, endpoint: args.endpoint as string });
        return;
      }

      if ("generationId" in args && !("amount" in args)) {
        // releaseReservation
        mockState.callHistory.push({ action: "releaseReservation", args });
        if (!session) return { success: false, error: "Session not found" };
        const reservation = mockState.ledger.find(
          (e) => e.sid === sid && e.reason === "reservation"
        );
        if (reservation) {
          session.credits += Math.abs(reservation.delta);
          mockState.ledger.push({ sid, delta: Math.abs(reservation.delta), reason: "refund" });
        }
        return { success: true, newBalance: session?.credits ?? 0 };
      }

      if ("modelId" in args && "generationId" in args && "amount" in args) {
        const existingReservation = mockState.ledger.find(
          (e) => e.sid === sid && e.reason === "reservation"
        );

        if (existingReservation) {
          // deductCredits (reservation already exists)
          mockState.callHistory.push({ action: "deductCredits", args });
          if (!session) return { success: false, error: "Session not found" };
          mockState.ledger.push({ sid, delta: -(args.amount as number), reason: "generation" });
          return { success: true, newBalance: session.credits };
        } else {
          // reserveCredits (no existing reservation)
          mockState.callHistory.push({ action: "reserveCredits", args });
          if (!session) return { success: false, error: "Session not found" };

          const amount = args.amount as number;
          const costUsd = (args.costUsd as number) || 0;
          const dailyLimit = session.dailySpendLimitUsd ?? 5.0;
          const currentDailySpend = session.dailySpendUsd ?? 0;

          if (session.tier !== "admin" && currentDailySpend + costUsd > dailyLimit) {
            return {
              success: false,
              error: "Daily spending limit exceeded",
              dailyLimit,
              dailySpent: currentDailySpend,
              remaining: Math.max(0, dailyLimit - currentDailySpend),
            };
          }

          if (session.credits < amount) {
            return {
              success: false,
              error: "Insufficient credits",
              required: amount,
              available: session.credits,
            };
          }

          session.credits -= amount;
          mockState.ledger.push({ sid, delta: -amount, reason: "reservation" });
          return { success: true, newBalance: session.credits };
        }
      }

      return;
    }),
  })),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

// Mock streamText - delegates to mockStreamTextImpl which can be reconfigured
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => mockStreamTextImpl(...args),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => ({
    chat: vi.fn((modelId: string) => ({ modelId, provider: "openrouter" })),
  })),
}));

// Mock chat-models with configurable cost
vi.mock("@/lib/chat-models", () => ({
  DEFAULT_CHAT_MODEL: "test/cheap-model",
  getChatModelPricing: vi.fn(async () => ({ prompt: "0.001", completion: "0.002" })),
  computeChatCreditsCost: vi.fn(() => mockCreditsCost.value),
  computeActualChatCreditsCost: vi.fn(() => mockCreditsCost.value),
  CREDIT_USD: 0.01,
}));

// Import route AFTER all mocks are set up
import { POST } from "../../chat/route";

// Helper to create mock stream response
function createMockStreamResponse(chunks: string[] = ["Hello", " world!"]) {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunkIndex >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[chunkIndex]));
      chunkIndex++;
    },
  });

  return {
    toUIMessageStreamResponse: vi.fn(() => {
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  };
}

// Helper functions
function resetMockState(sessions: Session[] = []) {
  mockState.sessions.clear();
  sessions.forEach((s) => mockState.sessions.set(s.sid, { ...s }));
  mockState.callHistory.length = 0;
  mockState.ledger.length = 0;
  mockState.adminAuditLog.length = 0;
}

function getCallCount(action: string) {
  return mockState.callHistory.filter((c) => c.action === action).length;
}

describe("Chat API Credit Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session" }]);
    mockCreditsCost.value = 2;
    mockRequestBody.value = { messages: fixtures.messages.valid };
    mockStreamTextImpl.mockReturnValue(createMockStreamResponse());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Happy Path", () => {
    it("reserve-stream-deduct: reserves credits and completes stream", async () => {
      resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session" }]);
      mockRequestBody.value = { messages: fixtures.messages.valid, context: fixtures.context.verse };
      mockStreamTextImpl.mockReturnValue(createMockStreamResponse());

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify reservation was made
      expect(getCallCount("reserveCredits")).toBe(1);

      // Read the stream to completion
      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      // Verify full reserve → stream → deduct cycle
      expect(getCallCount("deductCredits")).toBe(1);
    });

    it("admin-bypass-no-charge: admin user logs audit", async () => {
      resetMockState([{ ...fixtures.sessions.admin, sid: "test-session" }]);
      mockRequestBody.value = { messages: fixtures.messages.valid };
      mockStreamTextImpl.mockReturnValue(createMockStreamResponse());

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Admin should log usage
      expect(getCallCount("logAdminUsage")).toBe(1);
      expect(mockState.adminAuditLog.length).toBe(1);
      expect(mockState.adminAuditLog[0].endpoint).toBe("chat");
    });
  });

  describe("Error Paths", () => {
    it("insufficient-credits: returns 402 before reservation", async () => {
      resetMockState([{ ...fixtures.sessions.insufficientCredits, sid: "test-session" }]);
      mockStreamTextImpl.mockReturnValue(createMockStreamResponse());

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(402);

      const body = await response.json();
      expect(body.error).toBe("Insufficient credits");
    });

    it("reserve-fails-daily-limit: returns 429 with dailyLimit details", async () => {
      resetMockState([{ ...fixtures.sessions.paidAtDailyLimit, sid: "test-session" }]);
      mockStreamTextImpl.mockReturnValue(createMockStreamResponse());

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body.error).toBe("Daily spending limit exceeded");
      expect(body.dailyLimit).toBeDefined();
    });

    it("model-too-expensive: returns 400 if cost > 100 credits", async () => {
      resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session" }]);
      mockCreditsCost.value = 150;
      mockStreamTextImpl.mockReturnValue(createMockStreamResponse());

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("Request too expensive");
    });

    it("openrouter-rate-limit-429: returns 429 and releases credits", async () => {
      resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session" }]);
      mockStreamTextImpl.mockImplementation(() => {
        const error = new Error("Rate limited") as Error & { statusCode: number; responseBody: string };
        error.statusCode = 429;
        error.responseBody = JSON.stringify({ error: { message: "rate-limited" } });
        throw error;
      });

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body.error).toBe("Rate limit reached");
      expect(getCallCount("releaseReservation")).toBe(1);
    });

    it("generic-stream-error: returns 500 and releases credits", async () => {
      resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session" }]);
      mockStreamTextImpl.mockImplementation(() => {
        const error = new Error("API error") as Error & { statusCode: number; responseBody: string };
        error.statusCode = 500;
        error.responseBody = JSON.stringify({ error: { message: "Internal error" } });
        throw error;
      });

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.error).toBe("Failed to process chat request");
      expect(getCallCount("releaseReservation")).toBe(1);
    });
  });

  describe("Session Validation", () => {
    it("returns 401 when session is not found", async () => {
      resetMockState([]);
      mockStreamTextImpl.mockReturnValue(createMockStreamResponse());

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Session not found");
    });
  });

  describe("Request Validation", () => {
    it("returns 400 for invalid message format", async () => {
      resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session" }]);
      mockRequestBody.value = { messages: [] };
      mockStreamTextImpl.mockReturnValue(createMockStreamResponse());

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("Validation failed");
    });
  });
});
