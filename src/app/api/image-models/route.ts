import { NextResponse } from "next/server";
import { catalogImageQuote, imageCapabilities } from "@/lib/image-catalog";
import { DEFAULT_ETA_SECONDS, fetchImageModels, unavailableImageModels, type ImageModel } from "@/lib/image-models";
import { getScenePlannerEstimatedCreditsCost } from "@/lib/scene-planner";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

/** Quotes match generation admission; unversioned historical samples cannot override them. */
function quotedSettings(model: ImageModel, plannerCredits: number) {
  if (model.availability === "unavailable") return {};
  return Object.fromEntries((imageCapabilities(model.id)?.resolutions ?? []).flatMap(resolution => {
    const quote = catalogImageQuote(model.id, model.billing, resolution);
    return quote ? [[resolution, quote.credits + plannerCredits]] : [];
  }));
}

export async function GET() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return NextResponse.json({ models: unavailableImageModels("Image generation is not configured"),
      scenePlannerCreditsCost: 0, creditRange: null, error: "Image generation is not configured" },
      { headers: { "Cache-Control": "private, no-store" } });
  }
  const [result, scenePlannerCreditsCost] = await Promise.all([
    fetchImageModels(key), getScenePlannerEstimatedCreditsCost(key),
  ]);
  const etas = new Map<string, number>();
  const convex = getConvexClient();
  if (convex) {
    try {
      for (const stats of await convex.query(api.modelStats.getAllModelStats, {})) {
        etas.set(stats.modelId, stats.etaSeconds);
      }
    } catch (error) { console.error("Failed to fetch image ETAs:", error); }
  }
  const models = result.models.map(model => ({ ...model,
    etaSeconds: etas.get(model.id) ?? model.etaSeconds ?? DEFAULT_ETA_SECONDS,
    estimatedCreditsByResolution: quotedSettings(model, scenePlannerCreditsCost),
  }));
  const costs = models.flatMap(model => Object.values(model.estimatedCreditsByResolution));
  return NextResponse.json({ models, scenePlannerCreditsCost,
    creditRange: costs.length ? { min: Math.min(...costs), max: Math.max(...costs) } : null,
    ...(result.error ? { error: result.error } : {}),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
