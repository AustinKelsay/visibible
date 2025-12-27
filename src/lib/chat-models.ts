export interface ChatModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

export const DEFAULT_CHAT_MODEL = "openai/gpt-oss-120b";

interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

export interface ChatModelsResult {
  models: ChatModel[];
  error?: string;
}

function getDefaultChatModels(): ChatModel[] {
  return [
    {
      id: DEFAULT_CHAT_MODEL,
      name: "GPT-OSS 120B (Default)",
      provider: "Openai",
      contextLength: 131072,
    },
  ];
}

export async function fetchChatModels(openRouterApiKey: string): Promise<ChatModelsResult> {
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
        models: getDefaultChatModels(),
        error: "Failed to fetch models from OpenRouter",
      };
    }

    const data = await response.json();

    // Filter to text-capable models (input: text, output: text)
    const chatModels: ChatModel[] = (data.data || [])
      .filter((model: OpenRouterModel) => {
        const inputMods = model.architecture?.input_modalities || [];
        const outputMods = model.architecture?.output_modalities || [];
        // Must support text input and text output (chat models)
        return inputMods.includes("text") && outputMods.includes("text");
      })
      .map((model: OpenRouterModel) => ({
        id: model.id,
        name: model.name || model.id,
        provider: getProviderName(model.id),
        contextLength: model.context_length || 4096,
        pricing: {
          prompt: model.pricing?.prompt,
          completion: model.pricing?.completion,
        },
      }))
      .sort((a: ChatModel, b: ChatModel) => {
        const providerCompare = a.provider.localeCompare(b.provider);
        if (providerCompare !== 0) return providerCompare;
        return a.name.localeCompare(b.name);
      });

    // Ensure default model is present
    if (!chatModels.find((model) => model.id === DEFAULT_CHAT_MODEL)) {
      chatModels.unshift(...getDefaultChatModels());
    }

    return { models: chatModels };
  } catch (error) {
    console.error("Error fetching chat models:", error);
    return {
      models: getDefaultChatModels(),
      error: "Network error fetching models",
    };
  }
}

// Extract provider name from model ID (e.g., "anthropic/claude-3-haiku" -> "Anthropic")
export function getProviderName(modelId: string): string {
  const provider = modelId.split("/")[0];
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

// Format context length for display (e.g., 131072 -> "128K")
export function formatContextLength(length: number): string {
  if (length >= 1000000) {
    return `${Math.round(length / 1000000)}M`;
  }
  if (length >= 1000) {
    return `${Math.round(length / 1000)}K`;
  }
  return String(length);
}

// Calculate estimated cost for a message
export function estimateCost(
  promptTokens: number,
  completionTokens: number,
  pricing?: { prompt?: string; completion?: string }
): number | null {
  if (!pricing?.prompt || !pricing?.completion) return null;

  const perMillion = 1_000_000;
  const promptRate = parseFloat(pricing.prompt);
  const completionRate = parseFloat(pricing.completion);

  if (Number.isNaN(promptRate) || Number.isNaN(completionRate)) return null;

  const promptCost = (promptRate * promptTokens) / perMillion;
  const completionCost = (completionRate * completionTokens) / perMillion;

  return promptCost + completionCost;
}

// Format cost for display (e.g., 0.00012 -> "$0.00012")
export function formatCost(cost: number | null): string {
  if (cost === null) return "N/A";
  if (cost < 0.01) {
    return `$${cost.toFixed(6)}`;
  }
  return `$${cost.toFixed(4)}`;
}
