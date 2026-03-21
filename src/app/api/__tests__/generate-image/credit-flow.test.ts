/**
 * Integration tests for image generation API credit flow.
 * Tests reserve → generate → deduct lifecycle with actual vs estimated costs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fixtures, type Session } from "../shared/test-fixtures";

// Create mock state
const mockState = {
  sessions: new Map<string, Session>(),
  callHistory: [] as Array<{ action: string; args: unknown }>,
  ledger: [] as Array<{ sid: string; delta: number; reason: string; generationId?: string }>,
  adminAuditLog: [] as Array<{ sid: string; endpoint: string }>,
};

// Store original fetch
const originalFetch = global.fetch;

// Set env vars before imports
process.env.OPENROUTER_API_KEY = "test-api-key";
process.env.CONVEX_URL = "https://test.convex.cloud";
process.env.CONVEX_SERVER_SECRET = "test-server-secret";
process.env.SESSION_SECRET = "a".repeat(32);
process.env.IP_HASH_SECRET = "b".repeat(32);
process.env.ENABLE_IMAGE_GENERATION = "true";
process.env.ENABLE_SCENE_PLANNER = "false";
process.env.OPENROUTER_IMAGE_TIMEOUT_MS = "50";

// Store original env AFTER setting test vars
const originalEnv = { ...process.env };
let forceQuoteFailure = false;
let forceRecordImageCostEventFailure = false;
const mockImageSpendDownGraceCredits = 5;
const defaultImageCatalogModels: Array<{
  id: string;
  pricing: { imageOutput: string };
  usesEmergencyPricing?: boolean;
}> = [
  { id: "google/gemini-2.0-flash-exp:free", pricing: { imageOutput: "0.01" } },
  { id: "google/gemini-2.5-flash-image", pricing: { imageOutput: "0.02" } },
  { id: "openai/dall-e-3", pricing: { imageOutput: "0.04" } },
];
const fetchImageModelsMock = vi.fn(async () => ({
  models: defaultImageCatalogModels,
}));

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
        if (forceQuoteFailure) {
          throw new Error("quote failure");
        }
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
      if ("enqueueReason" in args) {
        mockState.callHistory.push({ action: "enqueueImageCostEventOutbox", args });
        return { enqueued: true };
      }

      if ("requestId" in args && "actualCreditsCost" in args) {
        if (forceRecordImageCostEventFailure) {
          throw new Error("record cost event failure");
        }
        mockState.callHistory.push({ action: "recordImageCostEvent", args });
        return { trackedCredits: args.actualCreditsCost };
      }

      if ("endpoint" in args && "estimatedCredits" in args) {
        // logAdminUsage
        mockState.callHistory.push({ action: "logAdminUsage", args });
        mockState.adminAuditLog.push({ sid, endpoint: args.endpoint as string });
        return;
      }

      if ("verseId" in args && "imageUrl" in args && "model" in args) {
        mockState.callHistory.push({ action: "saveImage", args });
        return { success: true, type: "storage", id: "saved-image-1" };
      }

      if ("generationId" in args && !("amount" in args)) {
        // releaseReservation
        mockState.callHistory.push({ action: "releaseReservation", args });
        if (!session) return { success: false, error: "Session not found" };
        const generationId = args.generationId as string;
        const alreadySettled = mockState.ledger.some(
          (entry) =>
            entry.sid === sid &&
            entry.generationId === generationId &&
            (entry.reason === "generation" || entry.reason === "refund")
        );
        if (alreadySettled) {
          return { success: true, newBalance: session?.credits ?? 0 };
        }
        const reservation = mockState.ledger.find(
          (e) => e.sid === sid && e.generationId === generationId && e.reason === "reservation"
        );
        if (reservation) {
          session.credits += Math.abs(reservation.delta);
          mockState.ledger.push({ sid, delta: Math.abs(reservation.delta), reason: "refund", generationId });
        }
        return { success: true, newBalance: session?.credits ?? 0 };
      }

      if ("actualAmount" in args || ("generationId" in args && "amount" in args && !("modelId" in args))) {
        // deductCredits
        mockState.callHistory.push({ action: "deductCredits", args });
        if (!session) return { success: false, error: "Session not found" };
        const actualAmount = (args.actualAmount as number) ?? (args.amount as number);
        const generationId = args.generationId as string;
        const reservation = [...mockState.ledger].reverse().find(
          (entry) =>
            entry.sid === sid &&
            entry.generationId === generationId &&
            entry.reason === "reservation"
        );
        const reservedAmount = reservation
          ? Math.abs(reservation.delta)
          : (args.amount as number);

        if (actualAmount < reservedAmount) {
          const refundAmount = reservedAmount - actualAmount;
          session.credits += refundAmount;
          mockState.ledger.push({
            sid,
            delta: refundAmount,
            reason: "refund",
            generationId,
          });
        }

        const chargedAmount = Math.min(actualAmount, reservedAmount);
        mockState.ledger.push({
          sid,
          delta: -chargedAmount,
          reason: "generation",
          generationId,
        });

        if (actualAmount > reservedAmount) {
          const shortfall = actualAmount - reservedAmount;
          mockState.ledger.push({
            sid,
            delta: 0,
            reason: "shortfall",
            generationId,
          });
          return {
            success: true,
            newBalance: session.credits,
            converted: true,
            shortfall,
          };
        }

        return { success: true, newBalance: session.credits };
      }

      if ("modelId" in args && "generationId" in args && "amount" in args) {
        // reserveCredits
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
        mockState.ledger.push({ sid, delta: -amount, reason: "reservation", generationId: args.generationId as string });
        return { success: true, newBalance: session.credits };
      }

      return;
    }),
  })),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

vi.mock("@/lib/image-models", () => ({
  DEFAULT_IMAGE_MODEL: "google/gemini-2.0-flash-exp:free",
  fetchImageModels: fetchImageModelsMock,
  computeCreditsCost: vi.fn((pricing: string | undefined) => {
    if (!pricing) return null;
    const usd = parseFloat(pricing);
    return Math.ceil(usd * 1.25 / 0.01);
  }),
  computeConservativeEstimate: vi.fn((pricing: string | undefined) => {
    if (!pricing) return null;
    const usd = parseFloat(pricing);
    return Math.ceil(usd * 1.25 * 35 / 0.01);
  }),
  computeAdjustedCreditsCost: vi.fn((baseCost: number | null, resolution: string, modelId?: string) => {
    if (baseCost === null) return 13;
    if (!modelId || !modelId.toLowerCase().includes("gemini")) return baseCost;
    const multipliers: Record<string, number> = { "1K": 1.0, "2K": 3.5, "4K": 6.5 };
    return Math.ceil(baseCost * (multipliers[resolution] ?? 1.0));
  }),
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
  IMAGE_GENERATION_SPEND_DOWN_GRACE_CREDITS: mockImageSpendDownGraceCredits,
  DEFAULT_ASPECT_RATIO: "16:9",
  DEFAULT_RESOLUTION: "1K",
  RESOLUTIONS: { "1K": { multiplier: 1.0 }, "2K": { multiplier: 3.5 }, "4K": { multiplier: 6.5 } },
  canAffordImageGeneration: vi.fn((credits: number, estimatedCreditsCost: number) =>
    credits >= estimatedCreditsCost ||
    (credits > 0 &&
      credits + mockImageSpendDownGraceCredits >= estimatedCreditsCost)
  ),
  isValidAspectRatio: vi.fn(() => true),
  isValidResolution: vi.fn(() => true),
  supportsResolution: vi.fn((modelId: string) => modelId.toLowerCase().includes("gemini")),
}));

vi.mock("@/lib/chat-models", () => ({
  DEFAULT_CHAT_MODEL: "test/scene-planner-model",
  SCENE_PLANNER_ESTIMATED_TOKENS: 300,
  computeChatCreditsCost: vi.fn(() => 1),
  getChatModelPricing: vi.fn(async () => ({ prompt: "0.001", completion: "0.002" })),
  isModelFree: vi.fn(() => false),
}));

// Mock fetch responses
type MockFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

let mockFetchResponse: MockFetchResponse | null = null;
let mockFetchImpl:
  | ((input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>)
  | null = null;

const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (mockFetchImpl) {
    return await mockFetchImpl(input, init);
  }
  if (mockFetchResponse) {
    return mockFetchResponse;
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
  mockState.adminAuditLog.length = 0;
}

function getCallCount(action: string) {
  // Extract the action name from "sessions:actionName" format
  const actionName = action.split(":").pop() || action;
  return mockState.callHistory.filter((c) => c.action === actionName).length;
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

describe("Image Generation API Credit Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchImageModelsMock.mockReset();
    fetchImageModelsMock.mockResolvedValue({
      models: defaultImageCatalogModels,
    });
    resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000 }]);
    mockFetchResponse = null;
    mockFetchImpl = null;
    forceQuoteFailure = false;
    forceRecordImageCostEventFailure = false;
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  describe("Happy Path", () => {
    it("reserve-generate-deduct-actual: uses OpenRouter usage.cost for actual amount", async () => {
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.05 },
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
      expect(body.imageUrl).toBeDefined();
      expect(body.savedImageId).toBe("saved-image-1");
      expect(getCallCount("sessions:reserveCredits")).toBe(1);
      expect(getCallCount("sessions:deductCredits")).toBe(1);
      expect(getCallCount("saveImage")).toBe(1);
      expect(body.openRouterUsageUsd).toBe(0.05);
      expect(body.usedActualCost).toBe(true);
    });

    it("reserve-generate-deduct-fallback: falls back to API estimate when no cost returned", async () => {
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          // No usage.cost
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.usedFallbackEstimate).toBe(true);
      expect(body.usedActualCost).toBe(false);
    });

    it("emergency-pricing: does not double-apply conservative reservation multiplier", async () => {
      fetchImageModelsMock.mockResolvedValueOnce({
        models: [
          {
            id: "google/gemini-2.0-flash-exp:free",
            pricing: { imageOutput: "0.10" },
            usesEmergencyPricing: true,
          },
        ],
      });
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Emergency fallback pricing test");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);
      const reserveCall = mockState.callHistory.find((c) => c.action === "reserveCredits");
      expect(reserveCall).toBeDefined();
      expect((reserveCall?.args as { amount: number }).amount).toBe(13);
    });

    it("actual-usage-local-fallback: quote failure still charges from usage.cost", async () => {
      forceQuoteFailure = true;
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.05 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Fallback usage test");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.imageCreditsCost).toBe(7);
      expect(body.creditsCost).toBe(7);
      expect(body.usedActualCost).toBe(true);
      expect(body.neutralCostUsedForActual).toBe(false);
    });

    it("resolution-multiplier-gemini: applies 3.5x for 2K", async () => {
      mockFetchResponse = {
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
      url.searchParams.set("text", "Test verse");
      url.searchParams.set("model", "google/gemini-2.5-flash-image");
      url.searchParams.set("resolution", "2K");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.resolution).toBe("2K");
      expect(body.resolutionMultiplier).toBe(3.5);
      expect(body.resolutionSupported).toBe(true);
    });

    it("resolution-ignored-non-gemini: no multiplier for non-Gemini models", async () => {
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.04 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");
      url.searchParams.set("model", "openai/dall-e-3");
      url.searchParams.set("resolution", "4K");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.resolutionMultiplier).toBe(1.0);
      expect(body.resolutionSupported).toBe(false);
    });

    it("low-balance-spend-down: reserves remaining credits and still succeeds within grace", async () => {
      resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1 }]);
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.04 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Spend down test");
      url.searchParams.set("model", "google/gemini-2.5-flash-image");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      const reserveCall = mockState.callHistory.find((c) => c.action === "reserveCredits");
      expect(reserveCall).toBeDefined();
      expect((reserveCall?.args as { amount: number }).amount).toBe(1);
      expect(body.chargeShortfall).toEqual({
        wantedCredits: 5,
        chargedCredits: 1,
        shortfall: 4,
      });
      expect(body.creditsCost).toBe(1);
      expect(body.costUsd).toBe(0.01);
      expect(body.credits).toBe(0);
      expect(body.usedActualCost).toBe(true);
      const shortfallEntry = mockState.ledger.find(
        (entry) => entry.reason === "shortfall"
      );
      expect(shortfallEntry).toBeDefined();
    });

    it("prompt-guardrails: explicitly blocks mockup and blank-white-backdrop presentation", async () => {
      let capturedPrompt = "";
      mockFetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: Array<{ content?: string }>;
        };
        capturedPrompt = requestBody.messages?.[0]?.content ?? "";

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
      };

      const { POST } = await import("../../generate-image/route");

      const request = createGenerateImageRequest({
        text: "And God said, Let there be light.",
        reference: "Genesis 1:3",
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(capturedPrompt).toContain(
        "not a photo of a painting, fresco, mural, manuscript, print, or gallery installation"
      );
      expect(capturedPrompt).toContain(
        "never a blank white/cream/beige backdrop or studio sweep"
      );
      expect(capturedPrompt).toContain("visible paper, matting");
    });
  });

  describe("Error Paths", () => {
    it("method-not-allowed: GET returns 405 with Allow header", async () => {
      const { GET } = await import("../../generate-image/route");

      const response = await GET();

      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
    });

    it("csrf-required: missing csrf header returns 403", async () => {
      const { POST } = await import("../../generate-image/route");
      const request = new Request("http://localhost:3000/api/generate-image", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          cookie: `visibible_csrf=${TEST_CSRF_TOKEN}`,
        },
        body: JSON.stringify({ text: "Test verse" }),
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
    });

    it("strict-origin-required: missing origin returns 403", async () => {
      const { POST } = await import("../../generate-image/route");
      const request = new Request("http://localhost:3000/api/generate-image", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": TEST_CSRF_TOKEN,
          cookie: `visibible_csrf=${TEST_CSRF_TOKEN}`,
        },
        body: JSON.stringify({ text: "Test verse" }),
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
    });

    it("payload-too-large: oversized JSON body returns 413", async () => {
      const { POST } = await import("../../generate-image/route");
      const oversizedText = "x".repeat(120_000);
      const request = createGenerateImageRequest({ text: oversizedText });

      const response = await POST(request);

      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body.error).toBe("Payload too large");
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
    });

    it("openrouter-api-error: returns 500 and releases reservation", async () => {
      mockFetchResponse = {
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "API error" } }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(500);
      expect(getCallCount("sessions:releaseReservation")).toBe(1);
      expect(getCallCount("sessions:deductCredits")).toBe(0);
    });

    it("openrouter-timeout: returns 504 and releases reservation", async () => {
      mockFetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) =>
        await new Promise((_, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new DOMException("No signal provided", "AbortError"));
            return;
          }
          if (signal.aborted) {
            reject(new Error("aborted", { cause: { name: "AbortError" } }));
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              reject(new DOMException("Request aborted", "AbortError"));
            },
            { once: true }
          );
        });

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Timeout test");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(504);
      const body = await response.json();
      expect(body.error).toBe("Image generation timed out");
      expect(getCallCount("sessions:releaseReservation")).toBe(1);
      expect(getCallCount("sessions:deductCredits")).toBe(0);
    });

    it("no-image-in-response: returns 500 and releases reservation", async () => {
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { content: [{ type: "text", text: "No image" }] } },
          ],
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toContain("No image");
      expect(getCallCount("sessions:releaseReservation")).toBe(1);
    });

    it("insufficient-credits: returns 402 with credit info", async () => {
      resetMockState([{ ...fixtures.sessions.insufficientCredits, sid: "test-session" }]);

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(402);
      const body = await response.json();
      expect(body.error).toBe("Insufficient credits");
    });

    it("daily-limit-exceeded: returns 429 with limit details", async () => {
      resetMockState([{ ...fixtures.sessions.paidAtDailyLimit, sid: "test-session" }]);

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBe("Daily spending limit exceeded");
    });

    it("daily-limit-exceeded-low-balance: still uses uncapped reservation usd for guardrail", async () => {
      resetMockState([
        {
          ...fixtures.sessions.paidWithCredits,
          sid: "test-session",
          credits: 1,
          dailySpendUsd: 4.5,
          dailySpendLimitUsd: 5.0,
        },
      ]);

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Low balance daily limit test");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBe("Daily spending limit exceeded");
    });

    it("cost-event-failure-enqueues-outbox: generation still succeeds", async () => {
      forceRecordImageCostEventFailure = true;
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.05 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Outbox fallback test");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(getCallCount("enqueueImageCostEventOutbox")).toBe(1);
    });
  });

  describe("Admin Bypass", () => {
    it("admin user logs audit but no credit operations", async () => {
      resetMockState([{ ...fixtures.sessions.admin, sid: "test-session" }]);

      mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gen-123",
          choices: [
            { message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } },
          ],
          usage: { cost: 0.05 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
      expect(getCallCount("sessions:logAdminUsage")).toBe(1);
      expect(mockState.adminAuditLog[0].endpoint).toBe("generate-image");
    });
  });

  describe("Model Validation", () => {
    it("returns 400 for unknown model", async () => {
      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");
      url.searchParams.set("model", "unknown/model");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Model not available");
    });
  });
});
