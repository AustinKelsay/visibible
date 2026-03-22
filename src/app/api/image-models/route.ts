import { NextResponse } from "next/server";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_ETA_SECONDS,
  DEFAULT_CREDITS_COST,
  EMERGENCY_IMAGE_MODEL_PRICING_USD,
  RESOLUTIONS,
  computeAdjustedCreditsCost,
  computeCreditsCost,
  fetchImageModels,
  normalizeResolutionForModel,
  resolveLearnedImageCreditsEstimate,
  type ImageModel,
  type ImageResolution,
  type LearnedImageCostEstimate,
} from "@/lib/image-models";
import { getScenePlannerEstimatedCreditsCost } from "@/lib/scene-planner";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

function normalizeLearnedEstimates(
  estimates: Array<{
    scopeType: string;
    scopeValue: string;
    resolution: string;
    estimateCredits: number;
    sampleCount: number;
  }>
): LearnedImageCostEstimate[] {
  return estimates.filter(
    (estimate): estimate is LearnedImageCostEstimate =>
      (estimate.scopeType === "model" ||
        estimate.scopeType === "provider" ||
        estimate.scopeType === "global") &&
      typeof estimate.scopeValue === "string" &&
      typeof estimate.resolution === "string" &&
      typeof estimate.estimateCredits === "number" &&
      typeof estimate.sampleCount === "number"
  );
}

function buildEstimatedCreditsByResolution(
  model: ImageModel,
  scenePlannerCreditsCost: number,
  learnedEstimates: LearnedImageCostEstimate[]
): Partial<Record<ImageResolution, number>> {
  return Object.fromEntries(
    (Object.keys(RESOLUTIONS) as ImageResolution[]).map((resolution) => {
      const learnedResolution = normalizeResolutionForModel(model.id, resolution);
      const fallbackCredits = computeAdjustedCreditsCost(
        model.creditsCost ?? DEFAULT_CREDITS_COST,
        resolution,
        model.id
      );
      const learnedEstimate = resolveLearnedImageCreditsEstimate({
        modelId: model.id,
        resolution: learnedResolution,
        fallbackCredits,
        estimates: learnedEstimates,
      });

      return [resolution, learnedEstimate.credits + scenePlannerCreditsCost];
    })
  ) as Partial<Record<ImageResolution, number>>;
}

export async function GET() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const emergencyDefaultPricing = EMERGENCY_IMAGE_MODEL_PRICING_USD[DEFAULT_IMAGE_MODEL];
  const scenePlannerCreditsCost = await getScenePlannerEstimatedCreditsCost(
    openRouterApiKey
  );

  if (!openRouterApiKey) {
    // Return fallback with just the default model
    return NextResponse.json({
      models: [
        {
          id: DEFAULT_IMAGE_MODEL,
          name: "Gemini 2.5 Flash (Default)",
          provider: "Google",
          pricing: { imageOutput: emergencyDefaultPricing },
          creditsCost:
            computeCreditsCost(emergencyDefaultPricing) ??
            DEFAULT_CREDITS_COST,
          usesEmergencyPricing: true,
          etaSeconds: DEFAULT_ETA_SECONDS,
          estimatedCreditsByResolution: buildEstimatedCreditsByResolution(
            {
              id: DEFAULT_IMAGE_MODEL,
              name: "Gemini 2.5 Flash (Default)",
              provider: "Google",
              creditsCost:
                computeCreditsCost(emergencyDefaultPricing) ??
                DEFAULT_CREDITS_COST,
            },
            scenePlannerCreditsCost,
            []
          ),
        },
      ],
      scenePlannerCreditsCost,
      creditRange: {
        min: DEFAULT_CREDITS_COST + scenePlannerCreditsCost,
        max: DEFAULT_CREDITS_COST + scenePlannerCreditsCost,
      },
      error: "OpenRouter API key not configured",
    });
  }

  const result = await fetchImageModels(openRouterApiKey);

  // Try to fetch model stats from Convex to get real ETAs
  const modelStatsMap: Map<string, number> = new Map();
  let learnedEstimates: LearnedImageCostEstimate[] = [];
  const convex = getConvexClient();

  if (convex) {
    try {
      const serverSecret = getConvexServerSecret();
      const [allStats, allCostEstimates] = await Promise.all([
        convex.query(api.modelStats.getAllModelStats, {}),
        convex.query(api.modelCostStats.getAllEstimates, {
          serverSecret,
        }),
      ]);

      for (const stats of allStats) {
        modelStatsMap.set(stats.modelId, stats.etaSeconds);
      }
      learnedEstimates = normalizeLearnedEstimates(allCostEstimates);
    } catch (e) {
      console.error("Failed to fetch image model metadata:", e);
    }
  }

  // Merge ETA from modelStats if available
  const modelsWithStats: ImageModel[] = result.models.map((model) => ({
    ...model,
    etaSeconds: modelStatsMap.get(model.id) ?? model.etaSeconds ?? DEFAULT_ETA_SECONDS,
    estimatedCreditsByResolution: buildEstimatedCreditsByResolution(
      model,
      scenePlannerCreditsCost,
      learnedEstimates
    ),
  }));

  // Compute credit cost range from learned display estimates when available.
  const creditCosts = modelsWithStats
    .flatMap((model) => {
      const estimates = model.estimatedCreditsByResolution
        ? Object.values(model.estimatedCreditsByResolution)
        : [];

      if (estimates.length > 0) {
        return estimates;
      }

      return model.creditsCost != null
        ? [model.creditsCost + scenePlannerCreditsCost]
        : [];
    })
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
    scenePlannerCreditsCost,
    ...(result.error ? { error: result.error } : {}),
  }, {
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
