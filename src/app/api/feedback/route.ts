import { NextResponse } from "next/server";
import { z } from "zod";
import { ConvexError } from "convex/values";
import {
  validateSessionWithIp,
  withSessionRefreshCookie,
  getClientIp,
  hashIp,
} from "@/lib/session";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
import {
  readJsonBodyWithLimit,
  PayloadTooLargeError,
  InvalidJsonError,
} from "@/lib/request-body";
import { api } from "../../../../convex/_generated/api";

// SECURITY: Zod schema with strict length limits to prevent database exhaustion
const feedbackSchema = z.object({
  // "image" reports the saved image named by imageContext.imageId; the server resolves everything else about it.
  kind: z.enum(["general", "image"]).optional(),
  message: z
    .string()
    .min(1, "Message is required")
    .max(5000, "Message too long (max 5000 characters)"),
  verseContext: z
    .object({
      book: z.string().max(100).optional(),
      chapter: z.number().int().positive().optional(),
      verseRange: z.string().max(50).optional(),
    })
    .optional(),
  imageContext: z
    .object({
      imageId: z.string().max(100).optional(),
      model: z.string().max(200).optional(),
      provider: z.string().max(100).optional(),
      aspectRatio: z.string().max(20).optional(),
      dimensions: z.string().max(50).optional(),
      creditsCost: z.number().nonnegative().optional(),
      costUsd: z.number().nonnegative().optional(),
      durationMs: z.number().nonnegative().optional(),
      createdAt: z.number().nonnegative().optional(),
    })
    .optional(),
});

// SECURITY: Limit feedback body size (much smaller than chat since feedback is simple text)
const MAX_FEEDBACK_BODY_SIZE = 10 * 1024; // 10KB

/**
 * POST /api/feedback
 * Submit user feedback.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // SECURITY: Validate request origin
  if (!validateOrigin(request)) {
    return invalidOriginResponse() as NextResponse;
  }

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 }
    );
  }

  let serverSecret: string;
  try {
    serverSecret = getConvexServerSecret();
  } catch {
    console.error("[Feedback API] CONVEX_SERVER_SECRET not configured");
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 }
    );
  }

  // Rate limit by IP hash to prevent spam
  const clientIp = getClientIp(request);
  const ipHash = await hashIp(clientIp);

  const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: ipHash,
    endpoint: "feedback",
    serverSecret,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: "Too many feedback submissions. Please try again later.",
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

  // SECURITY: Read body with enforced size limit
  let rawBody: unknown;
  try {
    rawBody = await readJsonBodyWithLimit(request, MAX_FEEDBACK_BODY_SIZE);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json(
        {
          error: "Payload too large",
          message: `Feedback body exceeds maximum size of ${MAX_FEEDBACK_BODY_SIZE} bytes.`,
        },
        { status: 413 }
      );
    }
    if (error instanceof InvalidJsonError) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to read request body" },
      { status: 400 }
    );
  }

  // SECURITY: Validate with Zod schema (enforces length limits)
  const parseResult = feedbackSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0];
    return NextResponse.json(
      {
        error: "Validation failed",
        message: firstError?.message || "Invalid feedback data",
      },
      { status: 400 }
    );
  }
  const body = parseResult.data;
  const kind = body.kind ?? "general";
  if (kind === "image" && !body.imageContext?.imageId) {
    return NextResponse.json(
      { error: "Validation failed", message: "An image report needs the id of the image it is about." },
      { status: 400 }
    );
  }

  // Get session ID (optional, for context)
  const sessionValidation = await validateSessionWithIp(request);
  const sid =
    sessionValidation.valid && sessionValidation.sid
      ? sessionValidation.sid
      : null;
  const withSessionRefresh = (response: Response) =>
    withSessionRefreshCookie(response, sessionValidation.refreshedToken) as NextResponse;

  // Get user agent
  const userAgent = request.headers.get("user-agent") ?? undefined;

  try {
    const result = await convex.mutation(api.feedback.submitFeedback, {
      message: body.message,
      sid: sid ?? undefined,
      verseContext: body.verseContext,
      // For an image report only the id is forwarded; style, source and versions come from the saved image.
      imageContext: kind === "image" ? { imageId: body.imageContext!.imageId } : body.imageContext,
      userAgent,
      kind,
      serverSecret,
    });

    return withSessionRefresh(NextResponse.json({ success: true, kind, ...("artStyle" in result ? { artStyle: result.artStyle } : {}) }));
  } catch (error) {
    console.error("Feedback submission error:", error);
    const message = error instanceof Error ? error.message : "Failed to submit feedback";
    const unknownImage = error instanceof ConvexError && (error.data as { code?: string } | undefined)?.code === "UNKNOWN_IMAGE";
    return withSessionRefresh(NextResponse.json(
      { error: unknownImage ? "Unknown image" : message, ...(unknownImage ? { message: "That image no longer exists, so it cannot be reported." } : {}) },
      { status: unknownImage ? 404 : 400 }
    ));
  }
}
