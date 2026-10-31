import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import {
  BibleApiLookupError,
  TRANSLATIONS,
  type Translation,
} from "@/lib/bible-api";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { CSRF_COOKIE_NAME, validateCsrfToken } from "@/lib/csrf";
import { resolveGenerationPassage } from "@/lib/generation-passage";
import { invalidOriginResponse, validateOrigin } from "@/lib/origin";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body";
import {
  getClientIp,
  hashIp,
  validateSessionWithIp,
  withSessionRefreshCookie,
} from "@/lib/session";
import {
  isActiveVideoStatus,
  VIDEO_DURATIONS,
  VIDEO_MODEL_ID,
  VIDEO_MODEL_NAME,
  VIDEO_RESOLUTIONS,
  type VideoConfiguration,
  type VideoJobResponse,
} from "@/lib/video-generation";
import { buildVideoPrompt } from "@/lib/video-prompts";
import { fetchVideoQuotes, VideoRequestError } from "@/lib/video-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 4_000;
const NO_STORE = { "Cache-Control": "private, no-store" };

const requestSchema = z
  .object({
    requestId: z.string().uuid(),
    reference: z.string().trim().min(1).max(100),
    translation: z
      .string()
      .refine((value) =>
        Object.prototype.hasOwnProperty.call(TRANSLATIONS, value),
      ),
    duration: z.union([
      z.literal(VIDEO_DURATIONS[0]),
      z.literal(VIDEO_DURATIONS[1]),
    ]),
    resolution: z.enum(VIDEO_RESOLUTIONS),
    maxCredits: z.number().int().positive().max(1_000_000),
  })
  .strict();

function isEnabled() {
  return (
    process.env.ENABLE_VIDEO_GENERATION === "true" &&
    !!process.env.OPENROUTER_API_KEY?.trim()
  );
}

function toVerseId(reference: string) {
  return reference.toLowerCase().replace(/\s+/g, "-").replace(/:/g, "-");
}

/** The user's intent only: never the live quote, maxCredits, or fetched verse text. */
function inputFingerprint(input: z.infer<typeof requestSchema>) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        model: VIDEO_MODEL_ID,
        reference: input.reference.replace(/\s+/g, " ").toLowerCase(),
        translation: input.translation,
        duration: input.duration,
        resolution: input.resolution,
      }),
    )
    .digest("hex");
}

function convexErrorCode(error: unknown): string | null {
  const data = (error as { data?: unknown } | null)?.data;
  return data &&
    typeof data === "object" &&
    typeof (data as { code?: unknown }).code === "string"
    ? (data as { code: string }).code
    : null;
}

const CONVEX_ERRORS: Record<string, [number, string]> = {
  REQUEST_CONFLICT: [
    409,
    "This request ID was used for different video settings.",
  ],
  VIDEO_ACTIVE: [409, "A video is already generating. Wait for it to finish."],
  INSUFFICIENT_CREDITS: [402, "Not enough credits for this video."],
  SPEND_LIMIT: [402, "This video would exceed your spending limit."],
  UNAUTHORIZED: [401, "Your session has expired."],
  INVALID_REQUEST: [400, "Invalid video request."],
};

export async function GET(): Promise<Response> {
  const config: VideoConfiguration = {
    enabled: false,
    model: VIDEO_MODEL_ID,
    modelName: VIDEO_MODEL_NAME,
    quotes: [],
  };
  if (!isEnabled()) return Response.json(config, { headers: NO_STORE });
  try {
    return Response.json(
      { ...config, enabled: true, quotes: await fetchVideoQuotes() },
      { headers: NO_STORE },
    );
  } catch {
    return Response.json(
      { ...config, error: "Video pricing is unavailable right now." },
      { headers: NO_STORE },
    );
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!request.headers.get("origin") || !validateOrigin(request))
    return invalidOriginResponse();
  if (
    !validateCsrfToken(request, request.cookies.get(CSRF_COOKIE_NAME)?.value)
  ) {
    return Response.json(
      { error: "CSRF validation failed." },
      { status: 403, headers: NO_STORE },
    );
  }
  if (!isEnabled())
    return Response.json(
      { error: "Video generation is disabled." },
      { status: 403, headers: NO_STORE },
    );

  const convex = getConvexClient();
  let serverSecret: string;
  try {
    serverSecret = getConvexServerSecret();
  } catch {
    serverSecret = "";
  }
  if (!convex || !serverSecret) {
    return Response.json(
      { error: "Service temporarily unavailable." },
      { status: 503, headers: NO_STORE },
    );
  }

  const session = await validateSessionWithIp(request);
  if (!session.valid || !session.sid) {
    return Response.json(
      { error: "Create a session before generating video." },
      { status: 401, headers: NO_STORE },
    );
  }
  const sid = session.sid;
  const json = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) =>
    withSessionRefreshCookie(
      Response.json(body, { status, headers: { ...NO_STORE, ...headers } }),
      session.refreshedToken,
    );
  const jobResponse = (job: VideoJobResponse) =>
    json(job, isActiveVideoStatus(job.status) ? 202 : 200);
  const convexFailure = (error: unknown) => {
    const mapped = CONVEX_ERRORS[convexErrorCode(error) ?? ""];
    return mapped
      ? json({ error: mapped[1] }, mapped[0])
      : json({ error: "Unable to safely start video generation." }, 503);
  };

  try {
    const ipHash =
      session.currentIpHash ?? (await hashIp(getClientIp(request)));
    const limit = await convex.mutation(api.rateLimit.checkRateLimit, {
      identifier: `${ipHash}:${sid}`,
      endpoint: "generate-video",
      serverSecret,
    });
    if (!limit.allowed) {
      return json(
        {
          error: "Too many video requests. Please wait before trying again.",
          retryAfter: limit.retryAfter,
        },
        429,
        { "Retry-After": String(limit.retryAfter || 60) },
      );
    }
  } catch {
    return json({ error: "Service temporarily unavailable." }, 503);
  }

  let input: z.infer<typeof requestSchema>;
  try {
    const parsed = requestSchema.safeParse(
      await readJsonBodyWithLimit(request, MAX_BODY_BYTES),
    );
    if (!parsed.success) {
      return json(
        {
          error:
            "Provide a request ID, a verse reference, a supported translation, duration 5 or 10, resolution 480p or 768p, and maxCredits.",
        },
        400,
      );
    }
    input = parsed.data;
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return json({ error: "Video request is too large." }, 413);
    if (error instanceof InvalidJsonError)
      return json({ error: "Request body must be valid JSON." }, 400);
    return json({ error: "Failed to read request body." }, 400);
  }
  const fingerprint = inputFingerprint(input);

  // A retry returns the original job before any lookup or requote, so it can never enqueue twice.
  try {
    const existing = await convex.query(api.verseVideos.findRequest, {
      serverSecret,
      sid,
      requestId: input.requestId,
      inputFingerprint: fingerprint,
    });
    if (existing) return jobResponse(existing);
  } catch (error) {
    return convexFailure(error);
  }

  const translation = input.translation as Translation;
  let passage: Awaited<ReturnType<typeof resolveGenerationPassage>>;
  try {
    passage = await resolveGenerationPassage(input.reference, translation);
  } catch (error) {
    const upstream =
      error instanceof BibleApiLookupError ? error.statusCode : undefined;
    return json(
      { error: "Could not verify that verse right now. Please try again." },
      upstream === undefined || upstream === 503 ? 503 : 502,
    );
  }
  if (!passage)
    return json(
      { error: "Choose a single verse available in the selected translation." },
      400,
    );

  let quote;
  try {
    quote = (await fetchVideoQuotes()).find(
      (item) =>
        item.duration === input.duration &&
        item.resolution === input.resolution,
    );
  } catch (error) {
    return json(
      {
        error:
          error instanceof VideoRequestError
            ? error.message
            : "Video pricing is unavailable right now.",
      },
      503,
    );
  }
  if (!quote)
    return json({ error: "Video pricing is unavailable right now." }, 503);
  if (quote.credits > input.maxCredits) {
    return json(
      {
        error:
          "The video price changed. Review the new estimate before generating.",
        code: "QUOTE_CHANGED",
        quote,
      },
      409,
    );
  }

  try {
    const job = await convex.mutation(api.verseVideos.enqueue, {
      serverSecret,
      sid,
      requestId: input.requestId,
      verseId: toVerseId(passage.reference),
      reference: passage.reference,
      translation,
      prompt: buildVideoPrompt(passage, input.duration),
      duration: input.duration,
      resolution: input.resolution,
      estimatedCostUsd: quote.providerCostUsd,
      estimatedCredits: quote.credits,
      inputFingerprint: fingerprint,
    });
    return jobResponse(job);
  } catch (error) {
    return convexFailure(error);
  }
}
