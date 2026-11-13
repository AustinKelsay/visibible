import { createOpenAI } from "@ai-sdk/openai";
import { streamText, createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import type { z } from "zod";
import {
  DEFAULT_CHAT_MODEL,
  getChatModelPricing,
  computeActualChatCreditsCost,
  CREDIT_USD,
} from "@/lib/chat-models";
import { BILLING_POLICY_VERSION, CHAT_SYSTEM_PROMPT_TOKEN_ALLOWANCE, QUOTE_STALE_ERROR, QUOTE_STALE_STATUS, chatQuoteTerms } from "@/lib/quotes";
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
import { boundHistory, buildSystemPrompt, chatRequestSchema, estimateTokens, resolveTranslation } from "@/lib/chat-request";

// Allow streaming responses up to 60 seconds: on 11 November 2026 about 6% of answers took over 30 (llm/releases/2026-11-11-chat-model-comparison).
export const maxDuration = 60;

// OpenRouter client via OpenAI-compatible provider.
const openRouter = createOpenAI({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
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
  const validationResult = chatRequestSchema.safeParse(body);
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

  const { messages, context, translation: requestedTranslation, model: requestedModel, quoteId: presentedQuoteId } = validationResult.data;

  const translation = resolveTranslation(requestedTranslation, req.headers.get("cookie"));
  if (!translation) {
    return withSessionRefresh(Response.json(
      { error: "Invalid translation", message: "Unsupported translation. Please select a supported translation." },
      { status: 400 }
    ));
  }

  // SECURITY: The system prompt, including the passage text, is built here from the reference alone.
  const prompt = await buildSystemPrompt(context, translation);
  if (!prompt.ok) {
    return withSessionRefresh(Response.json({ error: prompt.error, message: prompt.message }, { status: prompt.status }));
  }
  const system = prompt.systemPrompt;
  // The quoted maximum prices the system prompt at a fixed allowance, so a longer one is never sent.
  if (estimateTokens(system) > CHAT_SYSTEM_PROMPT_TOKEN_ALLOWANCE) {
    return withSessionRefresh(Response.json(
      { error: "Passage too long", message: "This passage is too long to discuss in one message." },
      { status: 400 }
    ));
  }

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

  // SECURITY: Bound the history and the answer to the model's context window before reserving credits.
  const history = boundHistory(messages, { systemPrompt: system, contextLength: modelPricing.contextLength });
  if (!history.ok) {
    return withSessionRefresh(Response.json({ error: history.error, message: history.message }, { status: history.status }));
  }
  if (history.emptyDropped > 0) {
    console.warn(`[Chat API] Left out ${history.emptyDropped} message(s) with empty content`);
  }

  // The turn's estimate (a typical 2,000-token exchange) and its maximum charge (the bounded input and output).
  const quoteTerms = chatQuoteTerms(modelId, modelPricing);
  const estimatedCredits = quoteTerms?.estimateCredits ?? null;
  if (!quoteTerms || estimatedCredits === null) {
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
  const maximumCredits = quoteTerms.maximumCredits;
  const maximumCostUsd = maximumCredits * CREDIT_USD;

  // Session validation and credit reservation
  const sessionId: string = sid;
  let generationId: string | null = null;
  let creditReserved = false;
  // The hold is the accepted maximum; the charge is actual usage within it.
  const creditAmount = maximumCredits;
  let chargedCredits = 0;
  let acceptedQuoteId: string | null = null;
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
  const settleCredits = (mode: "deduct" | "release", reason: string, usage?: { promptTokens?: number; completionTokens?: number }) => {
    if (!generationId || !creditReserved) {
      return Promise.resolve();
    }
    if (creditSettlement) return creditSettlement;
    const settledGenerationId = generationId;
    creditSettlement = (async () => {
      if (mode === "release") {
        await releaseReservedCredits(reason);
        return;
      }

      // Actual usage, never above the accepted maximum; the accepted estimate unless the provider reported both
      // counts. A reported zero is a count; a missing one is not, and half a report is not usage.
      const counted = (tokens: number | undefined): tokens is number => typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0;
      const actualCredits = usage && counted(usage.promptTokens) && counted(usage.completionTokens)
        ? computeActualChatCreditsCost(modelPricing, usage.promptTokens, usage.completionTokens)
        : null;
      const usedFallbackEstimate = actualCredits === null;
      const toCharge = Math.min(actualCredits ?? estimatedCredits, creditAmount);
      if (actualCredits !== null && actualCredits > creditAmount) {
        logSettlementEvent({ context: requestContext, outcome: "capped", sid: sessionId, generationId: settledGenerationId, details: { maximumCredits: creditAmount, wantedCredits: actualCredits } });
      }

      try {
        const deductResult = await convex.action(api.sessions.deductCredits, {
          sid: sessionId,
          amount: creditAmount,
          modelId,
          generationId: settledGenerationId,
          costUsd: maximumCostUsd,
          actualAmount: toCharge,
          // The daily limit counts what the turn was worth, not only the capped charge.
          actualCostUsd: (actualCredits ?? toCharge) * CREDIT_USD,
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
          chargedCredits = toCharge;
          logSettlementEvent({
            context: requestContext,
            outcome: "confirmed",
            sid: sessionId,
            generationId: settledGenerationId,
            details: { actualCredits: toCharge, usedActual: !usedFallbackEstimate },
          });
          // The stored record of the charge says whether it came from usage or from the estimate.
          if (acceptedQuoteId) {
            await convex.mutation(api.quotes.recordSettlement, {
              quoteId: acceptedQuoteId, usedBy: settledGenerationId, chargedCredits: toCharge, usedFallbackEstimate, serverSecret,
            }).catch((error) => logApiFailure({ context: requestContext, stage: "chat_quote_settlement", error, statusCode: 500, sid: sessionId, generationId: settledGenerationId }));
          }
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
  const session = await convex.query(api.sessions.getSession, { sid: sessionId, serverSecret: getConvexServerSecret() });

  if (!session) {
    return withSessionRefresh(Response.json(
      { error: "Session not found" },
      { status: 401 }
    ));
  }

  // Admin bypasses credit check but we log for audit trail
  if (session.tier !== "admin") {
    // The whole maximum must be affordable, because the whole maximum is held.
    if (session.credits < creditAmount) {
      return withSessionRefresh(Response.json(
        {
          error: "Insufficient credits",
          required: creditAmount,
          available: session.credits,
          message: `This model can use up to ${creditAmount} credits per message.`,
        },
        { status: 402 } // Payment Required
      ));
    }

    // Generate unique ID for this chat request
    generationId = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // The quote the guest accepted must be theirs, unused, unexpired and issued for these prices and bounds. Otherwise
    // the answer is a fresh quote, before any hold or model call.
    const terms = {
      sid: sessionId, operation: "chat" as const, fingerprint: quoteTerms.fingerprint, policyVersion: BILLING_POLICY_VERSION,
      estimateCredits: estimatedCredits, maximumCredits,
    };
    try {
      const acceptance = presentedQuoteId
        ? await convex.mutation(api.quotes.accept, { ...terms, quoteId: presentedQuoteId, usedBy: generationId, serverSecret })
        : { accepted: false as const, reason: "missing" as const };
      if (!acceptance.accepted) {
        return withSessionRefresh(Response.json(
          {
            error: QUOTE_STALE_ERROR,
            message: "The price for this message needs to be confirmed again.",
            reason: acceptance.reason,
            quote: await convex.mutation(api.quotes.create, { ...terms, serverSecret }),
          },
          { status: QUOTE_STALE_STATUS }
        ));
      }
      acceptedQuoteId = presentedQuoteId ?? null;
    } catch (error) {
      logApiFailure({ context: requestContext, stage: "chat_quote", error, statusCode: 503, sid: sessionId });
      return withSessionRefresh(Response.json(
        { error: "Service temporarily unavailable", message: "The price for this message could not be confirmed. Please try again.", retryable: true },
        { status: 503 }
      ));
    }

    // Hold exactly the accepted maximum (converted to the final charge on success, released on failure)
    const reserveResult = await convex.action(api.sessions.reserveCredits, {
      sid: sessionId,
      amount: creditAmount,
      modelId,
      generationId,
      costUsd: maximumCostUsd,
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
    const modelMessages = history.messages;

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
      maxOutputTokens: history.maxOutputTokens,
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
          const readUsage = () => Promise.resolve(result.totalUsage).catch(() => null);
          // A successful turn is charged from its usage; a failed one is released first, whatever its usage.
          let usage = success ? await readUsage() : null;
          await settleCredits(success ? "deduct" : "release", success ? "stream-success" : "stream-failed",
            { promptTokens: usage?.inputTokens, completionTokens: usage?.outputTokens });
          signal.removeEventListener("abort", onAbort);
          if (!success) usage = await readUsage();
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
              creditsCharged: billingStatus === "charged" ? chargedCredits : 0,
              creditsRefunded: billingStatus === "released" ? creditAmount : 0,
              estimatedCredits,
              maximumCredits,
              billingStatus: creditReserved ? billingStatus : "not_required",
              actualCredits: computeActualChatCreditsCost(modelPricing, promptTokens, completionTokens),
              incomplete: success && finish?.finishReason === "length",
              earlierMessagesOmitted: history.omitted,
              maxOutputTokens: history.maxOutputTokens,
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
