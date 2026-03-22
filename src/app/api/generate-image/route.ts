import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_IMAGE_MODEL,
  fetchImageModels,
  computeCreditsCost,
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
  supportsResolution,
  ImageAspectRatio,
  ImageResolution,
} from "@/lib/image-models";
import {
} from "@/lib/chat-models";
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

// Fallback text if no verse provided
const DEFAULT_TEXT = "In the beginning God created the heaven and the earth.";
const PROMPT_VERSION = "2026-03-19";
const DEFAULT_STYLE_PROFILE = "classical";
const DEFAULT_TRANSLATION_ID = "default";
const SCENE_PLAN_MAX_FIELD_LENGTH = 180;
const PROMPT_MAX_CHARS = 2800;
const CONTINUITY_HINT_MAX_CHARS = 160;
const SCENE_PLANNER_VERSE_MAX_CHARS = 280;
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

type ScenePlan = {
  primarySubject: string;
  action: string;
  setting: string;
  secondaryElements?: string;
  mood?: string;
  timeOfDay?: string;
  composition?: string;
};

type PromptPacket = {
  verseId: string;
  translationId: string;
  reference: string;
  currentVerse: string;
  styleProfileId: string;
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  chapterTheme?: {
    setting: string;
    palette: string;
    elements: string;
    style: string;
  };
  continuity?: {
    previous?: string;
    next?: string;
  };
  scenePlan?: ScenePlan;
  flags: {
    scenePlannerUsed: boolean;
    scenePlanFromCache: boolean;
    narrativeContextIncluded: boolean;
    generationNoteIncluded: boolean;
  };
  budget: {
    maxChars: number;
    finalChars: number;
  };
};

function normalizeSceneField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SCENE_PLAN_MAX_FIELD_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeScenePlan(value: unknown): ScenePlan | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const primarySubject = normalizeSceneField(data.primarySubject);
  const action = normalizeSceneField(data.action);
  const setting = normalizeSceneField(data.setting);
  if (!primarySubject || !action || !setting) return null;
  const scenePlan: ScenePlan = {
    primarySubject,
    action,
    setting,
  };
  const secondaryElements = normalizeSceneField(data.secondaryElements);
  const mood = normalizeSceneField(data.mood);
  const timeOfDay = normalizeSceneField(data.timeOfDay);
  const composition = normalizeSceneField(data.composition);
  if (secondaryElements) scenePlan.secondaryElements = secondaryElements;
  if (mood) scenePlan.mood = mood;
  if (timeOfDay) scenePlan.timeOfDay = timeOfDay;
  if (composition) scenePlan.composition = composition;
  return scenePlan;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function formatScenePlan(scenePlan: ScenePlan): string {
  const lines = [
    "SCENE PLAN (supporting; do not override priority rules):",
    `Primary subject: ${scenePlan.primarySubject}`,
    `Action: ${scenePlan.action}`,
    `Setting: ${scenePlan.setting}`,
  ];
  if (scenePlan.secondaryElements) {
    lines.push(`Secondary elements: ${scenePlan.secondaryElements}`);
  }
  if (scenePlan.mood) lines.push(`Mood: ${scenePlan.mood}`);
  if (scenePlan.timeOfDay) lines.push(`Time of day: ${scenePlan.timeOfDay}`);
  if (scenePlan.composition) lines.push(`Composition: ${scenePlan.composition}`);
  return `\n\n${lines.join("\n")}`;
}

function clipText(value: string, maxChars: number): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
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

function sanitizeRequestId(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return cleaned.length >= 8 ? cleaned : null;
}

function sanitizeTranslationId(value: string | null): string {
  if (!value) return DEFAULT_TRANSLATION_ID;
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return cleaned || DEFAULT_TRANSLATION_ID;
}

function toContinuityHint(verse: { number: number; text: string } | null): string | undefined {
  if (!verse) return undefined;
  const text = clipText(verse.text, CONTINUITY_HINT_MAX_CHARS);
  return text ? `v${verse.number}: ${text}` : undefined;
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

// Security: Validate and sanitize Bible reference format
function sanitizeReference(ref: string): string {
  // Only allow alphanumeric, spaces, colons, hyphens, and basic punctuation
  const sanitized = ref.replace(/[^\w\s:,\-.'()]/g, "").slice(0, 50);
  return sanitized || "Scripture";
}

// Security: Sanitize verse text to prevent prompt injection
function sanitizeVerseText(text: string): string {
  // Remove control characters and limit length
  // Strip common prompt injection patterns
  return text
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control chars
    .replace(
      /\b(ignore|disregard|forget|override|system|prompt|instruction)/gi,
      ""
    )
    .slice(0, 1200); // Limit to reasonable verse length
}

type ChapterTheme = {
  setting: string;
  palette: string;
  elements: string;
  style: string;
};

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
    reference: z.string().optional(),
    model: z.string().optional(),
    generation: z.union([z.number().finite(), z.string()]).optional(),
    style: z.string().optional(),
    aspectRatio: z.string().optional(),
    resolution: z.string().optional(),
    translation: z.string().optional(),
    requestId: z.string().optional(),
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

  // Get verse text, theme, model, and context from JSON body.
  // SECURITY: All user-provided text is sanitized to prevent prompt injection.
  const verseText = sanitizeVerseText(requestBody.text || DEFAULT_TEXT);
  const reference = sanitizeReference(requestBody.reference || "Scripture");
  const requestedModelId = requestBody.model;
  const requestedStyleId = requestBody.style;
  const requestedAspectRatio = requestBody.aspectRatio;
  const requestedResolution = requestBody.resolution;
  const translationId = sanitizeTranslationId(requestBody.translation ?? null);
  const clientRequestId =
    sanitizeRequestId(requestBody.requestId ?? null) || crypto.randomUUID();
  const verseId = toVerseId(reference);

  // Validate and set aspect ratio (default: 16:9)
  const aspectRatio: ImageAspectRatio = requestedAspectRatio && isValidAspectRatio(requestedAspectRatio)
    ? requestedAspectRatio
    : DEFAULT_ASPECT_RATIO;

  // Validate and set resolution (default: 1K)
  const resolution: ImageResolution = requestedResolution && isValidResolution(requestedResolution)
    ? requestedResolution
    : DEFAULT_RESOLUTION;

  let modelId = DEFAULT_IMAGE_MODEL;
  let modelPricing: string | undefined;
  let modelUsesEmergencyPricing = false;
  type StyleProfile = {
    id: string;
    label: string;
    rendering: string;
    palette?: string;
    lighting?: string;
    materials?: string;
    composition?: string;
    negative: string;
  };

  const STYLE_PROFILES: Record<string, StyleProfile> = {
    classical: {
      id: "classical",
      label: "Classical Painterly",
      rendering:
        "Stylized, painterly, biblical-era, mysterious, expansive; epic scale and reverent tone. The painterly treatment belongs to the depicted world itself, not to a photographed physical artwork.",
      palette: "Mature, grounded color; rich but restrained contrast.",
      lighting: "Luminous, dramatic lighting.",
      materials: "Gritty, raw texture; avoid polished digital smoothness.",
      composition: "Cinematic, immersive viewpoint; heroic but grounded.",
      negative:
        "Avoid photorealism or a photographic look. Avoid childish/cartoonish styling. Never present the scene as a painting on a wall, gallery piece, framed artwork, mural, poster, manuscript page, or printed illustration. Do not show canvas texture, paper edges, matting, border, mockup, or surrounding room. The depicted world must fill the image edge-to-edge.",
    },
  };

  /**
   * Parses and sanitizes a verse context object from the request body.
   * Accepts either a verse-shaped object or a JSON string (backward compatibility).
   * Returns null if the value is not valid.
   */
  function parseVerseContext(
    value: unknown
  ): { number: number; text: string; reference?: string } | null {
    let obj: Record<string, unknown> | null = null;
    if (value && typeof value === "object") {
      obj = value as Record<string, unknown>;
    } else if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    if (!obj) return null;
    const text = obj?.text;
    if (typeof text !== "string") return null;
    const number =
      typeof obj.number === "number" && Number.isFinite(obj.number)
        ? obj.number
        : 0;
    const reference =
      typeof obj.reference === "string" ? obj.reference : undefined;
    return {
      number,
      text: sanitizeVerseText(text),
      ...(reference !== undefined ? { reference } : {}),
    };
  }

  const parseChapterTheme = (
    value: GenerateImageRequestBody["theme"]
  ): ChapterTheme | null => {
    if (!value) return null;
    if (typeof value === "object") {
      return value;
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      const themeParse = chapterThemeSchema.safeParse(parsed);
      if (themeParse.success) {
        return themeParse.data;
      }
    } catch (e) {
      console.warn("[generate-image] Failed to parse chapterTheme:", {
        value: value?.substring(0, 100),
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
    return null;
  };

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

  const chapterTheme = parseChapterTheme(requestBody.theme);
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
    modelId = requestedModelId;
    modelPricing = foundModel.pricing?.imageOutput;
    modelUsesEmergencyPricing = foundModel.usesEmergencyPricing === true;
  } else {
    // Use default model, but still validate it exists and has pricing
    const foundModel = result.models.find((model) => model.id === modelId);
    modelPricing = foundModel?.pricing?.imageOutput;
    modelUsesEmergencyPricing = foundModel?.usesEmergencyPricing === true;
  }

  // SECURITY: Reject models without valid pricing (prevents cost abuse)
  const parsedModelPricingUsd = modelPricing ? Number.parseFloat(modelPricing) : Number.NaN;
  const legacyBaseImageCreditsCost = computeCreditsCost(modelPricing);
  if (
    legacyBaseImageCreditsCost === null ||
    !Number.isFinite(parsedModelPricingUsd) ||
    parsedModelPricingUsd <= 0
  ) {
    return jsonWithSessionRefresh(
      {
        error: "Model pricing unavailable",
        message: `The model "${modelId}" cannot be priced. Please select a different model.`,
      },
      { status: 400 }
    );
  }

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

  const baseImageQuote = await quoteUsdCost(parsedModelPricingUsd);
  const baseImageCreditsCost = baseImageQuote.credits;

  // Check if this model supports resolution settings
  // Only certain models (currently Gemini) support configurable resolution
  const modelSupportsResolution = supportsResolution(modelId);

  // Apply resolution multiplier only if model supports it
  // This prevents charging users extra for resolution settings that are ignored
  const imageCreditsCost = computeAdjustedCreditsCost(baseImageCreditsCost, resolution, modelId);

  // Compute conservative estimate for reservation (accounts for OpenRouter API pricing discrepancy)
  // The OpenRouter models API often underreports actual costs for multimodal image models
  // Emergency fallback prices are already conservative final-price baselines.
  // Avoid applying the catalog underreporting multiplier twice in outage mode.
  const reservationMultiplier = modelUsesEmergencyPricing
    ? 1
    : CONSERVATIVE_ESTIMATE_MULTIPLIER;
  const baseReservationCredits = Math.ceil(
    baseImageCreditsCost * reservationMultiplier
  );
  const reservationImageCredits = computeAdjustedCreditsCost(
    baseReservationCredits,
    resolution,
    modelId
  );

  // Determine scene planner settings early for cost calculation
  const enableScenePlanner = isScenePlannerEnabled();
  const scenePlannerModel = getScenePlannerModelId();

  // Phase 2: check scene plan cache before deciding planner cost.
  let cachedScenePlan: ScenePlan | null = null;
  let scenePlanFromCache = false;
  if (enableScenePlanner) {
    try {
      const cacheEntry = await convex.mutation(api.verseImages.getScenePlanCache, {
        verseId,
        translationId,
        styleProfileId: styleProfile.id,
        serverSecret,
      });
      const normalizedCached = cacheEntry?.scenePlan
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
  const chargeGenerationId = crypto.randomUUID();

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

  const createGenerationRequest = async () => {
    if (generationRequestCreated) return;
    try {
      await convex.mutation(api.verseImages.createGenerationRequest, {
        requestId: generationRequestId,
        sid,
        verseId,
        translationId,
        reference,
        modelId,
        aspectRatio,
        resolution,
        promptVersion: PROMPT_VERSION,
        scenePlannerModel: scenePlannerModel,
        estimatedCreditsCost,
        estimatedCostUsd: estimatedTotalCostUsd,
        serverSecret,
      });
      generationRequestCreated = true;
    } catch (error) {
      console.warn("[Image API] Failed to create generation request:", error);
    }
  };

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

  await createGenerationRequest();

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

  // Parse prev/next verse context for storyboard continuity (from request body, no JSON round-trip)
  const prevVerse = parseVerseContext(requestBody.prevVerse);
  const nextVerse = parseVerseContext(requestBody.nextVerse);

  const aspectRatioLabel = aspectRatio === "21:9"
    ? "ULTRA-WIDE CINEMATIC"
    : aspectRatio === "3:2"
      ? "CLASSIC WIDE"
      : "WIDESCREEN";
  const aspectRatioInstruction = `Aspect ratio: ${aspectRatio} (${aspectRatioLabel} landscape).`;

  /**
   * Get ordinal suffix for a number (1st, 2nd, 3rd, 4th, etc.)
   */
  function getOrdinalSuffix(n: number): string {
    const j = n % 10;
    const k = n % 100;
    if (j === 1 && k !== 11) return "st";
    if (j === 2 && k !== 12) return "nd";
    if (j === 3 && k !== 13) return "rd";
    return "th";
  }

  // Add generation diversity for non-first images
  let generationNote = "";
  if (generationNumber && generationNumber > 1) {
    generationNote = `\n\nVariation note: ${generationNumber}${getOrdinalSuffix(generationNumber)} generation for this verse. Keep the same canonical scene, but vary composition and camera feel.`;
  }

  const prevHint = toContinuityHint(prevVerse);
  const nextHint = toContinuityHint(nextVerse);

  // Scene planner settings already defined above for cost calculation
  await updateGenerationRequest("planning");

  const buildScenePlan = async (): Promise<{
    scenePlan: ScenePlan | null;
    fromCache: boolean;
  }> => {
    if (cachedScenePlan) {
      void convex
        .mutation(api.verseImages.markScenePlanCacheHit, {
          verseId,
          translationId,
          styleProfileId: styleProfile.id,
          serverSecret,
        })
        .catch((error) => {
          console.warn("[Image API] Scene plan cache hit update failed:", error);
        });
      return { scenePlan: cachedScenePlan, fromCache: true };
    }
    if (!enableScenePlanner) return { scenePlan: null, fromCache: false };
    const scenePlannerPrompt = `You are a scene planner for biblical illustrations. Return ONLY valid JSON.

Rules:
- Single scene only (no collage, no split panels).
- Biblical-era setting, no modern artifacts.
- Do not include any text or written elements.
- Keep it visually depictable, concise, and grounded in the verse.
- Use short phrases (no full sentences).
- Describe an immersive in-world scene, not an artwork object, poster, mural, or gallery presentation.
- Favor environmental backgrounds over blank white, cream, or beige backdrops.

Return JSON with keys:
primarySubject, action, setting, secondaryElements, mood, timeOfDay, composition

Inputs:
Reference: ${reference}
Verse: "${clipText(verseText, SCENE_PLANNER_VERSE_MAX_CHARS)}"
${prevVerse ? `Previous: "${clipText(prevVerse.text, SCENE_PLANNER_VERSE_MAX_CHARS)}"` : ""}
${nextVerse ? `Next: "${clipText(nextVerse.text, SCENE_PLANNER_VERSE_MAX_CHARS)}"` : ""}
${chapterTheme ? `Theme setting: ${chapterTheme.setting}` : "Theme setting: none"}
${chapterTheme ? `Theme elements: ${chapterTheme.elements}` : "Theme elements: none"}
Style profile: ${styleProfile.label} (${styleProfile.rendering})`;

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
            verseId,
            translationId,
            styleProfileId: styleProfile.id,
            scenePlan: normalized,
            plannerModel: scenePlannerModel,
            promptVersion: PROMPT_VERSION,
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

  const includeNarrativeContext = Boolean(prevHint || nextHint);
  const narrativeContext = includeNarrativeContext
    ? [
      "",
      "",
      "NARRATIVE CONTINUITY:",
      ...(prevHint ? [`- Previous: ${prevHint}`] : []),
      ...(nextHint ? [`- Next: ${nextHint}`] : []),
      "Keep continuity cues only; focus composition on the current verse moment.",
    ].join("\n")
    : "";

  const promptInputs = {
    reference,
    aspectRatio,
    styleProfileId: styleProfile.id,
    ...(scenePlan ? { scenePlan } : {}),
    ...(generationNumber ? { generationNumber } : {}),
    ...(prevVerse ? { prevVerse: { ...prevVerse, text: clipText(prevVerse.text, CONTINUITY_HINT_MAX_CHARS) } } : {}),
    ...(nextVerse ? { nextVerse: { ...nextVerse, text: clipText(nextVerse.text, CONTINUITY_HINT_MAX_CHARS) } } : {}),
  };

  const priorityRules = `PRIORITY RULES:
1) No text or symbols anywhere (letters, numbers, signage, labels, logos, watermarks, inscriptions).
2) Full-bleed immersive scene only (no frame, border, canvas-on-wall, poster, mockup, visible paper, matting, or blank backdrop).
3) Single unified scene only (no split panels, collage, or multi-scene layout).`;

  const globalNegatives = `GLOBAL NEGATIVES:
- No modern artifacts or technology (vehicles, screens, guns, electric fixtures, modern buildings, modern clothing).
- No anachronistic materials (plastic, neon, LEDs).
- No blank white, cream, or beige background; no gallery wall, studio sweep, paper backdrop, or empty negative-space presentation.
- No distorted anatomy (extra limbs/fingers, malformed hands/feet, warped faces).`;

  const scenePresentation = `SCENE PRESENTATION:
- Depict the moment directly, as if the viewer is present inside the biblical scene.
- The image itself is the scene, not a photo of a painting, fresco, mural, manuscript, print, or gallery installation.
- Extend scenery, sky, cloud, darkness, architecture, foliage, or atmosphere all the way to the edges.
- Background must be environmental and in-world, never a blank white/cream/beige backdrop or studio sweep.`;

  const scenePlanBlock = scenePlan ? formatScenePlan(scenePlan) : "";
  const styleSummary = [
    `STYLE PROFILE: ${styleProfile.label}`,
    `Rendering: ${styleProfile.rendering}`,
    styleProfile.palette ? `Palette: ${styleProfile.palette}` : "",
    styleProfile.lighting ? `Lighting: ${styleProfile.lighting}` : "",
    styleProfile.materials ? `Materials/Texture: ${styleProfile.materials}` : "",
    styleProfile.composition ? `Composition: ${styleProfile.composition}` : "",
    "",
    "STYLE NEGATIVES:",
    styleProfile.negative,
  ]
    .filter(Boolean)
    .join("\n");

  const buildPrompt = (options: {
    includeNarrative: boolean;
    includeGenerationNote: boolean;
    includeFullStyleDetails: boolean;
  }): string => {
    const styleBlock = options.includeFullStyleDetails
      ? styleSummary
      : `STYLE PROFILE: ${styleProfile.label}
Rendering: ${styleProfile.rendering}

STYLE NEGATIVES:
${styleProfile.negative}`;

    const chapterThemeBlock = chapterTheme
      ? `CHAPTER THEME:
Setting: ${chapterTheme.setting}
Visual elements: ${chapterTheme.elements}
Color palette: ${chapterTheme.palette}
Style: ${chapterTheme.style}

`
      : "";

    const generationBlock = options.includeGenerationNote ? generationNote : "";
    const continuityBlock = options.includeNarrative ? narrativeContext : "";

    return `${priorityRules}

SCENE:
Render a single, cohesive biblical-era scene for ${reference}: "${clipText(verseText, 900)}"${scenePlanBlock}${continuityBlock}${generationBlock}

${scenePresentation}

${chapterThemeBlock}${styleBlock}

${globalNegatives}

${aspectRatioInstruction}`;
  };

  let includeNarrative = includeNarrativeContext;
  let includeGeneration = Boolean(generationNote);
  let includeFullStyle = true;
  let prompt = buildPrompt({
    includeNarrative,
    includeGenerationNote: includeGeneration,
    includeFullStyleDetails: includeFullStyle,
  });

  if (prompt.length > PROMPT_MAX_CHARS && includeGeneration) {
    includeGeneration = false;
    prompt = buildPrompt({
      includeNarrative,
      includeGenerationNote: includeGeneration,
      includeFullStyleDetails: includeFullStyle,
    });
  }

  if (prompt.length > PROMPT_MAX_CHARS && includeFullStyle) {
    includeFullStyle = false;
    prompt = buildPrompt({
      includeNarrative,
      includeGenerationNote: includeGeneration,
      includeFullStyleDetails: includeFullStyle,
    });
  }

  if (prompt.length > PROMPT_MAX_CHARS && includeNarrative) {
    includeNarrative = false;
    prompt = buildPrompt({
      includeNarrative,
      includeGenerationNote: includeGeneration,
      includeFullStyleDetails: includeFullStyle,
    });
  }

  if (prompt.length > PROMPT_MAX_CHARS) {
    prompt = prompt.slice(0, PROMPT_MAX_CHARS).trimEnd();
  }

  const promptPacket: PromptPacket = {
    verseId,
    translationId,
    reference,
    currentVerse: clipText(verseText, 350),
    styleProfileId: styleProfile.id,
    aspectRatio,
    resolution,
    ...(chapterTheme ? { chapterTheme } : {}),
    ...((prevHint || nextHint) ? { continuity: { ...(prevHint ? { previous: prevHint } : {}), ...(nextHint ? { next: nextHint } : {}) } } : {}),
    ...(scenePlan ? { scenePlan } : {}),
    flags: {
      scenePlannerUsed,
      scenePlanFromCache,
      narrativeContextIncluded: includeNarrative,
      generationNoteIncluded: includeGeneration,
    },
    budget: {
      maxChars: PROMPT_MAX_CHARS,
      finalChars: prompt.length,
    },
  };

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
          // Specify aspect ratio and conditionally include resolution
          // image_size is only supported by certain models (currently Gemini)
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

    // OpenRouter returns images in a separate "images" field
    if (message?.images && Array.isArray(message.images)) {
      for (const image of message.images) {
        if (image.image_url?.url) {
          return await recordStatsAndReturn(image.image_url.url);
        }
      }
    }

    // Fallback: check content array (some models use this format)
    const content = message?.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          return await recordStatsAndReturn(part.image_url.url);
        }
        if (part.inline_data?.data) {
          const mimeType = part.inline_data.mime_type || "image/png";
          return await recordStatsAndReturn(
            `data:${mimeType};base64,${part.inline_data.data}`
          );
        }
      }
    }

    // If no image found, return error and release reservation
    // SECURITY: Log minimal info to avoid exposing API response structure
    console.error(`[Image API] No image in response for model=${modelId}`);
    await releaseReservationIfNeeded();
    await updateGenerationRequest("failed", {
      error: "No image generated - model may not support image output",
      durationMs: Date.now() - generationStartTime,
      scenePlannerUsed,
      scenePlanFromCache,
    });
    return jsonWithSessionRefresh(
      {
        error: "No image generated - model may not support image output",
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
