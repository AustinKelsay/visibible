export interface ImageModel {
  id: string;
  name: string;
  provider: string;
  pricing?: {
    imageOutput?: string;
  };
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

    const imageModels: ImageModel[] = (data.data || [])
      .filter(
        (model: OpenRouterModel) =>
          model.architecture?.output_modalities?.includes("image")
      )
      .map((model: OpenRouterModel) => ({
        id: model.id,
        name: model.name || model.id,
        provider: getProviderName(model.id),
        pricing: {
          imageOutput: model.pricing?.image,
        },
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
