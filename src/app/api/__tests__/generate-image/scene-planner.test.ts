/**
 * Integration tests for scene planner refund logic.
 * Tests partial refund on timeout/failure and retry behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fixtures, type Session } from "../shared/test-fixtures";

// Create mock state
const mockState = {
  sessions: new Map<string, Session>(),
  callHistory: [] as Array<{ action: string; args: unknown }>,
  ledger: [] as Array<{ sid: string; delta: number; reason: string; generationId?: string }>,
};

// Store original env and fetch BEFORE any modifications
const originalEnv = { ...process.env };
const originalFetch = global.fetch;

// Test-specific environment variables
const testEnv = {
  OPENROUTER_API_KEY: "test-api-key",
  CONVEX_URL: "https://test.convex.cloud",
  CONVEX_SERVER_SECRET: "test-server-secret",
  SESSION_SECRET: "a".repeat(32),
  IP_HASH_SECRET: "b".repeat(32),
  ENABLE_IMAGE_GENERATION: "true",
  ENABLE_SCENE_PLANNER: "true",
  SCENE_PLANNER_TIMEOUT_MS: "100",
};

// Apply test env vars for module imports
Object.assign(process.env, testEnv);

const SCENE_PLANNER_CREDITS = 1;

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
      if ("usd" in args && !("generationId" in args)) {
        mockState.callHistory.push({ action: "quoteUsdCost", args });
        const usd = args.usd as number;
        const billedUsd = usd * 1.25;
        return {
          providerUsd: usd,
          billedUsd,
          credits: Math.max(1, Math.ceil(billedUsd / 0.01)),
        };
      }

      const sid = args.sid as string;
      const session = mockState.sessions.get(sid);

      // Dispatch based on args structure
      if ("requestId" in args && "actualCreditsCost" in args) {
        mockState.callHistory.push({ action: "recordImageCostEvent", args });
        return { trackedCredits: args.actualCreditsCost };
      }

      if ("endpoint" in args && "estimatedCredits" in args) {
        // logAdminUsage
        mockState.callHistory.push({ action: "logAdminUsage", args });
        return;
      }

      if ("verseId" in args && "imageUrl" in args && "model" in args) {
        mockState.callHistory.push({ action: "saveImage", args });
        return { success: true, type: "storage", id: "saved-image-scene-planner" };
      }

      if ("generationId" in args && !("amount" in args)) {
        // releaseReservation
        mockState.callHistory.push({ action: "releaseReservation", args });
        if (!session) return { success: false, error: "Session not found" };
        const generationId = args.generationId as string;
        const reservation = mockState.ledger.find(
          (e) => e.sid === sid && e.generationId === generationId && e.reason === "reservation"
        );
        if (reservation) {
          const amount = Math.abs(reservation.delta);
          session.credits += amount;
          mockState.ledger.push({ sid, delta: amount, reason: "refund", generationId });
        }
        return { success: true, newBalance: session?.credits ?? 0 };
      }

      if ("actualAmount" in args || ("generationId" in args && "amount" in args && !("modelId" in args))) {
        // deductCredits
        mockState.callHistory.push({ action: "deductCredits", args });
        if (!session) return { success: false, error: "Session not found" };
        mockState.ledger.push({ sid, delta: -(args.actualAmount as number ?? args.amount as number), reason: "generation" });
        return { success: true, newBalance: session.credits };
      }

      if ("modelId" in args && "generationId" in args && "amount" in args) {
        // reserveCredits
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
        const generationId = args.generationId as string;
        mockState.ledger.push({ sid, delta: -amount, reason: "reservation", generationId });
        return { success: true, newBalance: session.credits };
      }

      if ("reason" in args && args.reason === "scene_planner_refund") {
        // addCredits for scene planner refund
        mockState.callHistory.push({ action: "addCredits", args });
        if (!session) throw new Error("Session not found");
        session.credits += args.amount as number;
        mockState.ledger.push({ sid, delta: args.amount as number, reason: args.reason as string });
        return { newBalance: session.credits };
      }

      return;
    }),
  })),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

// Track if scene planner is free
const mockIsModelFree = { value: false };

vi.mock("@/lib/image-models", () => ({
  DEFAULT_IMAGE_MODEL: "google/gemini-2.0-flash-exp:free",
  fetchImageModels: vi.fn(async () => ({
    models: [
      { id: "google/gemini-2.0-flash-exp:free", pricing: { imageOutput: "0.01" } },
    ],
  })),
  computeCreditsCost: vi.fn(() => 2),
  computeConservativeEstimate: vi.fn(() => 70),
  computeAdjustedCreditsCost: vi.fn((baseCost: number | null) => baseCost ?? 13),
  computeCreditsFromActualUsage: vi.fn((actualUsd: number | null, fallback: number) => {
    if (actualUsd === null || actualUsd <= 0) {
      return { credits: fallback, usedActual: false };
    }
    return { credits: Math.ceil(actualUsd * 1.25 / 0.01), usedActual: true };
  }),
  CONSERVATIVE_ESTIMATE_MULTIPLIER: 35,
  getProviderName: vi.fn(() => "openrouter"),
  CREDIT_USD: 0.01,
  PREMIUM_MULTIPLIER: 1.25,
  DEFAULT_ASPECT_RATIO: "16:9",
  DEFAULT_RESOLUTION: "1K",
  RESOLUTIONS: { "1K": { multiplier: 1.0 } },
  isValidAspectRatio: vi.fn(() => true),
  isValidResolution: vi.fn(() => true),
  supportsResolution: vi.fn(() => true),
}));

vi.mock("@/lib/chat-models", () => ({
  DEFAULT_CHAT_MODEL: "test/scene-planner-model",
  SCENE_PLANNER_ESTIMATED_TOKENS: 300,
  computeChatCreditsCost: vi.fn(() => SCENE_PLANNER_CREDITS),
  getChatModelPricing: vi.fn(async () => ({ prompt: "0.001", completion: "0.002" })),
  isModelFree: vi.fn(() => mockIsModelFree.value),
}));

// Mock fetch responses
type MockFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

let fetchCallIndex = 0;
let scenePlannerResponse: MockFetchResponse | (() => Promise<never>) | null = null;
let imageGenerationResponse: MockFetchResponse | null = null;

const mockFetch = vi.fn(async () => {
  const currentIndex = fetchCallIndex;
  fetchCallIndex++;

  // First call is scene planner
  if (currentIndex === 0 && scenePlannerResponse) {
    if (typeof scenePlannerResponse === "function") {
      return scenePlannerResponse();
    }
    return scenePlannerResponse;
  }

  // Second call is image generation
  if (imageGenerationResponse) {
    return imageGenerationResponse;
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "gen-123",
      choices: [
        { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
      ],
      usage: { cost: 0.01 },
    }),
  };
});

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

function getRefundEntries() {
  return mockState.ledger.filter((e) => e.reason === "scene_planner_refund");
}

const TEST_CSRF_TOKEN = "a".repeat(64);

function createGenerateImageRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/generate-image", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-csrf-token": TEST_CSRF_TOKEN,
      cookie: `visibible_csrf=${TEST_CSRF_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
}

describe("Scene Planner Refund Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore test env vars at start of each test for isolation
    Object.assign(process.env, testEnv);
    resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000 }]);
    fetchCallIndex = 0;
    scenePlannerResponse = null;
    imageGenerationResponse = null;
    mockIsModelFree.value = false;
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  describe("Scene Planner Success", () => {
    it("uses scene plan and includes cost in response", async () => {
      scenePlannerResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  primarySubject: "A figure in the void",
                  action: "witnessing creation",
                  setting: "primordial darkness",
                }),
              },
            },
          ],
        }),
      };

      imageGenerationResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.02 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "In the beginning God created the heaven and the earth.");
      url.searchParams.set("reference", "Genesis 1:1");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.scenePlannerUsed).toBe(true);
      expect(body.scenePlannerCredits).toBe(SCENE_PLANNER_CREDITS);
      expect(getCallCount("sessions:addCredits")).toBe(0); // No refund
    });
  });

  describe("Scene Planner Failure", () => {
    it("issues refund when scene planner fails with error", async () => {
      scenePlannerResponse = {
        ok: false,
        status: 500,
        json: async () => ({ error: "Scene planner error" }),
      };

      imageGenerationResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.01 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.scenePlannerUsed).toBe(false);

      // Refund should be issued
      expect(getCallCount("sessions:addCredits")).toBe(1);
      const refunds = getRefundEntries();
      expect(refunds.length).toBe(1);
      expect(refunds[0].delta).toBe(SCENE_PLANNER_CREDITS);
    });
  });

  describe("Scene Planner Disabled", () => {
    it("skips scene planner when ENABLE_SCENE_PLANNER=false", async () => {
      process.env.ENABLE_SCENE_PLANNER = "false";

      imageGenerationResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.01 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.scenePlannerUsed).toBe(false);
      expect(body.scenePlannerCredits).toBe(0);

      // Only image generation fetch (no scene planner)
      expect(fetchCallIndex).toBe(1);

      // No refund needed
      expect(getCallCount("sessions:addCredits")).toBe(0);
    });
  });

  describe("Free Scene Planner Model", () => {
    it("no refund needed when scene planner model is free", async () => {
      mockIsModelFree.value = true;

      // Scene planner will fail
      scenePlannerResponse = {
        ok: false,
        status: 500,
        json: async () => ({ error: "Scene planner error" }),
      };

      imageGenerationResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.01 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      // Scene planner cost should be 0 for free model
      expect(body.scenePlannerCredits).toBe(0);

      // No refund needed since scene planner was free
      expect(getCallCount("sessions:addCredits")).toBe(0);
    });
  });

  describe("Scene Planner Response Parsing", () => {
    it("handles malformed JSON gracefully", async () => {
      scenePlannerResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: "This is not valid JSON {",
              },
            },
          ],
        }),
      };

      imageGenerationResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.01 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.scenePlannerUsed).toBe(false);

      // Refund should be issued
      expect(getCallCount("sessions:addCredits")).toBe(1);
    });

    it("handles missing required fields gracefully", async () => {
      scenePlannerResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  primarySubject: "A figure", // Missing action and setting
                }),
              },
            },
          ],
        }),
      };

      imageGenerationResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.01 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.scenePlannerUsed).toBe(false);

      // Refund should be issued
      expect(getCallCount("sessions:addCredits")).toBe(1);
    });
  });
});
