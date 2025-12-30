/**
 * LND REST client for Voltage.
 * Uses invoice-only macaroon for creating and looking up invoices.
 */

// LND REST API response types
export interface LndInvoiceResponse {
  r_hash: string; // base64 encoded payment hash
  payment_request: string; // bolt11 invoice string
  add_index: string; // invoice index
  payment_addr: string; // base64 encoded payment address
}

export interface LndInvoiceLookup {
  memo: string;
  r_preimage: string; // base64 encoded preimage
  r_hash: string; // base64 encoded payment hash
  value: string; // invoice amount in sats
  value_msat: string;
  settled: boolean;
  creation_date: string; // unix timestamp
  settle_date: string; // unix timestamp (0 if not settled)
  payment_request: string;
  expiry: string; // seconds until expiry
  state: "OPEN" | "SETTLED" | "CANCELED" | "ACCEPTED";
  amt_paid_sat: string;
  amt_paid_msat: string;
}

class LndError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "LndError";
  }
}

function getLndConfig() {
  const host = process.env.LND_HOST;
  const macaroon = process.env.LND_INVOICE_MACAROON;

  if (!host || !macaroon) {
    throw new LndError("LND_HOST and LND_INVOICE_MACAROON must be set");
  }

  return { host, macaroon };
}

/**
 * Create a Lightning invoice via LND REST API.
 * @param amountSats - Invoice amount in satoshis
 * @param memo - Invoice description/memo
 * @returns LND invoice response with bolt11 and payment hash
 */
export async function createLndInvoice(
  amountSats: number,
  memo: string
): Promise<LndInvoiceResponse> {
  const { host, macaroon } = getLndConfig();

  const response = await fetch(`https://${host}/v1/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Grpc-Metadata-macaroon": macaroon,
    },
    body: JSON.stringify({
      value: amountSats.toString(),
      memo,
      expiry: "900", // 15 minutes
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new LndError(`LND invoice creation failed: ${errorText}`, response.status);
  }

  const data: LndInvoiceResponse = await response.json();
  return data;
}

/**
 * Look up an invoice by payment hash.
 * @param rHashHex - Payment hash in hex format
 * @returns Invoice details including settlement status
 */
export async function lookupLndInvoice(
  rHashHex: string
): Promise<LndInvoiceLookup> {
  const { host, macaroon } = getLndConfig();

  // LND expects the r_hash as a URL-safe base64 string in the path
  // Convert hex to bytes, then to base64url
  const bytes = Buffer.from(rHashHex, "hex");
  const rHashBase64Url = bytes.toString("base64url");

  const response = await fetch(
    `https://${host}/v1/invoice/${rHashBase64Url}`,
    {
      method: "GET",
      headers: {
        "Grpc-Metadata-macaroon": macaroon,
      },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new LndError(`LND invoice lookup failed: ${errorText}`, response.status);
  }

  const data: LndInvoiceLookup = await response.json();
  return data;
}

/**
 * Convert base64 string to hex string.
 */
export function base64ToHex(base64: string): string {
  return Buffer.from(base64, "base64").toString("hex");
}

/**
 * Check if LND is configured and available.
 */
export function isLndConfigured(): boolean {
  return !!(process.env.LND_HOST && process.env.LND_INVOICE_MACAROON);
}
