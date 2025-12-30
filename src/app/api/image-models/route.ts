import { NextResponse } from "next/server";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_ETA_SECONDS,
  DEFAULT_CREDITS_COST,
  fetchImageModels,
  type ImageModel,
} from "@/lib/image-models";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

interface ModelStats {
  modelId: string;
  etaSeconds: number;
}

export async function GET() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!openRouterApiKey) {
    // Return fallback with just the default model
    return NextResponse.json({
      models: [
        {
          id: DEFAULT_IMAGE_MODEL,
          name: "Gemini 2.5 Flash (Default)",
          provider: "Google",
          creditsCost: null,
          etaSeconds: DEFAULT_ETA_SECONDS,
        },
      ],
      error: "OpenRouter API key not configured",
    });
  }

  const result = await fetchImageModels(openRouterApiKey);

  // Try to fetch model stats from Convex to get real ETAs
  let modelStatsMap: Map<string, number> = new Map();
  const convex = getConvexClient();

  if (convex) {
    try {
      const allStats: ModelStats[] = await convex.query(
        api.modelStats.getAllModelStats,
        {}
      );
      for (const stats of allStats) {
        modelStatsMap.set(stats.modelId, stats.etaSeconds);
      }
    } catch (e) {
      console.error("Failed to fetch model stats:", e);
    }
  }

  // Merge ETA from modelStats if available
  const modelsWithStats: ImageModel[] = result.models.map((model) => ({
    ...model,
    etaSeconds: modelStatsMap.get(model.id) ?? model.etaSeconds ?? DEFAULT_ETA_SECONDS,
  }));

  // Compute credit cost range from models that have pricing
  const creditCosts = modelsWithStats
    .map((m) => m.creditsCost)
    .filter((cost): cost is number => cost !== null && cost !== undefined);

  // Fallback to default cost if no pricing is available to match the generation endpoint behavior
  // This ensures the UI accurately reflects the actual cost that will be charged
  const creditRange = creditCosts.length > 0
    ? {
        min: Math.min(...creditCosts),
        max: Math.max(...creditCosts),
      }
    : { min: DEFAULT_CREDITS_COST, max: DEFAULT_CREDITS_COST };

  return NextResponse.json({
    models: modelsWithStats,
    creditRange,
    ...(result.error ? { error: result.error } : {}),
  });
}
