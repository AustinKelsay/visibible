export interface ImageModel {
  id: string;
  name: string;
  provider: string;
  pricing?: {
    imageOutput?: string;
  };
  creditsCost?: number | null; // null = unpriced, number = credits required
  etaSeconds?: number; // estimated generation time
}

// Credit pricing constants
export const CREDIT_USD = 0.01; // 1 credit = $0.01
export const PREMIUM_MULTIPLIER = 1.25; // 25% premium over OpenRouter price
export const DEFAULT_ETA_SECONDS = 12; // default for unknown models
export const DEFAULT_CREDITS_COST = 20; // default credit cost for unpriced models (~$0.20)

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

export const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";

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

function getDefaultImageModels(): ImageModel[] {
  return [
    {
      id: DEFAULT_IMAGE_MODEL,
      name: "Gemini 2.5 Flash (Default)",
      provider: "Google",
    },
  ];
}

export async function fetchImageModels(openRouterApiKey: string): Promise<ImageModelsResult> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_REFERRER || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_TITLE || "visibible",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error("OpenRouter models API error:", response.status);
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
        etaSeconds: DEFAULT_ETA_SECONDS, // Will be overridden by modelStats
      }))
      .sort((a: ImageModel, b: ImageModel) => {
        const providerCompare = a.provider.localeCompare(b.provider);
        if (providerCompare !== 0) return providerCompare;
        return a.name.localeCompare(b.name);
      });

    if (!imageModels.find((model) => model.id === DEFAULT_IMAGE_MODEL)) {
      imageModels.unshift(...getDefaultImageModels());
    }

    return { models: imageModels };
  } catch (error) {
    console.error("Error fetching image models:", error);
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
