/**
 * Generic image generation through the request path (#175, spec #165 §5, §6, §7, §9). One
 * admitted request: deployed inputs checked against the registered analysis → the moment and
 * its in-section neighbours from the imported reference text → section look and scene plan
 * (lazy, owner-funded) → selected canon stages → current reference blobs, sent inline as JPEGs
 * → the rendering packet, rejected before any paid call when over budget → a prompt-aware quote
 * → the request record with its engine commitments and the exact packet snapshot → guest
 * reservation → one provider call → the finished-image check, with one owner-funded retry of a faulty image (ADR 0007)
 * → settlement for the image shown, from actual usage or the packet-aware fallback →
 * the saved image with WEB text and full provenance. A scene that cannot be prepared or packed is
 * declined before any request record exists, and the route returns that decline; there is no legacy
 * fallback (#184) and no unplanned prompt, and a replay never pays twice.
 */
import { api } from "../../../convex/_generated/api";
import { fetchImageModels, CREDIT_USD, DEFAULT_IMAGE_MODEL, IMAGE_RESERVATION_HEADROOM_MULTIPLIER, canAffordImageGeneration, getProviderName } from "../image-models";
import { imageCapabilities, IMAGE_BILLING_VERSION } from "../image-catalog";
import { extractNoImageText, extractOpenRouterUsageUsd, findResponseImageUrl, summarizeNoImageResponse } from "../image-response";
import { incrementMetricCounter, logApiFailure, logApiTimeout, logInfo, logSettlementEvent, logWarn, redactSid } from "../observability";
import { createOpenRouterTextModel, type TextModel } from "../reading-pass/model";
import { createConvexPreparationStore, type PreparationStore } from "./preparation";
import { GENERIC_PROMPT_VERSION } from "./prompt";
import { quoteGenericImage } from "./quote";
import { createReferenceBlobCache } from "./references";
import { createOpenRouterVisionChecker } from "./reference-adapters";
import { checkAndRetry, checkScene, SCENE_CHECK_VERSION, SOFT_EDGE_STYLES, type SceneChecker } from "./scene-check";
import { assembleRendering, type ReferenceRecord } from "./assemble";
import { loadWorkInputs, type MomentRange, type WorkInputs } from "./work-inputs";
import type { ConvexClient, GenericEngine, GenericGenerationInput, GenericGenerationOutcome } from "./dispatch";
import { listAnalysisRecords } from "./analysis-records";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type Runtime = GenericGenerationInput["runtime"];
type Blob = { bytes: Uint8Array; mimeType: string };

export type GenericEngineDeps = {
  loadInputs?: (workId: string) => Promise<WorkInputs>;
  /** The text model for looks and plans; Claude Haiku 5.5 through OpenRouter by default. */
  textModel?: (apiKey: string) => TextModel;
  fetch?: FetchLike;
  /** Read a stored reference blob; by default through a short-lived Convex storage URL. */
  loadReferenceBytes?: (runtime: Runtime, storageId: string) => Promise<Blob>;
  /** Convert a stored blob to the JPEG that is sent inline; sharp by default. */
  toJpeg?: (blob: Blob) => Promise<Blob>;
  modelId?: string;
  imageTimeoutMs?: () => number;
  now?: () => number;
  /**
   * The finished-image check (ADR 0007). Claude Haiku 5.5 through OpenRouter by default; null turns it off.
   * GENERIC_SCENE_CHECK=off also turns it off.
   */
  sceneChecker?: (apiKey: string, fetchImpl: FetchLike) => SceneChecker | null;
};

const DEFAULT_COST_MARKUP_MULTIPLIER = 1.25;
const COST_EVENT_PERSIST_TIMEOUT_MS = 1500;
const TIMEOUT_PREFIX = "Image generation timed out after";
const BIBLE_REFERENCE_TRANSLATION = "web";
const REFERENCE_FETCH_TIMEOUT_MS = 10_000;
/** Both check questions run in parallel; a slower check is skipped and the image is shown unchecked. */
const SCENE_CHECK_TIMEOUT_MS = 30_000;

function imageTimeoutMsFromEnv() {
  const parsed = Number.parseInt(process.env.OPENROUTER_IMAGE_TIMEOUT_MS || "45000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 45000;
}

async function defaultLoadReferenceBytes(runtime: Runtime, storageId: string): Promise<Blob> {
  const located = await runtime.convex.query(api.analysis.getReferenceBlobUrl, { serverSecret: runtime.serverSecret, storageId: storageId as never });
  if (!located?.url) throw new Error(`Reference blob ${storageId} is missing`);
  const response = await fetch(located.url, { signal: AbortSignal.timeout(REFERENCE_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Reference blob ${storageId} returned ${response.status}`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: located.contentType ?? response.headers.get("content-type") ?? "image/png" };
}

async function defaultToJpeg(blob: Blob): Promise<Blob> {
  if (blob.mimeType === "image/jpeg") return blob;
  const sharp = (await import("sharp")).default;
  const out = await sharp(Buffer.from(blob.bytes)).jpeg({ quality: 88 }).toBuffer();
  return { bytes: new Uint8Array(out), mimeType: "image/jpeg" };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

export { referenceIsCurrent } from "./assemble";

export function createGenericEngine(deps: GenericEngineDeps = {}): GenericEngine {
  const loadInputs = deps.loadInputs ?? ((workId: string) => loadWorkInputs(workId));
  const textModel = deps.textModel ?? ((apiKey: string) => createOpenRouterTextModel({ apiKey }));
  const fetchImpl: FetchLike = deps.fetch ?? ((input, init) => fetch(input, init));
  const loadReferenceBytes = deps.loadReferenceBytes ?? defaultLoadReferenceBytes;
  const toJpeg = deps.toJpeg ?? defaultToJpeg;
  const modelId = deps.modelId ?? DEFAULT_IMAGE_MODEL;
  const imageTimeoutMs = deps.imageTimeoutMs ?? imageTimeoutMsFromEnv;
  const now = deps.now ?? Date.now;
  const sceneChecker = deps.sceneChecker ?? ((apiKey: string, fetchImpl: FetchLike) => process.env.GENERIC_SCENE_CHECK === "off" ? null
    : createOpenRouterVisionChecker({ apiKey, fetch: fetchImpl, reasoningEffort: "low", maxTokens: 1500, timeoutMs: SCENE_CHECK_TIMEOUT_MS }));
  // One bounded JPEG cache per Convex client (one per server instance in production).
  const caches = new WeakMap<object, ReturnType<typeof createReferenceBlobCache>>();
  const cacheFor = (runtime: Runtime) => {
    let cache = caches.get(runtime.convex);
    if (!cache) {
      cache = createReferenceBlobCache(async (storageId) => (await toJpeg(await loadReferenceBytes(runtime, storageId))).bytes);
      caches.set(runtime.convex, cache);
    }
    return cache;
  };
  const momentLists = new Map<string, Promise<MomentRange[]>>();

  const storeFor = (convex: ConvexClient, workId: string, serverSecret: string): PreparationStore =>
    createConvexPreparationStore({ query: (ref, args) => convex.query(ref as never, args as never), mutation: (ref, args) => convex.mutation(ref as never, args as never) },
      api.analysis as unknown as Record<string, unknown>, workId, serverSecret);

  const listMomentsFor = (convex: ConvexClient, workId: string, generation: number) => (): Promise<MomentRange[]> => {
    const key = `${workId}#${generation}`;
    let list = momentLists.get(key);
    if (!list) {
      list = listAnalysisRecords(convex, workId, generation, "moment")
        .then((records) => records.filter((r) => r.payload.kind === "moment").map((r) => ({ id: r.recordId, firstUnit: (r.payload as { firstUnit: string }).firstUnit, lastUnit: (r.payload as { lastUnit: string }).lastUnit })))
        .catch((error) => { momentLists.delete(key); throw error; });
      momentLists.set(key, list);
    }
    return list;
  };

  return {
    id: `generic:${modelId}`,
    async execute(input): Promise<GenericGenerationOutcome> {
      const { runtime, workId, sid } = input;
      const { convex, serverSecret, requestContext } = runtime;
      const decline = (status: number, error: string, message: string, retryable: boolean, details?: Record<string, unknown>): Extract<GenericGenerationOutcome, { kind: "declined" }> =>
        ({ kind: "declined", status, error, message, retryable, ...(details ? { details } : {}) });
      const preparing = (message: string, details?: Record<string, unknown>) => decline(503, "Preparing scene", message, true, details);
      const respond = (status: number, body: Record<string, unknown>): GenericGenerationOutcome => ({ kind: "response", status, body });
      // Shared with the outer guard: once a request record exists, any unexpected throw must release the hold and fail it.
      let generationId: string | undefined;
      let reservationMade = false;
      const update = (status: "generating" | "succeeded" | "failed", updates: Record<string, unknown> = {}) =>
        convex.mutation(api.verseImages.updateGenerationRequest, { requestId: input.requestId, status, serverSecret, ...updates } as never);
      const release = async (stage: string) => {
        if (!reservationMade || !generationId) return;
        await convex.action(api.sessions.releaseReservation, { sid, generationId, serverSecret }).catch((error) => {
          logSettlementEvent({ context: requestContext, outcome: "release_failed", sid, generationId, details: { stage } });
          logApiFailure({ context: requestContext, stage, error, statusCode: 500, sid, generationId });
        });
      };
      try {
      // 1. Deployed inputs must be the ones the active analysis was registered against.
      let inputs: WorkInputs;
      try {
        inputs = await loadInputs(workId);
      } catch (error) {
        logApiFailure({ context: requestContext, stage: "generic_inputs", error, statusCode: 503, sid });
        return preparing("The work's inputs are not available on this server.");
      }
      if (inputs.workVersion !== input.readiness.workVersion || inputs.briefVersion !== input.readiness.briefVersion) {
        logWarn("generic.inputs_mismatch", { requestId: input.requestId, workId, deployedWork: inputs.workVersion, registeredWork: input.readiness.workVersion, deployedBrief: inputs.briefVersion, registeredBrief: input.readiness.briefVersion });
        return preparing("The deployed work or brief differs from the registered analysis.");
      }
      const store = storeFor(convex, workId, serverSecret);
      const cache = cacheFor(runtime);
      let assembled;
      try {
        assembled = await assembleRendering({
          inputs, store, model: textModel(runtime.openRouterApiKey), now,
          listMoments: listMomentsFor(convex, workId, input.readiness.activeGeneration),
          getReference: (kind, recordId) => convex.query(api.analysis.getReference, { workId, kind, recordId }) as Promise<ReferenceRecord | null>,
          loadReference: (storageId) => cache.get(storageId),
          onReferenceSkipped: (kind, id, reason) => logInfo("generic.reference_skipped", { requestId: input.requestId, workId, kind, id, reason }),
          onReferenceUnavailable: (kind, id, error) => logWarn("generic.reference_unavailable", { requestId: input.requestId, workId, kind, id, error: error instanceof Error ? error.message : String(error) }),
        }, { workId, unitId: input.verseId, styleId: input.styleId, variationNumber: input.generationNumber, aspectRatio: input.aspectRatio });
      } catch (error) {
        logApiFailure({ context: requestContext, stage: "generic_moment_lookup", error, statusCode: 503, sid });
        return preparing("The work's analysis could not be read.");
      }
      if (!assembled.ok) {
        switch (assembled.reason) {
          case "style": return decline(503, "Art style unavailable", assembled.message, false);
          case "unit": return decline(400, "Invalid or unavailable reference", assembled.message, false);
          case "moment": return preparing(assembled.message);
          case "context":
            logApiFailure({ context: requestContext, stage: "generic_moment_context", error: assembled.error, statusCode: 503, sid });
            return preparing(assembled.message);
          case "preparation": {
            const status = await convex.query(api.analysis.getPreparationStatus, { workId, momentId: input.verseId }).catch(() => null);
            if (assembled.stage) {
              logWarn("generic.preparation_unavailable", { requestId: input.requestId, workId, momentId: input.verseId, stage: assembled.stage, message: assembled.message });
              incrementMetricCounter("generic_preparation", { outcome: "unavailable", stage: assembled.stage });
            } else {
              logApiFailure({ context: requestContext, stage: "generic_preparation", error: assembled.error, statusCode: 503, sid });
            }
            return preparing(assembled.message, { preparation: status });
          }
          case "packet":
            await convex.mutation(api.analysis.noteAttention, { serverSecret, workId, reason: "prompt_over_budget", kind: "moment", recordId: assembled.momentId, detail: assembled.message }).catch(() => {});
            logWarn("generic.prompt_over_budget", { requestId: input.requestId, workId, momentId: assembled.momentId, finalChars: assembled.finalChars });
            return decline(503, "Scene unavailable", assembled.message, false);
        }
      }
      const { momentId, sectionId, context, prepared, prompt, packet, sentReferences, styleEntry } = assembled;
      const { style } = styleEntry;
      const unit = inputs.work.getUnit(input.verseId);
      incrementMetricCounter("generic_preparation", { outcome: prepared.calls > 0 ? "prepared" : "reused" });

      // 7. A quote for the actual prompt and the references that will be sent.
      let catalog;
      try {
        catalog = await fetchImageModels(runtime.openRouterApiKey);
      } catch (error) {
        logApiFailure({ context: requestContext, stage: "generic_catalog", error, statusCode: 503, sid });
        return decline(503, "Model or settings unavailable", "The image model catalog could not be read. Please try again.", true);
      }
      const model = catalog.models.find((m) => m.id === modelId);
      const capabilities = imageCapabilities(modelId);
      if (!model || model.availability === "unavailable" || !capabilities) {
        return decline(503, "Model or settings unavailable", model?.unavailableReason ?? "The image model is not available right now. Please try again.", true);
      }
      if (!capabilities.aspectRatios.includes(input.aspectRatio)) return decline(400, "Unsupported image settings", "The image model does not support this aspect ratio.", false);
      const quote = quoteGenericImage({ modelId, billing: model.billing, resolution: input.resolution, promptChars: prompt.length, referenceImages: sentReferences.length });
      if (!quote) return decline(503, "Model or settings unavailable", "The image cannot be priced right now. Please try again.", true);
      if (!quote.withinEnvelope) {
        await convex.mutation(api.analysis.noteAttention, { serverSecret, workId, reason: "quote_over_envelope", kind: "moment", recordId: momentId, detail: `Quote of ${quote.credits} credits (${quote.promptTokens} prompt tokens, ${quote.referenceImages} references) passes the image envelope` }).catch(() => {});
        return decline(503, "Scene unavailable", "This scene cannot be rendered within the image price envelope.", false);
      }
      const estimatedCreditsCost = quote.credits;
      const estimatedCostUsd = estimatedCreditsCost * CREDIT_USD;
      const reservationCreditsCost = estimatedCreditsCost * IMAGE_RESERVATION_HEADROOM_MULTIPLIER;
      const reservationCostUsd = reservationCreditsCost * CREDIT_USD;
      const requestId = input.requestId;

      // 8. Refuse before admission so a refused request id stays usable after a top-up or reset.
      if (!input.isOwner && !canAffordImageGeneration(input.session.credits, estimatedCreditsCost)) {
        return respond(402, { error: "Insufficient credits", requestId, required: estimatedCreditsCost, available: input.session.credits });
      }
      if (!input.isOwner && input.session.dailySpendUsd + reservationCostUsd > input.session.dailySpendLimitUsd) {
        return respond(429, { error: "Daily spending limit exceeded", dailyLimit: input.session.dailySpendLimitUsd, dailySpent: input.session.dailySpendUsd, requestId, remaining: Math.max(0, input.session.dailySpendLimitUsd - input.session.dailySpendUsd) });
      }

      // 9. One request identity, bound to the generic engine and its commitments.
      const commitments = { workId, momentId, briefVersion: inputs.briefVersion, analysisGeneration: input.readiness.activeGeneration, promptVersion: GENERIC_PROMPT_VERSION, billingVersion: IMAGE_BILLING_VERSION };
      try {
        const admission = await convex.mutation(api.verseImages.createGenerationRequest, {
          requestId, sid, verseId: unit.id, translationId: input.translationId, reference: input.reference, modelId,
          aspectRatio: input.aspectRatio, resolution: input.resolution, promptVersion: GENERIC_PROMPT_VERSION,
          estimatedCreditsCost, estimatedCostUsd, serverSecret, inputFingerprint: input.inputFingerprint, generationId: crypto.randomUUID(),
          executorVersion: "next-image-v1", billingPolicyVersion: "legacy-image-v1",
          engine: "generic", artStyleId: style.id, engineCommitments: commitments,
        });
        if (admission.alreadyExists) return { kind: "existing", admission };
        if (!admission.generationId) throw new Error("Missing admitted billing identity");
        generationId = admission.generationId;
      } catch (error) {
        logApiFailure({ context: requestContext, stage: "image_admission", error, statusCode: 503, sid });
        return decline(503, "Unable to safely start image generation", "Please try again.", true);
      }

      // 10. The exact snapshot, persisted before any paid attempt; a request without it never calls the provider.
      try {
        const snapshot = await update("generating", { renderingPacket: packet });
        if (!snapshot.success) throw new Error(snapshot.error ?? "Snapshot refused");
      } catch (error) {
        logApiFailure({ context: requestContext, stage: "generic_snapshot", error, statusCode: 503, sid, generationId });
        await update("failed", { error: "Rendering snapshot could not be persisted" }).catch(() => {});
        return decline(503, "Unable to safely start image generation", "Please try again.", true);
      }

      // 11. Guest reservation, or the owner's audit entry.
      let reservedCredits = 0;
      let updatedCredits: number | undefined;
      if (!input.isOwner) {
        reservedCredits = Math.min(reservationCreditsCost, input.session.credits);
        let reserve;
        try {
          reserve = await convex.action(api.sessions.reserveCredits, { sid, amount: reservedCredits, modelId, generationId, costUsd: reservationCostUsd, serverSecret });
        } catch (error) {
          // The hold may have committed before the error reached us: release by generation id, which is a no-op otherwise.
          logApiFailure({ context: requestContext, stage: "generic_reserve", error, statusCode: 503, sid, generationId });
          reservationMade = true;
          await release("generic_release_after_reserve_error");
          await update("failed", { error: "Credit reservation failed" }).catch(() => {});
          return decline(503, "Unable to safely start image generation", "Please try again.", true);
        }
        if (!reserve.success) {
          if ("dailyLimit" in reserve) {
            await update("failed", { error: "Daily spending limit exceeded" }).catch(() => {});
            return respond(429, { error: "Daily spending limit exceeded", dailyLimit: reserve.dailyLimit, dailySpent: reserve.dailySpent, requestId, remaining: reserve.remaining });
          }
          await update("failed", { error: "Insufficient credits" }).catch(() => {});
          return respond(402, { error: "Insufficient credits", requestId, required: estimatedCreditsCost, available: "available" in reserve ? reserve.available : 0 });
        }
        reservationMade = true;
        if ("newBalance" in reserve) updatedCredits = reserve.newBalance;
      } else {
        await convex.action(api.sessions.logAdminUsage, { sid, endpoint: "generate-image", modelId, estimatedCredits: reservationCreditsCost, estimatedCostUsd: reservationCostUsd, serverSecret })
          .catch((error) => logWarn("generic.admin_audit_failed", { requestId, error: error instanceof Error ? error.message : String(error) }));
      }
      const fail = async (status: number, error: string, message: string) => {
        await release("generic_release_on_failure");
        await update("failed", { error: message, durationMs: now() - started }).catch(() => {});
        return respond(status, { error, message, requestId });
      };

      // 12. One provider call, references inline after the prompt in packet order.
      const started = now();
      const timeoutMs = imageTimeoutMs();
      const callProvider = async (): Promise<Record<string, unknown>> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${runtime.openRouterApiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.OPENROUTER_REFERRER || "http://localhost:3000", "X-Title": process.env.OPENROUTER_TITLE || "visibible" },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: "user", content: [
                { type: "text", text: prompt },
                ...sentReferences.map((r) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from(r.bytes).toString("base64")}` } })),
              ] }],
              modalities: ["image", "text"],
              image_config: { aspect_ratio: input.aspectRatio, ...(capabilities.resolutions.length > 1 && { image_size: input.resolution }) },
              usage: { include: true },
            }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);
          return (await response.json()) as Record<string, unknown>;
        } finally {
          clearTimeout(timer);
        }
      };
      type ImageAttempt = { data: Record<string, unknown>; imageUrl: string; providerRequestId: string | undefined };
      const toAttempt = (data: Record<string, unknown>): ImageAttempt | { noImage: string } => {
        const choices = Array.isArray(data.choices) ? data.choices : [];
        const message = choices[0] && typeof choices[0] === "object" ? (choices[0] as { message?: unknown }).message : undefined;
        const imageUrl = findResponseImageUrl(message);
        if (!imageUrl) return { noImage: extractNoImageText(message) ?? "Model returned no image output." };
        return { data, imageUrl, providerRequestId: typeof data.id === "string" ? data.id : undefined };
      };
      let firstData: Record<string, unknown>;
      try {
        firstData = await callProvider();
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "AbortError";
        if (timedOut) {
          logApiTimeout({ context: requestContext, stage: "openrouter_generation", timeoutMs, sid, generationId });
          return fail(504, "Image generation timed out", `${TIMEOUT_PREFIX} ${timeoutMs}ms`);
        }
        logApiFailure({ context: requestContext, stage: "generate_image_handler", error, statusCode: 500, sid, generationId });
        return fail(500, "Failed to generate image", error instanceof Error ? error.message : "Failed to generate image");
      }
      const first = toAttempt(firstData);
      if ("noImage" in first) {
        logWarn("generic.no_image", { requestId, generationId, ...summarizeNoImageResponse(firstData) });
        return fail(500, "Model returned no image output", first.noImage);
      }

      // 12b. The scene check (ADR 0007): a faulty first image gets one owner-funded retry, and the better one is shown.
      // The reader pays for the image shown; the owner pays for the checks and the image not shown.
      let shown = first;
      const checker = sceneChecker(runtime.openRouterApiKey, fetchImpl);
      if (checker) {
        const checkContext = { people: assembled.canon.filter((c) => c.hasForm && c.kind === "character").map((c) => c.name),
          description: `${prepared.plan.payload.primarySubject}; ${prepared.plan.payload.secondaryElements}`, softEdges: SOFT_EDGE_STYLES.includes(style.id) };
        const checked = await checkAndRetry<ImageAttempt>(first, {
          check: (attempt, n) => {
            const match = attempt.imageUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
            if (!match) return Promise.reject(new Error("The image is not an inline data URL"));
            return withTimeout(checkScene(checker, { bytes: Uint8Array.from(Buffer.from(match[2], "base64")), mimeType: match[1] }, checkContext, `${momentId}:${n}`), SCENE_CHECK_TIMEOUT_MS, "Scene check timeout");
          },
          retry: async () => {
            const data = await callProvider();
            const attempt = toAttempt(data);
            if ("noImage" in attempt) throw new Error(attempt.noImage);
            return attempt;
          },
        });
        shown = checked.attempts[checked.chosen].image;
        const ownerUsd = checked.attempts.reduce((sum, a, i) => sum + (a.check?.costUsd ?? 0) + (i === checked.chosen ? 0 : extractOpenRouterUsageUsd(a.image.data) ?? 0), 0);
        const outcome = checked.attempts[0].checkError ? `check unavailable: ${checked.attempts[0].checkError.slice(0, 80)}`
          : checked.attempts.length === 1 ? (checked.retryError ? `faults ${checked.attempts[0].check!.faults.join(",")}; retry failed` : "clean")
          : `faults ${checked.attempts[0].check!.faults.join(",")}; retry ${checked.attempts[1].check?.faults.join(",") || (checked.attempts[1].checkError ? "unchecked" : "clean")}; showed ${checked.chosen + 1}`;
        await store.recordSpend({ kind: "check", recordId: momentId, model: checker.id, outcome: `${SCENE_CHECK_VERSION}: ${outcome}`, costUsd: ownerUsd, promptTokens: null, completionTokens: null, elapsedMs: now() - started })
          .catch((error) => logWarn("generic.scene_check_spend_failed", { requestId, error: error instanceof Error ? error.message : String(error) }));
        logInfo("generic.scene_check", { requestId, generationId, momentId, styleId: style.id, outcome, attempts: checked.attempts.length, chosen: checked.chosen + 1, ownerUsd });
        incrementMetricCounter("generic_scene_check", { outcome: checked.attempts[0].checkError ? "unavailable" : checked.attempts.length === 1 ? (checked.retryError ? "retry_failed" : "clean") : "retried" });
      }
      const { data, imageUrl, providerRequestId } = shown;
      const durationMs = now() - started;

      // 13. Settlement from actual usage, or from the quote that described the request actually made.
      const openRouterUsageUsd = extractOpenRouterUsageUsd(data);
      const usedActual = openRouterUsageUsd !== null;
      let actualCredits = quote.credits;
      let actualCostUsd = quote.credits * CREDIT_USD;
      let neutralCostUsedForActual = false;
      if (openRouterUsageUsd !== null) {
        try {
          const actual = await convex.action(api.costs.quoteUsdCost, { usd: openRouterUsageUsd, serverSecret });
          actualCredits = actual.credits; actualCostUsd = actual.billedUsd; neutralCostUsedForActual = true;
        } catch (error) {
          logWarn("generic.neutral_quote_failed", { requestId, error: error instanceof Error ? error.message : String(error) });
          actualCostUsd = openRouterUsageUsd * DEFAULT_COST_MARKUP_MULTIPLIER;
          actualCredits = Math.max(1, Math.ceil(actualCostUsd / CREDIT_USD));
        }
      } else {
        logWarn("generic.usage_missing", { requestId, generationId, fallbackCredits: quote.credits, referenceImages: sentReferences.length });
      }
      let chargedCredits = actualCredits;
      let chargedCostUsd = actualCostUsd;
      let chargeShortfall: { wantedCredits: number; chargedCredits: number; shortfall: number } | null = null;
      if (reservationMade) {
        let deduct;
        try {
          deduct = await convex.action(api.sessions.deductCredits, { sid, amount: reservedCredits, modelId, generationId, costUsd: reservationCostUsd, actualAmount: actualCredits, actualCostUsd, serverSecret });
        } catch (error) {
          // An image we cannot settle is not charged: the hold is released and the request fails.
          logApiFailure({ context: requestContext, stage: "generic_settlement", error, statusCode: 500, sid, generationId });
          return fail(500, "Failed to generate image", "Credit settlement failed");
        }
        if (!deduct.success) {
          logSettlementEvent({ context: requestContext, outcome: "deduct_failed", sid, generationId, details: { actualCredits } });
          await release("generic_release_after_deduct_failure");
          await update("failed", { error: "Insufficient credits", durationMs }).catch(() => {});
          return respond(402, { error: "Insufficient credits", requestId, required: actualCredits, available: "available" in deduct ? deduct.available : 0 });
        }
        if ("newBalance" in deduct) updatedCredits = deduct.newBalance;
        logSettlementEvent({ context: requestContext, outcome: "confirmed", sid, generationId, details: { actualCredits, usedActual } });
        if ("shortfall" in deduct && deduct.shortfall) {
          chargeShortfall = { wantedCredits: actualCredits, chargedCredits: reservedCredits, shortfall: deduct.shortfall as number };
          chargedCredits = reservedCredits;
          chargedCostUsd = reservedCredits * CREDIT_USD;
          logSettlementEvent({ context: requestContext, outcome: "shortfall", sid, generationId, details: { reservedCredits, wantedCredits: actualCredits, shortfall: deduct.shortfall } });
        }
      }
      void convex.mutation(api.modelStats.recordGeneration, { modelId, durationMs, serverSecret }).catch(() => {});

      // 14. The cost event, with the outbox when persistence is slow or down.
      const costEvent = {
        sid, requestId, generationId, modelId, verseId: unit.id, translationId: input.translationId, styleProfileId: style.id, reference: input.reference,
        aspectRatio: input.aspectRatio, resolution: input.resolution, scenePlannerUsed: false, scenePlanFromCache: false, usedFallbackEstimate: !usedActual,
        estimatedCreditsCost, estimatedCostUsd, reservationCreditsCost, reservationCostUsd,
        imageCreditsCost: chargedCredits, imageCostUsd: chargedCostUsd, scenePlannerCredits: 0, scenePlannerCostUsd: 0,
        actualCreditsCost: chargedCredits, actualCostUsd: chargedCostUsd, ...(openRouterUsageUsd !== null ? { openRouterUsageUsd } : {}), durationMs,
      };
      try {
        await withTimeout(convex.action(api.costs.recordImageCostEvent, { ...costEvent, serverSecret }), COST_EVENT_PERSIST_TIMEOUT_MS, "Cost event persistence timeout");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logSettlementEvent({ context: requestContext, outcome: "outbox_enqueued", sid, generationId, details: { reason } });
        await convex.action(api.costs.enqueueImageCostEventOutbox, { ...costEvent, enqueueReason: reason, serverSecret }).catch((enqueueError) => {
          logApiFailure({ context: requestContext, stage: "cost_event_outbox_enqueue", error: enqueueError, statusCode: 500, sid, generationId });
        });
      }

      // 15. The saved image: the work's reference text, never the reader's translation, with full provenance.
      const provenance = {
        workId, momentId, sectionId, eraId: packet.eraId, styleId: packet.styleId, styleVersion: packet.styleVersion, briefVersion: packet.briefVersion,
        lookVersion: packet.lookVersion, planVersion: packet.planVersion, promptVersion: packet.promptVersion, analysisGeneration: input.readiness.activeGeneration,
        canon: packet.canon, references: packet.references.map((r) => ({ kind: r.kind, id: r.id, version: r.version })), requestTranslationId: input.translationId,
      };
      const sourceTranslationId = workId === "bible-web" ? BIBLE_REFERENCE_TRANSLATION : workId;
      let savedImageId: string | undefined;
      try {
        const saved = await convex.action(api.verseImages.saveImage, {
          verseId: unit.id, imageUrl, model: modelId, prompt, reference: context.moment.reference, verseText: context.moment.text,
          generationNumber: input.generationNumber ?? undefined, promptVersion: GENERIC_PROMPT_VERSION, translationId: sourceTranslationId,
          provider: getProviderName(modelId), providerRequestId, creditsCost: chargedCredits, costUsd: chargedCostUsd, durationMs,
          aspectRatio: input.aspectRatio, generationId, engine: "generic", artStyleId: style.id, provenance, serverSecret,
        });
        if (saved && typeof saved.id === "string") savedImageId = saved.id;
      } catch (error) {
        logApiFailure({ context: requestContext, stage: "generic_save_image", error, statusCode: 500, sid, generationId });
      }
      await update("succeeded", { generationId, providerRequestId, usedFallbackEstimate: !usedActual, actualCreditsCost: chargedCredits, actualCostUsd: chargedCostUsd, durationMs }).catch(() => {});
      logInfo("generic.generated", { requestId, generationId, sid: redactSid(sid), workId, momentId, styleId: style.id, references: sentReferences.length, promptChars: prompt.length, preparationCalls: prepared.calls, credits: chargedCredits, durationMs });

      return respond(200, {
        requestId, engine: "generic", imageUrl, ...(savedImageId ? { savedImageId } : {}),
        model: modelId, provider: getProviderName(modelId), providerRequestId, generationId,
        prompt, promptVersion: GENERIC_PROMPT_VERSION, reference: context.moment.reference,
        translationId: sourceTranslationId, requestTranslationId: input.translationId, verseText: context.moment.text,
        generationNumber: input.generationNumber ?? undefined, style: style.id,
        creditsCost: chargedCredits, imageCreditsCost: chargedCredits, scenePlannerCredits: 0, costUsd: chargedCostUsd, imageCostUsd: chargedCostUsd, scenePlannerCostUsd: 0,
        scenePlannerUsed: false, scenePlanFromCache: false,
        estimatedCreditsCost, estimatedCostUsd, openRouterUsageUsd, usedActualCost: usedActual, usedFallbackEstimate: !usedActual, neutralCostUsedForActual,
        ...(chargeShortfall && { chargeShortfall }), durationMs, aspectRatio: input.aspectRatio, resolution: input.resolution,
        billingVersion: model.billing?.version, catalogEstimatedProviderUsd: quote.providerUsd, resolutionSupported: capabilities.resolutions.length > 1,
        provenance, preparation: { calls: prepared.calls, referencesSent: sentReferences.length, promptChars: prompt.length },
        ...(updatedCredits !== undefined && { credits: updatedCredits }),
      });
      } catch (error) {
        // Anything unexpected: never leave a request in `generating` with a hold behind it.
        logApiFailure({ context: requestContext, stage: "generic_unexpected", error, statusCode: 500, sid, generationId });
        if (generationId) {
          await release("generic_release_after_unexpected_error");
          await update("failed", { error: error instanceof Error ? error.message : "Failed to generate image" }).catch(() => {});
          return respond(500, { error: "Failed to generate image", requestId: input.requestId });
        }
        return decline(503, "Preparing scene", "Scene preparation failed.", true);
      }
    },
  };
}
