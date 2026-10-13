import { afterEach, describe, expect, it, vi } from "vitest";
import { quoteTokenUsage } from "../token-pricing";
import {
  computeActualChatCreditsCost,
  computeChatCreditsCost,
  estimateCost,
  EMERGENCY_CHAT_MODEL_PRICING,
  DEFAULT_CHAT_MODEL,
} from "../chat-models";

const pricing = { prompt: "0.00001", completion: "0.00001" };

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("provider token pricing", () => {
  it("uses catalog per-token units consistently for quotes and actual usage", () => {
    expect(quoteTokenUsage(pricing, 1000, 1000)).toEqual({ providerUsd: 0.02, credits: 3 });
    expect(estimateCost(1000, 1000, pricing)).toBe(0.02);
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
    expect(models.estimateCost(1000, 1000, fallback!)).toBe(0.0125);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [{
      id: "fixture/model", name: "Fixture", architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      pricing: fallback,
    }] }) })));
    const live = await models.getChatModelPricing("fixture/model", "fake");
    expect(models.computeChatCreditsCost(live!, 2000)).toBe(2);
  });
});
