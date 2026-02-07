export interface ChatModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  isFree: boolean;
}

// Credit pricing constants (shared with image-models.ts)
export const CREDIT_USD = 0.01; // 1 credit = $0.01
export const PREMIUM_MULTIPLIER = 1.25; // 25% premium over OpenRouter price
export const DEFAULT_ESTIMATED_TOKENS = 2000; // Conservative estimate for chat (1000 prompt + 1000 completion)
export const MIN_CHAT_CREDITS = 1; // Minimum credits to charge per chat

// Scene planner uses smaller context: ~200 prompt tokens + 220 max completion + overhead
export const SCENE_PLANNER_ESTIMATED_TOKENS = 450;

/**
 * Determine if a model is free based on:
 * 1. Model ID ends with ":free" suffix
 * 2. Both prompt and completion pricing are "0"
 */
export function isModelFree(model: {
  id: string;
  pricing?: { prompt?: string; completion?: string };
}): boolean {
  // Check for :free suffix in model ID
  if (model.id.endsWith(":free")) {
    return true;
  }

  // Check if both prices are "0" (string zero from OpenRouter)
  const promptPrice = model.pricing?.prompt;
  const completionPrice = model.pricing?.completion;

  if (promptPrice && completionPrice) {
    return promptPrice === "0" && completionPrice === "0";
  }

  return false;
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
      isFree: false, // gpt-oss-120b is a paid model on OpenRouter
    },
  ];
}

export async function fetchChatModels(openRouterApiKey: string): Promise<ChatModelsResult> {
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
        isFree: isModelFree({
          id: model.id,
          pricing: model.pricing,
        }),
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

/**
 * Compute the credit cost for a chat message based on OpenRouter pricing.
 * Uses estimated token count since we don't know actual usage until after streaming.
 *
 * @param pricing - Model pricing from OpenRouter (prompt and completion per million tokens)
 * @param estimatedTokens - Estimated total tokens (prompt + completion), defaults to 2000
 * @returns Credits required, or null if model has no valid pricing
 */
export function computeChatCreditsCost(
  pricing: { prompt?: string; completion?: string } | undefined,
  estimatedTokens: number = DEFAULT_ESTIMATED_TOKENS
): number | null {
  if (!pricing?.prompt || !pricing?.completion) return null;

  const promptRate = parseFloat(pricing.prompt);
  const completionRate = parseFloat(pricing.completion);

  if (isNaN(promptRate) || isNaN(completionRate)) return null;

  // Free models (both rates are 0) cost minimum credits
  if (promptRate === 0 && completionRate === 0) {
    return MIN_CHAT_CREDITS;
  }

  // Estimate cost: assume half prompt, half completion tokens
  const promptTokens = Math.floor(estimatedTokens / 2);
  const completionTokens = estimatedTokens - promptTokens;

  const perMillion = 1_000_000;
  const promptCost = (promptRate * promptTokens) / perMillion;
  const completionCost = (completionRate * completionTokens) / perMillion;
  const totalUsd = promptCost + completionCost;

  // Apply premium multiplier and convert to credits
  const effectiveUsd = totalUsd * PREMIUM_MULTIPLIER;
  return Math.max(MIN_CHAT_CREDITS, Math.ceil(effectiveUsd / CREDIT_USD));
}

/**
 * Calculate the actual credit cost after streaming completes based on real token usage.
 * Used for logging/comparison with estimated cost.
 *
 * @param pricing - Model pricing from OpenRouter
 * @param promptTokens - Actual prompt tokens used
 * @param completionTokens - Actual completion tokens used
 * @returns Actual credits that would be charged
 */
export function computeActualChatCreditsCost(
  pricing: { prompt?: string; completion?: string } | undefined,
  promptTokens: number,
  completionTokens: number
): number | null {
  if (!pricing?.prompt || !pricing?.completion) return null;

  const promptRate = parseFloat(pricing.prompt);
  const completionRate = parseFloat(pricing.completion);

  if (isNaN(promptRate) || isNaN(completionRate)) return null;

  // Free models cost minimum
  if (promptRate === 0 && completionRate === 0) {
    return MIN_CHAT_CREDITS;
  }

  const perMillion = 1_000_000;
  const promptCost = (promptRate * promptTokens) / perMillion;
  const completionCost = (completionRate * completionTokens) / perMillion;
  const totalUsd = promptCost + completionCost;

  const effectiveUsd = totalUsd * PREMIUM_MULTIPLIER;
  return Math.max(MIN_CHAT_CREDITS, Math.ceil(effectiveUsd / CREDIT_USD));
}

/**
 * Look up pricing for a specific chat model.
 * First checks cached models, then fetches if needed.
 *
 * @param modelId - The model ID to look up (e.g., "anthropic/claude-3-haiku")
 * @param apiKey - OpenRouter API key
 * @returns Model pricing or null if model not found or has no pricing
 */
export async function getChatModelPricing(
  modelId: string,
  apiKey: string
): Promise<{ prompt: string; completion: string } | null> {
  const result = await fetchChatModels(apiKey);

  const model = result.models.find((m) => m.id === modelId);
  if (!model) return null;

  // Model must have valid pricing
  if (!model.pricing?.prompt || !model.pricing?.completion) return null;

  return {
    prompt: model.pricing.prompt,
    completion: model.pricing.completion,
  };
}
