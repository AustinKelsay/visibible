import {
  PROMPT_VERSION, DEFAULT_STYLE_PROFILE, STYLE_PROFILES,
  normalizeScenePlan, extractJsonObject, clipText,
  buildScenePlannerPrompt, buildImagePrompt, scenePlanInputFingerprint, type ScenePlan, type PromptPacket,
} from "@/lib/image-prompts";
import type { FunctionReturnType } from "convex/server";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_CREDITS_COST,
  fetchImageModels,
  computeAdjustedCreditsCost,
  CONSERVATIVE_ESTIMATE_MULTIPLIER,
  getProviderName,
  CREDIT_USD,
  canAffordImageGeneration,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_RESOLUTION,
  RESOLUTIONS,
  isValidAspectRatio,
  isValidResolution,
  normalizeResolutionForModel,
  supportsResolution,
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
import { getScenePlannerEstimatedCreditsCost, getScenePlannerModelId, isScenePlannerEnabled } from "@/lib/scene-planner";
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
  logApiFailure,
  logApiTimeout,
  logSettlementEvent,
  logWarn,
  redactSid,
} from "@/lib/observability";
import { api } from "../../../../convex/_generated/api";

// Disable Next.js server-side caching - let browser cache handle it
export const dynamic = "force-dynamic";

const isImageGenerationEnabled =
  process.env.ENABLE_IMAGE_GENERATION === "true";

// Version boundary prevents reuse of plans derived from client-authored Scripture.
const DEFAULT_TRANSLATION_ID = "default";
const DEFAULT_COST_MARKUP_MULTIPLIER = 1.25;
const MAX_IMAGE_REQUEST_BODY_SIZE = DEFAULT_MAX_BODY_SIZE;
const COST_EVENT_PERSIST_TIMEOUT_MS = Number.parseInt(
  process.env.COST_EVENT_PERSIST_TIMEOUT_MS || "1500",
  10
);
const parsedOpenRouterImageTimeoutMs = Number.parseInt(
  process.env.OPENROUTER_IMAGE_TIMEOUT_MS || "45000",
  10
);
const EFFECTIVE_IMAGE_TIMEOUT_MS =
  Number.isFinite(parsedOpenRouterImageTimeoutMs) &&
  parsedOpenRouterImageTimeoutMs > 0
    ? parsedOpenRouterImageTimeoutMs
    : 45000;
// Scene planner timeout in milliseconds (default 10 seconds, configurable via env var)
const SCENE_PLANNER_TIMEOUT_MS = Number.parseInt(
  process.env.SCENE_PLANNER_TIMEOUT_MS || "10000",
  10
);
const IMAGE_GENERATION_TIMEOUT_MESSAGE_PREFIX = "Image generation timed out after";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildInlineImageDataUrl(part: unknown): string | null {
  if (!isRecord(part)) return null;

  const inlineData = isRecord(part.inline_data)
    ? part.inline_data
    : isRecord(part.inlineData)
      ? part.inlineData
      : null;

  if (!inlineData) return null;

  const data = getNonEmptyString(inlineData.data);
  if (!data) return null;

  const mimeType = getNonEmptyString(inlineData.mime_type)
    ?? getNonEmptyString(inlineData.mimeType)
    ?? "image/png";

  return `data:${mimeType};base64,${data}`;
}

function extractImageUrlFromPart(part: unknown): string | null {
  if (typeof part === "string") {
    return part.startsWith("data:image/") ? part : null;
  }

  if (!isRecord(part)) return null;

  const directUrl = getNonEmptyString(part.url);
  if (directUrl) return directUrl;

  const directImageUrl = getNonEmptyString(part.image_url)
    ?? getNonEmptyString(part.imageUrl);
  if (directImageUrl) return directImageUrl;

  const nestedImageUrl = isRecord(part.image_url)
    ? part.image_url
    : isRecord(part.imageUrl)
      ? part.imageUrl
      : null;
  if (nestedImageUrl) {
    const nestedUrl = getNonEmptyString(nestedImageUrl.url);
    if (nestedUrl) return nestedUrl;
  }

  const inlineDataUrl = buildInlineImageDataUrl(part);
  if (inlineDataUrl) return inlineDataUrl;

  const b64Json = getNonEmptyString(part.b64_json);
  if (b64Json) {
    return `data:image/png;base64,${b64Json}`;
  }

  return null;
}

function extractNoImageText(message: unknown): string | null {
  if (!isRecord(message)) return null;

  const messageContent = getNonEmptyString(message.content);
  if (messageContent) return clipText(messageContent, 180);

  const refusal = getNonEmptyString(message.refusal);
  if (refusal) return clipText(refusal, 180);

  if (!Array.isArray(message.content)) return null;

  for (const part of message.content) {
    if (!isRecord(part)) continue;

    const text = getNonEmptyString(part.text)
      ?? getNonEmptyString(part.refusal)
      ?? getNonEmptyString(part.content);

    if (text) return clipText(text, 180);
  }

  return null;
}

function summarizeNoImageResponse(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) {
    return { responseType: typeof data };
  }

  const choices = Array.isArray(data.choices) ? data.choices : [];

  return {
    id: getNonEmptyString(data.id),
    choiceCount: choices.length,
    choices: choices.slice(0, 2).map((choice) => {
      if (!isRecord(choice)) {
        return { choiceType: typeof choice };
      }

      const message = isRecord(choice.message) ? choice.message : null;
      const content = message?.content;

      return {
        finishReason: getNonEmptyString(choice.finish_reason),
        messageKeys: message ? Object.keys(message).slice(0, 8) : [],
        imagesCount: Array.isArray(message?.images) ? message.images.length : 0,
        contentType: Array.isArray(content) ? "array" : typeof content,
        contentPartTypes: Array.isArray(content)
          ? content.slice(0, 8).map((part) =>
              isRecord(part) ? getNonEmptyString(part.type) ?? "unknown" : typeof part
            )
          : [],
        textPreview: extractNoImageText(message),
      };
    }),
  };
}

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

function quoteUsdCostLocally(usd: number): { credits: number; billedUsd: number } {
  const billedUsd = usd * DEFAULT_COST_MARKUP_MULTIPLIER;
  return {
    credits: Math.max(1, Math.ceil(billedUsd / CREDIT_USD)),
    billedUsd,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 1500;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), effectiveTimeout);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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
      requestId: clientRequestId, generationId: admission.generationId,
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
    return jsonWithSessionRefresh({ requestId: clientRequestId, status: admission.status, reused: true }, { status: 202 });
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

  let modelId = DEFAULT_IMAGE_MODEL;
  let modelPricing: string | undefined;
  let modelUsesEmergencyPricing = false;
  let selectedModel:
    | Awaited<ReturnType<typeof fetchImageModels>>["models"][number]
    | undefined;
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
  const { verseText, prevVerse, nextVerse, chapterTheme } = passage;
  const verseId = toVerseId(reference);

  const generationNumber = parseGenerationNumber(requestBody.generation);
  const requestedStyleProfile = requestedStyleId
    ? STYLE_PROFILES[requestedStyleId]
    : undefined;
  const styleProfile = requestedStyleProfile || STYLE_PROFILES[DEFAULT_STYLE_PROFILE];

  if (requestedStyleId && !requestedStyleProfile) {
    return jsonWithSessionRefresh(
      {
        error: "Style profile not available",
        message: `The style "${requestedStyleId}" is not available. Please select a different style.`,
      },
      { status: 400 }
    );
  }

  // SECURITY: Validate model exists and has pricing to prevent cost abuse
  const result = await fetchImageModels(openRouterApiKey);

  if (requestedModelId && requestedModelId !== DEFAULT_IMAGE_MODEL) {
    const foundModel = result.models.find(
      (model) => model.id === requestedModelId
    );
    if (!foundModel) {
      return jsonWithSessionRefresh(
        {
          error: "Model not available",
          message: `The model "${requestedModelId}" is not available. Please select a different model.`,
        },
        { status: 400 }
      );
    }
    selectedModel = foundModel;
    modelId = requestedModelId;
    modelPricing = foundModel.pricing?.imageOutput;
    modelUsesEmergencyPricing = foundModel.usesEmergencyPricing === true;
  } else {
    // Use default model, but still validate it exists and has pricing
    const foundModel = result.models.find((model) => model.id === modelId);
    selectedModel = foundModel;
    modelPricing = foundModel?.pricing?.imageOutput;
    modelUsesEmergencyPricing = foundModel?.usesEmergencyPricing === true;
  }

  const parsedModelPricingUsd = modelPricing ? Number.parseFloat(modelPricing) : Number.NaN;
  const hasCatalogImagePricing =
    Number.isFinite(parsedModelPricingUsd) && parsedModelPricingUsd > 0;

  const quoteUsdCost = async (
    usd: number
  ): Promise<{ credits: number; billedUsd: number; viaNeutralCost: boolean }> => {
    try {
      const quote = await convex.action(api.costs.quoteUsdCost, {
        usd,
        serverSecret,
      });
      return {
        credits: quote.credits,
        billedUsd: quote.billedUsd,
        viaNeutralCost: true,
      };
    } catch (error) {
      console.warn("[Image API] Neutral cost quote failed, using local fallback:", error);
      const localQuote = quoteUsdCostLocally(usd);
      return {
        credits: localQuote.credits,
        billedUsd: localQuote.billedUsd,
        viaNeutralCost: false,
      };
    }
  };

  const fallbackBaseImageCreditsCost =
    selectedModel?.creditsCost ?? DEFAULT_CREDITS_COST;
  const baseImageQuote = hasCatalogImagePricing
    ? await quoteUsdCost(parsedModelPricingUsd)
    : {
        credits: fallbackBaseImageCreditsCost,
        billedUsd: fallbackBaseImageCreditsCost * CREDIT_USD,
        viaNeutralCost: false,
      };
  const baseImageCreditsCost = baseImageQuote.credits;

  if (!hasCatalogImagePricing) {
    console.warn(
      `[Image API] Missing catalog image pricing for model=${modelId}; using fallback estimate=${fallbackBaseImageCreditsCost} credits`
    );
  }

  // Check if this model supports resolution settings
  // Only certain models (currently Gemini) support configurable resolution
  const modelSupportsResolution = supportsResolution(modelId);
  const learnedEstimateResolution = normalizeResolutionForModel(
    modelId,
    resolution
  );

  // Apply resolution multiplier only if model supports it
  // This prevents charging users extra for resolution settings that are ignored
  const fallbackImageCreditsCost = computeAdjustedCreditsCost(
    baseImageCreditsCost,
    resolution,
    modelId
  );
  let imageCreditsCost = fallbackImageCreditsCost;

  try {
    const learnedEstimate = await convex.query(api.modelCostStats.getEstimate, {
      modelId,
      resolution: learnedEstimateResolution,
      fallbackCredits: fallbackImageCreditsCost,
      serverSecret,
    });
    imageCreditsCost = learnedEstimate.credits;
  } catch (error) {
    console.warn("[Image API] Failed to fetch learned image cost estimate:", error);
  }

  // Compute conservative estimate for reservation (accounts for OpenRouter API pricing discrepancy)
  // The OpenRouter models API often underreports actual costs for multimodal image models
  // Emergency fallback prices are already conservative final-price baselines.
  // Avoid applying the catalog underreporting multiplier twice in outage mode.
  const baseReservationCredits =
    selectedModel?.reservationCreditsCost ??
    (hasCatalogImagePricing
      ? Math.ceil(
          baseImageCreditsCost *
            (modelUsesEmergencyPricing ? 1 : CONSERVATIVE_ESTIMATE_MULTIPLIER)
        )
      : baseImageCreditsCost);
  const reservationImageCredits = computeAdjustedCreditsCost(
    baseReservationCredits,
    resolution,
    modelId
  );

  // Determine scene planner settings early for cost calculation
  const enableScenePlanner = isScenePlannerEnabled();
  const scenePlannerModel = getScenePlannerModelId();

  const sceneCacheIdentity = {
    verseId, translationId, styleProfileId: styleProfile.id,
    plannerModel: scenePlannerModel, promptVersion: PROMPT_VERSION,
    inputFingerprint: scenePlanInputFingerprint({ reference, verseText, prevVerse, nextVerse, chapterTheme, styleProfile }),
  };

  // Phase 2: check scene plan cache before deciding planner cost.
  let cachedScenePlan: ScenePlan | null = null;
  let scenePlanFromCache = false;
  if (enableScenePlanner) {
    try {
      const cacheEntry = await convex.query(api.verseImages.getScenePlanCache, {
        ...sceneCacheIdentity,
        serverSecret,
      });
      const normalizedCached = cacheEntry?.scenePlan && cacheEntry.promptVersion === PROMPT_VERSION && cacheEntry.plannerModel === scenePlannerModel
        ? normalizeScenePlan(cacheEntry.scenePlan)
        : null;
      if (normalizedCached) {
        cachedScenePlan = normalizedCached;
        scenePlanFromCache = true;
      }
    } catch (error) {
      console.warn("[Image API] Scene plan cache lookup failed:", error);
    }
  }

  // Calculate scene planner cost only when planner call is still needed.
  let scenePlannerCreditsCost = 0;
  let scenePlannerCostUsd = 0;
  if (enableScenePlanner && !scenePlanFromCache) {
    scenePlannerCreditsCost = await getScenePlannerEstimatedCreditsCost(
      openRouterApiKey
    );
    scenePlannerCostUsd = scenePlannerCreditsCost * CREDIT_USD;
  }

  // Estimated cost (what we expect to charge based on API pricing)
  const estimatedCreditsCost = imageCreditsCost + scenePlannerCreditsCost;
  const estimatedImageCostUsd = imageCreditsCost * CREDIT_USD;
  const estimatedTotalCostUsd = estimatedImageCostUsd + scenePlannerCostUsd;

  // Reservation cost (conservative estimate to ensure we have enough)
  const reservationCreditsCost = reservationImageCredits + scenePlannerCreditsCost;
  const reservationCostUsd = reservationCreditsCost * CREDIT_USD;

  // Use a conservative reservation for well-funded sessions, but cap the hold at the
  // user's remaining balance for low-credit sessions so they can spend down to zero.
  let cost = reservationCreditsCost;
  let costUsd = reservationCostUsd;
  let settledReservationCostUsd = reservationCostUsd;
  let updatedCredits: number | undefined;
  let shouldCharge = false;
  let reservationMade = false;
  let chargeGenerationId = crypto.randomUUID();

  // Check if user is admin (unlimited access)
  const session = await convex.query(api.sessions.getSession, { sid });
  if (!session) {
    return jsonWithSessionRefresh(
      { error: "Session not found" },
      { status: 401 }
    );
  }
  const isAdmin = session?.tier === "admin";
  let generationRequestCreated = false;
  const generationRequestId = clientRequestId;

  const updateGenerationRequest = async (
    status: "planning" | "generating" | "succeeded" | "failed",
    updates?: {
      error?: string;
      generationId?: string;
      providerRequestId?: string;
      scenePlannerUsed?: boolean;
      scenePlanFromCache?: boolean;
      usedFallbackEstimate?: boolean;
      promptPacket?: PromptPacket;
      actualCreditsCost?: number;
      actualCostUsd?: number;
      durationMs?: number;
    }
  ) => {
    if (!generationRequestCreated) return;
    try {
      await convex.mutation(api.verseImages.updateGenerationRequest, {
        requestId: generationRequestId,
        status,
        ...(updates?.error ? { error: updates.error } : {}),
        ...(updates?.generationId ? { generationId: updates.generationId } : {}),
        ...(updates?.providerRequestId
          ? { providerRequestId: updates.providerRequestId }
          : {}),
        ...(updates?.scenePlannerUsed !== undefined
          ? { scenePlannerUsed: updates.scenePlannerUsed }
          : {}),
        ...(updates?.scenePlanFromCache !== undefined
          ? { scenePlanFromCache: updates.scenePlanFromCache }
          : {}),
        ...(updates?.usedFallbackEstimate !== undefined
          ? { usedFallbackEstimate: updates.usedFallbackEstimate }
          : {}),
        ...(updates?.promptPacket ? { promptPacket: updates.promptPacket } : {}),
        ...(updates?.actualCreditsCost !== undefined
          ? { actualCreditsCost: updates.actualCreditsCost }
          : {}),
        ...(updates?.actualCostUsd !== undefined
          ? { actualCostUsd: updates.actualCostUsd }
          : {}),
        ...(updates?.durationMs !== undefined
          ? { durationMs: updates.durationMs }
          : {}),
        serverSecret,
      });
    } catch (error) {
      console.warn("[Image API] Failed to update generation request:", error);
    }
  };

  try {
    const admission = await convex.mutation(api.verseImages.createGenerationRequest, {
      requestId: generationRequestId, sid, verseId, translationId, reference, modelId,
      aspectRatio, resolution, promptVersion: PROMPT_VERSION, scenePlannerModel,
      estimatedCreditsCost, estimatedCostUsd: estimatedTotalCostUsd, serverSecret,
      inputFingerprint, generationId: chargeGenerationId,
      executorVersion: "next-image-v1", billingPolicyVersion: "legacy-image-v1",
    });
    if (admission.alreadyExists) return existingIntentResponse(admission);
    if (!admission.generationId) throw new Error("Missing admitted billing identity");
    chargeGenerationId = admission.generationId;
    generationRequestCreated = true;
  } catch (error) {
    logApiFailure({ context: requestContext, stage: "image_admission", error, statusCode: 503, sid });
    return jsonWithSessionRefresh({ error: "Unable to safely start image generation" }, { status: 503 });
  }

  const canStartGeneration = isAdmin
    ? true
    : canAffordImageGeneration(session.credits, estimatedCreditsCost);
  if (!canStartGeneration) {
    await updateGenerationRequest("failed", {
      error: "Insufficient credits",
    });
    return jsonWithSessionRefresh(
      {
        error: "Insufficient credits",
        requestId: generationRequestId,
        required: estimatedCreditsCost,
        available: session.credits,
      },
      { status: 402 }
    );
  }

  if (!isAdmin) {
    cost = Math.min(reservationCreditsCost, session.credits);
    costUsd = reservationCostUsd;
    settledReservationCostUsd = cost * CREDIT_USD;
  }

  // Skip credit checks for admin users but log for audit trail
  if (!isAdmin) {
    // Atomically reserve credits before generation to prevent race conditions
    const reserveResult = await convex.action(api.sessions.reserveCredits, {
      sid,
      amount: cost,
      modelId,
      generationId: chargeGenerationId,
      costUsd,
      serverSecret,
    });

    if (!reserveResult.success) {
      // Check if failure is due to daily spending limit vs insufficient credits
      if ("dailyLimit" in reserveResult) {
        await updateGenerationRequest("failed", {
          error: "Daily spending limit exceeded",
        });
        return jsonWithSessionRefresh(
          {
            error: "Daily spending limit exceeded",
            dailyLimit: reserveResult.dailyLimit,
            dailySpent: reserveResult.dailySpent,
            requestId: generationRequestId,
            remaining: reserveResult.remaining,
          },
          { status: 429 } // Too Many Requests - appropriate for rate/limit exceeded
        );
      }
      await updateGenerationRequest("failed", {
        error: "Insufficient credits",
      });
      return jsonWithSessionRefresh(
        {
          error: "Insufficient credits",
          requestId: generationRequestId,
          required: estimatedCreditsCost,
          available:
            "available" in reserveResult ? reserveResult.available : 0,
        },
        { status: 402 }
      );
    }

    reservationMade = true;
    shouldCharge = true;

    if ("newBalance" in reserveResult) {
      updatedCredits = reserveResult.newBalance;
    }
  } else {
    // SECURITY: Log admin usage for audit trail even though credits aren't charged
    // This enables detection of admin credential compromise
    // IMPORTANT: Await the call to ensure audit trail is reliably written
    try {
      await convex.action(api.sessions.logAdminUsage, {
        sid,
        endpoint: "generate-image",
        modelId,
        estimatedCredits: cost,
        estimatedCostUsd: costUsd,
        serverSecret,
      });
    } catch (err) {
      console.error("[Image API] Failed to log admin usage:", err);
      // Continue with the request even if audit logging fails
      // The request should proceed but we've logged the audit failure
    }
  }

  // Track generation start time for stats
  const generationStartTime = Date.now();

  // Scene planner settings already defined above for cost calculation
  await updateGenerationRequest("planning");

  const buildScenePlan = async (): Promise<{
    scenePlan: ScenePlan | null;
    fromCache: boolean;
  }> => {
    if (cachedScenePlan) {
      void convex
        .mutation(api.verseImages.markScenePlanCacheHit, {
          ...sceneCacheIdentity,
          serverSecret,
        })
        .catch((error) => {
          console.warn("[Image API] Scene plan cache hit update failed:", error);
        });
      return { scenePlan: cachedScenePlan, fromCache: true };
    }
    if (!enableScenePlanner) return { scenePlan: null, fromCache: false };
    const scenePlannerPrompt = buildScenePlannerPrompt({ reference, verseText, prevVerse, nextVerse, chapterTheme, styleProfile });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SCENE_PLANNER_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openRouterApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.OPENROUTER_REFERRER || "http://localhost:3000",
            "X-Title": process.env.OPENROUTER_TITLE || "visibible",
          },
          body: JSON.stringify({
            model: scenePlannerModel,
            messages: [
              {
                role: "user",
                content: scenePlannerPrompt,
              },
            ],
            temperature: 0.2,
            max_tokens: 220,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        console.warn(`[Image API] Scene planner failed: status=${response.status}`);
        return { scenePlan: null, fromCache: false };
      }

      const data = await response.json();
      const message = data?.choices?.[0]?.message;
      let content = "";
      if (typeof message?.content === "string") {
        content = message.content;
      } else if (Array.isArray(message?.content)) {
        content = message.content
          .map((part: { text?: string }) => (typeof part.text === "string" ? part.text : ""))
          .join("");
      }

      if (!content) return { scenePlan: null, fromCache: false };
      const jsonString = extractJsonObject(content) || content.trim();
      const parsed = JSON.parse(jsonString);
      const normalized = normalizeScenePlan(parsed);
      if (normalized) {
        void convex
          .mutation(api.verseImages.upsertScenePlanCache, {
            ...sceneCacheIdentity,
            scenePlan: normalized,
            serverSecret,
          })
          .catch((error) => {
            console.warn("[Image API] Scene plan cache upsert failed:", error);
          });
      }
      return { scenePlan: normalized, fromCache: false };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logApiTimeout({
          context: requestContext,
          stage: "scene_planner",
          timeoutMs: SCENE_PLANNER_TIMEOUT_MS,
          sid,
          generationId: chargeGenerationId,
        });
        console.warn(
          `[Image API] Scene planner timeout after ${SCENE_PLANNER_TIMEOUT_MS}ms`
        );
      } else {
        logApiFailure({
          context: requestContext,
          stage: "scene_planner",
          error,
          statusCode: 500,
          sid,
          generationId: chargeGenerationId,
        });
        console.warn("[Image API] Scene planner error:", error);
      }
      return { scenePlan: null, fromCache: false };
    }
  };

  const { scenePlan, fromCache: runtimeScenePlanFromCache } = await buildScenePlan();
  scenePlanFromCache = runtimeScenePlanFromCache;

  // Track whether scene planner was actually used (for partial refund on failure)
  const scenePlannerUsed = scenePlan !== null && !scenePlanFromCache;

  const { prompt, promptPacket, promptInputs } = buildImagePrompt({
    verseId, translationId, reference, verseText, prevVerse, nextVerse,
    chapterTheme, styleProfile, aspectRatio, resolution, generationNumber,
    scenePlan, scenePlannerUsed, scenePlanFromCache,
  });

  await updateGenerationRequest("generating", {
    scenePlannerUsed,
    scenePlanFromCache,
    promptPacket,
  });

  try {
    const releaseReservationIfNeeded = async () => {
      if (!reservationMade) {
        return;
      }
      await convex
        .action(api.sessions.releaseReservation, {
          sid,
          generationId: chargeGenerationId,
          serverSecret,
        })
        .catch((releaseError) => {
          logSettlementEvent({
            context: requestContext,
            outcome: "release_failed",
            sid,
            generationId: chargeGenerationId,
            details: { stage: "releaseReservationIfNeeded" },
          });
          logApiFailure({
            context: requestContext,
            stage: "release_reservation_if_needed",
            error: releaseError,
            statusCode: 500,
            sid,
            generationId: chargeGenerationId,
          });
          console.error("Failed to release reservation:", releaseError);
        });
    };

    // Use OpenRouter chat completions with Gemini for image generation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EFFECTIVE_IMAGE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_REFERRER || "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_TITLE || "visibible",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          // Request image output
          modalities: ["image", "text"],
          // Specify aspect ratio and only send image_size to documented-capable models.
          image_config: {
            aspect_ratio: aspectRatio,
            ...(modelSupportsResolution && { image_size: resolution }),
          },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        logApiTimeout({
          context: requestContext,
          stage: "openrouter_generation",
          timeoutMs: EFFECTIVE_IMAGE_TIMEOUT_MS,
          sid,
          generationId: chargeGenerationId,
        });
        console.error(
          `[Image API] Main generation timeout after ${EFFECTIVE_IMAGE_TIMEOUT_MS}ms`
        );
        throw new Error(
          `${IMAGE_GENERATION_TIMEOUT_MESSAGE_PREFIX} ${EFFECTIVE_IMAGE_TIMEOUT_MS}ms`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // SECURITY: Log minimal error info to avoid exposing API internals
      console.error(`[Image API] OpenRouter error: status=${response.status}`);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const providerRequestId = typeof data?.id === "string" ? data.id : undefined;

    // Extract actual usage/cost from OpenRouter response
    // OpenRouter may return cost in various locations depending on API version and request type
    // Check multiple known locations in priority order
    const openRouterUsageUsd: number | null = (() => {
      // Priority 1: Direct cost field in usage object (most common for OpenRouter)
      if (typeof data.usage?.cost === "number" && data.usage.cost > 0) {
        return data.usage.cost;
      }
      // Priority 2: total_cost field (alternative naming)
      if (typeof data.usage?.total_cost === "number" && data.usage.total_cost > 0) {
        return data.usage.total_cost;
      }
      // Priority 3: Root-level cost field
      if (typeof data.cost === "number" && data.cost > 0) {
        return data.cost;
      }
      // Priority 4: Root-level total_cost field
      if (typeof data.total_cost === "number" && data.total_cost > 0) {
        return data.total_cost;
      }
      return null;
    })();

    // Log when actual cost isn't available - include usage structure for debugging
    if (openRouterUsageUsd === null) {
      // Log the actual usage object structure to help identify correct field location
      const usageDebug = data.usage !== undefined
        ? `usage=${JSON.stringify(data.usage)}`
        : "usage=undefined";
      console.warn(`[Image API] No cost in response for model=${modelId}, gen=${chargeGenerationId}, ${usageDebug}`);
    }

    // Calculate actual credits to charge based on OpenRouter usage
    // Fall back to API-based estimate (not conservative 35x) if actual usage not available
    const effectiveScenePlannerCredits = scenePlannerUsed ? scenePlannerCreditsCost : 0;
    const effectiveScenePlannerCostUsd = scenePlannerUsed ? scenePlannerCostUsd : 0;

    // Compute actual image credits from OpenRouter usage via Neutral Cost quote.
    // If usage is missing, fall back to API-based estimate (imageCreditsCost), not conservative reservation.
    let actualImageCredits = imageCreditsCost;
    let actualImageCostUsd = imageCreditsCost * CREDIT_USD;
    const usedActual = openRouterUsageUsd !== null && openRouterUsageUsd > 0;
    let neutralCostUsedForActual = false;

    if (usedActual) {
      const actualQuote = await quoteUsdCost(openRouterUsageUsd);
      actualImageCredits = actualQuote.credits;
      actualImageCostUsd = actualQuote.billedUsd;
      neutralCostUsedForActual = actualQuote.viaNeutralCost;
    }

    const usedFallbackEstimate = !usedActual;

    // Log when fallback is used for retroactive analysis
    if (usedFallbackEstimate) {
      console.warn(`[Image API] Using fallback estimate for model=${modelId}, gen=${chargeGenerationId}, fallbackCredits=${imageCreditsCost}, reservationCredits=${reservationImageCredits}`);
    }

    // Total actual credits and cost
    const actualTotalCredits = actualImageCredits + effectiveScenePlannerCredits;
    const actualTotalCostUsd = actualImageCostUsd + effectiveScenePlannerCostUsd;

    // Record generation duration for ETA estimation
    const generationDurationMs = Date.now() - generationStartTime;

    // Track if there was a charge shortfall (rare: actual exceeded 35x conservative estimate)
    let chargeShortfall: { wantedCredits: number; chargedCredits: number; shortfall: number } | null = null;

    // Helper to record stats and return success
    const recordStatsAndReturn = async (imageUrl: string) => {
      if (shouldCharge) {
        // Convert reservation to debit after successful generation
        // Pass actual amount to charge based on OpenRouter usage
        const deductResult = await convex.action(api.sessions.deductCredits, {
          sid,
          amount: cost, // Original reserved amount
          modelId,
          generationId: chargeGenerationId,
          costUsd, // Original estimated cost
          actualAmount: actualTotalCredits, // Actual credits to charge
          actualCostUsd: actualTotalCostUsd, // Actual USD cost
          serverSecret,
        });

        if (!deductResult.success) {
          logSettlementEvent({
            context: requestContext,
            outcome: "deduct_failed",
            sid,
            generationId: chargeGenerationId,
            details: { actualCredits: actualTotalCredits },
          });
          // This should rarely happen since we reserved credits, but handle gracefully
          // Release the reservation if conversion fails
          if (reservationMade) {
            await convex
              .action(api.sessions.releaseReservation, {
                sid,
                generationId: chargeGenerationId,
                serverSecret,
              })
              .catch(() => {}); // Ignore release errors
          }
          await updateGenerationRequest("failed", {
            error: "Insufficient credits",
            scenePlannerUsed,
            scenePlanFromCache,
            durationMs: Date.now() - generationStartTime,
          });
          return jsonWithSessionRefresh(
            {
              error: "Insufficient credits",
              requestId: generationRequestId,
              required: actualTotalCredits,
              available:
                "available" in deductResult ? deductResult.available : 0,
            },
            { status: 402 }
          );
        }

        if ("newBalance" in deductResult) {
          updatedCredits = deductResult.newBalance;
        }
        logSettlementEvent({
          context: requestContext,
          outcome: "confirmed",
          sid,
          generationId: chargeGenerationId,
          details: { actualCredits: actualTotalCredits },
        });

        // Handle shortfall case: actual cost exceeded reservation and user couldn't cover the difference
        // In this case, we only charged the reserved amount, not the full actual amount
        if ("shortfall" in deductResult && deductResult.shortfall) {
          logSettlementEvent({
            context: requestContext,
            outcome: "shortfall",
            sid,
            generationId: chargeGenerationId,
            details: {
              reservedCredits: cost,
              wantedCredits: actualTotalCredits,
              shortfall: deductResult.shortfall as number,
            },
          });
          console.warn(
            `[Image API] Shortfall: wanted=${actualTotalCredits} credits, charged=${cost} credits, shortfall=${deductResult.shortfall}, gen=${chargeGenerationId}`
          );
          // Mark that we had a shortfall - response will use reserved amounts instead of actual
          chargeShortfall = {
            wantedCredits: actualTotalCredits,
            chargedCredits: cost,
            shortfall: deductResult.shortfall as number,
          };
        }

        // Log cost comparison for monitoring
        if (usedActual) {
          console.log(`[Image API] Cost comparison: estimated=${estimatedCreditsCost} credits, actual=${actualTotalCredits} credits, openRouterUsd=${openRouterUsageUsd}`);
        }
      }

      // Record generation stats for ETA estimation (don't await - fire and forget)
      convex
        .mutation(api.modelStats.recordGeneration, {
          modelId,
          durationMs: generationDurationMs,
          serverSecret,
        })
        .catch(() => {});

      if (usedActual) {
        try {
          await convex.mutation(api.modelCostStats.recordActualCost, {
            modelId,
            resolution: learnedEstimateResolution,
            actualCredits: actualImageCredits,
            serverSecret,
          });
        } catch (error) {
          console.warn("[Image API] Failed to record learned image cost:", error);
        }
      }

      // Calculate final charged amounts (may differ from actual in rare shortfall case)
      const finalChargedCredits = chargeShortfall?.chargedCredits ?? actualTotalCredits;
      const settledScenePlannerCredits = chargeShortfall
        ? Math.min(effectiveScenePlannerCredits, finalChargedCredits)
        : effectiveScenePlannerCredits;
      const finalChargedImageCredits = chargeShortfall
        ? Math.max(0, finalChargedCredits - settledScenePlannerCredits)
        : actualImageCredits;
      const finalChargedCostUsd = chargeShortfall
        ? settledReservationCostUsd
        : actualTotalCostUsd;
      const settledScenePlannerCostUsd = chargeShortfall
        ? Math.min(effectiveScenePlannerCostUsd, finalChargedCostUsd)
        : effectiveScenePlannerCostUsd;
      const finalChargedImageCostUsd = chargeShortfall
        ? Math.max(0, finalChargedCostUsd - settledScenePlannerCostUsd)
        : actualImageCostUsd;

      const costEventPayload = {
        sid,
        requestId: generationRequestId,
        generationId: chargeGenerationId,
        modelId,
        verseId,
        translationId,
        styleProfileId: styleProfile.id,
        reference,
        aspectRatio,
        resolution,
        scenePlannerUsed,
        scenePlanFromCache,
        usedFallbackEstimate,
        estimatedCreditsCost,
        estimatedCostUsd: estimatedTotalCostUsd,
        reservationCreditsCost,
        reservationCostUsd,
        imageCreditsCost: finalChargedImageCredits,
        imageCostUsd: finalChargedImageCostUsd,
        scenePlannerCredits: settledScenePlannerCredits,
        scenePlannerCostUsd: settledScenePlannerCostUsd,
        actualCreditsCost: finalChargedCredits,
        actualCostUsd: finalChargedCostUsd,
        ...(openRouterUsageUsd !== null ? { openRouterUsageUsd } : {}),
        durationMs: generationDurationMs,
      };

      try {
        await withTimeout(
          convex.action(api.costs.recordImageCostEvent, {
            ...costEventPayload,
            serverSecret,
          }),
          COST_EVENT_PERSIST_TIMEOUT_MS,
          "Cost event persistence timeout"
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logSettlementEvent({
          context: requestContext,
          outcome: "outbox_enqueued",
          sid,
          generationId: chargeGenerationId,
          details: { reason: message },
        });
        console.warn("[Image API] Cost event persistence failed, enqueueing outbox:", message);
        try {
          await convex.action(api.costs.enqueueImageCostEventOutbox, {
            ...costEventPayload,
            enqueueReason: message,
            serverSecret,
          });
        } catch (enqueueError) {
          logApiFailure({
            context: requestContext,
            stage: "cost_event_outbox_enqueue",
            error: enqueueError,
            statusCode: 500,
            sid,
            generationId: chargeGenerationId,
          });
          console.error("[Image API] Failed to enqueue cost event outbox:", enqueueError);
        }
      }

      let savedImageId: string | undefined;
      try {
        const saveResult = await convex.action(api.verseImages.saveImage, {
          verseId,
          imageUrl,
          model: modelId,
          prompt,
          reference,
          verseText,
          chapterTheme: chapterTheme ?? undefined,
          generationNumber: generationNumber ?? undefined,
          promptVersion: PROMPT_VERSION,
          promptInputs,
          translationId,
          provider: getProviderName(modelId),
          providerRequestId,
          creditsCost: finalChargedCredits,
          costUsd: finalChargedCostUsd,
          durationMs: generationDurationMs,
          aspectRatio,
          generationId: chargeGenerationId,
          serverSecret,
        });
        if (saveResult && typeof saveResult.id === "string") {
          savedImageId = saveResult.id;
        }
      } catch (saveError) {
        console.error("[Image API] Failed to persist generated image:", saveError);
      }

      await updateGenerationRequest("succeeded", {
        generationId: chargeGenerationId,
        providerRequestId,
        scenePlannerUsed,
        scenePlanFromCache,
        usedFallbackEstimate,
        actualCreditsCost: finalChargedCredits,
        actualCostUsd: finalChargedCostUsd,
        durationMs: generationDurationMs,
      });

      return jsonWithSessionRefresh(
        {
          requestId: generationRequestId,
          imageUrl,
          ...(savedImageId ? { savedImageId } : {}),
          model: modelId,
          provider: getProviderName(modelId),
          providerRequestId,
          generationId: chargeGenerationId,
          prompt,
          promptVersion: PROMPT_VERSION,
          promptInputs,
          reference,
          translationId,
          verseText,
          chapterTheme: chapterTheme ?? undefined,
          generationNumber: generationNumber ?? undefined,
          // Cost breakdown - actual charged amounts (adjusted for shortfall if applicable)
          creditsCost: finalChargedCredits, // Total credits charged
          imageCreditsCost: finalChargedImageCredits,
          scenePlannerCredits: settledScenePlannerCredits,
          costUsd: finalChargedCostUsd, // Total USD cost
          imageCostUsd: finalChargedImageCostUsd,
          scenePlannerCostUsd: settledScenePlannerCostUsd,
          scenePlannerUsed,
          scenePlanFromCache,
          // Estimation vs actual tracking
          estimatedCreditsCost,
          estimatedCostUsd: estimatedTotalCostUsd,
          openRouterUsageUsd,
          usedActualCost: usedActual,
          usedFallbackEstimate, // true when OpenRouter didn't return usage data
          neutralCostUsedForActual,
          // Shortfall tracking (rare: actual exceeded 35x conservative estimate)
          ...(chargeShortfall && { chargeShortfall }),
          durationMs: generationDurationMs,
          aspectRatio,
          resolution,
          // Only show actual multiplier if model supports resolution
          resolutionMultiplier: modelSupportsResolution ? RESOLUTIONS[resolution].multiplier : 1.0,
          resolutionSupported: modelSupportsResolution,
          ...(updatedCredits !== undefined && { credits: updatedCredits }),
        },
        {
          headers: { "Cache-Control": "private, max-age=3600" },
        }
      );
    };

    if (Array.isArray(message?.images)) {
      for (const image of message.images) {
        const imageUrl = extractImageUrlFromPart(image);
        if (imageUrl) {
          return await recordStatsAndReturn(imageUrl);
        }
      }
    }

    const content = message?.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        const imageUrl = extractImageUrlFromPart(part);
        if (imageUrl) {
          return await recordStatsAndReturn(imageUrl);
        }
      }
    }

    // If no image found, return error and release reservation
    const responseSummary = summarizeNoImageResponse(data);
    const noImageMessage = extractNoImageText(message) ?? "Model returned no image output.";
    console.error(`[Image API] No image in response for model=${modelId}`, responseSummary);
    await releaseReservationIfNeeded();
    await updateGenerationRequest("failed", {
      error: noImageMessage,
      durationMs: Date.now() - generationStartTime,
      scenePlannerUsed,
      scenePlanFromCache,
    });
    return jsonWithSessionRefresh(
      {
        error: "Model returned no image output",
        message: noImageMessage,
        requestId: generationRequestId,
      },
      { status: 500 }
    );
  } catch (error) {
    const timeoutError =
      error instanceof Error &&
      error.message.startsWith(IMAGE_GENERATION_TIMEOUT_MESSAGE_PREFIX);

    if (timeoutError) {
      logApiTimeout({
        context: requestContext,
        stage: "generate_image_handler",
        timeoutMs: EFFECTIVE_IMAGE_TIMEOUT_MS,
        sid,
        generationId: chargeGenerationId,
      });
    } else {
      logApiFailure({
        context: requestContext,
        stage: "generate_image_handler",
        error,
        statusCode: 500,
        sid,
        generationId: chargeGenerationId,
      });
    }
    console.error("Image generation error:", error);
    // Release reservation on failure so user doesn't lose credits
    if (reservationMade) {
      await convex
        .action(api.sessions.releaseReservation, {
          sid,
          generationId: chargeGenerationId,
          serverSecret,
        })
        .catch((releaseError) => {
          logSettlementEvent({
            context: requestContext,
            outcome: "release_failed",
            sid,
            generationId: chargeGenerationId,
            details: { stage: "generate_image_error_handler" },
          });
          logApiFailure({
            context: requestContext,
            stage: "release_reservation_on_error",
            error: releaseError,
            statusCode: 500,
            sid,
            generationId: chargeGenerationId,
          });
          console.error("Failed to release reservation:", releaseError);
        });
    }
    await updateGenerationRequest("failed", {
      error: error instanceof Error ? error.message : "Failed to generate image",
      durationMs: Date.now() - generationStartTime,
      scenePlannerUsed,
      scenePlanFromCache,
    });

    if (timeoutError) {
      return jsonWithSessionRefresh(
        {
          error: "Image generation timed out",
          requestId: generationRequestId,
        },
        { status: 504 }
      );
    }

    return jsonWithSessionRefresh(
      {
        error: "Failed to generate image",
        requestId: generationRequestId,
      },
      { status: 500 }
    );
  }
}
