/**
 * What the browser does with a quote (#60): show its estimate and maximum, send its id with the paid request, and
 * recognise the server's "quote stale" answer, which carries a fresh quote to accept. The numbers shown are the
 * server's; nothing here computes a price.
 */

/** The `error` of the answer to an acceptance that no longer holds. */
export const QUOTE_STALE_ERROR = "Quote stale";

export type DisplayQuote = { quoteId: string; estimateCredits: number; maximumCredits: number; expiresAt: number };

/** "About 2 credits · at most 4": the estimate, then the most the guest can be charged. */
export function formatQuote(quote: Pick<DisplayQuote, "estimateCredits" | "maximumCredits">): string {
  return `About ${quote.estimateCredits} ${quote.estimateCredits === 1 ? "credit" : "credits"} · at most ${quote.maximumCredits}`;
}

export function parseQuote(value: unknown): DisplayQuote | null {
  if (!value || typeof value !== "object") return null;
  const { quoteId, estimateCredits, maximumCredits, expiresAt } = value as Record<string, unknown>;
  return typeof quoteId === "string" && typeof estimateCredits === "number" && typeof maximumCredits === "number" && typeof expiresAt === "number"
    ? { quoteId, estimateCredits, maximumCredits, expiresAt }
    : null;
}

/** The fresh quote in a "quote stale" answer, or null when the answer is something else. */
export function parseStaleQuote(status: number, body: unknown): DisplayQuote | null {
  if (status !== 409 || !body || typeof body !== "object") return null;
  const { error, quote } = body as Record<string, unknown>;
  return error === QUOTE_STALE_ERROR ? parseQuote(quote) : null;
}

/** A fresh quote with the numbers the guest already accepted needs no second confirmation. */
export function sameQuoteNumbers(
  a: Pick<DisplayQuote, "estimateCredits" | "maximumCredits"> | null | undefined,
  b: Pick<DisplayQuote, "estimateCredits" | "maximumCredits"> | null | undefined
): boolean {
  return Boolean(a && b && a.estimateCredits === b.estimateCredits && a.maximumCredits === b.maximumCredits);
}
