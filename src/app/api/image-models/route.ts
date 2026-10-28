import { NextResponse } from "next/server";
import { catalogImageQuote, imageCapabilities } from "@/lib/image-catalog";
import { DEFAULT_ETA_SECONDS, fetchImageModels, unavailableImageModels, type ImageModel } from "@/lib/image-models";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { decideEngine, genericEngineMode } from "@/lib/engine/admission";
import { hasOwnerEngineAccess } from "@/lib/engine/owner-check";
import { ART_STYLES, type ArtStyleAvailability } from "@/lib/art-styles";
import { api } from "../../../../convex/_generated/api";

/**
 * Which art styles generation would admit right now (#177): the same decision the image route
 * makes at admission, so the reader is told before paying. Owner-only mode counts the session.
 */
async function styleAvailability(request: Request | undefined, convex: ReturnType<typeof getConvexClient>): Promise<ArtStyleAvailability[]> {
  const mode = genericEngineMode();
  let isOwner = false;
  let readiness: Parameters<typeof decideEngine>[0]["readiness"] = null;
  if (mode !== "disabled" && convex) {
    try {
      // Loaded only when a mode needs the session, so the catalog never requires session secrets to answer.
      const session = request ? await (await import("@/lib/session")).validateSessionWithIp(request) : null;
      if (session?.valid && session.sid) {
        const record = await convex.query(api.sessions.getSession, { sid: session.sid, serverSecret: getConvexServerSecret() });
        isOwner = hasOwnerEngineAccess(record);
      }
      const status = await convex.query(api.analysis.getWorkStatus, { workId: "bible-web" });
      readiness = { ready: status.ready, reasons: status.reasons, activeGeneration: status.activeGeneration, briefVersion: status.briefVersion };
    } catch (error) { console.error("Failed to read style availability:", error); }
  }
  return ART_STYLES.map((style) => {
    const decision = decideEngine({ mode, isOwner, styleId: style.id, readiness });
    return { ...style, available: decision.engine !== null, reason: decision.engine === null ? decision.reason : null };
  });
}

/** Quotes match generation admission; unversioned historical samples cannot override them. */
function quotedSettings(model: ImageModel) {
  if (model.availability === "unavailable") return {};
  return Object.fromEntries((imageCapabilities(model.id)?.resolutions ?? []).flatMap(resolution => {
    const quote = catalogImageQuote(model.id, model.billing, resolution);
    return quote ? [[resolution, quote.credits]] : [];
  }));
}

export async function GET(request?: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  const convex = getConvexClient();
  const artStyles = await styleAvailability(request, convex);
  if (!key) {
    return NextResponse.json({ models: unavailableImageModels("Image generation is not configured"), artStyles,
      creditRange: null, error: "Image generation is not configured" },
      { headers: { "Cache-Control": "private, no-store" } });
  }
  const result = await fetchImageModels(key);
  const etas = new Map<string, number>();
  if (convex) {
    try {
      for (const stats of await convex.query(api.modelStats.getAllModelStats, {})) {
        etas.set(stats.modelId, stats.etaSeconds);
      }
    } catch (error) { console.error("Failed to fetch image ETAs:", error); }
  }
  const models = result.models.map(model => ({ ...model,
    etaSeconds: etas.get(model.id) ?? model.etaSeconds ?? DEFAULT_ETA_SECONDS,
    estimatedCreditsByResolution: quotedSettings(model),
  }));
  const costs = models.flatMap(model => Object.values(model.estimatedCreditsByResolution));
  return NextResponse.json({ models, artStyles,
    creditRange: costs.length ? { min: Math.min(...costs), max: Math.max(...costs) } : null,
    ...(result.error ? { error: result.error } : {}),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
