import { createOpenAI } from "@ai-sdk/openai";
import { streamText, createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { z } from "zod";
import {
  DEFAULT_CHAT_MODEL,
  getChatModelPricing,
  computeChatCreditsCost,
  computeActualChatCreditsCost,
  CREDIT_USD,
} from "@/lib/chat-models";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import {
  validateSessionWithIp,
  getClientIp,
  hashIp,
  withSessionRefreshCookie,
} from "@/lib/session";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
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
  logSettlementEvent,
  logWarn,
  redactSid,
} from "@/lib/observability";
import { api } from "../../../../convex/_generated/api";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// OpenRouter client via OpenAI-compatible provider.
const openRouter = createOpenAI({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// SECURITY: Verse context with length limits to prevent token inflation
const verseContextSchema = z.object({
  number: z.number(),
  text: z.string().max(1200),
  reference: z.string().max(100).optional(),
});

// SECURITY: Page context with length limits to prevent token inflation attacks
const pageContextSchema = z.object({
  book: z.string().max(100).optional(),
  chapter: z.number().optional(),
  verseRange: z.string().max(50).optional(),
  heroCaption: z.string().max(500).optional(),
  imageTitle: z.string().max(200).optional(),
  verses: z
    .array(
      z.object({
        number: z.number().optional(),
        text: z.string().max(1200).optional(),
      })
    )
    .max(20) // Limit array length to prevent abuse
    .optional(),
  prevVerse: verseContextSchema.optional(),
  nextVerse: verseContextSchema.optional(),
});
// Note: Removed .passthrough() to reject unknown fields for security

type PageContext = z.infer<typeof pageContextSchema>;

const formatVerses = (verses?: PageContext["verses"]) => {
  if (!verses?.length) return null;

  const compact = verses
    .map((verse) => {
      if (!verse?.text) return null;
      const trimmed = verse.text.trim();
      if (!trimmed) return null;
      return typeof verse.number === "number" ? `${verse.number} ${trimmed}` : trimmed;
    })
    .filter(Boolean)
    .join(" ");

  if (!compact) return null;

  const maxLength = 1200;
  return compact.length > maxLength ? `${compact.slice(0, maxLength).trim()}...` : compact;
};

/**
 * Build a rich, contextual system prompt for the AI.
 * This gives the AI full awareness of where we are in Scripture.
 */
const buildSystemPrompt = (context?: PageContext | string): string => {
  const basePrompt = `You are Visibible, a reverent guide helping users connect deeply with Scripture.`;

  if (!context) {
    return `${basePrompt}\n\nHelp users understand and connect with God's Word. Be spiritually encouraging and keep responses grounded in Scripture.`;
  }

  if (typeof context === "string") {
    const trimmed = context.trim();
    return trimmed.length > 0
      ? `${basePrompt}\n\nContext: ${trimmed}`
      : basePrompt;
  }

  const { book, chapter, verseRange, prevVerse, nextVerse } = context;
  const currentVerseText = formatVerses(context.verses);

  // Build location string (e.g., "Genesis 1:3")
  let location = "";
  if (book) location = book;
  if (typeof chapter === "number") {
    location = location ? `${location} ${chapter}` : `Chapter ${chapter}`;
  }
  if (verseRange) {
    location = location ? `${location}:${verseRange}` : `Verse ${verseRange}`;
  }

  // Build the full system prompt
  let prompt = basePrompt;

  // Add current position
  if (location) {
    prompt += `\n\nCurrent Position: ${location}`;
  }

  // Add scripture context with prev/current/next
  prompt += "\n\nScripture Context:";
  if (prevVerse) {
    prompt += `\n- Previous (v${prevVerse.number}): "${prevVerse.text}"`;
  }
  if (currentVerseText) {
    prompt += `\n- CURRENT${verseRange ? ` (v${verseRange})` : ""}: "${currentVerseText}"`;
  }
  if (nextVerse) {
    prompt += `\n- Next (v${nextVerse.number}): "${nextVerse.text}"`;
  }

  // Add guidance
  prompt += `\n\nHelp users understand this verse in its biblical context. Share its meaning within the chapter and book, its theological significance, and how it connects to the broader story of Scripture. Be spiritually encouraging and help users connect personally with God's Word. Keep responses grounded but offer deeper insight when helpful.`;

  return prompt;
};

/**
 * Schema for message parts. Each part must have a type and corresponding content.
 * For text parts, the text field is required.
 */
const messagePartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
}).passthrough(); // Allow additional fields for extensibility

/**
 * Schema for a single message. Validates id, role (must be one of allowed values),
 * and parts array structure.
 */
const messageSchema = z.object({
  id: z.string().min(1, "Message id must be a non-empty string"),
  role: z.enum(["user", "assistant", "system"], {
    message: "Role must be one of: user, assistant, system",
  }),
  parts: z.array(messagePartSchema).min(1, "Message must have at least one part"),
});

/**
 * Schema for the request body. Must contain a non-empty messages array.
 * Now includes optional model parameter for model selection.
 */
const requestBodySchema = z.object({
  // SECURITY: Limit message count to prevent token inflation attacks
  // 50 messages allows extended conversations while preventing abuse
  messages: z
    .array(messageSchema)
    .min(1, "Request must include at least one message")
    .max(50, "Too many messages. Maximum 50 messages per request."),
  // SECURITY: Limit string context length to prevent token inflation
  context: z
    .union([z.string().min(1).max(2000), pageContextSchema])
    .optional(),
  model: z.string().optional(),
});

/**
 * POST handler for chat API endpoint.
 * Uses OpenRouter exclusively for all chat models.
 * Validates request body using Zod schema and streams AI responses with metadata.
 */
export async function POST(req: Request) {
  const requestContext = createRequestObservabilityContext(req, "/api/chat");

  // SECURITY: Validate request origin
  if (!validateOrigin(req)) {
    return invalidOriginResponse();
  }

  // Validate OpenRouter API key
  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json(
      { error: "OpenRouter API key not configured" },
      { status: 500 }
    );
  }

  // SECURITY: Convex is required for credit management and rate limiting
  const convex = getConvexClient();
  if (!convex) {
    return Response.json(
      { error: "Service temporarily unavailable" },
      { status: 503 }
    );
  }

  // Verify server secret is configured (fail fast with clear error vs cryptic 500 later)
  let serverSecret: string;
  try {
    serverSecret = getConvexServerSecret();
  } catch {
    console.error("[Chat API] CONVEX_SERVER_SECRET not configured");
    return Response.json(
      { error: "Service temporarily unavailable" },
      { status: 503 }
    );
  }

  // SECURITY: Validate the browser session and capture the current IP hash for
  // rate limiting and telemetry. IP changes alone do not invalidate a session.
  const sessionValidation = await validateSessionWithIp(req);
  if (!sessionValidation.sid) {
    return Response.json(
      { error: "Session required for chat" },
      { status: 401 }
    );
  }
  if (!sessionValidation.valid) {
    return Response.json(
      { error: "Session invalid" },
      { status: 401 }
    );
  }
  const sid = sessionValidation.sid;
  const withSessionRefresh = (response: Response) =>
    withSessionRefreshCookie(response, sessionValidation.refreshedToken);

  // SECURITY: Rate limiting - use IP hash as primary identifier to prevent multi-session bypass
  // Combined with sid for granular tracking per IP+session pair
  // Use currentIpHash from validation when available, otherwise compute it
  const ipHash = sessionValidation.currentIpHash ?? await hashIp(getClientIp(req));
  const rateLimitIdentifier = `${ipHash}:${sid}`;

  const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: rateLimitIdentifier,
    endpoint: "chat",
    serverSecret,
  });

  if (!rateLimitResult.allowed) {
    emitMetric("api_rate_limit_blocks_total", {
      route: requestContext.route,
      endpoint: "chat",
    });
    logWarn("api.rate_limited", {
      route: requestContext.route,
      requestId: requestContext.requestId,
      sid: redactSid(sid),
      retryAfter: rateLimitResult.retryAfter,
    });
    return withSessionRefresh(Response.json(
      {
        error: "Rate limit exceeded",
        message: "Too many requests. Please wait before sending more messages.",
        retryAfter: rateLimitResult.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfter || 60),
        },
      }
    ));
  }

  // SECURITY: Read body with enforced size limit
  // This handles both Content-Length and chunked transfer encoding safely
  let body: unknown;
  try {
    body = await readJsonBodyWithLimit(req, DEFAULT_MAX_BODY_SIZE);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return withSessionRefresh(Response.json(
        {
          error: "Payload too large",
          message: `Request body exceeds maximum size of ${error.maxSize} bytes.`,
          maxSize: error.maxSize,
        },
        { status: 413 }
      ));
    }
    if (error instanceof InvalidJsonError) {
      return withSessionRefresh(
        Response.json({ error: "Invalid JSON body" }, { status: 400 })
      );
    }
    return withSessionRefresh(
      Response.json({ error: "Failed to read request body" }, { status: 400 })
    );
  }

  // Validate request body structure and message format
  const validationResult = requestBodySchema.safeParse(body);
  if (!validationResult.success) {
    const errors = validationResult.error.issues.map((err: z.ZodIssue) => {
      const path = err.path.join(".");
      return path ? `${path}: ${err.message}` : err.message;
    });
    return withSessionRefresh(Response.json(
      {
        error: "Validation failed",
        details: errors,
      },
      { status: 400 }
    ));
  }

  const { messages, context, model: requestedModel } = validationResult.data;

  // Use requested model or fall back to default
  const modelId = requestedModel || DEFAULT_CHAT_MODEL;
  const startTime = Date.now();

  // SECURITY: Get model pricing to calculate credit cost
  // Models without valid pricing cannot be used (prevents cost abuse)
  const modelPricing = await getChatModelPricing(
    modelId,
    process.env.OPENROUTER_API_KEY!
  );

  if (!modelPricing) {
    return withSessionRefresh(Response.json(
      {
        error: "Model not available",
        message: `The model "${modelId}" is not available or cannot be priced. Please select a different model.`,
      },
      { status: 400 }
    ));
  }

  // Calculate credit cost based on model pricing (estimated ~2000 tokens)
  const estimatedCredits = computeChatCreditsCost(modelPricing);
  if (estimatedCredits === null) {
    return withSessionRefresh(Response.json(
      {
        error: "Model pricing unavailable",
        message: "Unable to determine cost for this model. Please try a different model.",
      },
      { status: 400 }
    ));
  }

  // SECURITY: Reject requests that would cost more than reasonable per-request limit
  // This prevents cost amplification attacks with expensive models
  const MAX_CREDITS_PER_REQUEST = 100; // $1.00 maximum per single request
  if (estimatedCredits > MAX_CREDITS_PER_REQUEST) {
    return withSessionRefresh(Response.json(
      {
        error: "Request too expensive",
        message: `This model costs approximately ${estimatedCredits} credits per message. Maximum is ${MAX_CREDITS_PER_REQUEST} credits ($1.00). Please select a more affordable model.`,
        estimated: estimatedCredits,
        maximum: MAX_CREDITS_PER_REQUEST,
      },
      { status: 400 }
    ));
  }

  const estimatedCostUsd = estimatedCredits * CREDIT_USD;

  // Session validation and credit reservation
  const sessionId: string = sid;
  let generationId: string | null = null;
  let creditReserved = false;
  const creditAmount = estimatedCredits; // Dynamic cost based on model
  let billingStatus: "pending" | "charged" | "released" | "unresolved" = "pending";

  // Best-effort cleanup for reserved credits to avoid permanently locking balances.
  // Safe to call multiple times because releaseReservation is idempotent.
  const releaseReservedCredits = async (reason: string) => {
    if (!generationId || !creditReserved) return;
    try {
      const released = await convex.action(api.sessions.releaseReservation, {
        sid: sessionId,
        generationId,
        serverSecret,
      });
      if (!released.success) throw new Error("Reservation release did not succeed");
      billingStatus = "released";
      console.log(`[Chat API] Released credit reservation (${reason})`);
      logSettlementEvent({
        context: requestContext,
        outcome: "released",
        sid: sessionId,
        generationId,
        details: { reason },
      });
    } catch (refundErr) {
      billingStatus = "unresolved";
      logSettlementEvent({
        context: requestContext,
        outcome: "release_failed",
        sid: sessionId,
        generationId,
        details: { reason },
      });
      logApiFailure({
        context: requestContext,
        stage: "chat_release_reservation",
        error: refundErr,
        statusCode: 500,
        sid: sessionId,
        generationId,
      });
      console.error(
        `[Chat API] Failed to release credit reservation (${reason}):`,
        refundErr
      );
    }
  };

  let creditSettlement: Promise<void> | null = null;
  const settleCredits = (mode: "deduct" | "release", reason: string) => {
    if (!generationId || !creditReserved) {
      return Promise.resolve();
    }
    if (creditSettlement) return creditSettlement;
    creditSettlement = (async () => {
      if (mode === "release") {
        await releaseReservedCredits(reason);
        return;
      }

      try {
        const deductResult = await convex.action(api.sessions.deductCredits, {
          sid: sessionId,
          amount: creditAmount,
          modelId,
          generationId,
          costUsd: estimatedCostUsd,
          serverSecret,
        });

        if (!deductResult.success) {
          logSettlementEvent({
            context: requestContext,
            outcome: "deduct_failed",
            sid: sessionId,
            generationId,
          });
          console.warn(
            "[Chat API] Reservation conversion failed, releasing credit:",
            deductResult
          );
          await releaseReservedCredits("deduct-failed");
        } else {
          billingStatus = "charged";
          logSettlementEvent({
            context: requestContext,
            outcome: "confirmed",
            sid: sessionId,
            generationId,
          });
        }
      } catch (err) {
        logApiFailure({
          context: requestContext,
          stage: "chat_deduct_credits",
          error: err,
          statusCode: 500,
          sid: sessionId,
          generationId,
        });
        console.error("[Chat API] Failed to convert reservation:", err);
        await releaseReservedCredits("deduct-error");
      }
    })();
    return creditSettlement;
  };

  // Get session to check tier and credits
  const session = await convex.query(api.sessions.getSession, { sid: sessionId });

  if (!session) {
    return withSessionRefresh(Response.json(
      { error: "Session not found" },
      { status: 401 }
    ));
  }

  // Admin bypasses credit check but we log for audit trail
  if (session.tier !== "admin") {
    // Check if user has enough credits for this model
    if (session.credits < creditAmount) {
      return withSessionRefresh(Response.json(
        {
          error: "Insufficient credits",
          required: creditAmount,
          available: session.credits,
          message: `This model requires ${creditAmount} credits per message.`,
        },
        { status: 402 } // Payment Required
      ));
    }

    // Generate unique ID for this chat request
    generationId = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Reserve credits based on model cost (will be converted to deduction on success, refunded on failure)
    const reserveResult = await convex.action(api.sessions.reserveCredits, {
      sid: sessionId,
      amount: creditAmount,
      modelId,
      generationId,
      costUsd: estimatedCostUsd,
      serverSecret,
    });

    if (!reserveResult.success) {
      // Check if failure is due to daily spending limit vs insufficient credits
      if ("dailyLimit" in reserveResult) {
        return withSessionRefresh(Response.json(
          {
            error: "Daily spending limit exceeded",
            dailyLimit: reserveResult.dailyLimit,
            dailySpent: reserveResult.dailySpent,
            remaining: reserveResult.remaining,
          },
          { status: 429 } // Too Many Requests - appropriate for rate/limit exceeded
        ));
      }
      return withSessionRefresh(Response.json(
        { error: reserveResult.error || "Failed to reserve credits" },
        { status: 402 }
      ));
    }

    creditReserved = true;
  } else {
    // SECURITY: Log admin usage for audit trail even though credits aren't charged
    // This enables detection of admin credential compromise
    // IMPORTANT: Await the call to ensure audit trail is reliably written
    try {
      await convex.action(api.sessions.logAdminUsage, {
        sid: sessionId,
        endpoint: "chat",
        modelId,
        estimatedCredits: creditAmount,
        estimatedCostUsd,
        serverSecret,
      });
    } catch (err) {
      console.error("[Chat API] Failed to log admin usage:", err);
      // Continue with the request even if audit logging fails
      // The request should proceed but we've logged the audit failure
    }
  }

  try {
    const system = buildSystemPrompt(context);

    // Convert UIMessages to simple model messages for OpenRouter
    // The AI SDK v6 parts format isn't always properly converted by convertToModelMessages
    const modelMessagesWithMetadata = messages.map((msg, index) => {
      const text = msg.parts
        .filter(
          (p): p is { type: string; text: string } =>
            p.type === "text" && typeof p.text === "string"
        )
        .map((p) => p.text)
        .join("");

      return {
        role: msg.role as "user" | "assistant" | "system",
        content: text,
        originalIndex: index,
        originalId: msg.id,
      };
    });

    // Filter out messages with empty content, preserving order
    const filteredMessages: typeof modelMessagesWithMetadata = [];
    const droppedMessages: Array<{ index: number; role: string; id: string }> = [];

    for (const msg of modelMessagesWithMetadata) {
      if (msg.content.trim().length > 0) {
        filteredMessages.push(msg);
      } else {
        droppedMessages.push({
          index: msg.originalIndex,
          role: msg.role,
          id: msg.originalId,
        });
      }
    }

    // Log dropped messages for debugging
    if (droppedMessages.length > 0) {
      console.warn(
        `[Chat API] Filtered out ${droppedMessages.length} message(s) with empty content:`,
        droppedMessages.map((m) => `[${m.index}] ${m.role} (id: ${m.id})`).join(", ")
      );
    }

    // Ensure at least one non-empty message remains
    if (filteredMessages.length === 0) {
      await releaseReservedCredits("empty-messages");
      return withSessionRefresh(Response.json(
        {
          error: "Invalid request",
          message: "All messages have empty content. At least one message with non-empty content is required.",
        },
        { status: 400 }
      ));
    }

    // Extract clean messages for OpenRouter (remove metadata)
    const modelMessages = filteredMessages.map(({ role, content }) => ({
      role,
      content,
    }));

    if (req.signal.aborted) {
      await settleCredits("release", "request-aborted");
      return withSessionRefresh(Response.json({ error: "Request cancelled" }, { status: 499 }));
    }
    const cancellation = new AbortController();
    const signal = AbortSignal.any([req.signal, cancellation.signal]);
    let failed = false;
    const onAbort = () => {
      failed = true;
      void settleCredits("release", "stream-cancel");
    };
    signal.addEventListener("abort", onAbort, { once: true });
    const result = streamText({
      model: openRouter.chat(modelId),
      system,
      messages: modelMessages,
      abortSignal: signal,
      onError: async () => {
        failed = true;
        await settleCredits("release", "provider-error");
      },
    });

    let hasText = false;
    let finish: Extract<UIMessageChunk, { type: "finish" }> | null = null;
    // Defer the UI finish chunk until the SDK has fully completed and settlement
    // is known. Error chunks are data, not necessarily thrown stream exceptions.
    const settledStream = result.toUIMessageStream().pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform(chunk, controller) {
          if (chunk.type === "text-delta" && chunk.delta.trim()) hasText = true;
          if (chunk.type === "error" || chunk.type === "abort") failed = true;
          if (chunk.type === "finish") finish = chunk;
          else controller.enqueue(chunk);
        },
        async flush(controller) {
          const success = !failed && !signal.aborted && hasText &&
            (finish?.finishReason === "stop" || finish?.finishReason === "length");
          await settleCredits(success ? "deduct" : "release", success ? "stream-success" : "stream-failed");
          signal.removeEventListener("abort", onAbort);
          const usage = await Promise.resolve(result.totalUsage).catch(() => null);
          const promptTokens = usage?.inputTokens ?? 0;
          const completionTokens = usage?.outputTokens ?? 0;
          const finishReason = failed ? "error" : finish?.finishReason ?? "error";
          controller.enqueue({
            type: "finish",
            finishReason,
            messageMetadata: {
              model: modelId,
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
              finishReason,
              latencyMs: Date.now() - startTime,
              creditsCharged: billingStatus === "charged" ? creditAmount : 0,
              creditsRefunded: billingStatus === "released" ? creditAmount : 0,
              billingStatus: creditReserved ? billingStatus : "not_required",
              actualCredits: computeActualChatCreditsCost(modelPricing, promptTokens, completionTokens),
              incomplete: success && finish?.finishReason === "length",
            },
          });
        },
      })
    );
    const reader = settledStream.getReader();
    let cancelled = false;
    const cancelAwareStream = new ReadableStream<UIMessageChunk>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (cancelled) return;
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        } catch (error) {
          signal.removeEventListener("abort", onAbort);
          await settleCredits("release", "stream-error");
          if (!cancelled) controller.error(error);
        }
      },
      async cancel(reason) {
        cancelled = true;
        cancellation.abort(reason);
        await settleCredits("release", "stream-cancel");
        await reader.cancel(reason).catch(() => {});
        signal.removeEventListener("abort", onAbort);
      },
    });
    return withSessionRefresh(createUIMessageStreamResponse({ stream: cancelAwareStream }));
  } catch (error) {
    logApiFailure({
      context: requestContext,
      stage: "chat_handler",
      error,
      statusCode: 500,
      sid: sessionId,
      generationId: generationId ?? undefined,
    });
    console.error("Chat API error:", error);

    // Release reserved credit on failure (refund)
    await releaseReservedCredits("chat-error");

    // Extract error details for user-friendly messages
    const errorObj = error as {
      statusCode?: number;
      responseBody?: string;
      lastError?: { statusCode?: number; responseBody?: string };
      reason?: string;
    };

    // Check for retry errors (AI_RetryError wraps the last error)
    const statusCode = errorObj.statusCode ?? errorObj.lastError?.statusCode;
    const responseBody = errorObj.responseBody ?? errorObj.lastError?.responseBody ?? "";

    // Parse response body for detailed error info
    let errorMessage = "";
    try {
      const parsed = JSON.parse(responseBody);
      errorMessage = parsed?.error?.message ?? "";
    } catch {
      // Ignore JSON parse errors
    }

    // Handle rate limit errors (429)
    if (statusCode === 429 || errorMessage.includes("rate-limited")) {
      return withSessionRefresh(Response.json(
        {
          error: "Rate limit reached",
          message:
            "We're experiencing high demand right now. Please wait a moment and try again. Free models have limited availability.",
          retryable: true,
        },
        { status: 429 }
      ));
    }

    // Handle data policy / no endpoints errors (404)
    if (
      statusCode === 404 ||
      errorMessage.includes("No endpoints found") ||
      errorMessage.includes("data policy")
    ) {
      return withSessionRefresh(Response.json(
        {
          error: "Model temporarily unavailable",
          message:
            "This model is temporarily unavailable. Please try a different model or wait a few minutes.",
          retryable: true,
        },
        { status: 503 }
      ));
    }

    // Handle max retries exceeded
    if (errorObj.reason === "maxRetriesExceeded") {
      return withSessionRefresh(Response.json(
        {
          error: "Service temporarily busy",
          message:
            "The AI service is experiencing high traffic. Please try again in a moment.",
          retryable: true,
        },
        { status: 503 }
      ));
    }

    // Generic fallback
    return withSessionRefresh(Response.json(
      {
        error: "Failed to process chat request",
        message: "Something went wrong. Please try again.",
        retryable: true,
      },
      { status: 500 }
    ));
  }
}
