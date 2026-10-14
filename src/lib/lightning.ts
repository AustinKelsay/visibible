/**
 * Lightning client for credit invoices.
 * Uses the LNURL-pay server behind pay@visibible.com, which fronts the receiving LND node.
 */
import { decode } from "light-bolt11-decoder";

export type LightningInvoiceState = "OPEN" | "SETTLED" | "CANCELED" | "ACCEPTED";

const INVOICE_STATES: readonly string[] = ["OPEN", "SETTLED", "CANCELED", "ACCEPTED"];

export interface LightningInvoice {
  bolt11: string;
  paymentHash: string; // hex
  expiresAt: number; // unix ms, from the invoice itself
}

function getPayUrl(): string {
  const payUrl = process.env.LNURL_PAY_URL;

  if (!payUrl) {
    throw new Error("LNURL_PAY_URL must be set");
  }

  return payUrl.replace(/\/+$/, "");
}

async function getLnurlJson(url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;

  if (!response.ok || !body || body.status === "ERROR") {
    throw new Error(`Lightning request failed: ${body?.reason ?? response.status}`);
  }

  return body;
}

/**
 * Create a Lightning invoice through the LNURL-pay callback.
 * @param amountSats - Invoice amount in satoshis
 * @param comment - Sent to the LNURL-pay callback (LUD-12); not encoded in the invoice
 */
export async function createLightningInvoice(
  amountSats: number,
  comment: string
): Promise<LightningInvoice> {
  const url = new URL(getPayUrl());
  url.searchParams.set("amount", String(amountSats * 1000));
  url.searchParams.set("comment", comment);

  const { pr } = await getLnurlJson(url);
  if (typeof pr !== "string") {
    throw new Error("Lightning server returned no invoice");
  }

  const decoded = decode(pr);
  const section = (name: string) => decoded.sections.find((s) => s.name === name);
  const amount = section("amount");
  const paymentHash = section("payment_hash");
  const timestamp = section("timestamp");
  const expiry = section("expiry");

  // Credits are granted for this amount, so the invoice must request exactly it.
  if (!amount || !("value" in amount) || amount.value !== String(amountSats * 1000)) {
    throw new Error("Lightning invoice amount does not match");
  }
  if (!paymentHash || !("value" in paymentHash) || typeof paymentHash.value !== "string" ||
      !/^[0-9a-f]{64}$/.test(paymentHash.value)) {
    throw new Error("Lightning invoice has no payment hash");
  }
  if (!timestamp || !("value" in timestamp) || typeof timestamp.value !== "number") {
    throw new Error("Lightning invoice has no timestamp");
  }

  // BOLT 11: an invoice without an expiry tag expires after 3600 seconds.
  const expirySeconds = expiry && "value" in expiry && typeof expiry.value === "number"
    ? expiry.value
    : 3600;

  return {
    bolt11: pr,
    paymentHash: paymentHash.value,
    expiresAt: (timestamp.value + expirySeconds) * 1000,
  };
}

/**
 * Look up an invoice's state on the receiving node by payment hash.
 * LND never settles a fixed-amount invoice for less than its amount.
 */
export async function lookupLightningInvoiceState(
  paymentHashHex: string
): Promise<LightningInvoiceState> {
  const url = new URL(`${getPayUrl()}/check`);
  url.searchParams.set("id", paymentHashHex.toLowerCase());

  const { status } = await getLnurlJson(url);
  if (typeof status !== "string" || !INVOICE_STATES.includes(status)) {
    throw new Error("Unexpected Lightning invoice state");
  }

  return status as LightningInvoiceState;
}

/**
 * Check if Lightning invoices are configured.
 */
export function isLightningConfigured(): boolean {
  return !!process.env.LNURL_PAY_URL;
}
