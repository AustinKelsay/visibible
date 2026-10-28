import { imageModelFixture } from "../shared/image-model-fixtures";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchImageModels = vi.fn();
const mockGetScenePlannerEstimatedCreditsCost = vi.fn();
const mockValidateSession = vi.fn();
const mockConvex = {
  query: vi.fn(),
  mutation: vi.fn(),
};

vi.mock("@/lib/image-models", async () => {
  const actual = await vi.importActual<typeof import("@/lib/image-models")>(
    "@/lib/image-models"
  );
  return {
    ...actual,
    fetchImageModels: mockFetchImageModels,
  };
});

vi.mock("@/lib/scene-planner", () => ({
  getScenePlannerEstimatedCreditsCost: mockGetScenePlannerEstimatedCreditsCost,
}));

vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => mockConvex),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

vi.mock("@/lib/session", () => ({ validateSessionWithIp: mockValidateSession }));

const originalEnv = { ...process.env };

describe("Image Models API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateSession.mockResolvedValue({ valid: false });
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: "test-api-key",
    };
    mockFetchImageModels.mockResolvedValue({
      models: [
        {
          ...imageModelFixture("google/gemini-2.5-flash-image"),
          name: "Gemini 2.5 Flash Image",
          provider: "Google",
          creditsCost: 2,
          etaSeconds: 12,
        },
        {
          id: "openai/dall-e-3",
          name: "DALL-E 3",
          provider: "OpenAI",
          availability: "unavailable",
          creditsCost: null,
          etaSeconds: 14,
        },
      ],
    });
    mockGetScenePlannerEstimatedCreditsCost.mockResolvedValue(1);
    mockConvex.mutation.mockResolvedValue({ processed: 0, skipped: 0, alreadySeeded: true });
    mockConvex.query.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if (!("serverSecret" in args)) {
        return [{ modelId: "google/gemini-2.5-flash-image", etaSeconds: 8 }];
      }
      if ("serverSecret" in args) {
        return [
          {
            scopeType: "model",
            scopeValue: "google/gemini-2.5-flash-image",
            resolution: "1K",
            estimateCredits: 7,
            sampleCount: 6,
          },
          {
            scopeType: "global",
            scopeValue: "global",
            resolution: "2K",
            estimateCredits: 18,
            sampleCount: 12,
          },
          {
            scopeType: "provider",
            scopeValue: "openai",
            resolution: "1K",
            estimateCredits: 9,
            sampleCount: 4,
          },
        ];
      }
      return [];
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("shows owner-check styles only for the exact valid existing session, with private uncached responses", async () => {
    process.env.GENERIC_ENGINE_MODE = "owner";
    process.env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256 = createHash("sha256").update("controlled-session").digest("hex");
    mockValidateSession.mockResolvedValue({ valid: true, sid: "controlled-session" });
    let exists = true;
    mockConvex.query.mockImplementation(async (_ref, args) => {
      if ("sid" in args) return exists ? { sid: "controlled-session", tier: "paid" } : null;
      if ("workId" in args) return { ready: true, reasons: [], activeGeneration: 1, briefVersion: "brief" };
      return [];
    });
    const { GET } = await import("../../image-models/route");
    const request = new Request("https://example.com/api/image-models");
    const admitted = await GET(request);
    expect(admitted.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await admitted.json()).artStyles.every((style: { available: boolean }) => style.available)).toBe(true);
    exists = false;
    expect((await (await GET(request)).json()).artStyles.find((style: { id: string }) => style.id === "watercolor").available).toBe(false);
    exists = true;
    mockValidateSession.mockResolvedValue({ valid: false, sid: "controlled-session" });
    expect((await (await GET(request)).json()).artStyles.find((style: { id: string }) => style.id === "watercolor").available).toBe(false);
  });

  it("quotes supported settings and ignores unversioned global samples", async () => {
    const { GET } = await import("../../image-models/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.creditRange).toEqual({ min: 3, max: 3 });
    expect(body.models[0].etaSeconds).toBe(8);
    expect(body.models[0].estimatedCreditsByResolution).toEqual({ "1K": 3 });
    expect(body.models[1].estimatedCreditsByResolution).toEqual({});
    expect(mockConvex.mutation).not.toHaveBeenCalled();
    expect(mockConvex.query).toHaveBeenCalledTimes(1);
  });

  it("falls back cleanly when the OpenRouter API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    mockGetScenePlannerEstimatedCreditsCost.mockResolvedValue(0);

    const { GET } = await import("../../image-models/route");

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.scenePlannerCreditsCost).toBe(0);
    expect(body.creditRange).toBeNull();
    expect(body.models[0].availability).toBe("unavailable");
    expect(mockFetchImageModels).not.toHaveBeenCalled();
  });
});

describe("art style availability", () => {
  it("reports every style with the admission decision: only Classical while the generic engine is disabled, Classical, Watercolor and Fresco when public and ready", async () => {
    process.env = { ...originalEnv, OPENROUTER_API_KEY: "test-api-key" };
    delete process.env.GENERIC_ENGINE_MODE;
    mockFetchImageModels.mockResolvedValue({ models: [imageModelFixture()] });
    mockGetScenePlannerEstimatedCreditsCost.mockResolvedValue(1);
    mockConvex.query.mockResolvedValue([]);
    const { GET } = await import("../../image-models/route");
    const disabled = await (await GET()).json();
    expect(disabled.artStyles.map((s: { id: string; available: boolean }) => [s.id, s.available])).toEqual([["classical", true], ["watercolor", false], ["fresco", false], ["icon", false]]);
    expect(disabled.artStyles[1].reason).toMatch(/temporarily unavailable/);

    process.env.GENERIC_ENGINE_MODE = "public";
    mockConvex.query.mockImplementation(async (_ref: unknown, args: Record<string, unknown>) =>
      "workId" in args ? { ready: true, reasons: [], activeGeneration: 1, briefVersion: "bv" } : []);
    const publicMode = await (await GET()).json();
    // Public mode releases Classical, Watercolor and Fresco; Icon stays owner-only (owner decisions, 28 October).
    expect(publicMode.artStyles.map((s: { id: string; available: boolean }) => [s.id, s.available])).toEqual([["classical", true], ["watercolor", true], ["fresco", true], ["icon", false]]);
    expect(publicMode.artStyles[3].reason).toMatch(/temporarily unavailable/);
  });
});
