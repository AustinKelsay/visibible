import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/session";
import { getConvexClient } from "@/lib/convex-client";
import { getBtcPrice, usdToSats } from "@/lib/btc-price";
import { createLndInvoice, base64ToHex, isLndConfigured } from "@/lib/lnd";
import { api } from "../../../../convex/_generated/api";

// Fixed bundle price
const BUNDLE_USD = 3;
const BUNDLE_CREDITS = 300;

/**
 * POST /api/invoice
 * Creates a new Lightning invoice for credit purchase.
 */
export async function POST(): Promise<NextResponse> {
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
