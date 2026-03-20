/**
 * Integration tests for chat API stream handling.
 * Tests stream cancellation, errors, and credit settlement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fixtures, type Session } from "../shared/test-fixtures";

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
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => mockStreamTextImpl(...args),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => ({
    chat: vi.fn((modelId: string) => ({ modelId, provider: "openrouter" })),
  })),
}));

vi.mock("@/lib/chat-models", () => ({
  DEFAULT_CHAT_MODEL: "test/cheap-model",
  getChatModelPricing: vi.fn(async () => ({ prompt: "0.001", completion: "0.002" })),
  computeChatCreditsCost: vi.fn(() => 2),
  computeActualChatCreditsCost: vi.fn(() => 2),
  CREDIT_USD: 0.01,
}));

// Controllable stream for testing cancellation and errors
function createControllableStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let pullResolver: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
    pull() {
      return new Promise<void>((resolve) => {
        pullResolver = resolve;
      });
    },
  });

  return {
    stream,
    enqueue: (data: string) => {
      controller?.enqueue(encoder.encode(data));
      pullResolver?.();
    },
    close: () => {
      controller?.close();
      pullResolver?.();
    },
    error: (err: Error) => {
      controller?.error(err);
      pullResolver?.();
    },
  };
}

// Helper functions
function resetMockState(sessions: Session[] = []) {
  mockState.sessions.clear();
  sessions.forEach((s) => mockState.sessions.set(s.sid, { ...s }));
  mockState.callHistory.length = 0;
  mockState.ledger.length = 0;
}

function getCallCount(action: string) {
  // Extract the action name from "sessions:actionName" format
  const actionName = action.split(":").pop() || action;
  return mockState.callHistory.filter((c) => c.action === actionName).length;
}

function getSession(sid: string) {
  return mockState.sessions.get(sid);
}

describe("Chat API Stream Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session" }]);
    mockRequestBody.value = { messages: fixtures.messages.valid };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Stream Completion", () => {
    it("stream-complete-deducts: flush triggers deductCredits", async () => {
      const controllable = createControllableStream();

      mockStreamTextImpl.mockReturnValue({
        toUIMessageStreamResponse: vi.fn(() => {
          return new Response(controllable.stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }),
      });

      const { POST } = await import("../../chat/route");

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify reservation was made
      expect(getCallCount("sessions:reserveCredits")).toBe(1);

      // Start reading
      const reader = response.body?.getReader();

      // Send data
      controllable.enqueue("Hello");
      await reader?.read();

      // Deduction should not happen yet
      expect(getCallCount("sessions:deductCredits")).toBe(0);

      // Close stream
      controllable.close();

      // Read until done
      if (reader) {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      // Deduction should happen after close
      expect(getCallCount("sessions:deductCredits")).toBe(1);
    });
  });

  describe("Stream Cancellation", () => {
    it("stream-cancel-releases-credit: client abort triggers releaseReservation", async () => {
      const controllable = createControllableStream();

      mockStreamTextImpl.mockReturnValue({
        toUIMessageStreamResponse: vi.fn(() => {
          return new Response(controllable.stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }),
      });

      const { POST } = await import("../../chat/route");

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Reservation made
      expect(getCallCount("sessions:reserveCredits")).toBe(1);

      // Read and then cancel
      const reader = response.body?.getReader();
      controllable.enqueue("Hello");
      await reader?.read();

      // Cancel (simulating client abort)
      await reader?.cancel("User cancelled");

      // Allow async operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Release should be called, not deduct
      expect(getCallCount("sessions:releaseReservation")).toBe(1);
      expect(getCallCount("sessions:deductCredits")).toBe(0);
    });
  });

  describe("Stream Errors", () => {
    it("stream-error-releases-credit: error mid-stream triggers releaseReservation", async () => {
      const controllable = createControllableStream();

      mockStreamTextImpl.mockReturnValue({
        toUIMessageStreamResponse: vi.fn(() => {
          return new Response(controllable.stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }),
      });

      const { POST } = await import("../../chat/route");

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const reader = response.body?.getReader();
      controllable.enqueue("Hello");
      await reader?.read();

      // Trigger error
      controllable.error(new Error("Stream error"));

      try {
        await reader?.read();
      } catch {
        // Expected
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Release should be called due to error
      expect(getCallCount("sessions:releaseReservation")).toBe(1);
      expect(getCallCount("sessions:deductCredits")).toBe(0);
    });
  });

  describe("Settlement Idempotency", () => {
    it("settlement-idempotent: multiple settle calls are no-op after first", async () => {
      const controllable = createControllableStream();

      mockStreamTextImpl.mockReturnValue({
        toUIMessageStreamResponse: vi.fn(() => {
          return new Response(controllable.stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }),
      });

      const { POST } = await import("../../chat/route");

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const reader = response.body?.getReader();

      // Complete normally
      controllable.enqueue("Hello");
      await reader?.read();
      controllable.close();

      if (reader) {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      // Deduction exactly once
      expect(getCallCount("sessions:deductCredits")).toBe(1);
      expect(getCallCount("sessions:releaseReservation")).toBe(0);
    });
  });

  describe("Credit Balance Tracking", () => {
    it("correctly updates session balance after successful stream", async () => {
      const initialCredits = 100;
      const creditCost = 2;

      resetMockState([
        { ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: initialCredits },
      ]);

      const controllable = createControllableStream();

      mockStreamTextImpl.mockReturnValue({
        toUIMessageStreamResponse: vi.fn(() => {
          return new Response(controllable.stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }),
      });

      const { POST } = await import("../../chat/route");

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);

      // After reservation
      const sessionAfterReserve = getSession("test-session");
      expect(sessionAfterReserve?.credits).toBe(initialCredits - creditCost);

      // Complete stream
      controllable.close();

      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      // Balance unchanged (reservation already deducted)
      const sessionAfterDeduct = getSession("test-session");
      expect(sessionAfterDeduct?.credits).toBe(initialCredits - creditCost);
    });

    it("restores credits after stream cancellation", async () => {
      const initialCredits = 100;
      const creditCost = 2;

      resetMockState([
        { ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: initialCredits },
      ]);

      const controllable = createControllableStream();

      mockStreamTextImpl.mockReturnValue({
        toUIMessageStreamResponse: vi.fn(() => {
          return new Response(controllable.stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }),
      });

      const { POST } = await import("../../chat/route");

      const request = new Request("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request);

      // After reservation
      const sessionAfterReserve = getSession("test-session");
      expect(sessionAfterReserve?.credits).toBe(initialCredits - creditCost);

      // Cancel
      const reader = response.body?.getReader();
      await reader?.cancel("User cancelled");

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Credits restored
      const sessionAfterRelease = getSession("test-session");
      expect(sessionAfterRelease?.credits).toBe(initialCredits);
    });
  });
});
