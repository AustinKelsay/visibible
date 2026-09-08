import { NextResponse } from "next/server";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { validateSessionWithIp, withSessionRefreshCookie } from "@/lib/session";
import { lookupLndInvoice, isLndConfigured, settledInvoiceAmount } from "@/lib/lnd";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
import {
  createRequestObservabilityContext,
  emitMetric,
  logApiFailure,
  logSettlementEvent,
  logWarn,
} from "@/lib/observability";
import { api } from "../../../../../convex/_generated/api";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const INVOICE_STATUS_RATE_LIMIT_ENDPOINT = "invoice-status";

function buildInvoiceStatusRateLimitIdentifier(ipHash: string, sid: string): string {
  return `${ipHash}:${sid}`;
}

async function enforceInvoiceStatusRateLimit(args: {
  convex: NonNullable<ReturnType<typeof getConvexClient>>;
  ipHash: string;
  sid: string;
  serverSecret: string;
  route: string;
  requestId: string;
}): Promise<NextResponse | null> {
  const rateLimitResult = await args.convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: buildInvoiceStatusRateLimitIdentifier(args.ipHash, args.sid),
    endpoint: INVOICE_STATUS_RATE_LIMIT_ENDPOINT,
    serverSecret: args.serverSecret,
  });

  if (rateLimitResult.allowed) {
    return null;
  }

  emitMetric("api_rate_limit_blocks_total", {
    route: args.route,
    endpoint: INVOICE_STATUS_RATE_LIMIT_ENDPOINT,
  });
  logWarn("api.rate_limited", {
    route: args.route,
    requestId: args.requestId,
    retryAfter: rateLimitResult.retryAfter,
  });

  return NextResponse.json(
    {
      error: "Too many invoice status requests",
      message: "Please wait before checking invoice status again.",
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

/**
 * GET /api/invoice/:id
 * Returns the status of an invoice.
 * If pending, checks LND for real payment status and updates accordingly.
 */
export async function GET(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  const requestContext = createRequestObservabilityContext(
    request,
    "/api/invoice/:id"
  );

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
    console.error("[Invoice Status API] CONVEX_SERVER_SECRET not configured");
    return NextResponse.json(
      { error: "Payment system not available" },
      { status: 503 }
    );
  }

  const sessionValidation = await validateSessionWithIp(request);
  if (!sessionValidation.valid || !sessionValidation.sid || !sessionValidation.currentIpHash) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }
  const sid = sessionValidation.sid;
  const currentIpHash = sessionValidation.currentIpHash;
  const withSessionRefresh = (response: Response) =>
    withSessionRefreshCookie(response, sessionValidation.refreshedToken) as NextResponse;

  const rateLimitResponse = await enforceInvoiceStatusRateLimit({
    convex,
    ipHash: currentIpHash,
    sid,
    serverSecret,
    route: requestContext.route,
    requestId: requestContext.requestId,
  });
  if (rateLimitResponse) {
    return withSessionRefresh(rateLimitResponse);
  }

  const { id: invoiceId } = await params;

  try {
    let invoice = await convex.query(api.invoices.getInvoice, { invoiceId, ownerSid: sid, serverSecret });

    if (!invoice) {
      return withSessionRefresh(
        NextResponse.json({ error: "Invoice not found" }, { status: 404 })
      );
    }

    if (invoice.sid !== sid) {
      return withSessionRefresh(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );
    }

    if (invoice.status !== "paid") {
      if (!invoice.paymentHash || !isLndConfigured()) {
        return withSessionRefresh(NextResponse.json(
          { error: "Lightning status unavailable", status: invoice.status }, { status: 503 }
        ));
      }
      try {
        const lndStatus = await lookupLndInvoice(invoice.paymentHash);
        if (lndStatus.state === "SETTLED") {
          const amountPaidSats = settledInvoiceAmount(lndStatus, {
            paymentHash: invoice.paymentHash, amountSats: invoice.amountSats,
          });
          await convex.action(api.invoices.confirmPayment, {
            invoiceId, paymentHash: invoice.paymentHash, amountPaidSats, serverSecret,
          });
          logSettlementEvent({ context: requestContext, outcome: "confirmed", sid, invoiceId });
          const confirmed = await convex.query(api.invoices.getInvoice, { invoiceId, ownerSid: sid, serverSecret });
          if (!confirmed || confirmed.status !== "paid") throw new Error("Confirmed invoice unavailable");
          invoice = confirmed;
        } else if (lndStatus.state === "CANCELED" || Date.now() > invoice.expiresAt) {
          await convex.mutation(api.invoices.expireInvoice, { invoiceId, serverSecret });
          invoice = { ...invoice, status: "expired" };
        }
      } catch (error) {
        logApiFailure({ context: requestContext, stage: "invoice_status_lnd_lookup", error, statusCode: 502, sid });
        return withSessionRefresh(NextResponse.json(
          { error: "Unable to verify Lightning payment", status: invoice.status }, { status: 502 }
        ));
      }
    }

    return withSessionRefresh(NextResponse.json({
      invoiceId: invoice.invoiceId,
      status: invoice.status,
      amountUsd: invoice.amountUsd,
      amountSats: invoice.amountSats,
      bolt11: invoice.bolt11,
      expiresAt: invoice.expiresAt,
      paidAt: invoice.paidAt,
    }));
  } catch (error) {
    logApiFailure({
      context: requestContext,
      stage: "invoice_status_get",
      error,
      statusCode: 500,
      sid,
    });
    console.error("Failed to get invoice:", error);
    return withSessionRefresh(NextResponse.json(
      { error: "Failed to get invoice" },
      { status: 500 }
    ));
  }
}

/**
 * POST /api/invoice/:id
 * Confirms payment for an invoice after verifying LND settlement.
 */
export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  const requestContext = createRequestObservabilityContext(
    request,
    "/api/invoice/:id"
  );

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
    console.error("[Invoice Confirm API] CONVEX_SERVER_SECRET not configured");
    return NextResponse.json(
      { error: "Payment system not available" },
      { status: 503 }
    );
  }

  const sessionValidation = await validateSessionWithIp(request);
  if (!sessionValidation.valid || !sessionValidation.sid || !sessionValidation.currentIpHash) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }
  const sid = sessionValidation.sid;
  const currentIpHash = sessionValidation.currentIpHash;
  const withSessionRefresh = (response: Response) =>
    withSessionRefreshCookie(response, sessionValidation.refreshedToken) as NextResponse;

  const rateLimitResponse = await enforceInvoiceStatusRateLimit({
    convex,
    ipHash: currentIpHash,
    sid,
    serverSecret,
    route: requestContext.route,
    requestId: requestContext.requestId,
  });
  if (rateLimitResponse) {
    return withSessionRefresh(rateLimitResponse);
  }

  const { id: invoiceId } = await params;

  try {
    const invoice = await convex.query(api.invoices.getInvoice, { invoiceId, ownerSid: sid, serverSecret });

    if (!invoice) {
      return withSessionRefresh(
        NextResponse.json({ error: "Invoice not found" }, { status: 404 })
      );
    }

    if (invoice.sid !== sid) {
      return withSessionRefresh(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );
    }

    if (invoice.status === "paid") {
      return withSessionRefresh(NextResponse.json({ success: true, alreadyPaid: true }));
    }

    if (!invoice.paymentHash) {
      return withSessionRefresh(NextResponse.json(
        { error: "Invoice is missing payment hash" },
        { status: 400 }
      ));
    }

    if (!isLndConfigured()) {
      return withSessionRefresh(NextResponse.json(
        { error: "Lightning payments not configured" },
        { status: 503 }
      ));
    }

    let lndStatus;
    try {
      lndStatus = await lookupLndInvoice(invoice.paymentHash);
      if (lndStatus.state === "SETTLED") settledInvoiceAmount(lndStatus, {
        paymentHash: invoice.paymentHash, amountSats: invoice.amountSats,
      });
    } catch (error) {
      logApiFailure({ context: requestContext, stage: "invoice_confirm_lnd_lookup", error, statusCode: 502, sid });
      return withSessionRefresh(NextResponse.json(
        { error: "Unable to verify Lightning payment" }, { status: 502 }
      ));
    }

    if (lndStatus.state === "SETTLED") {
      const result = await convex.action(api.invoices.confirmPayment, {
        invoiceId,
        paymentHash: invoice.paymentHash,
        amountPaidSats: Number(lndStatus.amt_paid_sat),
        serverSecret,
      });
      logSettlementEvent({
        context: requestContext,
        outcome: "confirmed",
        sid,
        invoiceId,
        details: {
          alreadyPaid: result.alreadyPaid,
          creditsAdded: result.creditsAdded,
        },
      });

      return withSessionRefresh(NextResponse.json({
        success: result.success,
        alreadyPaid: result.alreadyPaid,
        newBalance: result.newBalance,
        creditsAdded: result.creditsAdded,
      }));
    }

    if (lndStatus.state === "CANCELED" || Date.now() > invoice.expiresAt) {
      await convex.mutation(api.invoices.expireInvoice, { invoiceId, serverSecret });
      return withSessionRefresh(NextResponse.json(
        { error: lndStatus.state === "CANCELED" ? "Invoice was canceled" : "Invoice has expired" },
        { status: 410 }
      ));
    }

    return withSessionRefresh(NextResponse.json(
      { error: "Invoice not settled" },
      { status: 402 }
    ));
  } catch (error) {
    logApiFailure({
      context: requestContext,
      stage: "invoice_confirm",
      error,
      statusCode: 500,
      sid,
      invoiceId,
    });
    console.error("Failed to confirm payment:", error);
    return withSessionRefresh(NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to confirm payment",
      },
      { status: 500 }
    ));
  }
}
