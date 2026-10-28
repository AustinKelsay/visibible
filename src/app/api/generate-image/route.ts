import type { FunctionReturnType } from "convex/server";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_RESOLUTION,
  isValidAspectRatio,
  isValidResolution,
  ImageAspectRatio,
  ImageResolution,
} from "@/lib/image-models";
import {
  DEFAULT_TRANSLATION,
  TRANSLATIONS,
  BibleApiLookupError,
  type Translation,
} from "@/lib/bible-api";
import { resolveGenerationPassage } from "@/lib/generation-passage";
import { decideEngine, genericEngineMode } from "@/lib/engine/admission";
import { hasOwnerEngineAccess } from "@/lib/engine/owner-check";
import { SHARED_STYLES } from "@/lib/work-preparation";
import { getGenericEngine } from "@/lib/engine/dispatch";
import {
  validateSessionWithIp,
  withSessionRefreshCookie,
  getClientIp,
  hashIp,
} from "@/lib/session";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
import { validateCsrfToken, CSRF_COOKIE_NAME } from "@/lib/csrf";
import {
  readJsonBodyWithLimit,
  PayloadTooLargeError,
  InvalidJsonError,
  DEFAULT_MAX_BODY_SIZE,
} from "@/lib/request-body";
import {
  createRequestObservabilityContext,
  emitMetric,
  incrementMetricCounter,
  logApiFailure,
  logInfo,
  logWarn,
  redactSid,
} from "@/lib/observability";
import { api } from "../../../../convex/_generated/api";

// Disable Next.js server-side caching - let browser cache handle it
export const dynamic = "force-dynamic";

const isImageGenerationEnabled =
  process.env.ENABLE_IMAGE_GENERATION === "true";

const DEFAULT_TRANSLATION_ID = "default";
const MAX_IMAGE_REQUEST_BODY_SIZE = DEFAULT_MAX_BODY_SIZE;

function toVerseId(reference: string): string {
  return reference
    .toLowerCase()
    .replace(/:/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sanitizeTranslationId(value: string | null): string {
  if (!value) return DEFAULT_TRANSLATION_ID;
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return cleaned || DEFAULT_TRANSLATION_ID;
}

function isSupportedTranslation(value: string): value is Translation {
  return Object.prototype.hasOwnProperty.call(TRANSLATIONS, value);
}

const chapterThemeSchema = z.object({
  setting: z.string(),
  palette: z.string(),
  elements: z.string(),
  style: z.string(),
});

const verseContextSchema = z.object({
  number: z.number().finite().optional(),
  text: z.string(),
  reference: z.string().optional(),
});

const generateImageSchema = z
  .object({
    text: z.string().optional(),
    theme: z.union([chapterThemeSchema, z.string()]).optional(),
    prevVerse: z.union([verseContextSchema, z.string()]).optional(),
    nextVerse: z.union([verseContextSchema, z.string()]).optional(),
    reference: z.string().trim().min(1).max(80),
    model: z.string().optional(),
    generation: z.union([z.number().finite(), z.string()]).optional(),
    style: z.string().optional(),
    aspectRatio: z.string().optional(),
    resolution: z.string().optional(),
    translation: z.string().optional(),
    requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/).optional(),
    /** A bulk job's bound engine: the request is refused rather than admitted on another engine (#178). */
    engine: z.enum(["legacy", "generic"]).optional(),
  })
  .passthrough();

type GenerateImageRequestBody = z.infer<typeof generateImageSchema>;

function getCookieValue(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValueParts] = part.trim().split("=");
    if (rawKey !== name) continue;
    try {
      return decodeURIComponent(rawValueParts.join("="));
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Method not allowed",
      message: "Use POST /api/generate-image for generation requests.",
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    }
  );
}

export async function POST(request: Request) {
  const requestContext = createRequestObservabilityContext(
    request,
    "/api/generate-image"
  );

  // SECURITY: Strict origin validation for state-changing route.
  const origin = request.headers.get("origin");
  if (!origin || !validateOrigin(request)) {
    return invalidOriginResponse();
  }

  // SECURITY: Enforce CSRF protection on state-changing route.
  const csrfCookie = getCookieValue(request, CSRF_COOKIE_NAME);
  if (!validateCsrfToken(request, csrfCookie)) {
    return NextResponse.json(
      { error: "Invalid request", message: "CSRF validation failed" },
      { status: 403 }
    );
  }

  if (!isImageGenerationEnabled) {
    return NextResponse.json(
      { error: "Image generation disabled" },
      { status: 403 }
    );
  }

  // Validate OpenRouter API key before proceeding
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey || openRouterApiKey.trim() === "") {
    console.error("OPENROUTER_API_KEY is missing or empty");
    return NextResponse.json(
      { error: "Server configuration error: OpenRouter API key is not configured" },
      { status: 500 }
    );
  }

  // SECURITY: Convex is required for credit management and rate limiting
  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 }
    );
  }

  // Verify server secret is configured (fail fast with clear error vs cryptic 500 later)
  let serverSecret: string;
  try {
    serverSecret = getConvexServerSecret();
  } catch {
    console.error("[Image API] CONVEX_SERVER_SECRET not configured");
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 }
    );
  }

  // SECURITY: Validate the browser session and capture the current IP hash for
  // rate limiting and telemetry. IP changes alone do not invalidate a session.
  const sessionValidation = await validateSessionWithIp(request);
  if (!sessionValidation.sid) {
    return NextResponse.json(
      { error: "Session required for image generation" },
      { status: 401 }
    );
  }
  if (!sessionValidation.valid) {
    return NextResponse.json(
      { error: "Session invalid" },
      { status: 401 }
    );
  }
  const sid = sessionValidation.sid;
  const withSessionRefresh = (response: Response) =>
    withSessionRefreshCookie(response, sessionValidation.refreshedToken) as NextResponse;
  const jsonWithSessionRefresh = (...args: Parameters<typeof NextResponse.json>) =>
    withSessionRefresh(NextResponse.json(...args));

  // SECURITY: Rate limiting - use IP hash as primary identifier to prevent multi-session bypass
  // Combined with sid for granular tracking per IP+session pair
  // Use currentIpHash from validation when available, otherwise compute it
  const ipHash = sessionValidation.currentIpHash ?? await hashIp(getClientIp(request));
  const rateLimitIdentifier = `${ipHash}:${sid}`;

  const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: rateLimitIdentifier,
    endpoint: "generate-image",
    serverSecret,
  });

  if (!rateLimitResult.allowed) {
    emitMetric("api_rate_limit_blocks_total", {
      route: requestContext.route,
      endpoint: "generate-image",
    });
    logWarn("api.rate_limited", {
      route: requestContext.route,
      requestId: requestContext.requestId,
      sid: redactSid(sid),
      retryAfter: rateLimitResult.retryAfter,
    });
    return jsonWithSessionRefresh(
      {
        error: "Rate limit exceeded",
        message: "Too many image generation requests. Please wait before generating more.",
        retryAfter: rateLimitResult.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfter || 60),
        },
      }
    );
  }

  let requestBody: GenerateImageRequestBody;
  try {
    const parsed = await readJsonBodyWithLimit<unknown>(
      request,
      MAX_IMAGE_REQUEST_BODY_SIZE
    );
    const parseResult = generateImageSchema.safeParse(parsed);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return jsonWithSessionRefresh(
        {
          error: "Invalid request",
          message: firstIssue?.message || "Invalid request body.",
        },
        { status: 400 }
      );
    }
    requestBody = parseResult.data;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return jsonWithSessionRefresh(
        {
          error: "Payload too large",
          message: `Request body exceeds maximum size of ${MAX_IMAGE_REQUEST_BODY_SIZE} bytes.`,
        },
        { status: 413 }
      );
    }
    if (error instanceof InvalidJsonError) {
      return jsonWithSessionRefresh(
        { error: "Invalid request", message: "Request body must be valid JSON." },
        { status: 400 }
      );
    }
    return jsonWithSessionRefresh(
      { error: "Invalid request", message: "Failed to read request body." },
      { status: 400 }
    );
  }

  // Legacy text/context fields are accepted but never authoritative.
  let reference = requestBody.reference;
  const requestedModelId = requestBody.model;
  const requestedStyleId = requestBody.style;
  const requestedAspectRatio = requestBody.aspectRatio;
  const requestedResolution = requestBody.resolution;
  const parsedTranslationInput = z.string().optional().safeParse(requestBody.translation);
  if (!parsedTranslationInput.success) {
    return jsonWithSessionRefresh(
      {
        error: "Invalid translation",
        message: "Unsupported translation. Please select a supported translation.",
      },
      { status: 400 }
    );
  }
  const normalizedTranslation =
    parsedTranslationInput.data === undefined
      ? DEFAULT_TRANSLATION
      : sanitizeTranslationId(parsedTranslationInput.data);
  if (!isSupportedTranslation(normalizedTranslation)) {
    return jsonWithSessionRefresh(
      {
        error: "Invalid translation",
        message: "Unsupported translation. Please select a supported translation.",
      },
      { status: 400 }
    );
  }
  const bibleTranslation: Translation = normalizedTranslation;
  const translationId = bibleTranslation;
  const clientRequestId =
    requestBody.requestId ?? crypto.randomUUID();

  // Validate and set aspect ratio (default: 16:9)
  const aspectRatio: ImageAspectRatio = requestedAspectRatio && isValidAspectRatio(requestedAspectRatio)
    ? requestedAspectRatio
    : DEFAULT_ASPECT_RATIO;

  // Validate and set resolution (default: 1K)
  if ((requestedResolution && !isValidResolution(requestedResolution)) ||
      (requestedAspectRatio && !isValidAspectRatio(requestedAspectRatio))) {
    return jsonWithSessionRefresh({ error: "Unsupported image settings" }, { status: 400 });
  }
  const resolution: ImageResolution = requestedResolution && isValidResolution(requestedResolution)
    ? requestedResolution
    : DEFAULT_RESOLUTION;

  // Stable ordering and explicit fields exclude transport identity and unknown extras.
  const inputFingerprint = createHash("sha256").update(JSON.stringify({
    text: requestBody.text ?? null, reference: requestBody.reference ?? null,
    translation: translationId, model: requestedModelId ?? null, style: requestedStyleId ?? null,
    aspectRatio, resolution, theme: requestBody.theme ?? null,
    generation: requestBody.generation ?? null, prevVerse: requestBody.prevVerse ?? null,
    nextVerse: requestBody.nextVerse ?? null,
  })).digest("hex");
  const existingIntentResponse = (admission: FunctionReturnType<typeof api.verseImages.createGenerationRequest>) => {
    if (admission.conflict) {
      return jsonWithSessionRefresh({ error: "Request ID already belongs to different inputs or owner" }, { status: 409 });
    }
    const saved = admission.savedImage;
    if (saved?.imageUrl) return jsonWithSessionRefresh({
      requestId: clientRequestId, generationId: admission.generationId, engine: admission.engine ?? "legacy",
      status: admission.status, reused: true, savedImageId: saved.id,
      imageUrl: saved.imageUrl, reference: saved.reference, translationId: saved.translationId,
      verseText: saved.verseText, promptInputs: saved.promptInputs,
      model: saved.model, creditsCost: saved.creditsCost, durationMs: saved.durationMs,
    });
    if (admission.status === "failed" || admission.status === "succeeded") {
      return jsonWithSessionRefresh({ requestId: clientRequestId, status: admission.status,
        error: admission.error || "The original operation ended without an available saved image", reused: true,
      }, { status: 409 });
    }
    return jsonWithSessionRefresh({ requestId: clientRequestId, status: admission.status, reused: true, engine: admission.engine ?? "legacy" }, { status: 202 });
  };
  try {
    const existing = await convex.query(api.verseImages.getGenerationIntent, {
      requestId: clientRequestId, sid, inputFingerprint, serverSecret,
    });
    if (existing) return existingIntentResponse(existing);
  } catch (error) {
    logApiFailure({ context: requestContext, stage: "image_intent_lookup", error, statusCode: 503, sid });
    return jsonWithSessionRefresh({ error: "Unable to safely check image generation" }, { status: 503 });
  }

  const parseGenerationNumber = (
    value: GenerateImageRequestBody["generation"]
  ): number | null => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? Math.trunc(value) : null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  let passage: Awaited<ReturnType<typeof resolveGenerationPassage>>;
  try {
    passage = await resolveGenerationPassage(reference, bibleTranslation);
  } catch (error) {
    const lookupStatus = error instanceof BibleApiLookupError ? error.statusCode : undefined;
    return jsonWithSessionRefresh({
      error: "Reference lookup unavailable",
      message: `Could not verify "${reference}" in the ${translationId.toUpperCase()} translation right now. Please try again.`,
      details: { upstreamStatus: lookupStatus ?? null },
    }, { status: lookupStatus === undefined || lookupStatus === 503 ? 503 : 502 });
  }
  if (!passage) {
    return jsonWithSessionRefresh({
      error: "Invalid or unavailable reference",
      message: "Please provide a single verse available in the selected translation, like John 3:16.",
    }, { status: 400 });
  }
  reference = passage.reference;
  const verseId = toVerseId(reference);

  const generationNumber = parseGenerationNumber(requestBody.generation);
  // Engine admission (#174): decided once per new request, persisted with it, never switched later.
  if (requestedStyleId && !SHARED_STYLES.styles.some((style) => style.id === requestedStyleId)) {
    // An unregistered style can never succeed: the same non-retryable answer as before.
    return jsonWithSessionRefresh({ error: "Style profile not available", message: `The style "${requestedStyleId}" is not available. Please select a different style.` }, { status: 400 });
  }
  const engineMode = genericEngineMode();
  // Owner status and readiness matter only once the generic engine is switched on; disabled mode adds no query.
  let sessionLookupFailed = false;
  const sessionForAdmission = engineMode === "disabled" ? null : await convex.query(api.sessions.getSession, { sid, serverSecret }).catch((error) => {
    sessionLookupFailed = true;
    logApiFailure({ context: requestContext, stage: "engine_admission_session", error, statusCode: 503, sid });
    return null;
  });
  const isAdminForBilling = sessionForAdmission?.tier === "admin";
  const bibleWorkId = "bible-web";
  const readiness = engineMode === "disabled" ? null : await convex.query(api.analysis.getWorkStatus, { workId: bibleWorkId }).catch(() => null);
  const engineDecision = decideEngine({
    mode: engineMode, isOwner: hasOwnerEngineAccess(sessionForAdmission), styleId: requestedStyleId ?? null,
    readiness: readiness ? { ready: readiness.ready, reasons: readiness.reasons, activeGeneration: readiness.activeGeneration, briefVersion: readiness.briefVersion } : null,
  });
  logInfo("engine_admission", { requestId: clientRequestId, mode: engineMode, engine: engineDecision.engine, reason: engineDecision.engine ? engineDecision.reason : engineDecision.unavailable });
  incrementMetricCounter("engine_admission", { mode: engineMode, engine: engineDecision.engine ?? "none" });
  if (engineDecision.engine === null) {
    return jsonWithSessionRefresh({ error: engineDecision.unavailable === "style" ? "Art style unavailable" : "Preparing scene", message: engineDecision.reason, retryable: engineDecision.retryable, style: requestedStyleId ?? null }, { status: 503 });
  }
  // A bound job never silently continues on another engine; nothing is reserved or recorded. A job bound to the removed
  // legacy engine is refused here, so it pauses.
  if (requestBody.engine && requestBody.engine !== engineDecision.engine) {
    incrementMetricCounter("engine_binding_refused", { expected: requestBody.engine, decided: engineDecision.engine });
    return jsonWithSessionRefresh({ error: "Engine binding changed", message: `This request is bound to the ${requestBody.engine} engine, which is not admitting new work right now.`, expectedEngine: requestBody.engine, engine: engineDecision.engine, retryable: true }, { status: 409 });
  }
  // A failed lookup is temporary; only a lookup that returned nothing means the session is gone.
  if (sessionLookupFailed) return jsonWithSessionRefresh({ error: "Unable to verify session", retryable: true }, { status: 503 });
  if (!sessionForAdmission) return jsonWithSessionRefresh({ error: "Session not found" }, { status: 401 });
  if (!readiness || readiness.activeGeneration === null || !readiness.workVersion || !readiness.briefVersion) {
    return jsonWithSessionRefresh({ error: "Preparing scene", message: "The work's analysis is not registered.", retryable: true }, { status: 503 });
  }
  const outcome = await getGenericEngine().execute({
    requestId: clientRequestId, sid, isOwner: isAdminForBilling, verseId, reference, translationId, styleId: requestedStyleId ?? "classical", aspectRatio, resolution,
    workId: bibleWorkId, readiness: { activeGeneration: readiness.activeGeneration, workVersion: readiness.workVersion, briefVersion: readiness.briefVersion },
    session: { credits: sessionForAdmission.credits, dailySpendUsd: sessionForAdmission.dailySpendUsd, dailySpendLimitUsd: sessionForAdmission.dailySpendLimitUsd },
    inputFingerprint, generationNumber,
    runtime: { convex, serverSecret, openRouterApiKey, requestContext },
  });
  // A scene the generic engine cannot prepare is refused before any request record or reservation exists.
  if (outcome.kind === "declined") return jsonWithSessionRefresh({ error: outcome.error, message: outcome.message, retryable: outcome.retryable, ...outcome.details }, { status: outcome.status });
  if (outcome.kind === "existing") return existingIntentResponse(outcome.admission as Parameters<typeof existingIntentResponse>[0]);
  return jsonWithSessionRefresh(outcome.body, outcome.status === 200 ? { headers: { "Cache-Control": "private, max-age=3600" } } : { status: outcome.status });
}
