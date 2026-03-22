import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchImageModels = vi.fn();
const mockGetScenePlannerEstimatedCreditsCost = vi.fn();
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

const originalEnv = { ...process.env };

describe("Image Models API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: "test-api-key",
    };
    mockFetchImageModels.mockResolvedValue({
      models: [
        {
          id: "google/gemini-2.5-flash-image",
          name: "Gemini 2.5 Flash Image",
          provider: "Google",
          creditsCost: 2,
          etaSeconds: 12,
        },
        {
          id: "openai/dall-e-3",
          name: "DALL-E 3",
          provider: "OpenAI",
          creditsCost: 5,
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

  it("returns learned per-resolution estimates with the planner surcharge added", async () => {
    const { GET } = await import("../../image-models/route");

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.scenePlannerCreditsCost).toBe(1);
    expect(body.creditRange).toEqual({ min: 8, max: 19 });
    expect(body.models[0].etaSeconds).toBe(8);
    expect(body.models[0].estimatedCreditsByResolution).toEqual({
      "1K": 8,
      "2K": 19,
      "4K": 14,
    });
    expect(body.models[1].estimatedCreditsByResolution).toEqual({
      "1K": 10,
      "2K": 10,
      "4K": 10,
    });
  });

  it("backfills learned estimates from generation history when the stats table is empty", async () => {
    let estimatesQueryCount = 0;
    mockConvex.query.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if (!("serverSecret" in args)) {
        return [{ modelId: "google/gemini-2.5-flash-image", etaSeconds: 8 }];
      }

      estimatesQueryCount += 1;
      if (estimatesQueryCount === 1) {
        return [];
      }

      return [
        {
          scopeType: "model",
          scopeValue: "google/gemini-2.5-flash-image",
          resolution: "1K",
          estimateCredits: 5,
          sampleCount: 10,
        },
      ];
    });

    const { GET } = await import("../../image-models/route");

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(mockConvex.mutation).toHaveBeenCalledTimes(1);
    expect(body.models[0].estimatedCreditsByResolution).toEqual({
      "1K": 6,
      "2K": 8,
      "4K": 14,
    });
  });

  it("falls back cleanly when the OpenRouter API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    mockGetScenePlannerEstimatedCreditsCost.mockResolvedValue(0);

    const { GET } = await import("../../image-models/route");

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.scenePlannerCreditsCost).toBe(0);
    expect(body.creditRange).toEqual({ min: 20, max: 20 });
    expect(mockFetchImageModels).not.toHaveBeenCalled();
  });
});
