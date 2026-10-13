/** OpenRouter catalog rates are USD per token, including emergency rates. */
export type TokenPricing = { prompt?: string; completion?: string };

type Decimal = { units: bigint; scale: number };
const TEN = BigInt(10);

function decimal(value: string | undefined): Decimal | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value.trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? 0);
  if (fraction.length > 30 || Math.abs(exponent) > 30) return null;
  let units = BigInt(match[1] + fraction);
  const scale = fraction.length - exponent;
  if (scale < 0) units *= TEN ** BigInt(-scale);
  return { units, scale: Math.max(0, scale) };
}

/**
 * Calculate both provider USD and customer credits from one exact decimal sum.
 * Credits round once after the 25% markup ($0.01/credit, one-credit minimum).
 * Null means invalid/missing pricing or usage; known zero remains providerUsd=0.
 */
export function quoteTokenUsage(
  pricing: TokenPricing | undefined,
  inputTokens: number,
  outputTokens: number
): { providerUsd: number; credits: number } | null {
  return quoteBillableUnits([
    { price: pricing?.prompt, units: inputTokens },
    { price: pricing?.completion, units: outputTokens },
  ]);
}

/** Sum explicit billable units before the one final credit rounding. */
export function quoteBillableUnits(items: { price: string | undefined; units: number }[]): { providerUsd: number; credits: number } | null {
  if (items.length === 0 || !items.every(item => Number.isSafeInteger(item.units) && item.units >= 0)) return null;
  const prices = items.map(item => decimal(item.price));
  if (prices.some(price => !price)) return null;
  const scale = Math.max(...prices.map(price => price!.scale));
  const denominator = TEN ** BigInt(scale);
  const numerator = prices.reduce((total, price, index) => total +
    price!.units * TEN ** BigInt(scale - price!.scale) * BigInt(items[index].units), BigInt(0));
  const roundedCredits = (numerator * BigInt(125) + denominator - BigInt(1)) / denominator;
  if (roundedCredits > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const providerUsd = Number(numerator) / Number(denominator);
  if (!Number.isFinite(providerUsd)) return null;
  return { providerUsd, credits: Math.max(1, Number(roundedCredits)) };
}
