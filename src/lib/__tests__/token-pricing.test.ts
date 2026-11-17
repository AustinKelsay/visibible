import { afterEach, describe, expect, it, vi } from "vitest";
import { MICRO_CREDITS_PER_CREDIT, quoteTokenMicroCredits, quoteTokenUsage } from "../token-pricing";
import {
  computeActualChatCreditsCost,
  computeChatCreditsCost,
  EMERGENCY_CHAT_MODEL_PRICING,
  DEFAULT_CHAT_MODEL,
} from "../chat-models";

const pricing = { prompt: "0.00001", completion: "0.00001" };

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("chat's fractional credit price (#493)", () => {
  it("prices usage in millionths of a credit after the markup, rounded up once, with no one-credit minimum", () => {
    expect(MICRO_CREDITS_PER_CREDIT).toBe(1_000_000);
    // GPT-6 Luna at $0.10 / $0.50 per million: 770 in and 158 out is $0.000156 → ×1.25 → 0.0195 credits.
    expect(quoteTokenMicroCredits({ prompt: "0.0000001", completion: "0.0000005" }, 770, 158)).toBe(19_500);
    expect(quoteTokenMicroCredits({ prompt: "0.0000001", completion: "0.0000005" }, 0, 0)).toBe(0);
    expect(quoteTokenMicroCredits({ prompt: "0.000000123", completion: "0" }, 1, 0)).toBe(16); // 15.375 millionths rounds up
    expect(quoteTokenMicroCredits({ prompt: "free", completion: "0" }, 1, 1)).toBeNull();
    expect(quoteTokenMicroCredits({ prompt: "0.0000001", completion: "0.0000005" }, -1, 1)).toBeNull();
  });
});

describe("provider token pricing", () => {
  it("uses catalog per-token units consistently for quotes and actual usage", () => {
    expect(quoteTokenUsage(pricing, 1000, 1000)).toEqual({ providerUsd: 0.02, credits: 3 });
    expect(computeChatCreditsCost(pricing, 2000)).toBe(3);
    expect(computeActualChatCreditsCost(pricing, 1000, 1000)).toBe(3);
  });

  it("rounds the combined total once without floating-point overcharging", () => {
    expect(quoteTokenUsage({ prompt: "0.0001", completion: "0.0001" }, 400, 400))
      .toEqual({ providerUsd: 0.08, credits: 10 });
    expect(quoteTokenUsage({ prompt: "1e-8", completion: "2e-8" }, 1, 1))
      .toEqual({ providerUsd: 0.00000003, credits: 1 });
  });

  it("distinguishes zero provider spend from absent pricing", () => {
    expect(quoteTokenUsage({ prompt: "0", completion: "0" }, 100, 100))
      .toEqual({ providerUsd: 0, credits: 1 });
    expect(quoteTokenUsage(undefined, 100, 100)).toBeNull();
    expect(quoteTokenUsage({ prompt: "0" }, 100, 100)).toBeNull();
  });

  it.each(["-1", "Infinity", "NaN", "0.01USD", "", " ", "0x10", "1e999", "1e-999"])("rejects malformed rate %j", (rate) => {
    expect(quoteTokenUsage({ prompt: rate, completion: "0.001" }, 100, 100)).toBeNull();
    expect(quoteTokenUsage({ prompt: "0.001", completion: rate }, 100, 100)).toBeNull();
  });

  it.each([-1, Infinity, NaN, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid token usage %j", (tokens) => {
    expect(quoteTokenUsage(pricing, tokens, 100)).toBeNull();
    expect(computeChatCreditsCost(pricing, tokens)).toBeNull();
  });

  it("rejects unrepresentable credit amounts", () => {
    expect(quoteTokenUsage({ prompt: "1e30", completion: "1e30" }, 1, 1)).toBeNull();
  });

  it("keeps the existing emergency price in the same per-token units", () => {
    expect(quoteTokenUsage(EMERGENCY_CHAT_MODEL_PRICING[DEFAULT_CHAT_MODEL], 1000, 1000))
      .toEqual({ providerUsd: 0.0125, credits: 2 });
  });

  it("quotes the same rates from the catalog and an outage fallback", async () => {
    vi.resetModules();
    const models = await import("../chat-models");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    const fallback = await models.getChatModelPricing(models.DEFAULT_CHAT_MODEL, "fake");
    expect(quoteTokenUsage(fallback!, 1000, 1000)?.providerUsd).toBe(0.0125);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [{
      id: "fixture/model", name: "Fixture", architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      pricing: fallback,
    }] }) })));
    const live = await models.getChatModelPricing("fixture/model", "fake");
    expect(models.computeChatCreditsCost(live!, 2000)).toBe(2);
  });
});
