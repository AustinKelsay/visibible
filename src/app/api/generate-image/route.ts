import { NextResponse } from "next/server";
import {
  DEFAULT_IMAGE_MODEL,
  fetchImageModels,
  computeCreditsCost,
  computeAdjustedCreditsCost,
  computeConservativeEstimate,
  computeCreditsFromActualUsage,
  getProviderName,
  CREDIT_USD,
  PREMIUM_MULTIPLIER,
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
  DEFAULT_CHAT_MODEL,
  SCENE_PLANNER_ESTIMATED_TOKENS,
  computeChatCreditsCost,
  getChatModelPricing,
  isModelFree,
} from "@/lib/chat-models";
import { validateSessionWithIp, getClientIp, hashIp } from "@/lib/session";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
import { api } from "../../../../convex/_generated/api";

// Disable Next.js server-side caching - let browser cache handle it
export const dynamic = "force-dynamic";

const isImageGenerationEnabled =
  process.env.ENABLE_IMAGE_GENERATION === "true";

// Fallback text if no verse provided
const DEFAULT_TEXT = "In the beginning God created the heaven and the earth.";
const PROMPT_VERSION = "2026-01-07";
const DEFAULT_STYLE_PROFILE = "classical";
const DEFAULT_SCENE_PLANNER_MODEL = DEFAULT_CHAT_MODEL;
const SCENE_PLAN_MAX_FIELD_LENGTH = 180;
// Scene planner timeout in milliseconds (default 10 seconds, configurable via env var)
const SCENE_PLANNER_TIMEOUT_MS = Number.parseInt(
  process.env.SCENE_PLANNER_TIMEOUT_MS || "10000",
  10
);

type ScenePlan = {
  primarySubject: string;
  action: string;
  setting: string;
  secondaryElements?: string;
  mood?: string;
  timeOfDay?: string;
  composition?: string;
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

export async function GET(request: Request) {
  // SECURITY: Validate request origin
  if (!validateOrigin(request)) {
    return invalidOriginResponse();
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

  // SECURITY: Validate session with IP binding to prevent token theft
  // This ensures the session token's embedded IP hash matches the current request IP
  const sessionValidation = await validateSessionWithIp(request);
  if (!sessionValidation.sid) {
    return NextResponse.json(
      { error: "Session required for image generation" },
      { status: 401 }
    );
  }
  if (!sessionValidation.valid) {
    // IP mismatch detected - possible token theft
    console.warn(
      `[Image API] Session IP mismatch - rejecting request for sid=${sessionValidation.sid.slice(0, 8)}...`
    );
    return NextResponse.json(
      { error: "Session invalid" },
      { status: 401 }
    );
  }
  const sid = sessionValidation.sid;

  // SECURITY: Rate limiting - use IP hash as primary identifier to prevent multi-session bypass
  // Combined with sid for granular tracking per IP+session pair
  // Use currentIpHash from validation when available, otherwise compute it
  const ipHash = sessionValidation.currentIpHash ?? await hashIp(getClientIp(request));
  const rateLimitIdentifier = `${ipHash}:${sid}`;

  const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: rateLimitIdentifier,
    endpoint: "generate-image",
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
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

  // Get verse text, theme, model, and context from query params
  // SECURITY: All user-provided text is sanitized to prevent prompt injection
  const { searchParams } = new URL(request.url);
  const verseText = sanitizeVerseText(searchParams.get("text") || DEFAULT_TEXT);
  const themeParam = searchParams.get("theme");
  const prevVerseParam = searchParams.get("prevVerse")
    ? sanitizeVerseText(searchParams.get("prevVerse")!)
    : null;
  const nextVerseParam = searchParams.get("nextVerse")
    ? sanitizeVerseText(searchParams.get("nextVerse")!)
    : null;
  const reference = sanitizeReference(
    searchParams.get("reference") || "Scripture"
  );
  const requestedModelId = searchParams.get("model");
  const generationParam = searchParams.get("generation");
  const requestedStyleId = searchParams.get("style");
  const requestedAspectRatio = searchParams.get("aspectRatio");
  const requestedResolution = searchParams.get("resolution");

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
  type ChapterTheme = {
    setting: string;
    palette: string;
    elements: string;
    style: string;
  };

  const STYLE_PROFILES: Record<string, StyleProfile> = {
    classical: {
      id: "classical",
      label: "Classical Painterly",
      rendering:
        "Stylized, painterly, biblical-era, mysterious, expansive; epic scale and reverent tone.",
      palette: "Mature, grounded color; rich but restrained contrast.",
      lighting: "Luminous, dramatic lighting.",
      materials: "Gritty, raw texture; avoid polished digital smoothness.",
      composition: "Cinematic, immersive viewpoint; heroic but grounded.",
      negative:
        "Avoid photorealism or a photographic look. Avoid childish/cartoonish styling. Never render as a painting on a wall, gallery piece, or framed artwork—fill the entire canvas edge-to-edge.",
    },
  };

  const parseChapterTheme = (value: string | null): ChapterTheme | null => {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Partial<ChapterTheme>;
      if (
        typeof parsed.setting === "string" &&
        typeof parsed.palette === "string" &&
        typeof parsed.elements === "string" &&
        typeof parsed.style === "string"
      ) {
        return {
          setting: parsed.setting,
          palette: parsed.palette,
          elements: parsed.elements,
          style: parsed.style,
        };
      }
    } catch (e) {
      console.warn("[generate-image] Failed to parse chapterTheme:", {
        value: value?.substring(0, 100),
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
    return null;
  };

  const parseGenerationNumber = (value: string | null): number | null => {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const chapterTheme = parseChapterTheme(themeParam);
  const generationNumber = parseGenerationNumber(generationParam);
  const requestedStyleProfile = requestedStyleId
    ? STYLE_PROFILES[requestedStyleId]
    : undefined;
  const styleProfile = requestedStyleProfile || STYLE_PROFILES[DEFAULT_STYLE_PROFILE];

  if (requestedStyleId && !requestedStyleProfile) {
    return NextResponse.json(
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
      return NextResponse.json(
        {
          error: "Model not available",
          message: `The model "${requestedModelId}" is not available. Please select a different model.`,
        },
        { status: 400 }
      );
    }
    modelId = requestedModelId;
    modelPricing = foundModel.pricing?.imageOutput;
  } else {
    // Use default model, but still validate it exists and has pricing
    const foundModel = result.models.find((model) => model.id === modelId);
    modelPricing = foundModel?.pricing?.imageOutput;
  }

  // SECURITY: Reject models without valid pricing (prevents cost abuse)
  const baseImageCreditsCost = computeCreditsCost(modelPricing);
  if (baseImageCreditsCost === null) {
    return NextResponse.json(
      {
        error: "Model pricing unavailable",
        message: `The model "${modelId}" cannot be priced. Please select a different model.`,
      },
      { status: 400 }
    );
  }

  // Check if this model supports resolution settings
  // Only certain models (currently Gemini) support configurable resolution
  const modelSupportsResolution = supportsResolution(modelId);

  // Apply resolution multiplier only if model supports it
  // This prevents charging users extra for resolution settings that are ignored
  const imageCreditsCost = computeAdjustedCreditsCost(baseImageCreditsCost, resolution, modelId);

  // Compute conservative estimate for reservation (accounts for OpenRouter API pricing discrepancy)
  // The OpenRouter models API often underreports actual costs for multimodal image models
  const baseReservationCredits = computeConservativeEstimate(modelPricing);
  const reservationImageCredits = computeAdjustedCreditsCost(baseReservationCredits, resolution, modelId);

  // Determine scene planner settings early for cost calculation
  const enableScenePlanner = process.env.ENABLE_SCENE_PLANNER !== "false";
  const scenePlannerModel =
    process.env.OPENROUTER_SCENE_PLANNER_MODEL || DEFAULT_SCENE_PLANNER_MODEL;

  // Calculate scene planner cost if enabled and not using a free model
  let scenePlannerCreditsCost = 0;
  let scenePlannerCostUsd = 0;
  if (enableScenePlanner) {
    const scenePlannerPricing = await getChatModelPricing(
      scenePlannerModel,
      openRouterApiKey
    );
    if (
      scenePlannerPricing &&
      !isModelFree({ id: scenePlannerModel, pricing: scenePlannerPricing })
    ) {
      scenePlannerCreditsCost =
        computeChatCreditsCost(scenePlannerPricing, SCENE_PLANNER_ESTIMATED_TOKENS) ?? 0;
      scenePlannerCostUsd = scenePlannerCreditsCost * CREDIT_USD;
    }
  }

  // Estimated cost (what we expect to charge based on API pricing)
  const estimatedCreditsCost = imageCreditsCost + scenePlannerCreditsCost;
  const estimatedImageCostUsd = imageCreditsCost * CREDIT_USD;
  const estimatedTotalCostUsd = estimatedImageCostUsd + scenePlannerCostUsd;

  // Reservation cost (conservative estimate to ensure we have enough)
  const reservationCreditsCost = reservationImageCredits + scenePlannerCreditsCost;
  const reservationCostUsd = reservationCreditsCost * CREDIT_USD;

  // Use reservation amount for atomic credit reservation (higher than expected to cover actual cost)
  const cost = reservationCreditsCost;
  const costUsd = reservationCostUsd;
  let updatedCredits: number | undefined;
  let shouldCharge = false;
  let reservationMade = false;
  const chargeGenerationId = crypto.randomUUID();

  // Check if user is admin (unlimited access)
  const session = await convex.query(api.sessions.getSession, { sid });
  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 401 }
    );
  }
  const isAdmin = session?.tier === "admin";

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
        return NextResponse.json(
          {
            error: "Daily spending limit exceeded",
            dailyLimit: reserveResult.dailyLimit,
            dailySpent: reserveResult.dailySpent,
            remaining: reserveResult.remaining,
          },
          { status: 429 } // Too Many Requests - appropriate for rate/limit exceeded
        );
      }
      return NextResponse.json(
        {
          error: "Insufficient credits",
          required: cost,
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

  // Parse prev/next verse context for storyboard continuity
  let prevVerse: { number: number; text: string; reference?: string } | null = null;
  let nextVerse: { number: number; text: string; reference?: string } | null = null;

  try {
    if (prevVerseParam) prevVerse = JSON.parse(prevVerseParam);
    if (nextVerseParam) nextVerse = JSON.parse(nextVerseParam);
  } catch (e) {
    console.warn("[generate-image] Failed to parse verse context:", {
      prevVerseParam: prevVerseParam?.substring(0, 100),
      nextVerseParam: nextVerseParam?.substring(0, 100),
      error: e instanceof Error ? e.message : "Unknown error",
    });
    // Continue without context - graceful degradation
  }

  // Build prompt with storyboard context for visual continuity
  const aspectRatioLabel = aspectRatio === "21:9" ? "ULTRA-WIDE CINEMATIC" :
    aspectRatio === "3:2" ? "CLASSIC WIDE" : "WIDESCREEN";
  const aspectRatioInstruction = `Generate the image in ${aspectRatioLabel} LANDSCAPE format with a ${aspectRatio} aspect ratio (wide, not square).`;

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
    generationNote = `\n\nNOTE: This is the ${generationNumber}${getOrdinalSuffix(generationNumber)} generation of this image. Create a fresh, diverse interpretation while maintaining the core biblical scene.`;
  }

  // Build narrative context section
  let narrativeContext = "";
  if (prevVerse || nextVerse) {
    narrativeContext = "\n\nNARRATIVE CONTEXT (for visual continuity - this is a storyboard):";
    if (prevVerse) {
      narrativeContext += `\n- Previous scene (v${prevVerse.number}): "${prevVerse.text}"`;
    }
    narrativeContext += `\n- CURRENT SCENE (the verse to illustrate): "${verseText}"`;
    if (nextVerse) {
      narrativeContext += `\n- Next scene (v${nextVerse.number}): "${nextVerse.text}"`;
    }
    narrativeContext += "\n\nThis is part of a visual storyboard through Scripture. Maintain visual consistency with the flow of the narrative while focusing on THIS verse's moment.";
  }

  // Scene planner settings already defined above for cost calculation

  const buildScenePlan = async (): Promise<ScenePlan | null> => {
    if (!enableScenePlanner) return null;
    const scenePlannerPrompt = `You are a scene planner for biblical illustrations. Return ONLY valid JSON.

Rules:
- Single scene only (no collage, no split panels).
- Biblical-era setting, no modern artifacts.
- Do not include any text or written elements.
- Keep it visually depictable, concise, and grounded in the verse.
- Use short phrases (no full sentences).

Return JSON with keys:
primarySubject, action, setting, secondaryElements, mood, timeOfDay, composition

Inputs:
Reference: ${reference}
Verse: "${verseText}"
${prevVerse ? `Previous: "${prevVerse.text}"` : ""}
${nextVerse ? `Next: "${nextVerse.text}"` : ""}
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
        return null;
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

      if (!content) return null;
      const jsonString = extractJsonObject(content) || content.trim();
      const parsed = JSON.parse(jsonString);
      return normalizeScenePlan(parsed);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.warn(
          `[Image API] Scene planner timeout after ${SCENE_PLANNER_TIMEOUT_MS}ms`
        );
      } else {
        console.warn("[Image API] Scene planner error:", error);
      }
      return null;
    }
  };

  const scenePlan = await buildScenePlan();

  // Track whether scene planner was actually used (for partial refund on failure)
  const scenePlannerUsed = scenePlan !== null;

  // If scene planner failed/returned null but we reserved credits for it, issue partial refund
  if (
    scenePlannerCreditsCost > 0 &&
    !scenePlannerUsed &&
    reservationMade &&
    !isAdmin
  ) {
    // Partial refund for unused scene planner credits with retry
    const maxRetries = 3;
    let refundSuccess = false;
    for (let attempt = 1; attempt <= maxRetries && !refundSuccess; attempt++) {
      try {
        await convex.action(api.sessions.addCredits, {
          sid,
          amount: scenePlannerCreditsCost,
          reason: "scene_planner_refund",
          serverSecret,
        });
        refundSuccess = true;
      } catch (refundError) {
        if (attempt < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * Math.pow(2, attempt - 1))
          );
        } else {
          console.error(
            `[Image API] Failed to refund scene planner credits after ${maxRetries} attempts:`,
            refundError
          );
          // Continue with request - user will be over-charged but generation proceeds
        }
      }
    }
  }

  const promptInputs = {
    reference,
    aspectRatio,
    styleProfileId: styleProfile.id,
    ...(scenePlan ? { scenePlan } : {}),
    ...(generationNumber ? { generationNumber } : {}),
    ...(prevVerse ? { prevVerse } : {}),
    ...(nextVerse ? { nextVerse } : {}),
  };

  const priorityRules = `PRIORITY RULES (must follow):
1) ABSOLUTE: ZERO text of any kind. No letters, words, numbers, punctuation, symbols, runes, glyphs, sigils, logos, watermarks, captions, subtitles, labels, signage, banners, or inscriptions. Do not render the verse text or any readable/unreadable text-like marks. If a surface would normally contain writing (scrolls, tablets, signs), leave it blank or use abstract texture.
2) FULL-BLEED IMMERSIVE SCENE: edge-to-edge cinematic composition. No borders, frames, mattes, canvas edges, stretcher bars, wall-hung paintings, posters, prints, photographs, gallery/museum settings, mockups, or letterboxing. Do not depict the scene as artwork on a wall or in a frame; the image itself is the scene. No white wall or studio backdrop. Do not leave blank margins. Avoid solid white or empty backgrounds; fill negative space with atmospheric darkness, clouds, or textured sky/land. The viewer is IN the scene.
3) SINGLE SCENE ONLY: no split panels, diptychs, triptychs, insets, collages, or multiple scenes in one frame.`;

  const globalNegatives = `GLOBAL NEGATIVES:
- No modern artifacts or technology (vehicles, screens, guns, electrical lighting, contemporary architecture, modern clothing).
- No anachronistic materials (plastic, neon, LEDs).
- No distorted anatomy (extra limbs/fingers, malformed hands/feet, warped faces).`;

  const scenePlanBlock = scenePlan ? formatScenePlan(scenePlan) : "";

  let prompt: string;
  if (chapterTheme) {
    prompt = `${priorityRules}

SCENE:
Render a single, cohesive biblical-era scene for ${reference}: "${verseText}"${scenePlanBlock}${narrativeContext}${generationNote}

CHAPTER THEME:
Setting: ${chapterTheme.setting}
Visual elements: ${chapterTheme.elements}
Color palette: ${chapterTheme.palette}
Style: ${chapterTheme.style}

STYLE PROFILE: ${styleProfile.label}
Rendering: ${styleProfile.rendering}
${styleProfile.palette ? `Palette: ${styleProfile.palette}` : ""}
${styleProfile.lighting ? `Lighting: ${styleProfile.lighting}` : ""}
${styleProfile.materials ? `Materials/Texture: ${styleProfile.materials}` : ""}
${styleProfile.composition ? `Composition: ${styleProfile.composition}` : ""}

STYLE NEGATIVES:
${styleProfile.negative}

${globalNegatives}

${aspectRatioInstruction}`;
  } else {
    prompt = `${priorityRules}

SCENE:
Render a single, cohesive biblical-era scene for ${reference}: "${verseText}"${scenePlanBlock}${narrativeContext}${generationNote}

STYLE PROFILE: ${styleProfile.label}
Rendering: ${styleProfile.rendering}
${styleProfile.palette ? `Palette: ${styleProfile.palette}` : ""}
${styleProfile.lighting ? `Lighting: ${styleProfile.lighting}` : ""}
${styleProfile.materials ? `Materials/Texture: ${styleProfile.materials}` : ""}
${styleProfile.composition ? `Composition: ${styleProfile.composition}` : ""}

STYLE NEGATIVES:
${styleProfile.negative}

${globalNegatives}

${aspectRatioInstruction}`;
  }

  try {
    // Use OpenRouter chat completions with Gemini for image generation
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    });

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

    // Compute actual image credits from OpenRouter usage
    // Use API-based estimate as fallback (imageCreditsCost) rather than conservative 35x (reservationImageCredits)
    const { credits: actualImageCredits, usedActual } = computeCreditsFromActualUsage(
      openRouterUsageUsd,
      imageCreditsCost // Fall back to API-based estimate, not conservative 35x
    );
    const usedFallbackEstimate = !usedActual;

    // Log when fallback is used for retroactive analysis
    if (usedFallbackEstimate) {
      console.warn(`[Image API] Using fallback estimate for model=${modelId}, gen=${chargeGenerationId}, fallbackCredits=${imageCreditsCost}, reservationCredits=${reservationImageCredits}`);
    }

    // Total actual credits and cost
    const actualTotalCredits = actualImageCredits + effectiveScenePlannerCredits;
    const actualImageCostUsd = usedActual && openRouterUsageUsd !== null
      ? openRouterUsageUsd * PREMIUM_MULTIPLIER
      : actualImageCredits * CREDIT_USD;
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
          return NextResponse.json(
            {
              error: "Insufficient credits",
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

        // Handle shortfall case: actual cost exceeded reservation and user couldn't cover the difference
        // In this case, we only charged the reserved amount, not the full actual amount
        if ("shortfall" in deductResult && deductResult.shortfall) {
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
        })
        .catch(() => {});

      // Calculate final charged amounts (may differ from actual in rare shortfall case)
      const finalChargedCredits = chargeShortfall?.chargedCredits ?? actualTotalCredits;
      const finalChargedImageCredits = chargeShortfall
        ? Math.max(0, chargeShortfall.chargedCredits - effectiveScenePlannerCredits)
        : actualImageCredits;
      const finalChargedCostUsd = chargeShortfall ? costUsd : actualTotalCostUsd;
      const finalChargedImageCostUsd = chargeShortfall
        ? Math.max(0, costUsd - effectiveScenePlannerCostUsd)
        : actualImageCostUsd;

      return NextResponse.json(
        {
          imageUrl,
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
          scenePlannerCredits: effectiveScenePlannerCredits,
          costUsd: finalChargedCostUsd, // Total USD cost
          imageCostUsd: finalChargedImageCostUsd,
          scenePlannerCostUsd: effectiveScenePlannerCostUsd,
          scenePlannerUsed,
          // Estimation vs actual tracking
          estimatedCreditsCost,
          estimatedCostUsd: estimatedTotalCostUsd,
          openRouterUsageUsd,
          usedActualCost: usedActual,
          usedFallbackEstimate, // true when OpenRouter didn't return usage data
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
    if (reservationMade) {
      await convex
        .action(api.sessions.releaseReservation, {
          sid,
          generationId: chargeGenerationId,
          serverSecret,
        })
        .catch((releaseError) => {
          console.error("Failed to release reservation:", releaseError);
        });
    }
    return NextResponse.json(
      { error: "No image generated - model may not support image output" },
      { status: 500 }
    );
  } catch (error) {
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
          console.error("Failed to release reservation:", releaseError);
        });
    }
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
