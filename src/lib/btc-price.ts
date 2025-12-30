/**
 * BTC/USD price fetching with in-memory cache.
 * Uses Coinbase API (no auth required).
 */

interface CoinbaseResponse {
  data: {
    amount: string;
    currency: string;
  };
}

// Cache config
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedPrice: number | null = null;
let cacheTimestamp = 0;

/**
 * Fetch current BTC price in USD from Coinbase.
 * Results are cached for 5 minutes to avoid rate limits.
 */
export async function getBtcPrice(): Promise<number> {
  const now = Date.now();

  // Return cached price if still valid
  if (cachedPrice !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedPrice;
  }

  try {
    const response = await fetch(
      "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      {
        headers: {
          Accept: "application/json",
        },
        // Short timeout to avoid blocking
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new Error(`Coinbase API error: ${response.status}`);
    }

    const data: CoinbaseResponse = await response.json();
    const price = parseFloat(data.data.amount);

    if (isNaN(price) || price <= 0) {
      throw new Error("Invalid price from Coinbase");
    }

    // Update cache
    cachedPrice = price;
    cacheTimestamp = now;

    return price;
  } catch (error) {
    // If we have a stale cached price, use it as fallback
    if (cachedPrice !== null) {
      console.warn("Failed to fetch BTC price, using stale cache:", error);
      return cachedPrice;
    }
    throw error;
  }
}

/**
 * Convert USD amount to satoshis.
 * @param usd - Amount in USD
 * @param btcPrice - Current BTC/USD price
 * @returns Amount in satoshis (rounded to nearest sat)
 */
export function usdToSats(usd: number, btcPrice: number): number {
  // 1 BTC = 100,000,000 sats
  const btcAmount = usd / btcPrice;
  const sats = Math.round(btcAmount * 100_000_000);
  return sats;
}

/**
 * Format satoshis as a human-readable string.
 */
export function formatSats(sats: number): string {
  if (sats >= 1_000_000) {
    return `${(sats / 1_000_000).toFixed(2)}M sats`;
  }
  if (sats >= 1_000) {
    return `${(sats / 1_000).toFixed(1)}k sats`;
  }
  return `${sats} sats`;
}
