import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

type MockResponse = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
};

function mockFetchSequence(responses: Array<MockResponse | Error>) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (!next) {
      throw new Error("No mock fetch response configured");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("model catalog resilience", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("chat pricing falls back to emergency default during models API outage", async () => {
    mockFetchSequence([{ ok: false, status: 503 }]);

    const {
      DEFAULT_CHAT_MODEL,
      EMERGENCY_CHAT_MODEL_PRICING,
      getChatModelPricing,
    } = await import("../chat-models");

    const pricing = await getChatModelPricing(DEFAULT_CHAT_MODEL, "test-key");
    expect(pricing).toEqual(EMERGENCY_CHAT_MODEL_PRICING[DEFAULT_CHAT_MODEL]);
  });

  it("chat models use stale cached snapshot when a later models fetch fails", async () => {
    const cachedModelId = "anthropic/claude-3-haiku";

    mockFetchSequence([
      {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: cachedModelId,
              name: "Claude 3 Haiku",
              architecture: {
                input_modalities: ["text"],
                output_modalities: ["text"],
              },
              pricing: {
                prompt: "0.25",
                completion: "1.25",
              },
            },
          ],
        }),
      },
      { ok: false, status: 503 },
    ]);

    const { fetchChatModels } = await import("../chat-models");

    const first = await fetchChatModels("test-key");
    expect(first.models.some((model) => model.id === cachedModelId)).toBe(true);

    const second = await fetchChatModels("test-key");
    expect(second.error).toContain("cached chat models");
    expect(second.models.some((model) => model.id === cachedModelId)).toBe(true);
  });

  it("image models include emergency default pricing during models API outage", async () => {
    mockFetchSequence([{ ok: false, status: 503 }]);

    const {
      DEFAULT_IMAGE_MODEL,
      EMERGENCY_IMAGE_MODEL_PRICING_USD,
      computeCreditsCost,
      fetchImageModels,
    } = await import("../image-models");

    const result = await fetchImageModels("test-key");
    const defaultModel = result.models.find((model) => model.id === DEFAULT_IMAGE_MODEL);
    expect(defaultModel).toBeDefined();
    expect(defaultModel?.pricing?.imageOutput).toBe(
      EMERGENCY_IMAGE_MODEL_PRICING_USD[DEFAULT_IMAGE_MODEL]
    );
    expect(defaultModel?.usesEmergencyPricing).toBe(true);
    expect(defaultModel?.creditsCost).toBe(
      computeCreditsCost(EMERGENCY_IMAGE_MODEL_PRICING_USD[DEFAULT_IMAGE_MODEL])
    );
  });

  it("image models use stale cached snapshot when a later models fetch fails", async () => {
    const cachedModelId = "google/gemini-2.5-image";

    mockFetchSequence([
      {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: cachedModelId,
              name: "Gemini Image",
              architecture: {
                output_modalities: ["image"],
              },
              pricing: {
                image: "0.05",
              },
            },
          ],
        }),
      },
      { ok: false, status: 502 },
    ]);

    const { fetchImageModels } = await import("../image-models");

    const first = await fetchImageModels("test-key");
    expect(first.models.some((model) => model.id === cachedModelId)).toBe(true);

    const second = await fetchImageModels("test-key");
    expect(second.error).toContain("cached image models");
    expect(second.models.some((model) => model.id === cachedModelId)).toBe(true);
  });
});
