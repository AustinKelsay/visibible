import { quoteBillableUnits } from "./token-pricing";

export type ImageResolution = "1K" | "2K" | "4K";
export type ImageAspectRatio = "16:9" | "21:9" | "3:2";
export const IMAGE_CAPABILITY_SOURCE = "https://ai.google.dev/gemini-api/docs/image-generation";
export const IMAGE_PRICING_SOURCE = "https://ai.google.dev/gemini-api/docs/pricing";
export const IMAGE_CATALOG_SOURCE = "https://openrouter.ai/api/v1/models";
export const IMAGE_BILLING_VERSION = "google-input-output-tokens-2026-10-20";
export const IMAGE_INPUT_TOKEN_SOURCE = "https://ai.google.dev/gemini-api/docs/media-resolution";

// These counts are documented per output image, independent of our three ratios.
// Only these models are offered; others stay hidden until their billing units and request settings are verified.
const OUTPUT_TOKENS: Record<string, Partial<Record<ImageResolution, number>>> = {
  "google/gemini-2.5-flash-image": { "1K": 1290 },
  "google/gemini-3.1-flash-image": { "1K": 1120, "2K": 1680, "4K": 2520 },
  "google/gemini-3.1-flash-image-preview": { "1K": 1120, "2K": 1680, "4K": 2520 },
  "google/gemini-3.1-flash-lite-image": { "1K": 1120 },
};

// Gemini 3's default media resolution uses 1,120 tokens per image. These verified
// models price text and image input at the same rate; other families need an explicit price.
const INPUT_IMAGE_TOKENS: Record<string, number> = {
  "google/gemini-3.1-flash-image": 1120,
  "google/gemini-3.1-flash-image-preview": 1120,
  "google/gemini-3.1-flash-lite-image": 1120,
};

export interface ImageBilling {
  version: typeof IMAGE_BILLING_VERSION;
  source: typeof IMAGE_CATALOG_SOURCE;
  observedAt: number;
  unit: "token";
  textInputUsd: string;
  textOutputUsd: string;
  imageOutputUsd: string;
  // USD per supplied input image (OpenRouter's `image` price); absent when the catalog lists none.
  // The generic quote prefers this explicit price over the verified token-based alternative.
  imageInputUsd?: string;
  /** Unified input-token pricing when the catalog omits a separate per-image price. */
  imageInputTokens?: { usdPerToken: string; perImage: number };
  // Estimates, not enforced output/spend caps. Versioned authorization belongs to T04.
  estimatedTextInputTokens: number;
  estimatedTextOutputTokens: number;
}

export function imageCapabilities(modelId: string) {
  const tokens = OUTPUT_TOKENS[modelId.toLowerCase()];
  return tokens ? {
    resolutions: Object.keys(tokens) as ImageResolution[],
    aspectRatios: ["16:9", "21:9", "3:2"] as ImageAspectRatio[],
    outputTokens: tokens,
    source: IMAGE_CAPABILITY_SOURCE,
    pricingSource: IMAGE_PRICING_SOURCE,
  } : null;
}

export function catalogImageQuote(modelId: string, billing: ImageBilling | undefined, resolution: ImageResolution) {
  const tokens = imageCapabilities(modelId)?.outputTokens[resolution];
  if (!tokens || !billing || billing.unit !== "token" || billing.version !== IMAGE_BILLING_VERSION) return null;
  return quoteBillableUnits([
    { price: billing.textInputUsd, units: billing.estimatedTextInputTokens },
    { price: billing.textOutputUsd, units: billing.estimatedTextOutputTokens },
    { price: billing.imageOutputUsd, units: tokens },
  ]);
}

export function normalizeImageBilling(modelId: string, raw: Record<string, unknown> | undefined, observedAt: number): ImageBilling | undefined {
  if (!raw || !imageCapabilities(modelId)) return undefined;
  const inputTokens = INPUT_IMAGE_TOKENS[modelId.toLowerCase()];
  const billing: ImageBilling = {
    version: IMAGE_BILLING_VERSION, source: IMAGE_CATALOG_SOURCE, observedAt, unit: "token",
    textInputUsd: typeof raw.prompt === "string" ? raw.prompt : "",
    textOutputUsd: typeof raw.completion === "string" ? raw.completion : "",
    // `image` is input image pricing: unused by the legacy quote, which sends no images, and kept
    // for the generic engine's reference-aware quote.
    imageOutputUsd: typeof raw.image_output === "string" ? raw.image_output : "",
    ...(typeof raw.image === "string" && raw.image !== "" ? { imageInputUsd: raw.image } : {}),
    ...(raw.image === undefined && inputTokens ? { imageInputTokens: { usdPerToken: typeof raw.prompt === "string" ? raw.prompt : "", perImage: inputTokens } } : {}),
    estimatedTextInputTokens: 1000, estimatedTextOutputTokens: 1000,
  };
  return catalogImageQuote(modelId, billing, "1K") ? billing : undefined;
}
