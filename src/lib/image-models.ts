export interface ImageModel {
  id: string;
  name: string;
  provider: string;
  pricing?: {
    imageOutput?: string;
  };
  creditsCost?: number | null; // null = unpriced, number = estimated credits charged
  reservationCreditsCost?: number | null; // conservative reservation hold for low-variance billing
  usesEmergencyPricing?: boolean; // true when model pricing came from local outage fallback
  etaSeconds?: number; // estimated generation time
}

// Credit pricing constants
export const CREDIT_USD = 0.01; // 1 credit = $0.01
export const PREMIUM_MULTIPLIER = 1.25; // 25% premium over OpenRouter price
export const DEFAULT_ETA_SECONDS = 12; // default for unknown models
export const DEFAULT_CREDITS_COST = 20; // default credit cost for unpriced models (~$0.20)
export const IMAGE_GENERATION_SPEND_DOWN_GRACE_CREDITS = 5;
const MODEL_CACHE_MAX_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

// Conservative estimate multiplier to account for OpenRouter API vs actual billing discrepancy.
// The models API `pricing.image` field significantly underreports costs for multimodal models
// like Gemini (~31x actual cost observed). We use 35x to ensure reservations cover actual cost.
export const CONSERVATIVE_ESTIMATE_MULTIPLIER = 35;

/**
 * Compute the credit cost for a model based on OpenRouter pricing.
 * Returns null if pricing is missing or invalid (unpriced model).
 */
export function computeCreditsCost(pricingImage: string | undefined): number | null {
  if (!pricingImage) return null;

  const baseUsd = parseFloat(pricingImage);
  if (isNaN(baseUsd) || baseUsd <= 0) return null;

  const effectiveUsd = baseUsd * PREMIUM_MULTIPLIER;
  return Math.max(1, Math.ceil(effectiveUsd / CREDIT_USD));
}

/**
 * Compute a conservative credit estimate for reservation purposes.
 * This accounts for the known discrepancy between OpenRouter's API pricing
 * and actual billing for multimodal image models.
 *
 * @param pricingImage - The pricing.image value from OpenRouter models API
 * @returns Conservative credit estimate for upfront reservation, or null if unpriced
 */
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
  // Conservative per-image USD baseline used only if the OpenRouter catalog is unavailable.
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

export const RESOLUTIONS: Record<ImageResolution, { label: string; multiplier: number }> = {
  "1K": { label: "1K Standard", multiplier: 1.0 },
  "2K": { label: "2K High", multiplier: 3.5 },
  "4K": { label: "4K Ultra", multiplier: 6.5 },
};

export const DEFAULT_RESOLUTION: ImageResolution = "1K";

/**
 * Model prefixes that support user-configurable resolution settings.
 *
 * Currently only Gemini models support the `image_size` parameter (1K, 2K, 4K).
 * This list should be expanded as more providers add resolution support.
 *
 * IMPORTANT: Only add model prefixes here when the provider's API actually
 * respects the resolution setting. Users are charged based on this - if a
 * model is listed here but ignores resolution, users pay extra for nothing.
 */
const RESOLUTION_SUPPORTED_MODEL_PREFIXES = [
  "google/gemini",  // Gemini models support image_size parameter
];

/**
 * Check if a model supports user-configurable resolution settings.
 *
 * This determines:
 * 1. Whether the resolution multiplier is applied to credit costs
 * 2. Whether the image_size parameter is sent to the API
 *
 * @param modelId - The full model ID (e.g., "google/gemini-2.5-flash-image")
 * @returns true if the model supports resolution configuration
 */
export function supportsResolution(modelId: string): boolean {
  return RESOLUTION_SUPPORTED_MODEL_PREFIXES.some(prefix =>
    modelId.toLowerCase().startsWith(prefix.toLowerCase())
  );
}

/**
 * Check if a value is a valid ImageAspectRatio
 */
export function isValidAspectRatio(value: string): value is ImageAspectRatio {
  return value in ASPECT_RATIOS;
}

/**
 * Check if a value is a valid ImageResolution
 */
export function isValidResolution(value: string): value is ImageResolution {
  return value in RESOLUTIONS;
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

  // Only apply resolution multiplier if model supports it
  // If no modelId provided, assume no support (conservative/safe for users)
  const modelSupportsResolution = modelId ? supportsResolution(modelId) : false;
  const multiplier = modelSupportsResolution ? RESOLUTIONS[resolution].multiplier : 1.0;

  return Math.ceil(base * multiplier);
}

export function getDisplayedCreditsCost(model: Pick<ImageModel, "creditsCost" | "reservationCreditsCost">): number | null {
  return model.reservationCreditsCost ?? model.creditsCost ?? null;
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
  return models.map((model) => ({
    ...model,
    pricing: model.pricing
      ? {
          imageOutput: model.pricing.imageOutput,
        }
      : undefined,
    reservationCreditsCost: model.reservationCreditsCost,
    usesEmergencyPricing: model.usesEmergencyPricing,
  }));
}

function getDefaultImageModels(): ImageModel[] {
  const emergencyPricing = EMERGENCY_IMAGE_MODEL_PRICING_USD[DEFAULT_IMAGE_MODEL];
  return [
    {
      id: DEFAULT_IMAGE_MODEL,
      name: "Gemini 2.5 Flash (Default)",
      provider: "Google",
      pricing: {
        imageOutput: emergencyPricing,
      },
      creditsCost:
        computeCreditsCost(emergencyPricing) ?? DEFAULT_CREDITS_COST,
      reservationCreditsCost:
        computeCreditsCost(emergencyPricing) ?? DEFAULT_CREDITS_COST,
      usesEmergencyPricing: true,
      etaSeconds: DEFAULT_ETA_SECONDS,
    },
  ];
}

function applyEmergencyPricing(models: ImageModel[]): ImageModel[] {
  return models.map((model) => {
    const emergencyPricing = EMERGENCY_IMAGE_MODEL_PRICING_USD[model.id];
    const rawCatalogImageOutput = model.pricing?.imageOutput;
    const parsedCatalogImageOutput =
      rawCatalogImageOutput === undefined ? NaN : Number(rawCatalogImageOutput);
    const hasCatalogPricing =
      Number.isFinite(parsedCatalogImageOutput) && parsedCatalogImageOutput > 0;
    const imageOutput = hasCatalogPricing
      ? String(parsedCatalogImageOutput)
      : emergencyPricing;
    const usesEmergencyPricing = !hasCatalogPricing && !!emergencyPricing;
    return {
      ...model,
      pricing: imageOutput ? { imageOutput } : undefined,
      creditsCost: model.creditsCost ?? computeCreditsCost(imageOutput),
      reservationCreditsCost:
        model.reservationCreditsCost ??
        (usesEmergencyPricing
          ? computeCreditsCost(imageOutput)
          : computeConservativeEstimate(imageOutput)),
      usesEmergencyPricing,
      etaSeconds: model.etaSeconds ?? DEFAULT_ETA_SECONDS,
    };
  });
}

function getStaleCachedModels(nowMs = Date.now()): ImageModel[] | null {
  if (!lastKnownGoodImageModels) {
    return null;
  }
  const ageMs = nowMs - lastKnownGoodImageModelsAt;
  if (ageMs > MODEL_CACHE_MAX_STALE_MS) {
    return null;
  }
  return cloneImageModels(lastKnownGoodImageModels);
}

export async function fetchImageModels(openRouterApiKey: string): Promise<ImageModelsResult> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_REFERRER || process.env.NEXT_PUBLIC_APP_URL || "https://visibible.com",
        "X-Title": process.env.OPENROUTER_TITLE || "visibible",
      },
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
        models: getDefaultImageModels(),
        error: "Failed to fetch models from OpenRouter",
      };
    }

    const data = await response.json();

    // First, get all image-capable models
    const allImageModels: OpenRouterModel[] = (data.data || []).filter(
      (model: OpenRouterModel) =>
        model.architecture?.output_modalities?.includes("image")
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
      .map((model: OpenRouterModel) => ({
        id: model.id,
        name: model.name || model.id,
        provider: getProviderName(model.id),
        pricing: {
          imageOutput: model.pricing?.image,
        },
        creditsCost: computeCreditsCost(model.pricing?.image),
        reservationCreditsCost: computeConservativeEstimate(model.pricing?.image),
        etaSeconds: DEFAULT_ETA_SECONDS, // Will be overridden by modelStats
      }))
      .sort((a: ImageModel, b: ImageModel) => {
        const providerCompare = a.provider.localeCompare(b.provider);
        if (providerCompare !== 0) return providerCompare;
        return a.name.localeCompare(b.name);
      });

    let normalizedModels = applyEmergencyPricing(imageModels);

    if (!normalizedModels.find((model) => model.id === DEFAULT_IMAGE_MODEL)) {
      normalizedModels = [...getDefaultImageModels(), ...normalizedModels];
    }

    lastKnownGoodImageModels = cloneImageModels(normalizedModels);
    lastKnownGoodImageModelsAt = Date.now();

    return { models: normalizedModels };
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
      models: getDefaultImageModels(),
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

// Get a short display name from the full model name
export function getShortModelName(model: ImageModel): string {
  // Remove provider prefix and common suffixes for compact display
  const name = model.name || model.id.split("/")[1] || model.id;
  // Truncate if too long
  return name.length > 20 ? name.substring(0, 18) + "…" : name;
}
