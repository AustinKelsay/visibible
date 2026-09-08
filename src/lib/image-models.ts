import { catalogImageQuote, imageCapabilities, normalizeImageBilling, type ImageBilling } from "./image-catalog";
export { catalogImageQuote, imageCapabilities } from "./image-catalog";

export interface ImageModel {
  id: string;
  name: string;
  provider: string;
  billing?: ImageBilling;
  capabilities?: ReturnType<typeof imageCapabilities>;
  availability?: "available" | "stale" | "unavailable";
  unavailableReason?: string;
  pricing?: {
    imageOutput?: string;
  };
  creditsCost?: number | null; // null = unpriced, number = estimated credits charged
  reservationCreditsCost?: number | null; // conservative reservation hold for low-variance billing
  estimatedCreditsByResolution?: Partial<Record<ImageResolution, number>>;
  usesEmergencyPricing?: boolean; // true when model pricing came from local outage fallback
  etaSeconds?: number; // estimated generation time
}

export type ImageCostEstimateScope = "model" | "provider" | "global" | "fallback";

export interface LearnedImageCostEstimate {
  scopeType: "model" | "provider" | "global";
  scopeValue: string;
  resolution: string;
  estimateCredits: number;
  sampleCount: number;
}

// Credit pricing constants
export const CREDIT_USD = 0.01; // 1 credit = $0.01
export const PREMIUM_MULTIPLIER = 1.25; // 25% premium over OpenRouter price
export const DEFAULT_ETA_SECONDS = 12; // default for unknown models
export const DEFAULT_CREDITS_COST = 20; // default credit cost for unpriced models (~$0.20)
export const IMAGE_GENERATION_SPEND_DOWN_GRACE_CREDITS = 5;
const MODEL_CACHE_MAX_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

// Legacy hold policy retained until T04 introduces accepted maximum charges.
export const CONSERVATIVE_ESTIMATE_MULTIPLIER = 35;

/**
 * Legacy flat-USD conversion. Never pass a raw catalog image/token rate here.
 * Returns null if pricing is missing or invalid (unpriced model).
 */
export function computeCreditsCost(pricingImage: string | undefined): number | null {
  if (!pricingImage) return null;

  const baseUsd = parseFloat(pricingImage);
  if (isNaN(baseUsd) || baseUsd <= 0) return null;

  const effectiveUsd = baseUsd * PREMIUM_MULTIPLIER;
  return Math.max(1, Math.ceil(effectiveUsd / CREDIT_USD));
}

/** Legacy flat-USD hold helper; current catalog quotes use explicit output units. */
export function computeConservativeEstimate(pricingImage: string | undefined): number | null {
  const baseCost = computeCreditsCost(pricingImage);
  if (baseCost === null) return null;
  return Math.ceil(baseCost * CONSERVATIVE_ESTIMATE_MULTIPLIER);
}

/**
 * Compute credits from actual OpenRouter usage cost.
 * Used post-generation to calculate the real charge based on actual API cost.
 *
 * @param actualUsageUsd - The actual USD cost from OpenRouter response
 * @param fallbackCredits - Credits to use if actual usage is unavailable
 * @returns Object with credits to charge and whether actual usage was used
 */
export function computeCreditsFromActualUsage(
  actualUsageUsd: number | null,
  fallbackCredits: number
): { credits: number; usedActual: boolean } {
  if (actualUsageUsd !== null && actualUsageUsd > 0) {
    const withPremium = actualUsageUsd * PREMIUM_MULTIPLIER;
    return {
      credits: Math.max(1, Math.ceil(withPremium / CREDIT_USD)),
      usedActual: true,
    };
  }
  // Fallback: use provided estimate (ensures we don't undercharge)
  return { credits: fallbackCredits, usedActual: false };
}

export const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";
export const EMERGENCY_IMAGE_MODEL_PRICING_USD: Record<string, string> = {
  // Legacy placeholder retained for incomplete display state, never catalog admission.
  [DEFAULT_IMAGE_MODEL]: "0.10",
};
export const DEFAULT_IMAGE_ESTIMATED_CREDITS_COST =
  computeCreditsCost(EMERGENCY_IMAGE_MODEL_PRICING_USD[DEFAULT_IMAGE_MODEL]) ?? 13;

// Image aspect ratio types and configuration
export type ImageAspectRatio = "16:9" | "21:9" | "3:2";

export const ASPECT_RATIOS: Record<ImageAspectRatio, { label: string; cssRatio: string }> = {
  "16:9": { label: "Widescreen (16:9)", cssRatio: "16/9" },
  "21:9": { label: "Ultra-wide (21:9)", cssRatio: "21/9" },
  "3:2": { label: "Classic (3:2)", cssRatio: "3/2" },
};

export const DEFAULT_ASPECT_RATIO: ImageAspectRatio = "16:9";

// Image resolution types and configuration
export type ImageResolution = "1K" | "2K" | "4K";

export const RESOLUTIONS: Record<ImageResolution, { label: string }> = {
  "1K": { label: "1K Standard" },
  "2K": { label: "2K High" },
  "4K": { label: "4K Ultra" },
};

export const DEFAULT_RESOLUTION: ImageResolution = "1K";

/** The registry is shared by request construction, validation and settings UI. */
export function supportsResolution(modelId: string): boolean {
  return (imageCapabilities(modelId)?.resolutions.length ?? 0) > 1;
}

export function normalizeResolutionForModel(
  modelId: string,
  resolution: ImageResolution
): ImageResolution {
  return supportsResolution(modelId) ? resolution : DEFAULT_RESOLUTION;
}

/**
 * Check if a value is a valid ImageAspectRatio
 */
export function isValidAspectRatio(value: string): value is ImageAspectRatio {
  return Object.hasOwn(ASPECT_RATIOS, value);
}

/**
 * Check if a value is a valid ImageResolution
 */
export function isValidResolution(value: string): value is ImageResolution {
  return Object.hasOwn(RESOLUTIONS, value);
}

/**
 * Compute credit cost with resolution multiplier applied.
 *
 * The resolution multiplier is only applied if the model supports resolution
 * settings. This prevents users from being charged extra for resolution
 * options that the model ignores.
 *
 * @param baseCost - Base credit cost from model pricing
 * @param resolution - User-selected resolution
 * @param modelId - Model ID to check resolution support (optional)
 * @returns Adjusted credit cost (with multiplier if supported, base cost otherwise)
 */
export function computeAdjustedCreditsCost(
  baseCost: number | null | undefined,
  resolution: ImageResolution,
  modelId?: string
): number {
  const base = baseCost ?? DEFAULT_CREDITS_COST;

  // Compatibility helper for callers with only a base estimate. Catalog-backed
  // callers use the exact resolution quote instead of multiplying rounded credits.
  const tokens = modelId ? imageCapabilities(modelId)?.outputTokens : undefined;
  return Math.ceil(base * ((tokens?.[resolution] ?? tokens?.["1K"] ?? 1) / (tokens?.["1K"] ?? 1)));
}

export function computeEstimatedImageGenerationCreditsCost(
  baseCost: number | null | undefined,
  resolution: ImageResolution,
  modelId?: string,
  scenePlannerCreditsCost: number = 0
): number {
  return (
    computeAdjustedCreditsCost(baseCost, resolution, modelId) +
    Math.max(0, scenePlannerCreditsCost)
  );
}

export function getEstimatedCreditsCostForResolution(
  model: Pick<
    ImageModel,
    "id" | "billing" | "availability" | "creditsCost" | "reservationCreditsCost" | "estimatedCreditsByResolution"
  >,
  resolution: ImageResolution,
  scenePlannerCreditsCost: number = 0
): number | null {
  if (model.availability === "unavailable") return null;
  const normalized = normalizeResolutionForModel(model.id, resolution);
  const learnedEstimate = model.estimatedCreditsByResolution?.[normalized];
  if (typeof learnedEstimate === "number" && learnedEstimate > 0) {
    return Math.max(1, Math.round(learnedEstimate));
  }

  if (model.billing) {
    const quote = catalogImageQuote(model.id, model.billing, normalized);
    return quote ? quote.credits + scenePlannerCreditsCost : null;
  }
  const displayBaseCost = getDisplayedCreditsCost(model);
  if (displayBaseCost === null) {
    return null;
  }

  return computeEstimatedImageGenerationCreditsCost(
    displayBaseCost,
    resolution,
    model.id,
    scenePlannerCreditsCost
  );
}

export function resolveLearnedImageCreditsEstimate({
  modelId,
  resolution,
  fallbackCredits,
  estimates,
}: {
  modelId: string;
  resolution: ImageResolution;
  fallbackCredits: number;
  estimates: LearnedImageCostEstimate[];
}): { credits: number; source: ImageCostEstimateScope; sampleCount: number } {
  const provider = modelId.split("/")[0]?.toLowerCase() || "unknown";
  const exact =
    estimates.find(
      (estimate) =>
        estimate.scopeType === "model" &&
        estimate.scopeValue === modelId &&
        estimate.resolution === resolution
    ) ??
    estimates.find(
      (estimate) =>
        estimate.scopeType === "provider" &&
        estimate.scopeValue === provider &&
        estimate.resolution === resolution
    ) ??
    estimates.find(
      (estimate) =>
        estimate.scopeType === "global" &&
        estimate.scopeValue === "global" &&
        estimate.resolution === resolution
    ) ??
    null;

  if (!exact) {
    return {
      credits: Math.max(1, Math.round(fallbackCredits)),
      source: "fallback",
      sampleCount: 0,
    };
  }

  return {
    credits: Math.max(1, Math.round(exact.estimateCredits)),
    source: exact.scopeType,
    sampleCount: exact.sampleCount,
  };
}

/**
 * Cost shown to users in selectors and generate CTAs.
 *
 * This should reflect the estimated charge, not the conservative reservation hold.
 * The higher reservation amount is only for backend settlement safety and is
 * refunded down to the actual charge after generation completes.
 */
export function getDisplayedCreditsCost(
  model: Pick<ImageModel, "creditsCost" | "reservationCreditsCost">
): number | null {
  return model.creditsCost ?? model.reservationCreditsCost ?? null;
}

export function canAffordImageGeneration(
  credits: number,
  estimatedCreditsCost: number
): boolean {
  if (credits >= estimatedCreditsCost) return true;
  if (credits <= 0) return false;
  return credits + IMAGE_GENERATION_SPEND_DOWN_GRACE_CREDITS >= estimatedCreditsCost;
}

interface OpenRouterModel {
  id: string;
  name: string;
  architecture?: {
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    image_output?: string;
    image?: string;
  };
}

export interface ImageModelsResult {
  models: ImageModel[];
  error?: string;
}

let lastKnownGoodImageModels: ImageModel[] | null = null;
let lastKnownGoodImageModelsAt = 0;

function cloneImageModels(models: ImageModel[]): ImageModel[] {
  return structuredClone(models);
}

export function unavailableImageModels(reason: string): ImageModel[] {
  return [{ id: DEFAULT_IMAGE_MODEL, name: "Gemini 2.5 Flash", provider: "Google",
    availability: "unavailable", unavailableReason: reason, creditsCost: null, reservationCreditsCost: null }];
}

function getStaleCachedModels(nowMs = Date.now()): ImageModel[] | null {
  if (!lastKnownGoodImageModels) {
    return null;
  }
  const ageMs = nowMs - lastKnownGoodImageModelsAt;
  if (ageMs > MODEL_CACHE_MAX_STALE_MS) {
    return null;
  }
  return cloneImageModels(lastKnownGoodImageModels).map(model => ({ ...model, availability: model.availability === "unavailable" ? "unavailable" : "stale" }));
}

export async function fetchImageModels(openRouterApiKey: string): Promise<ImageModelsResult> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_REFERRER || process.env.NEXT_PUBLIC_APP_URL || "https://visibible.com",
        "X-Title": process.env.OPENROUTER_TITLE || "visibible",
      },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error("OpenRouter models API error:", response.status);
      const staleModels = getStaleCachedModels();
      if (staleModels) {
        return {
          models: staleModels,
          error: "Using cached image models after OpenRouter models API failure",
        };
      }
      return {
        models: unavailableImageModels("Catalog unavailable; pricing cannot be verified"),
        error: "Failed to fetch models from OpenRouter",
      };
    }

    const data = await response.json();
    if (!Array.isArray(data.data)) throw new Error("Invalid image catalog");

    // First, get all image-capable models
    const allImageModels: OpenRouterModel[] = (data.data || []).filter(
      (model: OpenRouterModel) =>
        model && typeof model.id === "string" && Array.isArray(model.architecture?.output_modalities) && model.architecture.output_modalities.includes("image")
    );

    // Build set of stable model IDs (non-preview)
    const stableModelIds = new Set(
      allImageModels
        .filter((m) => !m.id.toLowerCase().includes("-preview"))
        .map((m) => m.id)
    );

    // Filter out preview models only if a stable version exists
    const imageModels: ImageModel[] = allImageModels
      .filter((model: OpenRouterModel) => {
        const isPreview = model.id.toLowerCase().includes("-preview");
        if (!isPreview) return true;

        // Keep preview if no stable version exists
        const stableId = model.id.replace(/-preview$/i, "");
        return !stableModelIds.has(stableId);
      })
      .map((model: OpenRouterModel): ImageModel => {
        const billing = normalizeImageBilling(model.id, model.pricing, Date.now());
        const quote = catalogImageQuote(model.id, billing, "1K");
        return {
          id: model.id, name: typeof model.name === "string" ? model.name : model.id, provider: getProviderName(model.id), billing, capabilities: imageCapabilities(model.id),
          availability: quote ? "available" : "unavailable",
          unavailableReason: quote ? undefined : imageCapabilities(model.id)
            ? "Output pricing unavailable" : "Pricing and settings not verified",
          creditsCost: quote?.credits ?? null,
          reservationCreditsCost: quote ? quote.credits * CONSERVATIVE_ESTIMATE_MULTIPLIER : null,
          etaSeconds: DEFAULT_ETA_SECONDS,
        };
      })
      .sort((a: ImageModel, b: ImageModel) => {
        const providerCompare = a.provider.localeCompare(b.provider);
        if (providerCompare !== 0) return providerCompare;
        return a.name.localeCompare(b.name);
      });

    lastKnownGoodImageModels = cloneImageModels(imageModels);
    lastKnownGoodImageModelsAt = Date.now();
    return { models: imageModels };
  } catch (error) {
    console.error("Error fetching image models:", error);
    const staleModels = getStaleCachedModels();
    if (staleModels) {
      return {
        models: staleModels,
        error: "Using cached image models after OpenRouter models API network error",
      };
    }
    return {
      models: unavailableImageModels("Catalog unavailable; pricing cannot be verified"),
      error: "Network error fetching models",
    };
  }
}

// Extract provider name from model ID (e.g., "google/gemini-2.5-flash" -> "Google")
export function getProviderName(modelId: string): string {
  const provider = modelId.split("/")[0];
  // Capitalize first letter
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

