import { z } from "zod";
import { DEFAULT_CHAT_MODEL, getChatModelPricing } from "@/lib/chat-models";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { validateSessionWithIp, getClientIp, hashIp, withSessionRefreshCookie } from "@/lib/session";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
import { readJsonBodyWithLimit } from "@/lib/request-body";
import { createRequestObservabilityContext, logApiFailure } from "@/lib/observability";
import { BILLING_POLICY_VERSION, chatQuoteTerms } from "@/lib/quotes";
import { api } from "../../../../../convex/_generated/api";

export const dynamic = "force-dynamic";

const quoteRequestSchema = z.object({ model: z.string().max(200).optional() });
const MAX_QUOTE_BODY_SIZE = 4 * 1024;

/**
 * The estimate and maximum charge for one chat turn with the selected model (#60), shown in the composer and accepted
 * by sending. It calls no model and holds nothing. The answer is `{ quote }`; the owner, who is not charged, gets
 * `{ quote: null }`.
 */
export async function POST(req: Request) {
  const requestContext = createRequestObservabilityContext(req, "/api/chat/quote");
  if (!validateOrigin(req)) return invalidOriginResponse();

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const convex = getConvexClient();
  if (!openRouterApiKey || !convex) {
    return Response.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  let serverSecret: string;
  try {
    serverSecret = getConvexServerSecret();
  } catch {
    return Response.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }

  const sessionValidation = await validateSessionWithIp(req);
  if (!sessionValidation.sid || !sessionValidation.valid) {
    return Response.json({ error: sessionValidation.sid ? "Session invalid" : "Session required for chat" }, { status: 401 });
  }
  const sid = sessionValidation.sid;
  const respond = (body: unknown, init?: ResponseInit) =>
    withSessionRefreshCookie(Response.json(body, { ...init, headers: { "Cache-Control": "no-store", ...init?.headers } }), sessionValidation.refreshedToken);

  const ipHash = sessionValidation.currentIpHash ?? await hashIp(getClientIp(req));
  const rateLimit = await convex.mutation(api.rateLimit.checkRateLimit, { identifier: `${ipHash}:${sid}`, endpoint: "chat-quote", serverSecret });
  if (!rateLimit.allowed) {
    return respond({ error: "Rate limit exceeded", retryAfter: rateLimit.retryAfter }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter || 60) } });
  }

  let parsed;
  try {
    parsed = quoteRequestSchema.safeParse(await readJsonBodyWithLimit(req, MAX_QUOTE_BODY_SIZE));
  } catch {
    return respond({ error: "Invalid request" }, { status: 400 });
  }
  if (!parsed.success) return respond({ error: "Invalid request" }, { status: 400 });
  const modelId = parsed.data.model || DEFAULT_CHAT_MODEL;

  const pricing = await getChatModelPricing(modelId, openRouterApiKey);
  const terms = pricing ? chatQuoteTerms(modelId, pricing) : null;
  if (!terms) {
    return respond({ error: "Model not available", message: `The model "${modelId}" is not available or cannot be priced. Please select a different model.` }, { status: 400 });
  }

  try {
    const session = await convex.query(api.sessions.getSession, { sid, serverSecret });
    if (!session) return respond({ error: "Session not found" }, { status: 401 });
    if (session.tier === "admin") return respond({ quote: null });
    if (session.credits < terms.maximumCredits) {
      return respond({ error: "Insufficient credits", required: terms.maximumCredits, available: session.credits }, { status: 402 });
    }
    const quote = await convex.mutation(api.quotes.create, {
      sid, operation: "chat", fingerprint: terms.fingerprint, policyVersion: BILLING_POLICY_VERSION,
      estimateCredits: terms.estimateCredits, maximumCredits: terms.maximumCredits, serverSecret,
    });
    return respond({ quote });
  } catch (error) {
    logApiFailure({ context: requestContext, stage: "chat_quote", error, statusCode: 503, sid });
    return respond({ error: "Service temporarily unavailable", retryable: true }, { status: 503 });
  }
}
