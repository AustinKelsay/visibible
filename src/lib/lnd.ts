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
  const rHashNormalized = rHashHex.toLowerCase();
  const isHexHash = /^[0-9a-f]{64}$/.test(rHashNormalized);

  const fetchInvoice = async (url: string) => {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Grpc-Metadata-macaroon": macaroon,
      },
      signal: AbortSignal.timeout(10000),
    });

    return response;
  };

  // Prefer the documented REST path using r_hash_str (hex).
  if (isHexHash) {
    const response = await fetchInvoice(`https://${host}/v1/invoice/${rHashNormalized}`);

    if (response.ok) {
      return (await response.json()) as LndInvoiceLookup;
    }

    // If not found, fall through to try r_hash query for newer gateways.
    if (response.status !== 404) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new LndError(`LND invoice lookup failed: ${errorText}`, response.status);
    }
  }

  // Fallback: use r_hash query param (base64) for gateways that support bytes in query.
  const rHashBase64 = isHexHash ? hexToBase64(rHashNormalized) : rHashHex;
  const rHashParam = encodeURIComponent(rHashBase64);
  const response = await fetchInvoice(
    `https://${host}/v1/invoice?r_hash=${rHashParam}`
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new LndError(`LND invoice lookup failed: ${errorText}`, response.status);
  }

  return (await response.json()) as LndInvoiceLookup;
}

/**
 * Convert base64 string to hex string.
 */
export function base64ToHex(base64: string): string {
  return Buffer.from(base64, "base64").toString("hex");
}

/**
 * Convert hex string to base64 string.
 */
export function hexToBase64(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64");
}

/**
 * Check if LND is configured and available.
 */
export function isLndConfigured(): boolean {
  return !!(process.env.LND_HOST && process.env.LND_INVOICE_MACAROON);
}
