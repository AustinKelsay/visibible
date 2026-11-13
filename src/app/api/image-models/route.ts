import { NextResponse } from "next/server";
import { catalogImageQuote, imageCapabilities } from "@/lib/image-catalog";
import { DEFAULT_ETA_SECONDS, DEFAULT_IMAGE_MODEL, fetchImageModels, unavailableImageModels, type ImageModel } from "@/lib/image-models";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { decideEngine, genericEngineMode } from "@/lib/engine/admission";
import { hasOwnerEngineAccess } from "@/lib/engine/owner-check";
import { ART_STYLES, type ArtStyleAvailability } from "@/lib/art-styles";
import { BIBLE_WORK_ID, findProseWork, isProseOwner, type ProseWork } from "@/lib/works/catalog";
import { api } from "../../../../convex/_generated/api";

/**
 * Which art styles generation would admit right now (#177): the same decision the image route
 * makes at admission, so the reader is told before paying. Owner-only mode counts the session.
 * With a prose work, its readiness decides, styles outside its brief are unavailable, and an
 * owner-only work admits nothing for anyone else.
 */
async function styleAvailability(request: Request | undefined, convex: ReturnType<typeof getConvexClient>, work: ProseWork | null): Promise<ArtStyleAvailability[]> {
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
      const status = await convex.query(api.analysis.getWorkStatus, { workId: work?.id ?? BIBLE_WORK_ID });
      readiness = { ready: status.ready, reasons: status.reasons, activeGeneration: status.activeGeneration, briefVersion: status.briefVersion };
    } catch (error) { console.error("Failed to read style availability:", error); }
  }
  return ART_STYLES.map((style) => {
    if (work && !work.styleIds.includes(style.id)) return { ...style, available: false, reason: `${work.title} is not drawn in this style` };
    const decision = decideEngine({ mode, isOwner, styleId: style.id, readiness });
    return { ...style, available: decision.engine !== null, reason: decision.engine === null ? decision.reason : null };
  });
}

async function viewerIsProseOwner(request: Request | undefined, convex: ReturnType<typeof getConvexClient>): Promise<boolean> {
  if (!request || !convex) return false;
  try {
    const session = await (await import("@/lib/session")).validateSessionWithIp(request);
    if (!session?.valid || !session.sid) return false;
    return isProseOwner(await convex.query(api.sessions.getSession, { sid: session.sid, serverSecret: getConvexServerSecret() }));
  } catch {
    return false;
  }
}

/** Quotes match generation admission; unversioned historical samples cannot override them. */
function quotedSettings(model: ImageModel) {
  if (model.availability === "unavailable") return {};
  return Object.fromEntries((imageCapabilities(model.id)?.resolutions ?? []).flatMap(resolution => {
    const quote = catalogImageQuote(model.id, model.billing, resolution);
    return quote ? [[resolution, quote.credits]] : [];
  }));
}

export async function GET(request: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  const convex = getConvexClient();
  // An unknown work, and one the viewer may not open, are answered as the Bible would be: never an error, and
  // nothing that tells an unopened book from a missing one.
  const workParam = request ? new URL(request.url).searchParams.get("work") : null;
  const listed = workParam && workParam !== BIBLE_WORK_ID ? findProseWork(workParam) : null;
  const work = listed && (listed.visibility === "public" || await viewerIsProseOwner(request, convex)) ? listed : null;
  const artStyles = await styleAvailability(request, convex, work);
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
  // Only the model generation runs on (ADR 0012): the engine ignores any other choice, so offering one would quote a
  // price the reader is not charged.
  // A catalog without it reports it unavailable rather than offering nothing.
  const offered = result.models.filter(model => model.id === DEFAULT_IMAGE_MODEL);
  const models = (offered.length ? offered : unavailableImageModels(result.error ?? "Image model not in catalog")).map(model => ({ ...model,
    etaSeconds: etas.get(model.id) ?? model.etaSeconds ?? DEFAULT_ETA_SECONDS,
    estimatedCreditsByResolution: quotedSettings(model),
  }));
  const costs = models.flatMap(model => Object.values(model.estimatedCreditsByResolution));
  return NextResponse.json({ models, artStyles,
    creditRange: costs.length ? { min: Math.min(...costs), max: Math.max(...costs) } : null,
    ...(result.error ? { error: result.error } : {}),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
