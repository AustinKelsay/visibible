/**
 * Integration tests for image generation API credit flow.
 * Tests reserve → generate → deduct lifecycle with actual vs estimated costs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { getFunctionName, type FunctionArgs, type FunctionReference } from "convex/server";
import schema from "../../../../../convex/schema";
import { api, internal } from "../../../../../convex/_generated/api";
import { modules } from "../../../../../tests/convex/modules";
let requestDb = convexTest(schema, modules);
let failAdmission = false;
import { fixtures, type Session } from "../shared/test-fixtures";
import { clearBibleApiCache } from "@/lib/bible-api";
import {
  mockFetchBibleApi,
  resetMockFetchBibleApiBypass,
  setMockFetchBibleApiBypass,
} from "@/app/api/__tests__/shared/bible-api-mocks";

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
let mockLearnedEstimate:
  | { credits: number; source: "model" | "provider" | "global" | "fallback"; sampleCount: number }
  | null = null;
const mockImageSpendDownGraceCredits = 5;
const defaultImageCatalogModels: Array<{
  id: string;
  pricing?: { imageOutput: string };
  creditsCost?: number | null;
  reservationCreditsCost?: number | null;
  usesEmergencyPricing?: boolean;
}> = [
  { id: "google/gemini-2.0-flash-exp:free", pricing: { imageOutput: "0.01" } },
  { id: "google/gemini-2.5-flash-image", pricing: { imageOutput: "0.02" } },
  { id: "google/gemini-3.1-flash-image-preview", pricing: { imageOutput: "0.02" } },
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
      if ("inputFingerprint" in args) return requestDb.query(api.verseImages.getGenerationIntent, args as FunctionArgs<typeof api.verseImages.getGenerationIntent>);
      if ("fallbackCredits" in args && "modelId" in args && "resolution" in args) {
        mockState.callHistory.push({ action: "getEstimate", args });
        return (
          mockLearnedEstimate ?? {
            credits: args.fallbackCredits as number,
            source: "fallback",
            sampleCount: 0,
          }
        );
      }

      // Query for session data
      const sid = args.sid as string;
      const session = mockState.sessions.get(sid);
      return session || null;
    }),
    mutation: vi.fn(async (_apiPath: FunctionReference<"mutation">, args: Record<string, unknown>) => {
      switch (getFunctionName(_apiPath)) {
        case "verseImages:getScenePlanCache":
          return requestDb.mutation(api.verseImages.getScenePlanCache, args as FunctionArgs<typeof api.verseImages.getScenePlanCache>);
        case "verseImages:upsertScenePlanCache":
          return requestDb.mutation(api.verseImages.upsertScenePlanCache, args as FunctionArgs<typeof api.verseImages.upsertScenePlanCache>);
        case "verseImages:markScenePlanCacheHit":
          return requestDb.mutation(api.verseImages.markScenePlanCacheHit, args as FunctionArgs<typeof api.verseImages.markScenePlanCacheHit>);
      }
      if ("inputFingerprint" in args) {
        if (failAdmission) throw new Error("Admission unavailable");
        return requestDb.mutation(api.verseImages.createGenerationRequest, args as FunctionArgs<typeof api.verseImages.createGenerationRequest>);
      }
      if ("requestId" in args && "status" in args) {
        return requestDb.mutation(api.verseImages.updateGenerationRequest, args as FunctionArgs<typeof api.verseImages.updateGenerationRequest>);
      }
      if ("actualCredits" in args && "modelId" in args && "resolution" in args) {
        mockState.callHistory.push({ action: "recordActualCost", args });
        return null;
      }
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
        const id = await requestDb.mutation(internal.verseImages.saveImageWithUrl, {
          verseId: String(args.verseId), imageUrl: String(args.imageUrl), model: String(args.model),
          generationId: String(args.generationId),
          reference: args.reference as string, verseText: args.verseText as string,
          translationId: args.translationId as string,
          promptInputs: args.promptInputs as FunctionArgs<typeof internal.verseImages.saveImageWithUrl>["promptInputs"],
        });
        return { success: true, type: "url", id };
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

vi.mock("@/lib/image-models", () => {
  const resolutionSupportedModelIds = new Set([
    "google/gemini-3.1-flash-image-preview",
    "google/gemini-3-pro-image-preview",
  ]);

  const modelSupportsResolution = (modelId?: string) =>
    typeof modelId === "string" &&
    resolutionSupportedModelIds.has(modelId.toLowerCase());

  return {
    DEFAULT_IMAGE_MODEL: "google/gemini-2.0-flash-exp:free",
    DEFAULT_CREDITS_COST: 20,
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
      if (!modelSupportsResolution(modelId)) return baseCost;
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
    normalizeResolutionForModel: vi.fn((modelId: string, resolution: string) =>
      modelSupportsResolution(modelId) ? resolution : "1K"
    ),
    supportsResolution: vi.fn((modelId: string) => modelSupportsResolution(modelId)),
  };
});

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
  const bibleApiResponse = mockFetchBibleApi(input);
  if (bibleApiResponse) {
    return bibleApiResponse;
  }
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
    body: JSON.stringify({ reference: "Genesis 1:1", ...body }),
  });
}

describe("Image Generation API Credit Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestDb = convexTest(schema, modules);
    failAdmission = false;
    clearBibleApiCache();
    fetchImageModelsMock.mockReset();
    fetchImageModelsMock.mockResolvedValue({
      models: defaultImageCatalogModels,
    });
    resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000 }]);
    mockFetchResponse = null;
    mockFetchImpl = null;
    resetMockFetchBibleApiBypass();
    forceQuoteFailure = false;
    forceRecordImageCostEventFailure = false;
    mockLearnedEstimate = null;
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    resetMockFetchBibleApiBypass();
  });

  describe("durable HTTP intent admission", () => {
    const body = { requestId: "stable-request-id", reference: "Genesis 1:1", text: "In the beginning God created." };
    it("concurrent identical POSTs and a lost-response retry reserve and call the provider once", async () => {
      const { POST } = await import("../../generate-image/route");
      const responses = await Promise.all([POST(createGenerateImageRequest(body)), POST(createGenerateImageRequest(body))]);
      expect(responses.map((r) => r.status)).toContain(200);
      expect(responses.every((r) => r.status === 200 || r.status === 202)).toBe(true);
      const networkCallsBeforeRetry = mockFetch.mock.calls.length;
      fetchImageModelsMock.mockRejectedValueOnce(new Error("Catalog offline"));
      const retry = await POST(createGenerateImageRequest(body));
      expect(mockFetch.mock.calls).toHaveLength(networkCallsBeforeRetry);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({ reused: true, savedImageId: expect.any(String) });
      expect(getCallCount("reserveCredits")).toBe(1);
      expect(getCallCount("saveImage")).toBe(1);
      expect(mockFetch.mock.calls.filter(([url]) => String(url).includes("openrouter.ai"))).toHaveLength(1);
    });
    it("rejects changed immutable input without starting a second paid call", async () => {
      const { POST } = await import("../../generate-image/route");
      await POST(createGenerateImageRequest(body));
      const conflict = await POST(createGenerateImageRequest({ ...body, generation: 2 }));
      expect(conflict.status).toBe(409);
      expect(getCallCount("reserveCredits")).toBe(1);
    });
    it("does not reserve or call the provider when admission cannot be persisted", async () => {
      const { POST } = await import("../../generate-image/route");
      failAdmission = true;
      expect((await POST(createGenerateImageRequest(body))).status).toBe(503);
      expect(getCallCount("reserveCredits")).toBe(0);
      expect(getCallCount("saveImage")).toBe(0);
      expect(mockFetch.mock.calls.filter(([url]) => String(url).includes("openrouter.ai"))).toHaveLength(0);
    });
  });

  describe("canonical passage authority", () => {
    it("ignores forged text/context/theme and replaces legacy cached plans", async () => {
      process.env.ENABLE_SCENE_PLANNER = "true";
      const legacyPlan = { primarySubject: "FORGED_OLD_PLAN", action: "posing", setting: "studio" };
      await requestDb.mutation(api.verseImages.upsertScenePlanCache, {
        verseId: "genesis-1-1", translationId: "web", styleProfileId: "classical",
        scenePlan: legacyPlan, plannerModel: "old-planner", promptVersion: "2026-03-19", serverSecret: "test-server-secret",
      });
      const prompts: string[] = [];
      mockFetchImpl = async (_input, init) => {
        const payload = JSON.parse(String(init?.body));
        prompts.push(JSON.stringify(payload.messages));
        return {
          ok: true, status: 200,
          json: async () => prompts.length === 1 ? {
            choices: [{ message: { content: JSON.stringify({ primarySubject: "Created world", action: "emerging", setting: "cosmos" }) } }],
            usage: { cost: 0.001 },
          } : {
            choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } }], usage: { cost: 0.01 },
          },
        };
      };
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest({
        reference: "Genesis 1:1", text: "FORGED_CURRENT", prevVerse: { number: 9, text: "FORGED_PREVIOUS" },
        nextVerse: JSON.stringify({ number: 9, text: "FORGED_NEXT" }),
        theme: { setting: "FORGED_THEME", palette: "FORGED_PALETTE", elements: "FORGED_ELEMENTS", style: "FORGED_STYLE" },
      }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.verseText).toBe("In the beginning God created the heavens and the earth.");
      expect(body.translationId).toBe("web");
      expect(body.promptInputs.prevVerse).toBeUndefined();
      expect(body.promptInputs.nextVerse).toMatchObject({ number: 2, text: "The earth was formless and empty." });
      expect(prompts).toHaveLength(2);
      expect(prompts.join(" ")).not.toContain("FORGED");
      expect(prompts[0]).toContain("In the beginning God created");
      expect(prompts[0]).toContain("Creation of the cosmos");
      const saved = await requestDb.query(internal.verseImages.getImageById, { imageId: body.savedImageId });
      expect(saved).toMatchObject({ verseText: body.verseText, reference: "Genesis 1:1", translationId: "web" });
      expect(JSON.stringify(saved?.promptInputs)).not.toContain("FORGED");
      const plans = await requestDb.run((ctx) => ctx.db.query("scenePlanCache").collect());
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({ promptVersion: "2026-09-08-canonical", scenePlan: { primarySubject: "Created world" } });
    });

    it.each([undefined, "", "Scripture"])("rejects a noncanonical reference (%s) before paid work", async (reference) => {
      mockFetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) });
      const { POST } = await import("../../generate-image/route");
      expect((await POST(createGenerateImageRequest({ reference, text: "FORGED_CURRENT" }))).status).toBe(400);
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
      expect(getCallCount("saveImage")).toBe(0);
    });

    it("rejects absent canonical chapter text even when the reference endpoint and client supply text", async () => {
      setMockFetchBibleApiBypass((url) => url.pathname === "/data/web/GEN/1");
      const providerCalls = vi.fn();
      mockFetchImpl = async (input) => {
        if (String(input).includes("bible-api.com")) return { ok: false, status: 404, json: async () => ({}) };
        providerCalls();
        throw new Error("Paid provider must not run");
      };
      const { POST } = await import("../../generate-image/route");
      expect((await POST(createGenerateImageRequest({ text: "FORGED_CURRENT" }))).status).toBe(400);
      expect(providerCalls).not.toHaveBeenCalled();
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
    });
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
      expect(await requestDb.query(internal.verseImages.getImageById, { imageId: body.savedImageId })).toMatchObject({ generationId: body.generationId });
      expect(getCallCount("sessions:reserveCredits")).toBe(1);
      expect(getCallCount("sessions:deductCredits")).toBe(1);
      expect(getCallCount("saveImage")).toBe(1);
      expect(body.openRouterUsageUsd).toBe(0.05);
      expect(body.usedActualCost).toBe(true);
    });

    it("reference-only requests resolve verse text and same-chapter continuity context", async () => {
      setMockFetchBibleApiBypass((url) => url.pathname === "/data/web/GEN/1");
      mockFetchImpl = async (input: RequestInfo | URL) => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

        if (url.includes("bible-api.com/Genesis%201%3A2?translation=web")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              reference: "Genesis 1:2",
              verses: [
                {
                  book_id: "GEN",
                  book_name: "Genesis",
                  chapter: 1,
                  verse: 2,
                  text: "The earth was formless and empty.",
                },
              ],
              text: "The earth was formless and empty.",
              translation_id: "web",
              translation_name: "World English Bible",
              translation_note: "",
            }),
          };
        }

        if (url.includes("bible-api.com/data/web/GEN/1")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              verses: [
                { book_id: "GEN", book: "Genesis", chapter: 1, verse: 1, text: "In the beginning God created." },
                { book_id: "GEN", book: "Genesis", chapter: 1, verse: 2, text: "The earth was formless and empty." },
                { book_id: "GEN", book: "Genesis", chapter: 1, verse: 3, text: "God said, Let there be light." },
              ],
              translation: { identifier: "web", name: "World English Bible" },
            }),
          };
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
      };

      const { POST } = await import("../../generate-image/route");
      const request = createGenerateImageRequest({
        reference: "Genesis 1:2",
        translation: "web",
      });
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.reference).toBe("Genesis 1:2");
      expect(body.verseText).toBe("The earth was formless and empty.");
      expect(body.promptInputs.prevVerse.reference).toBe("Genesis 1:1");
      expect(body.promptInputs.nextVerse.reference).toBe("Genesis 1:3");
    });

    it("reference-only requests resolve previous-book continuity at book boundaries", async () => {
      mockFetchImpl = async (input: RequestInfo | URL) => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

        if (url.includes("bible-api.com/Exodus%201%3A1?translation=web")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              reference: "Exodus 1:1",
              verses: [
                {
                  book_id: "EXO",
                  book_name: "Exodus",
                  chapter: 1,
                  verse: 1,
                  text: "Now these are the names of the sons of Israel.",
                },
              ],
              text: "Now these are the names of the sons of Israel.",
              translation_id: "web",
              translation_name: "World English Bible",
              translation_note: "",
            }),
          };
        }

        if (url.includes("bible-api.com/data/web/EXO/1")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              verses: [
                { book_id: "EXO", book: "Exodus", chapter: 1, verse: 1, text: "Now these are the names of the sons of Israel." },
                { book_id: "EXO", book: "Exodus", chapter: 1, verse: 2, text: "Reuben, Simeon, Levi, and Judah," },
              ],
              translation: { identifier: "web", name: "World English Bible" },
            }),
          };
        }

        if (url.includes("bible-api.com/data/web/GEN/50")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              verses: [
                { book_id: "GEN", book: "Genesis", chapter: 50, verse: 25, text: "Joseph took an oath of the children of Israel." },
                { book_id: "GEN", book: "Genesis", chapter: 50, verse: 26, text: "So Joseph died, being one hundred ten years old." },
              ],
              translation: { identifier: "web", name: "World English Bible" },
            }),
          };
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
      };

      const { POST } = await import("../../generate-image/route");
      const request = createGenerateImageRequest({
        reference: "Exodus 1:1",
        translation: "web",
      });
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.reference).toBe("Exodus 1:1");
      expect(body.promptInputs.prevVerse.reference).toBe("Genesis 50:26");
      expect(body.promptInputs.nextVerse.reference).toBe("Exodus 1:2");
    });

    it("reference-only requests resolve next-chapter continuity at chapter boundaries", async () => {
      setMockFetchBibleApiBypass((url) => url.pathname === "/data/web/GEN/1");
      mockFetchImpl = async (input: RequestInfo | URL) => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

        if (url.includes("bible-api.com/Genesis%201%3A31?translation=web")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              reference: "Genesis 1:31",
              verses: [
                {
                  book_id: "GEN",
                  book_name: "Genesis",
                  chapter: 1,
                  verse: 31,
                  text: "God saw everything that he had made, and, behold, it was very good.",
                },
              ],
              text: "God saw everything that he had made, and, behold, it was very good.",
              translation_id: "web",
              translation_name: "World English Bible",
              translation_note: "",
            }),
          };
        }

        if (url.includes("bible-api.com/data/web/GEN/1")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              verses: [
                { book_id: "GEN", book: "Genesis", chapter: 1, verse: 30, text: "To every animal of the earth, and to every bird of the sky..." },
                { book_id: "GEN", book: "Genesis", chapter: 1, verse: 31, text: "God saw everything that he had made, and, behold, it was very good." },
              ],
              translation: { identifier: "web", name: "World English Bible" },
            }),
          };
        }

        if (url.includes("bible-api.com/data/web/GEN/2")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              verses: [
                { book_id: "GEN", book: "Genesis", chapter: 2, verse: 1, text: "The heavens, the earth, and all their vast array were finished." },
                { book_id: "GEN", book: "Genesis", chapter: 2, verse: 2, text: "On the seventh day God finished his work which he had done." },
              ],
              translation: { identifier: "web", name: "World English Bible" },
            }),
          };
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
      };

      const { POST } = await import("../../generate-image/route");
      const request = createGenerateImageRequest({
        reference: "Genesis 1:31",
        translation: "web",
      });
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.reference).toBe("Genesis 1:31");
      expect(body.promptInputs.prevVerse.reference).toBe("Genesis 1:30");
      expect(body.promptInputs.nextVerse.reference).toBe("Genesis 2:1");
    });

    it("returns 503 and does not bill when reference lookup is temporarily unavailable", async () => {
      const mockFetchImplSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

        if (url.includes("bible-api.com/Genesis%201%3A2?translation=web")) {
          return {
            ok: false,
            status: 503,
            json: async () => ({
              error: "upstream unavailable",
            }),
          };
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
      mockFetchImpl = mockFetchImplSpy;

      const { POST } = await import("../../generate-image/route");
      const request = createGenerateImageRequest({
        reference: "Genesis 1:2",
        translation: "web",
      });
      const response = await POST(request);

      expect(response.status).toBe(503);
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
      expect(getCallCount("sessions:deductCredits")).toBe(0);

      const body = await response.json();
      expect(body.error).toBe("Reference lookup unavailable");
      expect(body.details.upstreamStatus).toBe(503);
      expect(
        mockFetchImplSpy.mock.calls.some(([input]) => {
          const url = typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
          return url.includes("bible-api.com/Genesis%201%3A2?translation=web");
        })
      ).toBe(true);
    });

    it("returns 400 and does not bill when reference lookup fails", async () => {
      const mockFetchImplSpy = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

        if (url.includes("bible-api.com/Genesis%201%3A2?translation=web")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              reference: "Genesis 1:2",
              verses: [],
              text: "",
              translation_id: "web",
              translation_name: "World English Bible",
              translation_note: "",
            }),
          };
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
      mockFetchImpl = mockFetchImplSpy;

      const { POST } = await import("../../generate-image/route");
      const request = createGenerateImageRequest({
        reference: "Genesis 1:2",
        translation: "web",
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
      expect(getCallCount("sessions:deductCredits")).toBe(0);
      expect(
        mockFetchImplSpy.mock.calls.some(([input]) => {
          const url = typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
          return url.includes("openrouter.ai");
        })
      ).toBe(false);
    });

    it("reserve-generate-deduct-fallback: falls back to API estimate when no cost returned", async () => {
      mockLearnedEstimate = {
        credits: 7,
        source: "model",
        sampleCount: 5,
      };
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
      expect(body.imageCreditsCost).toBe(7);
      expect(body.creditsCost).toBe(7);
      expect(body.estimatedCreditsCost).toBe(7);
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

    it("token-priced image models fall back to the default estimate instead of failing", async () => {
      fetchImageModelsMock.mockResolvedValueOnce({
        models: [
          { id: "google/gemini-2.0-flash-exp:free", pricing: { imageOutput: "0.01" } },
          { id: "openai/gpt-5-image", creditsCost: null, reservationCreditsCost: null },
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
          usage: { cost: 0.05 },
        }),
      };

      const { POST } = await import("../../generate-image/route");

      const request = createGenerateImageRequest({
        text: "Token priced image model",
        reference: "Genesis 1:1",
        model: "openai/gpt-5-image",
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(getCallCount("quoteUsdCost")).toBe(1);

      const estimateCall = mockState.callHistory.find((c) => c.action === "getEstimate");
      expect(estimateCall).toBeDefined();
      expect((estimateCall?.args as { fallbackCredits: number }).fallbackCredits).toBe(20);

      const reserveCall = mockState.callHistory.find((c) => c.action === "reserveCredits");
      expect(reserveCall).toBeDefined();
      expect((reserveCall?.args as { amount: number }).amount).toBe(20);
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

    it("resolution-multiplier-supported-gemini: applies 3.5x for 2K on Gemini 3.1 image preview", async () => {
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
      url.searchParams.set("model", "google/gemini-3.1-flash-image-preview");
      url.searchParams.set("resolution", "2K");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.resolution).toBe("2K");
      expect(body.resolutionMultiplier).toBe(3.5);
      expect(body.resolutionSupported).toBe(true);
    });

    it("resolution-ignored-unsupported-models: no multiplier for unsupported models", async () => {
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
      const estimateCall = mockState.callHistory.find((entry) => entry.action === "getEstimate");
      expect(estimateCall).toBeDefined();
      expect((estimateCall?.args as { resolution: string }).resolution).toBe("1K");
      const recordActualCostCall = mockState.callHistory.find(
        (entry) => entry.action === "recordActualCost"
      );
      expect(recordActualCostCall).toBeDefined();
      expect((recordActualCostCall?.args as { resolution: string }).resolution).toBe("1K");
    });

    it("resolution-ignored-gemini-2-5: omits image_size for Gemini 2.5 Flash Image", async () => {
      let capturedImageConfig: Record<string, unknown> | null = null;

      mockFetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
          image_config?: Record<string, unknown>;
        };
        capturedImageConfig = requestBody.image_config ?? null;

        return {
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
      };

      const { POST } = await import("../../generate-image/route");

      const url = new URL("http://localhost:3000/api/generate-image");
      url.searchParams.set("text", "Test verse");
      url.searchParams.set("model", "google/gemini-2.5-flash-image");
      url.searchParams.set("resolution", "4K");

      const request = createGenerateImageRequest(Object.fromEntries(url.searchParams.entries()));
      const response = await POST(request);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(capturedImageConfig).toEqual({
        aspect_ratio: "16:9",
      });
      expect(body.resolution).toBe("4K");
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
      expect(body.error).toBe("Model returned no image output");
      expect(body.message).toContain("No image");
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
