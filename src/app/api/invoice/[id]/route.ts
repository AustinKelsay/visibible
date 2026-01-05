import { NextResponse } from "next/server";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { getSessionFromCookies } from "@/lib/session";
import { lookupLndInvoice, isLndConfigured } from "@/lib/lnd";
import { api } from "../../../../../convex/_generated/api";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/invoice/:id
 * Returns the status of an invoice.
 * If pending, checks LND for real payment status and updates accordingly.
 */
export async function GET(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Payment system not available" },
      { status: 503 }
    );
  }

  const sid = await getSessionFromCookies();
  if (!sid) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }

  const { id: invoiceId } = await params;

  try {
    let invoice = await convex.query(api.invoices.getInvoice, { invoiceId });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.sid !== sid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (invoice.status === "pending") {
      const now = Date.now();

      if (now > invoice.expiresAt) {
        await convex.mutation(api.invoices.expireInvoice, { invoiceId });
        invoice = { ...invoice, status: "expired" };
      } else if (invoice.paymentHash && isLndConfigured()) {
        try {
          const lndStatus = await lookupLndInvoice(invoice.paymentHash);

          if (lndStatus.state === "SETTLED") {
            // Payment received - confirm and grant credits
            await convex.action(api.invoices.confirmPayment, {
              invoiceId,
              paymentHash: invoice.paymentHash,
              serverSecret: getConvexServerSecret(),
            });
            // Update local status for response
            invoice = { ...invoice, status: "paid" };
          } else if (lndStatus.state === "CANCELED") {
            // Invoice was canceled
            await convex.mutation(api.invoices.expireInvoice, { invoiceId });
            invoice = { ...invoice, status: "expired" };
          }
          // "OPEN" and "ACCEPTED" states mean still waiting for payment
        } catch (lndError) {
          // Log but don't fail - we can still return the cached status
          console.warn("Failed to check LND status:", lndError);
        }
      }
    }

    return NextResponse.json({
      invoiceId: invoice.invoiceId,
      status: invoice.status,
      amountUsd: invoice.amountUsd,
      amountSats: invoice.amountSats,
      bolt11: invoice.bolt11,
      expiresAt: invoice.expiresAt,
      paidAt: invoice.paidAt,
    });
  } catch (error) {
    console.error("Failed to get invoice:", error);
    return NextResponse.json(
      { error: "Failed to get invoice" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invoice/:id
 * Confirms payment for an invoice after verifying LND settlement.
 */
export async function POST(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Payment system not available" },
      { status: 503 }
    );
  }

  const sid = await getSessionFromCookies();
  if (!sid) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }

  const { id: invoiceId } = await params;

  try {
    const invoice = await convex.query(api.invoices.getInvoice, { invoiceId });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.sid !== sid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!invoice.paymentHash) {
      return NextResponse.json(
        { error: "Invoice is missing payment hash" },
        { status: 400 }
      );
    }

    if (!isLndConfigured()) {
      return NextResponse.json(
        { error: "Lightning payments not configured" },
        { status: 503 }
      );
    }

    const now = Date.now();
    if (now > invoice.expiresAt) {
      await convex.mutation(api.invoices.expireInvoice, { invoiceId });
      return NextResponse.json(
        { error: "Invoice has expired" },
        { status: 410 }
      );
    }

    const lndStatus = await lookupLndInvoice(invoice.paymentHash);

    if (lndStatus.state === "SETTLED") {
      const result = await convex.action(api.invoices.confirmPayment, {
        invoiceId,
        paymentHash: invoice.paymentHash,
        serverSecret: getConvexServerSecret(),
      });

      return NextResponse.json({
        success: result.success,
        alreadyPaid: result.alreadyPaid,
        newBalance: result.newBalance,
        creditsAdded: result.creditsAdded,
      });
    }

    if (lndStatus.state === "CANCELED") {
      await convex.mutation(api.invoices.expireInvoice, { invoiceId });
      return NextResponse.json(
        { error: "Invoice was canceled" },
        { status: 410 }
      );
    }

    return NextResponse.json(
      { error: "Invoice not settled" },
      { status: 402 }
    );
  } catch (error) {
    console.error("Failed to confirm payment:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to confirm payment",
      },
      { status: 500 }
    );
  }
}
