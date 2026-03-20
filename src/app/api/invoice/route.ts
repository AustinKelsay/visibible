import { NextResponse } from "next/server";
import { validateSessionWithIp, withSessionRefreshCookie } from "@/lib/session";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { getBtcPrice, usdToSats } from "@/lib/btc-price";
import { createLndInvoice, base64ToHex, isLndConfigured } from "@/lib/lnd";
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

/**
 * POST /api/invoice
 * Creates a new Lightning invoice for credit purchase.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestContext = createRequestObservabilityContext(request, "/api/invoice");

  const rawBody = await request.text();
  let amountUsd: 1 | 3 = DEFAULT_BUNDLE_USD;

  if (rawBody) {
    let body: { amountUsd?: unknown };

    try {
      body = JSON.parse(rawBody) as { amountUsd?: unknown };
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

  if (!isLndConfigured()) {
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

  // SECURITY: Rate limit invoice creation to prevent LND flooding
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
    // Get current BTC price and calculate sats
    const btcPrice = await getBtcPrice();
    const amountSats = usdToSats(amountUsd, btcPrice);

    // Generate invoiceId before LND call so we can include it in memo for linking
    const invoiceId = crypto.randomUUID();
    const memo = `Visibible: ${invoiceId}`;

    // Create real Lightning invoice via LND
    const lndInvoice = await createLndInvoice(amountSats, memo);

    // Convert payment hash from base64 to hex
    const paymentHash = base64ToHex(lndInvoice.r_hash);

    // Store in Convex with real LND data
    const invoice = await convex.mutation(api.invoices.createInvoice, {
      invoiceId,
      sid,
      amountUsd,
      amountSats,
      bolt11: lndInvoice.payment_request,
      paymentHash,
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
