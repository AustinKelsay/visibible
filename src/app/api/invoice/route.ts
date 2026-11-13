import { NextResponse } from "next/server";
import { validateSessionWithIp, withSessionRefreshCookie } from "@/lib/session";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { getBtcPrice, usdToSats } from "@/lib/btc-price";
import { createLightningInvoice, isLightningConfigured } from "@/lib/lightning";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
import {
  createRequestObservabilityContext,
  emitMetric,
  logApiFailure,
  logWarn,
  redactSid,
} from "@/lib/observability";
import { api } from "../../../../convex/_generated/api";

const DEFAULT_BUNDLE_USD = 3;

function isSupportedBundleAmountUsd(value: unknown): value is 1 | 3 {
  return value === 1 || value === 3;
}

const INTENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** No invoice was shown for this intent and none will be: the buyer starts a new purchase. */
function unresolvedResponse(intentId: string): NextResponse {
  return NextResponse.json(
    {
      error: "We could not confirm that an invoice was created. You have not been charged. Please start a new purchase.",
      code: "invoice_unresolved",
      reference: intentId,
    },
    { status: 409 }
  );
}

/**
 * POST /api/invoice
 * Creates a new Lightning invoice for credit purchase.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestContext = createRequestObservabilityContext(request, "/api/invoice");

  const rawBody = await request.text();
  let amountUsd: 1 | 3 = DEFAULT_BUNDLE_USD;
  // The browser keeps one intent id across retries of a purchase. A caller that sends none
  // gets a fresh one, which behaves as a new purchase every time.
  let intentId: string = crypto.randomUUID();

  if (rawBody) {
    let body: { amountUsd?: unknown; intentId?: unknown };

    try {
      body = JSON.parse(rawBody) as { amountUsd?: unknown; intentId?: unknown };
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const requestedAmountUsd = body.amountUsd ?? DEFAULT_BUNDLE_USD;
    if (!isSupportedBundleAmountUsd(requestedAmountUsd)) {
      return NextResponse.json(
        { error: "Unsupported credit bundle" },
        { status: 400 }
      );
    }

    amountUsd = requestedAmountUsd;

    if (body.intentId !== undefined) {
      if (typeof body.intentId !== "string" || !INTENT_ID_PATTERN.test(body.intentId)) {
        return NextResponse.json(
          { error: "Invalid purchase intent" },
          { status: 400 }
        );
      }
      intentId = body.intentId.toLowerCase();
    }
  }

  // SECURITY: Validate request origin
  if (!validateOrigin(request)) {
    return invalidOriginResponse() as NextResponse;
  }

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Payment system not available" },
      { status: 503 }
    );
  }

  let serverSecret: string;
  try {
    serverSecret = getConvexServerSecret();
  } catch {
    console.error("[Invoice API] CONVEX_SERVER_SECRET not configured");
    return NextResponse.json(
      { error: "Payment system not available" },
      { status: 503 }
    );
  }

  if (!isLightningConfigured()) {
    return NextResponse.json(
      { error: "Lightning payments not configured" },
      { status: 503 }
    );
  }

  const sessionValidation = await validateSessionWithIp(request);
  if (!sessionValidation.valid || !sessionValidation.sid || !sessionValidation.currentIpHash) {
    return NextResponse.json(
      { error: "Session required" },
      { status: 401 }
    );
  }
  const sid = sessionValidation.sid;
  const withSessionRefresh = (response: Response) =>
    withSessionRefreshCookie(response, sessionValidation.refreshedToken) as NextResponse;

  // SECURITY: Rate limit invoice creation to prevent node flooding
  // Use IP hash only (not session) to prevent multi-session bypass from same IP
  const rateLimitIdentifier = sessionValidation.currentIpHash;

  const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: rateLimitIdentifier,
    endpoint: "invoice",
    serverSecret,
  });

  if (!rateLimitResult.allowed) {
    emitMetric("api_rate_limit_blocks_total", {
      route: requestContext.route,
      endpoint: "invoice",
    });
    logWarn("api.rate_limited", {
      route: requestContext.route,
      requestId: requestContext.requestId,
      sid: redactSid(sid),
      retryAfter: rateLimitResult.retryAfter,
    });
    return withSessionRefresh(NextResponse.json(
      {
        error: "Too many invoice creation requests",
        message: "Please wait before creating more invoices.",
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

  try {
    // Save the intent before the Lightning call. The invoice id goes in the callback's comment for linking.
    // A repeated intent is answered from what was saved, so it needs no fresh price.
    const intent = { sid, intentId, invoiceId: crypto.randomUUID(), amountUsd, serverSecret };
    let begun = await convex.mutation(api.invoices.beginInvoice, intent);
    if (begun.outcome === "quote") {
      const amountSats = usdToSats(amountUsd, await getBtcPrice());
      begun = await convex.mutation(api.invoices.beginInvoice, { ...intent, amountSats });
    }
    if (begun.outcome === "quote") throw new Error("Purchase intent was not saved");
    if (begun.outcome === "existing") {
      return withSessionRefresh(NextResponse.json(begun.invoice));
    }
    if (begun.outcome === "in_progress") {
      return withSessionRefresh(NextResponse.json(
        { error: "This invoice is still being created. Please try again in a moment.", code: "invoice_in_progress" },
        { status: 409, headers: { "Retry-After": "3" } }
      ));
    }
    if (begun.outcome === "conflict") {
      return withSessionRefresh(NextResponse.json(
        { error: "This purchase was started for a different credit bundle.", code: "invoice_intent_conflict" },
        { status: 409 }
      ));
    }
    if (begun.outcome === "unresolved") {
      logWarn("invoice.intent_unresolved", { route: requestContext.route, requestId: requestContext.requestId, sid: redactSid(sid), intentId });
      return withSessionRefresh(unresolvedResponse(intentId));
    }
    const { invoiceId } = begun;

    let lightningInvoice;
    try {
      lightningInvoice = await createLightningInvoice(begun.amountSats, `credits ${invoiceId}`);
    } catch (error) {
      // Only the pay server's own refusal means no invoice exists. Anything else may have made one.
      const refused = (error as { refused?: unknown } | null)?.refused === true;
      // If this write is lost too, the intent stays "creating" and a later retry reports it unresolved.
      await convex.mutation(api.invoices.closeInvoiceIntent, {
        sid, intentId, status: refused ? "failed" : "unresolved", serverSecret,
      }).catch(() => {});
      if (refused) throw error;
      logApiFailure({ context: requestContext, stage: "invoice_create_unresolved", error, statusCode: 409, sid });
      return withSessionRefresh(unresolvedResponse(intentId));
    }

    const invoice = await convex.mutation(api.invoices.createInvoice, {
      invoiceId,
      intentId,
      sid,
      amountUsd,
      amountSats: begun.amountSats,
      bolt11: lightningInvoice.bolt11,
      paymentHash: lightningInvoice.paymentHash,
      expiresAt: lightningInvoice.expiresAt,
      serverSecret,
    });

    emitMetric("invoice_created_total", {
      route: requestContext.route,
    });

    return withSessionRefresh(NextResponse.json({
      invoiceId: invoice.invoiceId,
      bolt11: invoice.bolt11,
      amountUsd: invoice.amountUsd,
      amountSats: invoice.amountSats,
      expiresAt: invoice.expiresAt,
      credits: invoice.credits,
    }));
  } catch (error) {
    logApiFailure({
      context: requestContext,
      stage: "invoice_create",
      error,
      statusCode: 500,
      sid,
    });
    console.error("Failed to create invoice:", error);
    return withSessionRefresh(NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invoice" },
      { status: 500 }
    ));
  }
}
