import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchImageModels = vi.fn();
const mockGetScenePlannerEstimatedCreditsCost = vi.fn();
const mockConvex = {
  query: vi.fn(),
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
    mockConvex.query.mockResolvedValue([
      { modelId: "google/gemini-2.5-flash-image", etaSeconds: 8 },
    ]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("returns planner surcharge alongside the total credit range", async () => {
    const { GET } = await import("../../image-models/route");

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.scenePlannerCreditsCost).toBe(1);
    expect(body.creditRange).toEqual({ min: 3, max: 6 });
    expect(body.models[0].etaSeconds).toBe(8);
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
