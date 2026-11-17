/**
 * Free answers on the server (#493): whether they are switched on, the network a request counts against, and the
 * provider cost reserved and settled for one. Convex keeps the counts and the budget (convex/freeAnswers.ts).
 */
import { clientNetwork } from "./client-ip";
import { getClientIp, hashIp } from "./session";
import { quoteTokenUsage, type TokenPricing } from "./token-pricing";

/**
 * The provider key free answers use, or null when free answers are off. They are on only when `FREE_ASK_ENABLED` is
 * "true" and they have their own key (`OPENROUTER_FREE_ASK_API_KEY`), whose provider-side limit stops spend even if
 * the count here is wrong. Paid answers and images keep `OPENROUTER_API_KEY`.
 */
export function freeAnswersKey(): string | null {
  if (process.env.FREE_ASK_ENABLED !== "true") return null;
  return process.env.OPENROUTER_FREE_ASK_API_KEY?.trim() || null;
}

/** The hashed network a request's free answers count against, or null when the client address cannot be read. */
export async function freeAnswerNetwork(req: Request): Promise<string | null> {
  const network = clientNetwork(getClientIp(req));
  return network ? hashIp(network) : null;
}

/**
 * Room for an endpoint priced above the catalog's list price. On 17 November 2026 two of Mistral Small 4's three
 * endpoints charged 10% over it, and the provider's own cost does not reach the route.
 */
export const FREE_SPEND_MARGIN = 1.1;

/**
 * The most input tokens a free turn can be billed for. Input is counted in estimated tokens (ASCII characters ÷ 3,
 * other characters by their UTF-8 bytes; `estimateTokens`), so the text is at most three bytes per estimated token,
 * and a byte-level tokenizer never makes more tokens than bytes: a history of digits, say, is about one token per
 * character. Each message adds a few tokens of framing.
 */
export function freeAnswerInputTokenBound(estimatedInputTokens: number, messages: number): number {
  return 3 * estimatedInputTokens + 8 * (messages + 1) + 64;
}

/** Provider cost of the given tokens at the model's prices, with the margin; null when the prices are unusable. */
export function freeAnswerCostUsd(pricing: TokenPricing, inputTokens: number, outputTokens: number): number | null {
  const usage = quoteTokenUsage(pricing, inputTokens, outputTokens);
  return usage ? usage.providerUsd * FREE_SPEND_MARGIN : null;
}
