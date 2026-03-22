/**
 * Unit tests for credit calculation functions.
 * Tests pricing calculations for chat and image models.
 */

import { describe, it, expect } from "vitest";
import {
  isModelFree,
  computeChatCreditsCost,
  computeActualChatCreditsCost,
  MIN_CHAT_CREDITS,
  DEFAULT_ESTIMATED_TOKENS,
  SCENE_PLANNER_ESTIMATED_TOKENS,
  getSuggestedChatModels,
} from "../chat-models";
import {
  canAffordImageGeneration,
  computeCreditsCost,
  computeConservativeEstimate,
  computeCreditsFromActualUsage,
  computeAdjustedCreditsCost,
  computeEstimatedImageGenerationCreditsCost,
  supportsResolution,
  CONSERVATIVE_ESTIMATE_MULTIPLIER,
  DEFAULT_CREDITS_COST,
  IMAGE_GENERATION_SPEND_DOWN_GRACE_CREDITS,
  getDisplayedCreditsCost,
} from "../image-models";

describe("isModelFree", () => {
  it("should detect :free suffix models", () => {
    expect(isModelFree({ id: "some-model:free" })).toBe(true);
    expect(isModelFree({ id: "anthropic/claude:free" })).toBe(true);
    expect(isModelFree({ id: "model-name:free", pricing: { prompt: "1", completion: "1" } })).toBe(true);
  });

  it('should detect zero pricing models ("0"/"0")', () => {
    expect(isModelFree({ id: "some-model", pricing: { prompt: "0", completion: "0" } })).toBe(true);
  });

  it("should NOT detect models with only partial zero pricing as free", () => {
    expect(isModelFree({ id: "some-model", pricing: { prompt: "0", completion: "0.01" } })).toBe(false);
    expect(isModelFree({ id: "some-model", pricing: { prompt: "0.01", completion: "0" } })).toBe(false);
  });

  it("should NOT detect models with null/undefined pricing as free", () => {
    expect(isModelFree({ id: "some-model" })).toBe(false);
    expect(isModelFree({ id: "some-model", pricing: {} })).toBe(false);
    expect(isModelFree({ id: "some-model", pricing: { prompt: undefined, completion: undefined } })).toBe(false);
  });

  it("should NOT detect paid models as free", () => {
    expect(isModelFree({ id: "gpt-4", pricing: { prompt: "0.03", completion: "0.06" } })).toBe(false);
    expect(isModelFree({ id: "claude-3", pricing: { prompt: "0.000001", completion: "0.000001" } })).toBe(false);
  });
});

describe("computeChatCreditsCost", () => {
  it("should return null for missing pricing", () => {
    expect(computeChatCreditsCost(undefined)).toBeNull();
    expect(computeChatCreditsCost({})).toBeNull();
    expect(computeChatCreditsCost({ prompt: "0.01" })).toBeNull();
    expect(computeChatCreditsCost({ completion: "0.01" })).toBeNull();
  });

  it("should return null for NaN pricing", () => {
    expect(computeChatCreditsCost({ prompt: "abc", completion: "0.01" })).toBeNull();
    expect(computeChatCreditsCost({ prompt: "0.01", completion: "xyz" })).toBeNull();
  });

  it("should return MIN_CHAT_CREDITS for free models", () => {
    expect(computeChatCreditsCost({ prompt: "0", completion: "0" })).toBe(MIN_CHAT_CREDITS);
  });

  it("should always return at least MIN_CHAT_CREDITS", () => {
    // Very cheap model
    const result = computeChatCreditsCost({ prompt: "0.000001", completion: "0.000001" });
    expect(result).toBeGreaterThanOrEqual(MIN_CHAT_CREDITS);
  });

  it("should apply premium multiplier correctly", () => {
    // Test with known pricing: $10/million tokens for both prompt and completion
    const pricing = { prompt: "10", completion: "10" };
    const result = computeChatCreditsCost(pricing, 1000);

    // Expected: (10 * 500 / 1_000_000) + (10 * 500 / 1_000_000) = 0.005 + 0.005 = 0.01 USD
    // With premium: 0.01 * 1.25 = 0.0125 USD
    // Credits: ceil(0.0125 / 0.01) = 2
    expect(result).toBe(2);
  });

  it("should use default estimated tokens when not specified", () => {
    const pricing = { prompt: "1", completion: "1" };
    const result = computeChatCreditsCost(pricing);
    // This uses DEFAULT_ESTIMATED_TOKENS
    expect(result).toBeGreaterThanOrEqual(MIN_CHAT_CREDITS);
  });

  it("should use scene planner tokens for smaller estimates", () => {
    const pricing = { prompt: "1", completion: "1" };
    const normalResult = computeChatCreditsCost(pricing, DEFAULT_ESTIMATED_TOKENS);
    const smallResult = computeChatCreditsCost(pricing, SCENE_PLANNER_ESTIMATED_TOKENS);
    // Smaller token estimate should result in lower cost
    expect(smallResult).toBeLessThanOrEqual(normalResult!);
  });
});

describe("computeActualChatCreditsCost", () => {
  it("should return null for missing pricing", () => {
    expect(computeActualChatCreditsCost(undefined, 100, 100)).toBeNull();
    expect(computeActualChatCreditsCost({}, 100, 100)).toBeNull();
  });

  it("should return MIN_CHAT_CREDITS for free models", () => {
    expect(computeActualChatCreditsCost({ prompt: "0", completion: "0" }, 1000, 1000)).toBe(MIN_CHAT_CREDITS);
  });

  it("should calculate based on actual token counts", () => {
    // $10/million tokens
    const pricing = { prompt: "10", completion: "10" };
    const result = computeActualChatCreditsCost(pricing, 500, 500);

    // Cost: (10 * 500 / 1_000_000) + (10 * 500 / 1_000_000) = 0.01 USD
    // With premium: 0.01 * 1.25 = 0.0125 USD
    // Credits: ceil(0.0125 / 0.01) = 2
    expect(result).toBe(2);
  });
});

describe("getSuggestedChatModels", () => {
  it("returns the curated suggestions in the intended order", () => {
    const models = [
      {
        id: "qwen/qwen3.5-plus-02-15",
        name: "Qwen: Qwen3.5 Plus 2026-02-15",
        provider: "Qwen",
        contextLength: 1000000,
        isFree: false,
      },
      {
        id: "google/gemini-2.5-flash",
        name: "Google: Gemini 2.5 Flash",
        provider: "Google",
        contextLength: 1048576,
        isFree: false,
      },
      {
        id: "openai/gpt-5.4-mini",
        name: "OpenAI: GPT-5.4 Mini",
        provider: "Openai",
        contextLength: 400000,
        isFree: false,
      },
      {
        id: "openai/gpt-oss-120b",
        name: "OpenAI: gpt-oss-120b",
        provider: "Openai",
        contextLength: 131072,
        isFree: false,
      },
      {
        id: "anthropic/claude-haiku-4.5",
        name: "Anthropic: Claude Haiku 4.5",
        provider: "Anthropic",
        contextLength: 200000,
        isFree: false,
      },
      {
        id: "deepseek/deepseek-v3.2",
        name: "DeepSeek: DeepSeek V3.2",
        provider: "Deepseek",
        contextLength: 163840,
        isFree: false,
      },
      {
        id: "mistralai/mistral-small-2603",
        name: "Mistral: Mistral Small 4",
        provider: "Mistralai",
        contextLength: 262144,
        isFree: false,
      },
    ];

    expect(getSuggestedChatModels(models).map((model) => model.id)).toEqual([
      "openai/gpt-oss-120b",
      "openai/gpt-5.4-mini",
      "anthropic/claude-haiku-4.5",
      "deepseek/deepseek-v3.2",
      "mistralai/mistral-small-2603",
      "qwen/qwen3.5-plus-02-15",
      "google/gemini-2.5-flash",
    ]);
  });

  it("skips curated models that are not present in the fetched catalog", () => {
    const models = [
      {
        id: "openai/gpt-oss-120b",
        name: "OpenAI: gpt-oss-120b",
        provider: "Openai",
        contextLength: 131072,
        isFree: false,
      },
      {
        id: "some-provider/other-model",
        name: "Other Model",
        provider: "Other",
        contextLength: 4096,
        isFree: false,
      },
    ];

    expect(getSuggestedChatModels(models).map((model) => model.id)).toEqual([
      "openai/gpt-oss-120b",
    ]);
  });
});

// Image model credit calculations
describe("computeCreditsCost", () => {
  it("should return null for missing/invalid pricing", () => {
    expect(computeCreditsCost(undefined)).toBeNull();
    expect(computeCreditsCost("")).toBeNull();
    expect(computeCreditsCost("abc")).toBeNull();
    expect(computeCreditsCost("0")).toBeNull();
    expect(computeCreditsCost("-1")).toBeNull();
  });

  it("should return at least 1 credit", () => {
    expect(computeCreditsCost("0.001")).toBeGreaterThanOrEqual(1);
  });

  it("should apply premium multiplier", () => {
    // $0.10 base price
    const result = computeCreditsCost("0.1");
    // Expected: 0.1 * 1.25 = 0.125 USD = ceil(0.125 / 0.01) = 13 credits
    expect(result).toBe(13);
  });
});

describe("canAffordImageGeneration", () => {
  it("allows users with enough credits outright", () => {
    expect(canAffordImageGeneration(5, 5)).toBe(true);
    expect(canAffordImageGeneration(12, 5)).toBe(true);
  });

  it("allows a small spend-down grace window above zero", () => {
    expect(
      canAffordImageGeneration(
        2,
        2 + IMAGE_GENERATION_SPEND_DOWN_GRACE_CREDITS
      )
    ).toBe(true);
  });

  it("does not allow zero-credit sessions to start another generation", () => {
    expect(canAffordImageGeneration(0, 5)).toBe(false);
  });

  it("rejects requests outside the grace window", () => {
    expect(
      canAffordImageGeneration(
        2,
        3 + IMAGE_GENERATION_SPEND_DOWN_GRACE_CREDITS
      )
    ).toBe(false);
  });
});

describe("computeConservativeEstimate", () => {
  it("should return null for unpriced models", () => {
    expect(computeConservativeEstimate(undefined)).toBeNull();
    expect(computeConservativeEstimate("0")).toBeNull();
  });

  it("should apply 35x multiplier for pricing discrepancy", () => {
    const baseCost = computeCreditsCost("0.1");
    const conservative = computeConservativeEstimate("0.1");

    // Conservative should be approximately 35x the base (with ceiling effects)
    expect(conservative).toBe(Math.ceil(baseCost! * CONSERVATIVE_ESTIMATE_MULTIPLIER));
  });
});

describe("computeCreditsFromActualUsage", () => {
  it("should use actual usage when available", () => {
    // $0.10 actual usage
    const result = computeCreditsFromActualUsage(0.1, 100);
    expect(result.usedActual).toBe(true);
    // 0.1 * 1.25 = 0.125 = 13 credits
    expect(result.credits).toBe(13);
  });

  it("should fall back when actual usage is null", () => {
    const result = computeCreditsFromActualUsage(null, 100);
    expect(result.usedActual).toBe(false);
    expect(result.credits).toBe(100);
  });

  it("should fall back when actual usage is 0", () => {
    const result = computeCreditsFromActualUsage(0, 100);
    expect(result.usedActual).toBe(false);
    expect(result.credits).toBe(100);
  });

  it("should fall back when actual usage is negative", () => {
    const result = computeCreditsFromActualUsage(-0.5, 100);
    expect(result.usedActual).toBe(false);
    expect(result.credits).toBe(100);
  });

  it("should return at least 1 credit for actual usage", () => {
    const result = computeCreditsFromActualUsage(0.0001, 100);
    expect(result.credits).toBeGreaterThanOrEqual(1);
  });
});

describe("supportsResolution", () => {
  it("should detect google/gemini models as supporting resolution", () => {
    expect(supportsResolution("google/gemini-2.5-flash-image")).toBe(true);
    expect(supportsResolution("google/gemini-pro")).toBe(true);
    expect(supportsResolution("GOOGLE/GEMINI-flash")).toBe(true); // Case insensitive
  });

  it("should NOT detect non-Gemini models as supporting resolution", () => {
    expect(supportsResolution("openai/dall-e-3")).toBe(false);
    expect(supportsResolution("stability/stable-diffusion")).toBe(false);
    expect(supportsResolution("anthropic/claude-3")).toBe(false);
  });
});

describe("computeAdjustedCreditsCost", () => {
  it("should use DEFAULT_CREDITS_COST when baseCost is null/undefined", () => {
    expect(computeAdjustedCreditsCost(null, "1K")).toBe(DEFAULT_CREDITS_COST);
    expect(computeAdjustedCreditsCost(undefined, "1K")).toBe(DEFAULT_CREDITS_COST);
  });

  it("should NOT apply multiplier without modelId", () => {
    expect(computeAdjustedCreditsCost(10, "1K")).toBe(10);
    expect(computeAdjustedCreditsCost(10, "2K")).toBe(10); // No multiplier without modelId
    expect(computeAdjustedCreditsCost(10, "4K")).toBe(10);
  });

  it("should NOT apply multiplier for non-Gemini models", () => {
    expect(computeAdjustedCreditsCost(10, "2K", "openai/dall-e-3")).toBe(10);
    expect(computeAdjustedCreditsCost(10, "4K", "stability/stable-diffusion")).toBe(10);
  });

  it("should apply 3.5x multiplier for 2K Gemini", () => {
    const result = computeAdjustedCreditsCost(10, "2K", "google/gemini-2.5-flash-image");
    expect(result).toBe(35); // 10 * 3.5 = 35
  });

  it("should apply 6.5x multiplier for 4K Gemini", () => {
    const result = computeAdjustedCreditsCost(10, "4K", "google/gemini-2.5-flash-image");
    expect(result).toBe(65); // 10 * 6.5 = 65
  });

  it("should apply 1.0x multiplier for 1K Gemini", () => {
    const result = computeAdjustedCreditsCost(10, "1K", "google/gemini-2.5-flash-image");
    expect(result).toBe(10);
  });

  it("should ceil fractional credits", () => {
    const result = computeAdjustedCreditsCost(3, "2K", "google/gemini-pro");
    expect(result).toBe(11); // ceil(3 * 3.5) = 11
  });
});

describe("computeEstimatedImageGenerationCreditsCost", () => {
  it("adds the scene planner surcharge on top of the adjusted image estimate", () => {
    expect(
      computeEstimatedImageGenerationCreditsCost(
        10,
        "1K",
        "google/gemini-2.5-flash-image",
        1
      )
    ).toBe(11);
  });

  it("applies resolution multipliers before adding the planner surcharge", () => {
    expect(
      computeEstimatedImageGenerationCreditsCost(
        10,
        "2K",
        "google/gemini-2.5-flash-image",
        2
      )
    ).toBe(37);
  });

  it("ignores negative planner surcharges", () => {
    expect(
      computeEstimatedImageGenerationCreditsCost(
        10,
        "1K",
        "google/gemini-2.5-flash-image",
        -5
      )
    ).toBe(10);
  });
});

describe("getDisplayedCreditsCost", () => {
  it("prefers estimated pricing when reservation pricing is also available", () => {
    expect(
      getDisplayedCreditsCost({
        creditsCost: 1,
        reservationCreditsCost: 35,
      })
    ).toBe(1);
  });

  it("falls back to reservation pricing when estimated pricing is unavailable", () => {
    expect(
      getDisplayedCreditsCost({
        creditsCost: null,
        reservationCreditsCost: 35,
      })
    ).toBe(35);
  });

  it("uses estimated pricing when only estimated pricing is available", () => {
    expect(
      getDisplayedCreditsCost({
        creditsCost: 7,
        reservationCreditsCost: null,
      })
    ).toBe(7);
  });

  it("returns null when no pricing is available", () => {
    expect(
      getDisplayedCreditsCost({
        creditsCost: null,
        reservationCreditsCost: null,
      })
    ).toBeNull();
  });
});
