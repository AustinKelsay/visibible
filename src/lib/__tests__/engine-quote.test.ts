/**
 * The reference-aware image quote (#173): the assembled prompt and every reference image are counted from controlled
 * catalog data, with the reasoning Nano Banana 2.1 bills beside each image (ADR 0012).
 */
import { describe, it, expect } from "vitest";
import { quoteGenericImage } from "../engine/quote";
import { normalizeImageBilling } from "../image-catalog";
import { DEFAULT_IMAGE_MODEL } from "../image-models";
import referencePricing from "../../../tests/fixtures/lite-reference-pricing.json";
import catalog from "../../../tests/fixtures/image-catalog.json";

describe("the generation model's quote", () => {
  it("allows for the reasoning it bills with every image, so a typical lean request quotes six credits", () => {
    const billing = normalizeImageBilling(DEFAULT_IMAGE_MODEL, catalog.data.find((m) => m.id === DEFAULT_IMAGE_MODEL)!.pricing, 1);
    // 1,120 image tokens and 600 reasoning tokens at catalog rates, plus a 6,700-character prompt and two references:
    // about $0.043, the median the lean comparison measured, which rounds to 6 credits after the 25% premium.
    const quote = quoteGenericImage({ modelId: DEFAULT_IMAGE_MODEL, billing, resolution: "1K", promptChars: 6700, referenceImages: 2 })!;
    expect(quote).toMatchObject({ outputTokens: 1120, credits: 6, withinEnvelope: true });
    expect(quote.providerUsd).toBeCloseTo(0.0435, 3);
  });
});

describe("generic image quote", () => {
  const lite = "google/gemini-3.1-flash-lite-image";
  const billing = normalizeImageBilling(lite, { prompt: "0.00000025", completion: "0.0000015", image_output: "0.00003", image: "0.0003" }, 1);

  it("counts the assembled prompt and each reference image, staying near five credits on Lite", () => {
    const text = quoteGenericImage({ modelId: lite, billing, resolution: "1K", promptChars: 7800, referenceImages: 0 })!;
    const withRefs = quoteGenericImage({ modelId: lite, billing, resolution: "1K", promptChars: 7800, referenceImages: 3 })!;
    expect(text.promptTokens).toBe(1950);
    expect(text.outputTokens).toBe(1120);
    // 1950 × 0.25e-6 + 100 × 1.5e-6 + 1120 × 30e-6 = 0.0342375 USD → 4.28 → 5 credits with the markup.
    expect(text.providerUsd).toBeCloseTo(0.0342375, 7);
    expect(text.credits).toBe(5);
    expect(withRefs.providerUsd).toBeCloseTo(0.0342375 + 3 * 0.0003, 7);
    expect(withRefs.credits).toBe(5);
    expect(withRefs.withinEnvelope).toBe(true);
    expect(quoteGenericImage({ modelId: lite, billing, resolution: "1K", promptChars: 2000, referenceImages: 0 })!.credits).toBeLessThanOrEqual(text.credits);
  });

  it("quotes the live Lite catalog's unified input-token rate when the per-image field is absent", () => {
    const noImagePrice = normalizeImageBilling(lite, { prompt: "0.00000025", completion: "0.0000015", image_output: "0.00003" }, 1);
    const quote = quoteGenericImage({ modelId: lite, billing: noImagePrice, resolution: "1K", promptChars: 7800, referenceImages: 3 });
    // 3 × 1,120 input image tokens at $0.25/M, plus the text and output image.
    expect(quote?.providerUsd).toBeCloseTo(0.0350775, 8);
    expect(quote?.credits).toBe(5);
    expect(noImagePrice?.imageInputTokens).toEqual({ usdPerToken: "0.00000025", perImage: 1120 });
    const oldFamily = "google/gemini-2.5-flash-image";
    const unverifiedInput = normalizeImageBilling(oldFamily, { prompt: "0.0000003", completion: "0.0000025", image_output: "0.00003" }, 1);
    expect(quoteGenericImage({ modelId: oldFamily, billing: unverifiedInput, resolution: "1K", promptChars: 1000, referenceImages: 1 })).toBeNull();
    expect(quoteGenericImage({ modelId: "unknown/model", billing, resolution: "1K", promptChars: 1000, referenceImages: 0 })).toBeNull();
    expect(billing?.imageInputUsd).toBe("0.0003");
  });

  it("refuses invalid reference counts and malformed explicit input-image prices", () => {
    for (const referenceImages of [-1, 1.5, NaN, Infinity]) {
      expect(quoteGenericImage({ modelId: lite, billing, resolution: "1K", promptChars: 1000, referenceImages })).toBeNull();
    }
    const invalid = normalizeImageBilling(lite, { prompt: "0.00000025", completion: "0.0000015", image_output: "0.00003", image: "invalid" }, 1);
    expect(quoteGenericImage({ modelId: lite, billing: invalid, resolution: "1K", promptChars: 1000, referenceImages: 1 })).toBeNull();
  });

  it("quotes recorded two- and three-reference requests at five credits against retained provider usage", () => {
    const captured = normalizeImageBilling(referencePricing.model.id, referencePricing.model.pricing, Date.parse(referencePricing.observedAt));
    for (const sample of referencePricing.samples) {
      const quote = quoteGenericImage({ modelId: referencePricing.model.id, billing: captured, resolution: "1K", promptChars: sample.promptChars, referenceImages: sample.references });
      expect(quote, `${sample.caseId}/${sample.arm}`).toMatchObject({ credits: 5, referenceImages: sample.references, withinEnvelope: true });
      expect(quote!.providerUsd).toBeGreaterThan(sample.actualCostUsd);
      expect(quote!.providerUsd - sample.actualCostUsd).toBeLessThan(0.001);
      // Provider native usage independently reconciles to the captured input/output rates.
      expect(sample.promptTokens * Number(referencePricing.model.pricing.prompt) + sample.outputImageTokens * Number(referencePricing.model.pricing.image_output)).toBeCloseTo(sample.actualCostUsd, 10);
    }
  });
});
