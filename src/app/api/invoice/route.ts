import { NextResponse } from "next/server";
import { getSessionFromCookies, getClientIp, hashIp } from "@/lib/session";
import { getConvexClient } from "@/lib/convex-client";
import { getBtcPrice, usdToSats } from "@/lib/btc-price";
import { createLndInvoice, base64ToHex, isLndConfigured } from "@/lib/lnd";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
import { api } from "../../../../convex/_generated/api";

// Fixed bundle price
const BUNDLE_USD = 3;
const BUNDLE_CREDITS = 300;

/**
 * POST /api/invoice
 * Creates a new Lightning invoice for credit purchase.
 */
export async function POST(request: Request): Promise<NextResponse> {
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

  if (!isLndConfigured()) {
    return NextResponse.json(
      { error: "Lightning payments not configured" },
      { status: 503 }
    );
  }

  const sid = await getSessionFromCookies();
  if (!sid) {
    return NextResponse.json(
      { error: "Session required" },
      { status: 401 }
    );
  }

  // SECURITY: Rate limit invoice creation to prevent LND flooding
  // Use IP hash as primary identifier to prevent multi-session bypass
  const clientIp = getClientIp(request);
  const ipHash = await hashIp(clientIp);
  const rateLimitIdentifier = `${ipHash}:${sid}`;

  const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: rateLimitIdentifier,
    endpoint: "invoice",
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
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
    );
  }

  try {
    // Get current BTC price and calculate sats
    const btcPrice = await getBtcPrice();
    const amountSats = usdToSats(BUNDLE_USD, btcPrice);
    const memo = `Visibible: ${BUNDLE_CREDITS} credits`;

    // Create real Lightning invoice via LND
    const lndInvoice = await createLndInvoice(amountSats, memo);

    // Convert payment hash from base64 to hex
    const paymentHash = base64ToHex(lndInvoice.r_hash);

    // Store in Convex with real LND data
    const invoice = await convex.mutation(api.invoices.createInvoice, {
      sid,
      amountSats,
      bolt11: lndInvoice.payment_request,
      paymentHash,
    });

    return NextResponse.json({
      invoiceId: invoice.invoiceId,
      bolt11: invoice.bolt11,
      amountUsd: invoice.amountUsd,
      amountSats: invoice.amountSats,
      expiresAt: invoice.expiresAt,
      credits: invoice.credits,
    });
  } catch (error) {
    console.error("Failed to create invoice:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invoice" },
      { status: 500 }
    );
  }
}
