import { createHash } from "node:crypto";
import { LEAN_PROMPT_VERSION } from "@/lib/engine/lean";
import { imageModelFixture } from "../shared/image-model-fixtures";
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
let saveBarrier: Promise<void> | null = null;
let failSave = false;
let failReserve = false;
let failDeduct = false;
import { fixtures, type Session } from "../shared/test-fixtures";
import { clearBibleApiCache } from "@/lib/bible-api";
import { contentVersion } from "../../../../../convex/_helpers/contentVersion";
import { normalizeImageBilling } from "@/lib/image-catalog";
import { createWorkReader } from "@/lib/work-input";
import { SHARED_STYLES, type WorkBrief } from "@/lib/work-preparation";
import type { WorkInputs } from "@/lib/engine/work-inputs";
import {
  mockFetchBibleApi,
  resetMockFetchBibleApiBypass,
  setMockFetchBibleApiBypass,
} from "@/app/api/__tests__/shared/bible-api-mocks";
import { testDepiction } from "../../../../../tests/fixtures/depiction";

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
process.env.OPENROUTER_IMAGE_TIMEOUT_MS = "50";

// Store original env AFTER setting test vars
const originalEnv = { ...process.env };
let forceRecordImageCostEventFailure = false;
const defaultImageCatalogModels = [
  imageModelFixture(),
  imageModelFixture("google/gemini-2.5-flash-image"),
  imageModelFixture("google/gemini-3.1-flash-image-preview", "0.000015"),
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
    query: vi.fn(async (_apiPath: FunctionReference<"query">, args: Record<string, unknown>) => {
      if (["modelStats:getAllModelStats"].includes(getFunctionName(_apiPath))) return [];
      if (getFunctionName(_apiPath).startsWith("analysis:")) {
        return requestDb.query(_apiPath as never, args as never);
      }
      if ("inputFingerprint" in args) return requestDb.query(api.verseImages.getGenerationIntent, args as FunctionArgs<typeof api.verseImages.getGenerationIntent>);

      // Query for session data
      const sid = args.sid as string;
      const session = mockState.sessions.get(sid);
      return session || null;
    }),
    mutation: vi.fn(async (_apiPath: FunctionReference<"mutation">, args: Record<string, unknown>) => {
      if (getFunctionName(_apiPath).startsWith("analysis:") || getFunctionName(_apiPath).startsWith("quotes:")) {
        return requestDb.mutation(_apiPath as never, args as never);
      }
      if ("inputFingerprint" in args) {
        if (failAdmission) throw new Error("Admission unavailable");
        return requestDb.mutation(api.verseImages.createGenerationRequest, args as FunctionArgs<typeof api.verseImages.createGenerationRequest>);
      }
      if ("requestId" in args && "status" in args) {
        return requestDb.mutation(api.verseImages.updateGenerationRequest, args as FunctionArgs<typeof api.verseImages.updateGenerationRequest>);
      }
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
        await saveBarrier;
        if (failSave) throw new Error("storage unavailable");
        const storageId = await requestDb.run((ctx) => ctx.storage.store(new Blob([String(args.imageUrl)], { type: "image/png" })));
        const id = await requestDb.mutation(internal.verseImages.saveImageWithStorage, {
          verseId: String(args.verseId), storageId, model: String(args.model),
          generationId: String(args.generationId),
          reference: args.reference as string, verseText: args.verseText as string,
          translationId: args.translationId as string,
          prompt: args.prompt as string | undefined, promptVersion: args.promptVersion as string | undefined,
          creditsCost: args.creditsCost as number | undefined,
          engine: args.engine as "legacy" | "generic" | undefined,
          artStyleId: args.artStyleId as string | undefined,
          provenance: args.provenance as FunctionArgs<typeof internal.verseImages.saveImageWithStorage>["provenance"],
        });
        return { success: true, type: "storage", id };
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
        if (failDeduct) throw new Error("settlement unavailable");
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

        // Like computeReservedChargeOutcome: an overrun is charged from the
        // balance when it fits, and is a shortfall only when it does not.
        const additional = actualAmount - reservedAmount;
        const chargeAdditional = additional > 0 && session.credits >= additional;
        if (chargeAdditional) session.credits -= additional;
        const chargedAmount = chargeAdditional ? actualAmount : Math.min(actualAmount, reservedAmount);
        mockState.ledger.push({
          sid,
          delta: -chargedAmount,
          reason: "generation",
          generationId,
        });

        if (actualAmount > reservedAmount && !chargeAdditional) {
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
        if (failReserve) throw new Error("reservation unavailable");
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

vi.mock("@/lib/image-models", async () => ({
  ...await vi.importActual<typeof import("@/lib/image-models")>("@/lib/image-models"),
  fetchImageModels: fetchImageModelsMock,
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

/**
 * A generation request. By default it is automatic generation (the bulk and first-visit path), which needs no accepted
 * quote; the quote tests pass `automatic: undefined` to act as a guest's explicit request.
 */
function createGenerateImageRequest(body: Record<string, unknown>, path = "/api/generate-image") {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-csrf-token": TEST_CSRF_TOKEN,
      cookie: `visibible_csrf=${TEST_CSRF_TOKEN}`,
    },
    body: JSON.stringify({ reference: "Genesis 1:1", automatic: true, ...body }),
  });
}

describe("Image Generation API Credit Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestDb = convexTest(schema, modules);
    failAdmission = false;
    saveBarrier = null;
    failSave = false;
    failReserve = false;
    failDeduct = false;
    clearBibleApiCache();
    fetchImageModelsMock.mockReset();
    fetchImageModelsMock.mockResolvedValue({
      models: defaultImageCatalogModels,
    });
    resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000 }]);
    mockFetchResponse = null;
    mockFetchImpl = null;
    resetMockFetchBibleApiBypass();
    forceRecordImageCostEventFailure = false;
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    resetMockFetchBibleApiBypass();
  });

  describe("engine admission", () => {
    const body = { requestId: "engine-request", reference: "Genesis 1:1", text: "In the beginning God created." };
    const openRouterCalls = () => mockFetch.mock.calls.filter(([url]) => String(url).includes("openrouter.ai")).length;
    const storedRequest = async () => (await requestDb.run((ctx) => ctx.db.query("imageGenerationRequests").collect()))[0];
    const readyWork = async () => {
      const secret = process.env.CONVEX_SERVER_SECRET!;
      await requestDb.mutation(api.analysis.registerWork, { serverSecret: secret, workId: "bible-web", workVersion: "wv", briefVersion: "bv" });
      const { generation } = await requestDb.mutation(api.analysis.stageGeneration, { serverSecret: secret, workId: "bible-web", workVersion: "wv", briefVersion: "bv" });
      await requestDb.mutation(api.analysis.putRecords, { serverSecret: secret, workId: "bible-web", generation, records: [
        { kind: "entry", recordId: "god", payload: { kind: "entry", name: "God", entryKind: "character", hasForm: false, stages: [{ id: "main", text: "God: light only." }] } },
        { kind: "section", recordId: "genesis-1-1", payload: { kind: "section", title: "Creation", firstUnit: "genesis-1-1", lastUnit: "genesis-1-31", cast: [{ entryId: "god", stageId: "main" }] } },
        { kind: "moment", recordId: "genesis-1-1", payload: { kind: "moment", sectionId: "genesis-1-1", firstUnit: "genesis-1-1", lastUnit: "genesis-1-1" } },
      ] });
      await requestDb.mutation(api.analysis.activateGeneration, { serverSecret: secret, workId: "bible-web", generation });
    };
    /**
     * A Classical request accepted on the legacy engine before its code was removed (#184). Its key is the input
     * fingerprint the route has always computed, so this also pins that fingerprint: changing it would break replays.
     */
    const seedLegacyRequest = async () => {
      const secret = process.env.CONVEX_SERVER_SECRET!;
      const inputFingerprint = createHash("sha256").update(JSON.stringify({
        text: body.text, reference: body.reference, translation: "web", model: null, style: null,
        aspectRatio: "16:9", resolution: "1K", theme: null, generation: null, prevVerse: null, nextVerse: null,
      })).digest("hex");
      await requestDb.mutation(api.verseImages.createGenerationRequest, {
        requestId: body.requestId, inputFingerprint, generationId: "legacy-generation", executorVersion: "next-image-v1", billingPolicyVersion: "legacy-image-v1",
        engine: "legacy", artStyleId: "classical", sid: "test-session", verseId: "genesis-1-1", translationId: "web", reference: "Genesis 1:1", serverSecret: secret,
      });
      await requestDb.mutation(api.verseImages.updateGenerationRequest, { requestId: body.requestId, status: "generating", serverSecret: secret });
      const storageId = await requestDb.run((ctx) => ctx.storage.store(new Blob(["legacy"], { type: "image/png" })));
      await requestDb.mutation(internal.verseImages.saveImageWithStorage, {
        verseId: "genesis-1-1", storageId, model: "google/gemini-2.5-flash-image", generationId: "legacy-generation",
        engine: "legacy", artStyleId: "classical", reference: "Genesis 1:1", translationId: "web",
      });
      await requestDb.mutation(api.verseImages.updateGenerationRequest, { requestId: body.requestId, status: "succeeded", serverSecret: secret });
    };

    it("disabled: no style has an engine, Classical included, before any reservation; an unregistered style stays a 400", async () => {
      process.env.GENERIC_ENGINE_MODE = "disabled";
      const { POST } = await import("../../generate-image/route");
      for (const [requestId, style] of [["classical-request", undefined], ["watercolor-request", "watercolor"]]) {
        const unavailable = await POST(createGenerateImageRequest({ ...body, requestId, style }));
        expect(unavailable.status).toBe(503);
        expect(await unavailable.json()).toMatchObject({ error: "Art style unavailable", retryable: true, style: style ?? null });
      }
      expect(getCallCount("reserveCredits")).toBe(0);
      expect(openRouterCalls()).toBe(0);
      expect(await storedRequest()).toBeUndefined();
      const unknown = await POST(createGenerateImageRequest({ ...body, requestId: "typo-style", style: "watrcolor" }));
      expect(unknown.status).toBe(400);
      expect(await unknown.json()).toMatchObject({ error: "Style profile not available" });
    });

    it("replays an accepted legacy request but admits no new legacy work", async () => {
      process.env.GENERIC_ENGINE_MODE = "disabled";
      await seedLegacyRequest();
      const { POST } = await import("../../generate-image/route");
      const replay = await POST(createGenerateImageRequest(body));
      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({ reused: true, engine: "legacy", imageUrl: expect.stringContaining("/api/storage/"), savedImageId: expect.any(String) });
      // With the generic engine disabled there is no engine for a new Classical request, or for a legacy-bound job item.
      for (const request of [{ ...body, requestId: "new-classical" }, { ...body, requestId: "bulk-legacy", engine: "legacy" as const }]) {
        const refused = await POST(createGenerateImageRequest(request));
        expect(refused.status).toBe(503);
        expect(await refused.json()).toMatchObject({ error: "Art style unavailable", retryable: true });
      }
      expect(getCallCount("reserveCredits")).toBe(0);
      expect(openRouterCalls()).toBe(0);
    });

    it("public mode with an unready work: retryable preparing error, no reservation", async () => {
      process.env.GENERIC_ENGINE_MODE = "public";
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "Preparing scene", retryable: true });
      expect(getCallCount("reserveCredits")).toBe(0);
      expect(openRouterCalls()).toBe(0);
      expect(await storedRequest()).toBeUndefined();
    });

    it("owner mode: a non-owner gets no engine; an owner with a ready work reaches the generic engine, which declines without charging when the work's inputs are not deployed", async () => {
      process.env.GENERIC_ENGINE_MODE = "owner";
      await readyWork();
      const { POST } = await import("../../generate-image/route");
      const guest = await POST(createGenerateImageRequest(body));
      expect(guest.status).toBe(503);
      expect(await guest.json()).toMatchObject({ error: "Art style unavailable", retryable: true });
      resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000, tier: "admin" }]); // clears the call history too
      const owner = await POST(createGenerateImageRequest({ ...body, requestId: "owner-request" }));
      expect(owner.status).toBe(503);
      expect(await owner.json()).toMatchObject({ error: "Preparing scene", retryable: true });
      expect(getCallCount("reserveCredits")).toBe(0);
      expect(openRouterCalls()).toBe(0);
      expect(await storedRequest()).toBeUndefined();
    });

    it("public mode with a ready work dispatches to the installed generic engine and replays an accepted legacy request unchanged", async () => {
      await seedLegacyRequest();
      process.env.GENERIC_ENGINE_MODE = "public";
      await readyWork();
      const { POST } = await import("../../generate-image/route");
      const { setGenericEngine } = await import("@/lib/engine/dispatch");
      const seen: unknown[] = [];
      setGenericEngine({ id: "fake-generic", async execute(input) { seen.push(input); return { kind: "response", status: 200, body: { requestId: input.requestId, engine: "generic", styleId: input.styleId } }; } });
      try {
        // The accepted legacy request replays its saved result: no new paid work, and the generic engine is not asked.
        const replay = await POST(createGenerateImageRequest(body));
        expect(replay.status).toBe(200);
        expect(await replay.json()).toMatchObject({ reused: true, engine: "legacy" });
        // Naming the Bible's own work id leaves the fingerprint, and so the replay, unchanged.
        const named = await POST(createGenerateImageRequest({ ...body, workId: "bible-web" }));
        expect(named.status).toBe(200);
        expect(await named.json()).toMatchObject({ reused: true, engine: "legacy" });
        expect(seen).toHaveLength(0);
        // A new request goes to the generic engine seam.
        const generic = await POST(createGenerateImageRequest({ ...body, requestId: "generic-request", style: "watercolor" }));
        expect(generic.status).toBe(200);
        expect(await generic.json()).toEqual({ requestId: "generic-request", engine: "generic", styleId: "watercolor" });
        expect(seen).toEqual([expect.objectContaining({ requestId: "generic-request", sid: "test-session", isOwner: false, verseId: "genesis-1-1", styleId: "watercolor", translationId: "web" })]);
        // Icon is not released to readers yet: unavailable, with no record or reservation.
        const icon = await POST(createGenerateImageRequest({ ...body, requestId: "icon-request", style: "icon" }));
        expect(icon.status).toBe(503);
        expect(seen).toHaveLength(1);
        expect(getCallCount("reserveCredits")).toBe(0);
      } finally {
        setGenericEngine(null);
      }
    });
  });

  describe("prose works", () => {
    const readyAlice = async () => {
      const secret = process.env.CONVEX_SERVER_SECRET!;
      await requestDb.mutation(api.analysis.registerWork, { serverSecret: secret, workId: "alice-in-wonderland", workVersion: "wv", briefVersion: "bv" });
      const { generation } = await requestDb.mutation(api.analysis.stageGeneration, { serverSecret: secret, workId: "alice-in-wonderland", workVersion: "wv", briefVersion: "bv" });
      await requestDb.mutation(api.analysis.putRecords, { serverSecret: secret, workId: "alice-in-wonderland", generation, records: [
        { kind: "entry", recordId: "alice", payload: { kind: "entry", name: "Alice", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Alice: a girl in a yellow frock." }] } },
        { kind: "section", recordId: "the-pool-of-tears-1", payload: { kind: "section", title: "Tears", firstUnit: "the-pool-of-tears-1", lastUnit: "the-pool-of-tears-26", cast: [{ entryId: "alice", stageId: "main" }] } },
        { kind: "moment", recordId: "the-pool-of-tears-1", payload: { kind: "moment", sectionId: "the-pool-of-tears-1", firstUnit: "the-pool-of-tears-1", lastUnit: "the-pool-of-tears-3" } },
      ] });
      await requestDb.mutation(api.analysis.activateGeneration, { serverSecret: secret, workId: "alice-in-wonderland", generation });
    };
    const prose = (requestId: string, extra: Record<string, unknown> = {}) =>
      createGenerateImageRequest({ requestId, reference: "ignored label", workId: "alice-in-wonderland", unitId: "the-pool-of-tears-1", style: "watercolor", ...extra });

    it("draws a prose moment from the book's own text for the owner, and is not found for anyone else while the book is the owner's", async () => {
      process.env.GENERIC_ENGINE_MODE = "public";
      await readyAlice();
      const { POST } = await import("../../generate-image/route");
      const { setGenericEngine } = await import("@/lib/engine/dispatch");
      const seen: Array<Record<string, unknown>> = [];
      setGenericEngine({ id: "fake-generic", async execute(input) { seen.push(input as unknown as Record<string, unknown>); return { kind: "response", status: 200, body: { requestId: input.requestId, engine: "generic" } }; } });
      try {
        // A reader: not found, with no record, reservation or engine call, and no Bible lookup. An unknown book, and
        // an unknown paragraph of an unopened book, get the very same answer, so neither can be probed.
        const reader = await POST(prose("prose-reader"));
        expect(reader.status).toBe(404);
        const readerBody = await reader.json();
        for (const probe of [prose("probe-unit", { unitId: "the-pool-of-tears-999" }), prose("probe-work", { workId: "moby-dick" })]) {
          const response = await POST(probe);
          expect(response.status).toBe(404);
          expect(await response.json()).toEqual(readerBody);
        }
        expect(seen).toHaveLength(0);
        expect(await requestDb.run((ctx) => ctx.db.query("imageGenerationRequests").collect())).toHaveLength(0);

        // The owner (an admin session): the unit and its reference come from Alice's text, admitted on Alice's analysis.
        resetMockState([{ ...fixtures.sessions.admin, sid: "test-session" }]);
        const owner = await POST(prose("prose-owner"));
        expect(owner.status).toBe(200);
        expect(seen).toEqual([expect.objectContaining({ workId: "alice-in-wonderland", verseId: "the-pool-of-tears-1", reference: "The Pool of Tears ¶1", styleId: "watercolor", isOwner: true,
          readiness: expect.objectContaining({ activeGeneration: 1, briefVersion: "bv" }) })]);

        // For the owner too: a paragraph the book lacks, or one inside a passage (images live under its first
        // paragraph), is refused before admission.
        const unknownUnit = await POST(prose("prose-unknown-unit", { unitId: "the-pool-of-tears-999" }));
        expect(unknownUnit.status).toBe(400);
        const interior = await POST(prose("prose-interior", { unitId: "the-pool-of-tears-2" }));
        expect(interior.status).toBe(400);
        expect((await interior.json()).message).toMatch(/does not begin a passage/);
        expect((await POST(prose("prose-unknown-work", { workId: "moby-dick" }))).status).toBe(404);
        expect(seen).toHaveLength(1);
        expect(mockFetch.mock.calls.filter(([url]) => String(url).includes("bible-api"))).toHaveLength(0);
      } finally {
        setGenericEngine(null);
      }
    });
  });

  describe("generic engine generation", () => {
    const SECRET = "test-server-secret";
    const WORK = "bible-web";
    const webText: Record<number, string> = {
      1: "In the beginning, God created the heavens and the earth.",
      2: "The earth was formless and empty. Darkness was on the surface of the deep.",
      3: "God said, “Let there be light,” and there was light.",
    };
    const work = createWorkReader({
      schemaVersion: 1, id: WORK, title: "The Holy Bible", author: "Various", language: "en",
      referenceText: { name: "World English Bible", source: "https://ebible.org", credit: "Public domain", sha256: "0".repeat(64) },
      levels: ["Book", "Chapter", "Verse"], referenceFormats: { Chapter: "{Book} {Chapter}:{Verse}" }, momentMode: "unit",
      divisions: [{ key: "genesis", label: "Genesis", level: "Book", divisions: [{ key: "1", label: "1", level: "Chapter", units: [1, 2, 3].map((n) => ({ number: n, text: webText[n] })) }] }],
    });
    const brief: WorkBrief = {
      schemaVersion: 1, workId: WORK, tone: "Reverent and grounded.", depictionRules: [{ text: "Use symbolic light for divine action." }],
      eras: [{ id: "creation", label: "Creation", people: "The first people.", dress: "Simple wraps.", buildingsAndObjects: "Wild land and rivers.", technology: "None." }],
      styleIds: ["classical", "watercolor", "icon"],
    };
    const adamText = "Adam: a young man with dark curly hair and brown skin, wearing a plain wrap.";
    const workInputs = (tone = brief.tone): WorkInputs => ({
      work, workVersion: "wv", brief: { ...brief, tone }, briefVersion: "bv", depiction: testDepiction(brief.workId),
      styles: Object.fromEntries(SHARED_STYLES.styles.map((style) => [style.id, { style, version: `sv-${style.id}` }])),
    });
    let blobFailures = new Set<string>();
    let loadedBlobs: string[] = [];
    const loadReferenceBytes = async (_runtime: unknown, storageId: string) => {
      loadedBlobs.push(storageId);
      if (blobFailures.has(storageId)) throw new Error("blob gone");
      return { bytes: new TextEncoder().encode(`jpeg:${storageId}`), mimeType: "image/jpeg" };
    };
    let tone = brief.tone;
    const styleOf = (id: string) => SHARED_STYLES.styles.find((style) => style.id === id)!;
    const watercolor = styleOf("watercolor");
    const classicalStyle = styleOf("classical");
    // The engine finds its model in the catalog by DEFAULT_IMAGE_MODEL, read in beforeEach once the module mocks are installed.
    let engineModelId = "";
    const catalogModel = (pricing: Record<string, string>) => ({ ...imageModelFixture(engineModelId), billing: normalizeImageBilling(engineModelId, pricing, 1) });
    const syntheticPricing = { prompt: "0.0000001", completion: "0.0000004", image_output: "0.00001", image: "0.001" };
    const imageCalls = () => mockFetch.mock.calls.filter(([url]) => String(url).includes("chat/completions")).map(([, init]) => JSON.parse(String(init?.body)) as { model: string; modalities?: string[]; messages: Array<{ content: Array<{ type: string; text?: string; image_url?: { url: string } }> }> });
    const promptOf = (call: ReturnType<typeof imageCalls>[number]) => call.messages[0].content[0].text!;
    const storedRequests = () => requestDb.run((ctx) => ctx.db.query("imageGenerationRequests").collect());
    const savedImages = () => requestDb.run((ctx) => ctx.db.query("verseImages").collect());
    const body = { requestId: "generic-1", reference: "Genesis 1:1", text: "In the beginning God created.", style: "watercolor" };

    const prepareWork = async () => {
      await requestDb.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
      const { generation } = await requestDb.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
      await requestDb.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records: [
        { kind: "entry", recordId: "god", payload: { kind: "entry", name: "God", entryKind: "character", hasForm: false, stages: [{ id: "main", text: "God: shown only as light." }] } },
        { kind: "entry", recordId: "adam", payload: { kind: "entry", name: "Adam", entryKind: "character", hasForm: true, stages: [{ id: "main", text: adamText }] } },
        { kind: "entry", recordId: "eden", payload: { kind: "entry", name: "Eden", entryKind: "location", hasForm: true, stages: [{ id: "main", text: "Eden: a lush river garden with tall cedars." }] } },
        { kind: "section", recordId: "genesis-1-1", payload: { kind: "section", title: "Creation", firstUnit: "genesis-1-1", lastUnit: "genesis-1-3", era: "creation", cast: [{ entryId: "god", stageId: "main" }, { entryId: "adam", stageId: "main" }, { entryId: "eden", stageId: "main" }] } },
        ...["genesis-1-1", "genesis-1-2", "genesis-1-3"].map((id) => ({ kind: "moment" as const, recordId: id, payload: { kind: "moment" as const, sectionId: "genesis-1-1", firstUnit: id, lastUnit: id } })),
      ] });
      await requestDb.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
      const adam = await requestDb.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "adam" });
      const store = () => requestDb.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
      const sheetBlob = await store();
      const styleBlob = await store();
      await requestDb.mutation(api.analysis.putReference, { serverSecret: SECRET, workId: WORK, kind: "sheet", recordId: "adam:main", storageId: sheetBlob, inputs: [
        { kind: "entry", recordId: "adam", version: adam!.version }, { kind: "stage", recordId: "adam:main", version: contentVersion(adamText) }, { kind: "style", recordId: "classical", version: "sv-classical" }, { kind: "era", recordId: "creation", version: "ev" },
      ] });
      await requestDb.mutation(api.analysis.putReference, { serverSecret: SECRET, workId: WORK, kind: "styleReference", recordId: "watercolor", storageId: styleBlob, inputs: [
        { kind: "style", recordId: "watercolor", version: "sv-watercolor" }, { kind: "era", recordId: "creation", version: "ev" },
      ] });
      return { sheetBlob: String(sheetBlob), styleBlob: String(styleBlob), adamVersion: adam!.version };
    };

    beforeEach(async () => {
      process.env.GENERIC_ENGINE_MODE = "public";
      blobFailures = new Set(); loadedBlobs = []; tone = brief.tone;
      // Imported here, after the module mocks above are installed.
      engineModelId = (await import("@/lib/image-models")).DEFAULT_IMAGE_MODEL;
      fetchImageModelsMock.mockResolvedValue({ models: [catalogModel(syntheticPricing)] });
      const { createGenericEngine } = await import("@/lib/engine/generation");
      const { setGenericEngine } = await import("@/lib/engine/dispatch");
      setGenericEngine(createGenericEngine({ loadInputs: async () => workInputs(tone), loadReferenceBytes, toJpeg: async (blob) => blob }));
    });
    afterEach(async () => { (await import("@/lib/engine/dispatch")).setGenericEngine(null); });

    it("reserves and settles guest credits for the controlled owner-check session without granting admin billing", async () => {
      await prepareWork();
      process.env.GENERIC_ENGINE_MODE = "owner";
      process.env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256 = createHash("sha256").update("test-session").digest("hex");
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ engine: "generic", creditsCost: 2, credits: 998, usedActualCost: true });
      expect(mockState.sessions.get("test-session")!.tier).toBe("paid");
      expect(getCallCount("reserveCredits")).toBe(1);
      expect(getCallCount("deductCredits")).toBe(1);
      expect(getCallCount("logAdminUsage")).toBe(0);
    });

    it("renders a moment with references and WEB text, and another style of it", async () => {
      const { sheetBlob, styleBlob } = await prepareWork();
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(200);
      const result = await response.json();
      // One provider call: the prompt first, then the style reference and Adam's sheet as JPEG data URLs; Eden has no sheet and God has no form.
      const calls = imageCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].model).toBe(engineModelId);
      const parts = calls[0].messages[0].content;
      expect(parts.map((p) => p.type)).toEqual(["text", "image_url", "image_url"]);
      const prompt = parts[0].text!;
      // The prompt is built from the WEB verse itself and the verse after it. God has no form: its name is replaced
      // wherever the model would read it, its canon stays out, and the unseen-presence wording stands in.
      expect(prompt).toContain('MOMENT (Genesis 1:1): "In the beginning, the presence created the heavens and the earth."');
      expect(prompt).toContain(`CONTEXT (for understanding only; paint the moment above):\n- After: ${webText[2]}`);
      expect(prompt).not.toMatch(/\bGod\b/);
      expect(prompt).not.toContain("shown only as light.");
      expect(prompt).toContain("UNSEEN PRESENCE (binding)");
      expect(prompt).toContain('IMAGERY, NOT FORM (binding): wherever the text calls something "the presence", it has no body.');
      // The whole section cast's canon is offered: the place as the setting, and Adam, whom no verse here names, as elsewhere in the passage.
      expect(prompt).toMatch(/SETTING \(where this passage happens[^\n]*\):\n- Eden: a lush river garden with tall cedars\.\n/);
      expect(prompt).toMatch(new RegExp(`CANON, ELSEWHERE IN THIS PASSAGE \\([^\\n]*\\):\\n- ${adamText}\\n`));
      expect(prompt).not.toContain("CANON, NAMED HERE");
      // Nothing of the removed look and plan is left in it.
      expect(prompt).not.toContain("SELECTED CHARACTERS");
      expect(prompt).not.toMatch(/scene plan/i);
      expect(prompt).not.toContain("MOMENT CONDITIONS");
      expect(prompt).toContain(`ART STYLE: ${watercolor.label}\n`);
      expect(parts[1].image_url!.url).toBe(`data:image/jpeg;base64,${Buffer.from(`jpeg:${styleBlob}`).toString("base64")}`);
      expect(parts[2].image_url!.url).toBe(`data:image/jpeg;base64,${Buffer.from(`jpeg:${sheetBlob}`).toString("base64")}`);
      // Settled from actual usage ($0.01 → 2 credits) after a headroom reservation; nothing was prepared before the image.
      expect(result).toMatchObject({ engine: "generic", model: engineModelId, prompt, promptVersion: LEAN_PROMPT_VERSION, translationId: "web", requestTranslationId: "web", verseText: webText[1],
        creditsCost: 2, usedActualCost: true, credits: 998, style: "watercolor" });
      expect(result).not.toHaveProperty("scenePlannerUsed");
      expect(result).not.toHaveProperty("preparation");
      expect(result.estimatedCreditsCost).toBe(2);
      expect(mockState.sessions.get("test-session")!.credits).toBe(998);
      expect(getCallCount("reserveCredits")).toBe(1);
      expect(getCallCount("recordImageCostEvent")).toBe(1);
      expect(mockState.callHistory.find((c) => c.action === "recordImageCostEvent")!.args).toMatchObject({ styleProfileId: "watercolor", actualCreditsCost: 2 });
      expect(mockState.callHistory.find((c) => c.action === "recordImageCostEvent")!.args).not.toHaveProperty("scenePlannerUsed");
      // The request record carries the engine, its commitments and the exact packet snapshot.
      const [request] = await storedRequests();
      expect(request).toMatchObject({ engine: "generic", artStyleId: "watercolor", status: "succeeded", modelId: engineModelId, promptVersion: LEAN_PROMPT_VERSION,
        engineCommitments: { workId: WORK, momentId: "genesis-1-1", briefVersion: "bv", analysisGeneration: 1, promptVersion: LEAN_PROMPT_VERSION } });
      expect(request.renderingPacket).toMatchObject({ promptVersion: LEAN_PROMPT_VERSION, styleId: "watercolor", styleVersion: "sv-watercolor", briefVersion: "bv", eraId: "creation",
        flags: { variationIncluded: false, neighborsIncluded: true, styleDetailIncluded: true }, budget: { finalChars: prompt.length } });
      expect(request.renderingPacket).not.toHaveProperty("lookVersion");
      expect(request.renderingPacket!.flags).not.toHaveProperty("lookDetailIncluded");
      expect(request.renderingPacket!.references.map((r) => r.id)).toEqual(["watercolor", "adam:main"]);
      // Every section cast member, ranked: God, named in the moment, first; then Adam and Eden in section order.
      expect(request.renderingPacket!.canon.map((c) => c.entryId)).toEqual(["god", "adam", "eden"]);
      // The saved image is WEB text with full provenance; the reader's translation is request context only.
      const [image] = await savedImages();
      expect(image).toMatchObject({ verseId: "genesis-1-1", translationId: "web", verseText: webText[1], engine: "generic", artStyleId: "watercolor", prompt, promptVersion: LEAN_PROMPT_VERSION });
      expect(image.provenance).toMatchObject({ workId: WORK, momentId: "genesis-1-1", sectionId: "genesis-1-1", styleId: "watercolor", promptVersion: LEAN_PROMPT_VERSION, requestTranslationId: "web" });
      expect(image.provenance).not.toHaveProperty("lookVersion");
      expect(image.provenance).not.toHaveProperty("planVersion");
      expect(image.provenance!.canon).toEqual(request.renderingPacket!.canon);
      expect(image.provenance!.references).toEqual([{ kind: "styleReference", id: "watercolor", version: expect.any(String) }, { kind: "sheet", id: "adam:main", version: expect.any(String) }]);
      // The work's depiction profile is recorded with the accepted packet and the saved image (ADR 0010).
      expect(request.renderingPacket!.depictionVersion).toBe(testDepiction(brief.workId).version);
      expect(image.provenance!.depictionVersion).toBe(request.renderingPacket!.depictionVersion);
      // A second style of the same moment is one more image call and nothing else. This work has no Classical style reference, so only the sheet is sent.
      const classical = await POST(createGenerateImageRequest({ ...body, requestId: "generic-2", style: "classical" }));
      expect(classical.status).toBe(200);
      expect(imageCalls()).toHaveLength(2);
      expect(imageCalls()[1].messages[0].content.map((p) => p.type)).toEqual(["text", "image_url"]);
      const classicalPrompt = promptOf(imageCalls()[1]);
      expect(classicalPrompt).toContain('MOMENT (Genesis 1:1): "In the beginning, the presence created the heavens and the earth."');
      expect(classicalPrompt).toContain(`ART STYLE: ${classicalStyle.label}\n`);
      expect(classicalPrompt).not.toContain(`ART STYLE: ${watercolor.label}\n`);
      expect((await savedImages())[1].provenance!.references).toEqual([{ kind: "sheet", id: "adam:main", version: expect.any(String) }]);
    });

    it("refuses before any charge when a section cast member's canon is missing, since it may be a subject without form", async () => {
      await prepareWork();
      // The section still assigns God, but the entry is gone from the active analysis: its names could not be replaced.
      await requestDb.run(async (ctx) => {
        const rows = (await ctx.db.query("analysisRecords").collect()).filter((r) => r.kind === "entry" && r.recordId === "god");
        expect(rows).toHaveLength(1);
        await ctx.db.delete(rows[0]._id);
      });
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "Preparing scene", message: "Preparing scene: missing canon stage god:main.", retryable: true });
      expect(imageCalls()).toHaveLength(0);
      expect(await storedRequests()).toHaveLength(0);
      expect(getCallCount("reserveCredits")).toBe(0);
      expect(mockState.sessions.get("test-session")!.credits).toBe(1000);
    });

    it("makes no text-model call: the only model request is the image call, and nothing is prepared or spent for the owner", async () => {
      await prepareWork();
      const { POST } = await import("../../generate-image/route");
      expect((await POST(createGenerateImageRequest(body))).status).toBe(200);
      // Every request to the provider is the one image call to the image model.
      const providerCalls = mockFetch.mock.calls.filter(([url]) => String(url).includes("openrouter.ai"));
      expect(providerCalls.map(([url]) => String(url))).toEqual(["https://openrouter.ai/api/v1/chat/completions"]);
      const calls = imageCalls();
      expect(calls).toHaveLength(1);
      for (const call of calls) {
        expect(call.model).toBe(engineModelId);
        expect(call.modalities).toContain("image");
      }
      // The engine reads the analysis directly.
      const { getConvexClient } = await import("@/lib/convex-client");
      const queries = vi.mocked(getConvexClient).mock.results.flatMap((r) => vi.mocked((r.value as NonNullable<ReturnType<typeof getConvexClient>>).query).mock.calls.map(([ref]) => getFunctionName(ref)));
      expect(queries).toContain("analysis:getActiveRecord");
    });

    it("admits reference-bearing requests with the default model's live catalog shape and settles actual usage separately", async () => {
      await prepareWork();
      // Nano Banana 2.1's rates in tests/fixtures/image-catalog.json: no per-image price, so references are priced as input tokens.
      fetchImageModelsMock.mockResolvedValueOnce({ models: [catalogModel({ prompt: "0.0000015", completion: "0.0000075", image_output: "0.00003" })] });
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(200);
      // $0.0336 image output + $0.0045 for 600 response text tokens + $0.00336 for two references + about $0.0017 of prompt = $0.0432, × 1.25 → 6 credits.
      expect(await response.json()).toMatchObject({ estimatedCreditsCost: 6, creditsCost: 2, usedActualCost: true });
      expect(getCallCount("reserveCredits")).toBe(1);
      expect(imageCalls()).toHaveLength(1);
      expect((await storedRequests())[0].engineCommitments?.billingVersion).toBe("google-input-output-tokens-2026-10-20");
      expect(mockState.sessions.get("test-session")!.credits).toBe(998);
    });

    it("refuses a job item bound to the removed legacy engine before any record, reservation or provider call", async () => {
      await prepareWork();
      const { POST } = await import("../../generate-image/route");
      const bound = await POST(createGenerateImageRequest({ ...body, requestId: "bulk-legacy", style: "classical", engine: "legacy" }));
      expect(bound.status).toBe(409);
      expect(await bound.json()).toMatchObject({ error: "Engine binding changed", expectedEngine: "legacy", engine: "generic", retryable: true });
      expect(imageCalls()).toHaveLength(0);
      expect(getCallCount("reserveCredits")).toBe(0);
      expect(await storedRequests()).toEqual([]);
    });

    it("omits a reference whose blob cannot be loaded or whose inputs changed, and the packet reflects what was actually sent", async () => {
      const { sheetBlob, adamVersion } = await prepareWork();
      blobFailures.add(sheetBlob);
      const { POST } = await import("../../generate-image/route");
      const first = await POST(createGenerateImageRequest(body));
      expect(first.status).toBe(200);
      expect(imageCalls()[0].messages[0].content.map((p) => p.type)).toEqual(["text", "image_url"]);
      expect((await storedRequests())[0].renderingPacket!.references.map((r) => r.id)).toEqual(["watercolor"]);
      expect((await savedImages())[0].provenance!.references).toEqual([{ kind: "styleReference", id: "watercolor", version: expect.any(String) }]);
      // An owner edit to Adam's canon makes his sheet stale: it is skipped without being loaded, and the next prompt carries the new canon.
      blobFailures.clear();
      await requestDb.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "adam", expectedVersion: adamVersion,
        payload: { kind: "entry", name: "Adam", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Adam: an older man with grey hair." }] } });
      loadedBlobs = [];
      const second = await POST(createGenerateImageRequest({ ...body, requestId: "generic-2" }));
      expect(second.status).toBe(200);
      expect(loadedBlobs).not.toContain(sheetBlob);
      expect(imageCalls()[1].messages[0].content.map((p) => p.type)).toEqual(["text", "image_url"]);
      expect(promptOf(imageCalls()[1])).toContain("- Adam: an older man with grey hair.");
      expect(promptOf(imageCalls()[1])).not.toContain(adamText);
      expect((await storedRequests())[1].renderingPacket!.references.map((r) => r.id)).toEqual(["watercolor"]);
      // Nothing is prepared for either request: two image calls, no look or plan, no owner spend.
      expect(imageCalls()).toHaveLength(2);
    });

    it("rejects an over-budget prompt before any paid call and leaves an attention item", async () => {
      await prepareWork();
      tone = "x".repeat(13000);
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "Scene unavailable", retryable: false });
      expect(imageCalls()).toHaveLength(0);
      expect(getCallCount("reserveCredits")).toBe(0);
      expect(await storedRequests()).toHaveLength(0);
      expect(await requestDb.query(api.analysis.listAttention, { workId: WORK, status: "open" })).toMatchObject([{ reason: "prompt_over_budget", recordId: "genesis-1-1" }]);
    });

    it("releases the reservation and fails the request when the model returns no image", async () => {
      await prepareWork();
      mockFetchResponse = { ok: true, status: 200, json: async () => ({ id: "gen-refused", choices: [{ message: { content: "I cannot depict this scene." } }], usage: { cost: 0.001 } }) };
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: "Model returned no image output", message: "I cannot depict this scene.", requestId: "generic-1" });
      expect(getCallCount("reserveCredits")).toBe(1);
      expect(getCallCount("releaseReservation")).toBe(1);
      expect(mockState.sessions.get("test-session")!.credits).toBe(1000);
      expect((await storedRequests())[0]).toMatchObject({ status: "failed", engine: "generic" });
      expect(await savedImages()).toHaveLength(0);
    });

    it("settles from the packet-aware quote when the provider reports no usage", async () => {
      await prepareWork();
      mockFetchResponse = { ok: true, status: 200, json: async () => ({ id: "gen-nousage", choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } }] }) };
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toMatchObject({ usedFallbackEstimate: true, usedActualCost: false, openRouterUsageUsd: null });
      expect(result.creditsCost).toBe(result.estimatedCreditsCost);
      expect(mockState.sessions.get("test-session")!.credits).toBe(1000 - result.estimatedCreditsCost);
      expect(mockState.callHistory.find((c) => c.action === "recordImageCostEvent")!.args).toMatchObject({ usedFallbackEstimate: true, actualCreditsCost: result.estimatedCreditsCost });
    });

    it("delivers duplicate and concurrent requests once: one reservation, one provider call", async () => {
      await prepareWork();
      const { POST } = await import("../../generate-image/route");
      const responses = await Promise.all([POST(createGenerateImageRequest(body)), POST(createGenerateImageRequest(body))]);
      const statuses = responses.map((r) => r.status);
      expect(statuses).toContain(200);
      expect(statuses.every((status) => status === 200 || status === 202)).toBe(true);
      expect(imageCalls()).toHaveLength(1);
      expect(getCallCount("reserveCredits")).toBe(1);
      const replay = await POST(createGenerateImageRequest(body));
      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({ reused: true, translationId: "web", verseText: webText[1], savedImageId: expect.any(String) });
      expect(imageCalls()).toHaveLength(1);
      expect(mockState.sessions.get("test-session")!.credits).toBe(998);
    });

    it("never repeats a paid call after an interrupted save or an uncertain provider outcome", async () => {
      await prepareWork();
      const { POST } = await import("../../generate-image/route");
      failSave = true;
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(200);
      expect((await response.json()).savedImageId).toBeUndefined();
      expect((await storedRequests())[0]).toMatchObject({ status: "succeeded" });
      failSave = false;
      const replay = await POST(createGenerateImageRequest(body));
      expect(replay.status).toBe(409);
      expect(await replay.json()).toMatchObject({ reused: true, status: "succeeded" });
      expect(imageCalls()).toHaveLength(1);
      expect(mockState.sessions.get("test-session")!.credits).toBe(998);
      // A timeout after the attempt began: the hold is released, the request is failed and a retry is a replay, not a second attempt.
      mockFetchImpl = async (_input, init) => new Promise((_, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("Request aborted", "AbortError")), { once: true }); });
      const timedOut = await POST(createGenerateImageRequest({ ...body, requestId: "generic-timeout" }));
      expect(timedOut.status).toBe(504);
      expect(mockState.sessions.get("test-session")!.credits).toBe(998);
      expect((await storedRequests())[1]).toMatchObject({ status: "failed", engine: "generic" });
      mockFetchImpl = null;
      const retry = await POST(createGenerateImageRequest({ ...body, requestId: "generic-timeout" }));
      expect(retry.status).toBe(409);
      expect(imageCalls()).toHaveLength(2);
    });

    it("fails the request and releases the hold when the reservation or settlement action throws, without a second attempt", async () => {
      await prepareWork();
      const { POST } = await import("../../generate-image/route");
      failReserve = true;
      const reserveFailed = await POST(createGenerateImageRequest(body));
      expect(reserveFailed.status).toBe(503);
      expect(await reserveFailed.json()).toMatchObject({ error: "Unable to safely start image generation", retryable: true });
      expect(imageCalls()).toHaveLength(0);
      expect(getCallCount("releaseReservation")).toBe(1);
      expect((await storedRequests())[0]).toMatchObject({ status: "failed", engine: "generic" });
      expect(await storedRequests()).toHaveLength(1);
      failReserve = false;
      failDeduct = true;
      const settlementFailed = await POST(createGenerateImageRequest({ ...body, requestId: "generic-settle" }));
      expect(settlementFailed.status).toBe(500);
      expect(imageCalls()).toHaveLength(1);
      expect(getCallCount("releaseReservation")).toBe(2);
      expect(mockState.sessions.get("test-session")!.credits).toBe(1000);
      expect((await storedRequests())[1]).toMatchObject({ status: "failed", engine: "generic" });
      expect(await savedImages()).toHaveLength(0);
      failDeduct = false;
      const retry = await POST(createGenerateImageRequest({ ...body, requestId: "generic-settle" }));
      expect(retry.status).toBe(409);
      expect(imageCalls()).toHaveLength(1);
    });

    it("rehearsal: owner mode admits only the owner, and a rollback keeps accepted work replayable while refusing new work in every style", async () => {
      process.env.GENERIC_ENGINE_MODE = "owner";
      await prepareWork();
      const { POST } = await import("../../generate-image/route");
      // A guest has no engine in owner mode, since the legacy engine is removed; the owner's Watercolor request runs on generic.
      const guestSession = { ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000 };
      resetMockState([guestSession]);
      const guest = await POST(createGenerateImageRequest({ ...body, requestId: "rehearsal-guest", style: "classical" }));
      expect(guest.status).toBe(503);
      expect(await guest.json()).toMatchObject({ error: "Art style unavailable", retryable: true });
      resetMockState([{ ...guestSession, tier: "admin" }]);
      const ownerResponse = await POST(createGenerateImageRequest({ ...body, requestId: "rehearsal-owner" }));
      expect(ownerResponse.status).toBe(200);
      expect((await ownerResponse.json()).engine).toBe("generic");
      expect((await storedRequests()).map((r) => [r.requestId, r.engine, r.status])).toEqual([["rehearsal-owner", "generic", "succeeded"]]);
      // Rollback: the switch goes back to disabled. The accepted request replays unchanged; a new request in any style is
      // refused before any reservation; the saved image stays readable.
      process.env.GENERIC_ENGINE_MODE = "disabled";
      const replay = await POST(createGenerateImageRequest({ ...body, requestId: "rehearsal-owner" }));
      expect(await replay.json()).toMatchObject({ reused: true, engine: "generic", translationId: "web" });
      for (const style of ["watercolor", "classical"]) {
        const refused = await POST(createGenerateImageRequest({ ...body, requestId: `rehearsal-after-${style}`, style }));
        expect(refused.status).toBe(503);
        expect(await refused.json()).toMatchObject({ error: "Art style unavailable", retryable: true });
      }
      expect(imageCalls()).toHaveLength(1);
      expect((await requestDb.query(api.verseImages.getImageHistory, { verseId: "genesis-1-1", artStyle: "watercolor" }))[0]).toMatchObject({ engine: "generic", translationId: "web", verseText: webText[1] });
    });

    it("lets the owner generate without a reservation while recording the audit entry", async () => {
      await prepareWork();
      resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000, tier: "admin" }]);
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(200);
      expect(getCallCount("reserveCredits")).toBe(0);
      expect(getCallCount("deductCredits")).toBe(0);
      expect(getCallCount("logAdminUsage")).toBe(1);
      expect((await savedImages())[0]).toMatchObject({ engine: "generic", translationId: "web" });
    });

    it("releases the reservation and fails the request when the provider returns an error", async () => {
      await prepareWork();
      mockFetchResponse = { ok: false, status: 500, json: async () => ({ error: { message: "API error" } }) };
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest(body));
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: "Failed to generate image" });
      expect(getCallCount("releaseReservation")).toBe(1);
      expect(getCallCount("deductCredits")).toBe(0);
      expect(mockState.sessions.get("test-session")!.credits).toBe(1000);
      expect((await storedRequests())[0]).toMatchObject({ status: "failed", engine: "generic" });
    });

    it("still delivers the image when its cost event cannot be recorded, and queues the event instead", async () => {
      await prepareWork();
      forceRecordImageCostEventFailure = true;
      const { POST } = await import("../../generate-image/route");
      expect((await POST(createGenerateImageRequest(body))).status).toBe(200);
      expect(getCallCount("enqueueImageCostEventOutbox")).toBe(1);
    });

    describe("quotes and the maximum charge (#60)", () => {
      // A guest's explicit request: no `automatic` flag, so it needs the quote the guest accepted.
      const explicit = (extra: Record<string, unknown> = {}) => ({ ...body, automatic: undefined, ...extra });
      const askQuote = async (extra: Record<string, unknown> = {}) => {
        const { POST } = await import("../../generate-image/quote/route");
        const response = await POST(createGenerateImageRequest(explicit(extra), "/api/generate-image/quote"));
        return { status: response.status, body: await response.json() };
      };
      const generate = async (extra: Record<string, unknown> = {}) => {
        const { POST } = await import("../../generate-image/route");
        const response = await POST(createGenerateImageRequest(explicit(extra)));
        return { status: response.status, body: await response.json() };
      };
      const storedQuotes = () => requestDb.run((ctx) => ctx.db.query("quotes").collect());
      const actionArgs = (action: string) => mockState.callHistory.filter((c) => c.action === action).map((c) => c.args as Record<string, unknown>);
      const credits = () => mockState.sessions.get("test-session")!.credits;
      const setCredits = (value: number) => resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: value }]);
      const providerCost = (cost?: number) => {
        mockFetchResponse = { ok: true, status: 200, json: async () => ({ id: "gen-priced", choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,test" } }] } }], ...(cost === undefined ? {} : { usage: { cost } }) }) };
      };
      const expectNothingStarted = async () => {
        expect(getCallCount("reserveCredits")).toBe(0);
        expect(imageCalls()).toHaveLength(0);
        expect(await storedRequests()).toHaveLength(0);
      };
      afterEach(() => vi.useRealTimers());

      it("quotes without starting anything: the estimate, the maximum, a five-minute expiry and a stored fingerprint", async () => {
        await prepareWork();
        const before = Date.now();
        const { status, body: answer } = await askQuote();
        expect(status).toBe(200);
        expect(answer.quote).toEqual({ quoteId: expect.any(String), operation: "image", policyVersion: "accepted-maximum-v1", estimateCredits: 2, maximumCredits: 4, expiresAt: expect.any(Number) });
        expect(answer.quote.expiresAt - before).toBeGreaterThanOrEqual(5 * 60 * 1000);
        expect(answer.quote.expiresAt - before).toBeLessThan(5 * 60 * 1000 + 5000);
        await expectNothingStarted();
        expect(credits()).toBe(1000);
        expect(await storedQuotes()).toMatchObject([{ sid: "test-session", operation: "image", origin: "shown", policyVersion: "accepted-maximum-v1", estimateCredits: 2, maximumCredits: 4, fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
        expect((await storedQuotes())[0].usedAt).toBeUndefined();
      });

      it("quote → accept → reserve → finish: holds exactly the accepted maximum once and charges actual usage", async () => {
        await prepareWork();
        const { quote } = (await askQuote()).body;
        const { status, body: result } = await generate({ quoteId: quote.quoteId });
        expect(status).toBe(200);
        // The provider reported $0.01: 2 credits of the 4 held.
        expect(result).toMatchObject({ creditsCost: 2, estimatedCreditsCost: 2, maximumCreditsCost: 4, quoteId: quote.quoteId, billingPolicyVersion: "accepted-maximum-v1", usedActualCost: true, credits: 998 });
        expect(actionArgs("reserveCredits")).toMatchObject([{ amount: 4, costUsd: 0.04 }]);
        expect(actionArgs("deductCredits")).toMatchObject([{ amount: 4, actualAmount: 2 }]);
        expect(imageCalls()).toHaveLength(1);
        expect(credits()).toBe(998);
        expect((await storedRequests())[0]).toMatchObject({ status: "succeeded", billingPolicyVersion: "accepted-maximum-v1", quoteId: quote.quoteId, estimatedCreditsCost: 2, maximumCreditsCost: 4, actualCreditsCost: 2, usedFallbackEstimate: false });
        expect((await storedQuotes())[0]).toMatchObject({ usedBy: "generic-1", usedAt: expect.any(Number) });
        expect(actionArgs("recordImageCostEvent")[0]).toMatchObject({ estimatedCreditsCost: 2, reservationCreditsCost: 4, actualCreditsCost: 2, usedFallbackEstimate: false });
      });

      it("quote → accept → provider failure → release: the hold returns in full and the quote cannot be used again", async () => {
        await prepareWork();
        const { quote } = (await askQuote()).body;
        mockFetchResponse = { ok: false, status: 500, json: async () => ({ error: { message: "API error" } }) };
        const failed = await generate({ quoteId: quote.quoteId });
        expect(failed.status).toBe(500);
        expect(actionArgs("reserveCredits")).toMatchObject([{ amount: 4 }]);
        expect(getCallCount("releaseReservation")).toBe(1);
        expect(getCallCount("deductCredits")).toBe(0);
        expect(credits()).toBe(1000);
        expect((await storedRequests())[0]).toMatchObject({ status: "failed", quoteId: quote.quoteId });

        mockFetchResponse = null;
        const again = await generate({ quoteId: quote.quoteId, requestId: "generic-retry" });
        expect(again.status).toBe(409);
        expect(again.body).toMatchObject({ error: "Quote stale", reason: "used", quote: { estimateCredits: 2, maximumCredits: 4 } });
        expect(again.body.quote.quoteId).not.toBe(quote.quoteId);
        expect(getCallCount("reserveCredits")).toBe(1);
        expect(imageCalls()).toHaveLength(1);
        // The fresh quote it carried is good for the retry.
        expect((await generate({ quoteId: again.body.quote.quoteId, requestId: "generic-retry" })).status).toBe(200);
        expect(credits()).toBe(998);
      });

      it("refuses an expired quote before any record, hold or provider call, and answers with a fresh one", async () => {
        await prepareWork();
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.parse("2026-11-13T12:00:00Z"));
        const { quote } = (await askQuote()).body;
        vi.setSystemTime(Date.parse("2026-11-13T12:05:00Z"));
        const stale = await generate({ quoteId: quote.quoteId });
        expect(stale.status).toBe(409);
        expect(stale.body).toMatchObject({ error: "Quote stale", reason: "expired", requestId: "generic-1", quote: { estimateCredits: 2, maximumCredits: 4, expiresAt: Date.parse("2026-11-13T12:10:00Z") } });
        await expectNothingStarted();
        expect(credits()).toBe(1000);
        // The request id is still free: accepting the fresh quote runs the same request.
        expect((await generate({ quoteId: stale.body.quote.quoteId })).status).toBe(200);
        expect(actionArgs("reserveCredits")).toMatchObject([{ amount: 4 }]);
      });

      it("refuses a missing, tampered or other-session quote id the same way", async () => {
        await prepareWork();
        const { quote } = (await askQuote()).body;
        for (const quoteId of [undefined, "not-a-quote", `${quote.quoteId.slice(0, -1)}${quote.quoteId.endsWith("a") ? "b" : "a"}`]) {
          const refused = await generate({ quoteId });
          expect(refused.status).toBe(409);
          expect(refused.body).toMatchObject({ error: "Quote stale", reason: "missing", quote: { estimateCredits: 2, maximumCredits: 4 } });
        }
        // Another guest presents this guest's quote id.
        const { validateSessionWithIp } = await import("@/lib/session");
        mockState.sessions.set("other-session", { ...fixtures.sessions.paidWithCredits, sid: "other-session", credits: 1000 });
        vi.mocked(validateSessionWithIp).mockResolvedValueOnce({ valid: true, sid: "other-session", currentIpHash: "mock-ip-hash" } as never);
        const other = await generate({ quoteId: quote.quoteId });
        expect(other.status).toBe(409);
        expect(other.body).toMatchObject({ error: "Quote stale", reason: "missing" });
        await expectNothingStarted();
        // Nobody used it: its owner still can.
        expect((await storedQuotes()).find((q) => q._id === quote.quoteId)!.usedAt).toBeUndefined();
        expect((await generate({ quoteId: quote.quoteId })).status).toBe(200);
      });

      it("refuses acceptance after the catalog price changed, with a fresh quote at the new price", async () => {
        await prepareWork();
        const { quote } = (await askQuote()).body;
        fetchImageModelsMock.mockResolvedValue({ models: [catalogModel({ ...syntheticPricing, image_output: "0.00003" })] });
        const stale = await generate({ quoteId: quote.quoteId });
        expect(stale.status).toBe(409);
        expect(stale.body).toMatchObject({ error: "Quote stale", reason: "changed" });
        expect(stale.body.quote.estimateCredits).toBeGreaterThan(quote.estimateCredits);
        expect(stale.body.quote.maximumCredits).toBe(stale.body.quote.estimateCredits * 2);
        await expectNothingStarted();
        const accepted = await generate({ quoteId: stale.body.quote.quoteId });
        expect(accepted.status).toBe(200);
        expect(actionArgs("reserveCredits")).toMatchObject([{ amount: stale.body.quote.maximumCredits }]);
      });

      it("refuses a quote presented with other settings than it was issued for", async () => {
        await prepareWork();
        const { quote } = (await askQuote()).body;
        for (const changed of [{ style: "classical" }, { aspectRatio: "21:9" }]) {
          const stale = await generate({ quoteId: quote.quoteId, ...changed });
          expect([changed, stale.status, stale.body.error]).toEqual([changed, 409, "Quote stale"]);
          expect(stale.body).toMatchObject({ error: "Quote stale", reason: "changed" });
        }
        await expectNothingStarted();
        expect((await generate({ quoteId: quote.quoteId })).status).toBe(200);
      });

      it("grace: a guest short of the estimate still runs an explicit image, with the hold and the maximum capped to the balance", async () => {
        await prepareWork();
        setCredits(1);
        const { status, body: answer } = await askQuote();
        expect(status).toBe(200);
        expect(answer.quote).toMatchObject({ estimateCredits: 1, maximumCredits: 1 });
        const result = await generate({ quoteId: answer.quote.quoteId });
        expect(result.status).toBe(200);
        // Usage came to 2 credits; the guest accepted at most 1.
        expect(actionArgs("reserveCredits")).toMatchObject([{ amount: 1, costUsd: 0.01 }]);
        expect(actionArgs("deductCredits")).toMatchObject([{ amount: 1, actualAmount: 1 }]);
        expect(result.body).toMatchObject({ creditsCost: 1, maximumCreditsCost: 1, chargeCapped: { wantedCredits: 2, chargedCredits: 1 }, credits: 0 });
        expect(credits()).toBe(0);
      });

      it("caps the maximum to a balance between the estimate and twice the estimate", async () => {
        await prepareWork();
        setCredits(3);
        expect((await askQuote()).body.quote).toMatchObject({ estimateCredits: 2, maximumCredits: 3 });
      });

      it("automatic generation needs the whole estimate: no grace, and its own quote accepted by the server", async () => {
        await prepareWork();
        setCredits(1);
        const refused = await generate({ automatic: true });
        expect(refused.status).toBe(402);
        expect(refused.body).toMatchObject({ error: "Insufficient credits", required: 2, available: 1 });
        await expectNothingStarted();
        expect(await storedQuotes()).toHaveLength(0);

        setCredits(2);
        const result = await generate({ automatic: true });
        expect(result.status).toBe(200);
        expect(actionArgs("reserveCredits")).toMatchObject([{ amount: 2 }]);
        expect(await storedQuotes()).toMatchObject([{ origin: "automatic", usedBy: "generic-1", estimateCredits: 2, maximumCredits: 2 }]);
        expect((await storedRequests())[0]).toMatchObject({ billingPolicyVersion: "accepted-maximum-v1", quoteId: String((await storedQuotes())[0]._id), maximumCreditsCost: 2 });
      });

      it("caps settlement at the accepted maximum when usage comes in above it", async () => {
        await prepareWork();
        const { quote } = (await askQuote()).body;
        providerCost(0.1); // 13 credits after the markup
        const { status, body: result } = await generate({ quoteId: quote.quoteId });
        expect(status).toBe(200);
        expect(result).toMatchObject({ creditsCost: 4, costUsd: 0.04, maximumCreditsCost: 4, chargeCapped: { wantedCredits: 13, chargedCredits: 4 }, openRouterUsageUsd: 0.1, credits: 996 });
        expect(actionArgs("deductCredits")).toMatchObject([{ amount: 4, actualAmount: 4, actualCostUsd: 0.04 }]);
        expect(credits()).toBe(996);
        expect((await storedRequests())[0]).toMatchObject({ status: "succeeded", actualCreditsCost: 4, usedFallbackEstimate: false });
        // Provider spend stays on the record beside the capped charge.
        expect(actionArgs("recordImageCostEvent")[0]).toMatchObject({ actualCreditsCost: 4, reservationCreditsCost: 4, openRouterUsageUsd: 0.1 });
        expect((await savedImages())[0]).toMatchObject({ creditsCost: 4 });
      });

      it("charges the accepted estimate when usage is missing, and records the charge as estimated", async () => {
        await prepareWork();
        const { quote } = (await askQuote()).body;
        providerCost(undefined);
        const { status, body: result } = await generate({ quoteId: quote.quoteId });
        expect(status).toBe(200);
        expect(result).toMatchObject({ creditsCost: quote.estimateCredits, usedFallbackEstimate: true, usedActualCost: false, openRouterUsageUsd: null });
        expect(actionArgs("deductCredits")).toMatchObject([{ amount: 4, actualAmount: 2 }]);
        expect(credits()).toBe(998);
        expect((await storedRequests())[0]).toMatchObject({ status: "succeeded", usedFallbackEstimate: true, actualCreditsCost: 2 });
        expect(actionArgs("recordImageCostEvent")[0]).toMatchObject({ usedFallbackEstimate: true, actualCreditsCost: 2 });
      });

      it("refuses reuse of a quote id by another request, and replays the request that used it", async () => {
        await prepareWork();
        const { quote } = (await askQuote()).body;
        expect((await generate({ quoteId: quote.quoteId })).status).toBe(200);
        const reused = await generate({ quoteId: quote.quoteId, requestId: "generic-second" });
        expect(reused.status).toBe(409);
        expect(reused.body).toMatchObject({ error: "Quote stale", reason: "used" });
        expect(getCallCount("reserveCredits")).toBe(1);
        expect(imageCalls()).toHaveLength(1);
        expect(await storedRequests()).toHaveLength(1);
        // The same request delivered again is the same generation: its saved result, no second charge.
        const replay = await generate({ quoteId: quote.quoteId });
        expect(replay.status).toBe(200);
        expect(replay.body).toMatchObject({ reused: true, savedImageId: expect.any(String) });
        expect(credits()).toBe(998);
      });

      it("lets only one of two concurrent requests use the same quote: one hold, one provider call", async () => {
        await prepareWork();
        const { quote } = (await askQuote()).body;
        const results = await Promise.all([
          generate({ quoteId: quote.quoteId, requestId: "generic-concurrent-a" }),
          generate({ quoteId: quote.quoteId, requestId: "generic-concurrent-b" }),
        ]);
        expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
        expect(results.find((result) => result.status === 409)!.body).toMatchObject({ error: "Quote stale", reason: "used" });
        expect(actionArgs("reserveCredits")).toMatchObject([{ amount: 4 }]);
        expect(imageCalls()).toHaveLength(1);
        expect(credits()).toBe(998);
      });

      it("answers a quote request like generation would: 402 with no credits, 429 at the daily limit, nothing to accept for the owner", async () => {
        await prepareWork();
        setCredits(0);
        expect((await askQuote()).status).toBe(402);
        resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000, dailySpendUsd: 4.99 }]);
        expect((await askQuote()).status).toBe(429);
        resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000, tier: "admin" }]);
        expect(await askQuote()).toEqual({ status: 200, body: { quote: null } });
        expect(await storedQuotes()).toHaveLength(0);
        await expectNothingStarted();
      });

      it("the owner generates without a quote and is never capped or charged", async () => {
        await prepareWork();
        resetMockState([{ ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000, tier: "admin" }]);
        providerCost(0.1);
        const { status, body: result } = await generate();
        expect(status).toBe(200);
        expect(result.chargeCapped).toBeUndefined();
        expect(result.creditsCost).toBe(13);
        expect(getCallCount("reserveCredits")).toBe(0);
        expect(await storedQuotes()).toHaveLength(0);
      });
    });

    describe("durable HTTP intent admission", () => {
      it("answers a lost-response retry from the saved result, before the catalog and without a second paid call", async () => {
        await prepareWork();
        const { POST } = await import("../../generate-image/route");
        expect((await POST(createGenerateImageRequest(body))).status).toBe(200);
        const networkCallsBeforeRetry = mockFetch.mock.calls.length;
        fetchImageModelsMock.mockRejectedValueOnce(new Error("Catalog offline"));
        const retry = await POST(createGenerateImageRequest(body));
        expect(mockFetch.mock.calls).toHaveLength(networkCallsBeforeRetry);
        expect(retry.status).toBe(200);
        expect(await retry.json()).toMatchObject({ reused: true, savedImageId: expect.any(String) });
        expect(getCallCount("reserveCredits")).toBe(1);
        expect(getCallCount("saveImage")).toBe(1);
        expect(imageCalls()).toHaveLength(1);
      });

      it("rejects changed immutable input without starting a second paid call", async () => {
        await prepareWork();
        const { POST } = await import("../../generate-image/route");
        expect((await POST(createGenerateImageRequest(body))).status).toBe(200);
        const conflict = await POST(createGenerateImageRequest({ ...body, generation: 2 }));
        expect(conflict.status).toBe(409);
        expect(getCallCount("reserveCredits")).toBe(1);
        expect(imageCalls()).toHaveLength(1);
      });

      it("does not reserve or call the provider when admission cannot be persisted", async () => {
        await prepareWork();
        const { POST } = await import("../../generate-image/route");
        failAdmission = true;
        expect((await POST(createGenerateImageRequest(body))).status).toBe(503);
        expect(getCallCount("reserveCredits")).toBe(0);
        expect(getCallCount("saveImage")).toBe(0);
        expect(imageCalls()).toHaveLength(0);
      });

      it.each([
        ["insufficient credits", { credits: 0 }, 402],
        ["the daily spend limit", { dailySpendUsd: 4.99 }, 429],
      ] as const)("admits the same ID after a refusal for %s before paid work", async (_reason, refusal, status) => {
        await prepareWork();
        const funded = { ...fixtures.sessions.paidWithCredits, sid: "test-session", credits: 1000 };
        resetMockState([{ ...funded, ...refusal }]);
        const { POST } = await import("../../generate-image/route");
        expect((await POST(createGenerateImageRequest(body))).status).toBe(status);
        expect(getCallCount("reserveCredits")).toBe(0);
        expect(imageCalls()).toHaveLength(0);
        mockState.sessions.set("test-session", funded);
        expect((await POST(createGenerateImageRequest(body))).status).toBe(200);
        expect(getCallCount("reserveCredits")).toBe(1);
      });

      it("holds the verified quote with bounded headroom", async () => {
        await prepareWork();
        const { IMAGE_RESERVATION_HEADROOM_MULTIPLIER } = await import("@/lib/image-models");
        const { POST } = await import("../../generate-image/route");
        const result = await (await POST(createGenerateImageRequest(body))).json();
        const reserve = mockState.callHistory.find((c) => c.action === "reserveCredits");
        expect((reserve?.args as { amount: number }).amount).toBe(result.estimatedCreditsCost * IMAGE_RESERVATION_HEADROOM_MULTIPLIER);
      });

      it("keeps retries in progress until the saved result is available", async () => {
        await prepareWork();
        let finishSave!: () => void;
        saveBarrier = new Promise<void>((resolve) => { finishSave = resolve; });
        const { POST } = await import("../../generate-image/route");
        const first = POST(createGenerateImageRequest(body));
        await vi.waitFor(() => expect(getCallCount("saveImage")).toBe(1));
        try {
          const retry = await POST(createGenerateImageRequest(body));
          expect(retry.status).toBe(202);
          expect(await retry.json()).toMatchObject({ status: "generating", engine: "generic" });
        } finally {
          finishSave();
          await first;
        }
        const recovered = await POST(createGenerateImageRequest(body));
        expect(recovered.status).toBe(200);
        expect((await recovered.json()).savedImageId).toBeDefined();
        expect(getCallCount("reserveCredits")).toBe(1);
      });
    });
  });

  describe("canonical passage authority", () => {
    it.each([undefined, "", "Scripture"])("rejects a noncanonical reference (%s) before paid work", async (reference) => {
      mockFetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) });
      const { POST } = await import("../../generate-image/route");
      expect((await POST(createGenerateImageRequest({ reference, text: "FORGED_CURRENT" }))).status).toBe(400);
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
      expect(getCallCount("saveImage")).toBe(0);
    });

    it.each([401, 403, 429, 500, 503])("preserves upstream reference failure %i without charging", async (status) => {
      setMockFetchBibleApiBypass((url) => decodeURIComponent(url.pathname) === "/Genesis 1:1");
      const providerCalls = vi.fn();
      mockFetchImpl = async (input) => {
        if (String(input).includes("bible-api.com")) return { ok: false, status, json: async () => ({}) };
        providerCalls();
        throw new Error("Paid provider must not run");
      };
      const { POST } = await import("../../generate-image/route");
      const response = await POST(createGenerateImageRequest({}));
      expect(response.status).toBe(status === 503 ? 503 : 502);
      expect((await response.json()).details.upstreamStatus).toBe(status);
      expect(providerCalls).not.toHaveBeenCalled();
      expect(getCallCount("sessions:reserveCredits")).toBe(0);
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

  describe("reference lookup", () => {
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
  });
});
