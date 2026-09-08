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
                prompt: "0.00000025",
                completion: "0.00000125",
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

  it("disables paid choices during a cold catalog outage", async () => {
    mockFetchSequence([{ ok: false, status: 503 }]);
    const { fetchImageModels } = await import("../image-models");
    const result = await fetchImageModels("test-key");
    expect(result.models[0]).toMatchObject({ availability: "unavailable", creditsCost: null });
  });

  it("image models use stale cached snapshot when a later models fetch fails", async () => {
    const cachedModelId = "google/gemini-2.5-flash-image";

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
                prompt: "0.0000003", completion: "0.0000025", image_output: "0.00003",
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
    expect(second.models[0].availability).toBe("stale");
    expect(second.models.some((model) => model.id === cachedModelId)).toBe(true);
  });
});
