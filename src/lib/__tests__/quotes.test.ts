import { describe, expect, it } from "vitest";
import { HISTORY_TOKEN_BUDGET, MAX_OUTPUT_TOKENS } from "@/lib/chat-request";
import { IMAGE_RESERVATION_HEADROOM_MULTIPLIER } from "@/lib/image-models";
import {
  BILLING_POLICY_VERSION, chatQuoteTerms, imageQuoteAmounts, imageQuoteFingerprint,
} from "@/lib/quotes";

describe("image quote terms", () => {
  const terms = {
    workId: "bible-web", unitId: "genesis-1-1", reference: "Genesis 1:1", translationId: "web", styleId: "classical",
    modelId: "google/gemini-nano-banana-2.1", aspectRatio: "16:9", resolution: "1K", prompt: "Draw the first day.",
    referenceImages: 2, billingVersion: "catalog-v1",
    rates: { unit: "token", textInputUsd: "0.0000015", textOutputUsd: "0.000009", imageOutputUsd: "0.00003", imageInputTokens: { usdPerToken: "0.0000015", perImage: 1290 } } as Parameters<typeof imageQuoteFingerprint>[0]["rates"],
  };

  it("fingerprints every term that determines the price, and nothing else", () => {
    const fingerprint = imageQuoteFingerprint(terms);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(imageQuoteFingerprint({ ...terms })).toBe(fingerprint);
    const changes: Array<Partial<typeof terms>> = [
      { workId: "holmes-adventures" }, { unitId: "genesis-1-2" }, { reference: "Genesis 1:2" }, { translationId: "kjv" },
      { styleId: "watercolor" }, { modelId: "google/other" }, { aspectRatio: "21:9" }, { resolution: "2K" },
      { prompt: "Draw the second day." }, { referenceImages: 3 }, { billingVersion: "catalog-v2" },
      // A rate can move without the rounded credits moving, so each rate is part of the fingerprint.
      { rates: { ...terms.rates!, textInputUsd: "0.0000016" } }, { rates: { ...terms.rates!, textOutputUsd: "0.00001" } },
      { rates: { ...terms.rates!, imageOutputUsd: "0.0000301" } }, { rates: { ...terms.rates!, unit: "image" } },
      { rates: { ...terms.rates!, imageInputTokens: { usdPerToken: "0.0000016", perImage: 1290 } } },
      { rates: { ...terms.rates!, imageInputTokens: { usdPerToken: "0.0000015", perImage: 1300 } } },
      { rates: { ...terms.rates!, imageInputTokens: undefined, imageInputUsd: "0.002" } }, { rates: undefined },
    ];
    const changed = changes.map((change) => imageQuoteFingerprint({ ...terms, ...change }));
    expect(new Set([fingerprint, ...changed]).size).toBe(changes.length + 1);
  });

  it("sets the maximum at twice the quote, capped to the guest's balance, with the estimate never above it", () => {
    expect(IMAGE_RESERVATION_HEADROOM_MULTIPLIER).toBe(2);
    expect(imageQuoteAmounts(2, 1000)).toEqual({ estimateCredits: 2, maximumCredits: 4 });
    expect(imageQuoteAmounts(2, 4)).toEqual({ estimateCredits: 2, maximumCredits: 4 });
    expect(imageQuoteAmounts(2, 3)).toEqual({ estimateCredits: 2, maximumCredits: 3 });
    // Spend-down grace: short of the estimate, the guest's whole balance is the maximum.
    expect(imageQuoteAmounts(6, 2)).toEqual({ estimateCredits: 2, maximumCredits: 2 });
    // The owner is not charged and has no balance to cap to.
    expect(imageQuoteAmounts(6, null)).toEqual({ estimateCredits: 6, maximumCredits: 12 });
  });
});

describe("chat quote terms", () => {
  // $1 per million tokens in, $5 out.
  const pricing = { prompt: "0.000001", completion: "0.000005", contextLength: 200_000 };

  it("prices the maximum from the server's bounds and the estimate from a typical turn with this system prompt", () => {
    const terms = chatQuoteTerms("test/model", pricing, 2000)!;
    // (6,000 + 2,000 in × $0.000001 + 2,048 out × $0.000005) × 1.25 = $0.0228: 3 credits.
    // A typical turn (2,000 + 300 in, 1,000 out) is $0.0073 × 1.25: 1 credit.
    expect(terms).toMatchObject({ estimateCredits: 1, maximumCredits: 3, maxInputTokens: HISTORY_TOKEN_BUDGET + 2000, maxOutputTokens: MAX_OUTPUT_TOKENS });
  });

  it("grows the estimate and the maximum with the system prompt", () => {
    const dear = { prompt: "0.0001", completion: "0" };
    // In at $0.0001 a token × 1.25: a typical turn of 500 + 300 tokens is 10 credits, of 3,500 + 300 is 48;
    // the maximum adds the 6,000-token history: 82 and 119.
    expect(chatQuoteTerms("test/model", dear, 500)).toMatchObject({ estimateCredits: 10, maximumCredits: 82, maxInputTokens: 6500 });
    expect(chatQuoteTerms("test/model", dear, 3500)).toMatchObject({ estimateCredits: 48, maximumCredits: 119, maxInputTokens: 9500 });
  });

  it("uses the smaller output cap of a small context window, and never quotes an estimate above the maximum", () => {
    const small = chatQuoteTerms("test/model", { prompt: "0", completion: "0.0001", contextLength: 2048 }, 700)!;
    expect(small.maxOutputTokens).toBe(512);
    // 512 tokens out is the most this model can be asked for, although a typical turn assumes 1,000.
    expect(small.maximumCredits).toBe(7);
    expect(small.estimateCredits).toBe(7);
  });

  it("changes its fingerprint with the model, either price, the input bound or the output bound, and is stable otherwise", () => {
    const base = chatQuoteTerms("test/model", pricing, 700)!.fingerprint;
    expect(chatQuoteTerms("test/model", { ...pricing }, 700)!.fingerprint).toBe(base);
    const others = [
      chatQuoteTerms("test/other", pricing, 700)!, chatQuoteTerms("test/model", { ...pricing, prompt: "0.000002" }, 700)!,
      chatQuoteTerms("test/model", { ...pricing, completion: "0.000006" }, 700)!, chatQuoteTerms("test/model", { ...pricing, contextLength: 4096 }, 700)!,
      chatQuoteTerms("test/model", pricing, 701)!,
    ].map((terms) => terms.fingerprint);
    expect(new Set([base, ...others]).size).toBe(6);
  });

  it("gives no terms for a model that cannot be priced", () => {
    expect(chatQuoteTerms("test/model", { prompt: "not-a-price", completion: "0.000005" }, 700)).toBeNull();
  });

  it("names the policy version new operations are billed under", () => {
    expect(BILLING_POLICY_VERSION).toBe("accepted-maximum-v1");
  });
});
