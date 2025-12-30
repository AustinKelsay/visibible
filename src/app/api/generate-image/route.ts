import { NextResponse } from "next/server";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_CREDITS_COST,
  fetchImageModels,
  computeCreditsCost,
  getProviderName,
} from "@/lib/image-models";
import { getSessionFromCookies } from "@/lib/session";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

// Disable Next.js server-side caching - let browser cache handle it
export const dynamic = "force-dynamic";

const isImageGenerationEnabled =
  process.env.ENABLE_IMAGE_GENERATION === "true";

// Fallback text if no verse provided
const DEFAULT_TEXT = "In the beginning God created the heaven and the earth.";
const PROMPT_VERSION = "2025-12-30";

export async function GET(request: Request) {
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

  // Get verse text, theme, model, and context from query params
  const { searchParams } = new URL(request.url);
  const verseText = searchParams.get("text") || DEFAULT_TEXT;
  const themeParam = searchParams.get("theme");
  const prevVerseParam = searchParams.get("prevVerse");
  const nextVerseParam = searchParams.get("nextVerse");
  const reference = searchParams.get("reference") || "Scripture";
  const requestedModelId = searchParams.get("model");
  const generationParam = searchParams.get("generation");
  const aspectRatio = "16:9";

  let modelId = DEFAULT_IMAGE_MODEL;
  let modelPricing: string | undefined;
  type ChapterTheme = {
    setting: string;
    palette: string;
    elements: string;
    style: string;
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
    } catch {
      // Ignore parsing errors
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

  if (requestedModelId && requestedModelId !== DEFAULT_IMAGE_MODEL) {
    const result = await fetchImageModels(openRouterApiKey);
    const foundModel = result.models.find(
      (model) => model.id === requestedModelId
    );
    if (foundModel) {
      modelId = requestedModelId;
      modelPricing = foundModel.pricing?.imageOutput;
    }
  } else if (requestedModelId) {
    modelId = requestedModelId;
    // Fetch pricing for default model
    const result = await fetchImageModels(openRouterApiKey);
    const foundModel = result.models.find((model) => model.id === modelId);
    modelPricing = foundModel?.pricing?.imageOutput;
  }

  // Atomic credit reservation before generation (prevents race conditions)
  const convex = getConvexClient();
  const creditsCost = computeCreditsCost(modelPricing);
  const cost = creditsCost ?? DEFAULT_CREDITS_COST;
  const costUsd = cost * 0.01;
  let updatedCredits: number | undefined;
  let shouldCharge = false;
  let reservationMade = false;
  const chargeGenerationId = crypto.randomUUID();
  let sid: string | null = null;

  // If Convex is enabled and we have a session, enforce credit system
  if (convex) {
    sid = await getSessionFromCookies();
    if (!sid) {
      return NextResponse.json(
        { error: "Session required for image generation" },
        { status: 401 }
      );
    }

    // Check if user is admin (unlimited access)
    const session = await convex.query(api.sessions.getSession, { sid });
    if (!session) {
      return NextResponse.json(
        { error: "Session required for image generation" },
        { status: 401 }
      );
    }
    const isAdmin = session?.tier === "admin";

    // Skip credit checks for admin users
    if (!isAdmin) {
      // Atomically reserve credits before generation to prevent race conditions
      const reserveResult = await convex.mutation(api.sessions.reserveCredits, {
        sid,
        amount: cost,
        modelId,
        generationId: chargeGenerationId,
        costUsd,
      });

      if (!reserveResult.success) {
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
  } catch {
    // Ignore parsing errors, continue without context
  }

  // Build prompt with storyboard context for visual continuity
  const aspectRatioInstruction = `Generate the image in WIDESCREEN LANDSCAPE format with a ${aspectRatio} aspect ratio (wide, not square).`;

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

  const promptInputs = {
    reference,
    aspectRatio,
    ...(generationNumber ? { generationNumber } : {}),
    ...(prevVerse ? { prevVerse } : {}),
    ...(nextVerse ? { nextVerse } : {}),
  };

  const noTextInstruction = `ABSOLUTE RULE: The image must contain ZERO text of any kind.
No letters, words, numbers, punctuation, symbols, runes, glyphs, sigils, logos, watermarks, captions, subtitles, labels, signage, banners, or inscriptions.
Do not render the verse text or any readable/unreadable text-like marks; use purely visual storytelling.
If a surface would normally contain writing (scrolls, tablets, signs), leave it blank or use non-letter abstract texture.`;
  const styleDirection = "Stylized, painterly, biblical-era, mysterious, expansive; gritty, raw texture; mature, grounded color; avoid photorealism, childish cartoon look, and modern artifacts.";
  const framingInstruction = "FRAMING: cinematic composition (not a photo) filling the frame edge to edge; the scene is reality, not artwork. No borders, frames, canvas, wall-hung paintings, posters, gallery/museum settings, mockups, or letterboxing. Do not leave blank margins. Avoid solid white or empty backgrounds; if there is any negative space, make it atmospheric darkness, clouds, or textured sky/land so the entire 16:9 frame is visually filled. The viewer is IN the scene.";

  let prompt: string;
  if (chapterTheme) {
    prompt = `${noTextInstruction}

Render a stylized biblical-era scene for ${reference}: "${verseText}"${narrativeContext}${generationNote}

Setting: ${chapterTheme.setting}
Visual elements: ${chapterTheme.elements}
Color palette: ${chapterTheme.palette}
Style: ${chapterTheme.style}; ${styleDirection}

${framingInstruction}

${aspectRatioInstruction}`;
  } else {
    prompt = `${noTextInstruction}

Render a stylized biblical-era scene for ${reference}: "${verseText}"${narrativeContext}${generationNote}

Style: ${styleDirection} Luminous, dramatic lighting.

${framingInstruction}

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
        // Specify 16:9 widescreen aspect ratio
        image_config: {
          aspect_ratio: aspectRatio,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter error:", response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const providerRequestId = typeof data?.id === "string" ? data.id : undefined;

    // Record generation duration for ETA estimation
    const generationDurationMs = Date.now() - generationStartTime;

    // Helper to record stats and return success
    const recordStatsAndReturn = async (imageUrl: string) => {
      if (shouldCharge && convex && sid) {
        // Convert reservation to debit after successful generation
        // This is idempotent - if reservation was already converted, it returns success
        const deductResult = await convex.mutation(api.sessions.deductCredits, {
          sid,
          amount: cost,
          modelId,
          generationId: chargeGenerationId,
          costUsd,
        });

        if (!deductResult.success) {
          // This should rarely happen since we reserved credits, but handle gracefully
          // Release the reservation if conversion fails
          if (reservationMade) {
            await convex
              .mutation(api.sessions.releaseReservation, {
                sid,
                generationId: chargeGenerationId,
              })
              .catch(() => {}); // Ignore release errors
          }
          return NextResponse.json(
            {
              error: "Insufficient credits",
              required: cost,
              available:
                "available" in deductResult ? deductResult.available : 0,
            },
            { status: 402 }
          );
        }

        if ("newBalance" in deductResult) {
          updatedCredits = deductResult.newBalance;
        }
      }

      if (convex) {
        // Record generation stats for ETA estimation (don't await - fire and forget)
        convex
          .mutation(api.modelStats.recordGeneration, {
            modelId,
            durationMs: generationDurationMs,
          })
          .catch(() => {});
      }
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
          creditsCost: cost,
          costUsd,
          durationMs: generationDurationMs,
          aspectRatio,
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
    console.error("No image in response:", JSON.stringify(data, null, 2));
    if (reservationMade && convex && sid) {
      await convex
        .mutation(api.sessions.releaseReservation, {
          sid,
          generationId: chargeGenerationId,
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
    if (reservationMade && convex && sid) {
      await convex
        .mutation(api.sessions.releaseReservation, {
          sid,
          generationId: chargeGenerationId,
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
