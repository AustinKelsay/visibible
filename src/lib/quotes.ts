/**
 * Quote terms for paid work (#60), computed on the server from the request it is about to make: the price
 * fingerprint, the estimate and the maximum charge. Convex stores and accepts them (`convex/quotes.ts`); the browser
 * shows them (`quote-display.ts`). Server only: the fingerprint uses Node's crypto.
 */
import { createHash } from "node:crypto";
import { computeChatCreditsCost } from "./chat-models";
import { HISTORY_TOKEN_BUDGET, maxOutputTokensFor } from "./chat-request";
import { IMAGE_RESERVATION_HEADROOM_MULTIPLIER } from "./image-models";
import { quoteTokenUsage, type TokenPricing } from "./token-pricing";

/**
 * The billing policy of every operation admitted with an accepted quote: the hold is the accepted maximum, and the
 * charge is actual usage capped at it, or the accepted estimate when usage is missing. Earlier image requests keep
 * "legacy-image-v1".
 */
export const BILLING_POLICY_VERSION = "accepted-maximum-v1";

/** The answer to an acceptance that no longer holds; it carries a fresh quote for the same request. */
export { QUOTE_STALE_ERROR } from "./quote-display";
export const QUOTE_STALE_STATUS = 409;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Everything that determines an image's price. Field order is fixed, so equal terms give an equal fingerprint. */
export function imageQuoteFingerprint(terms: {
  workId: string; unitId: string; reference: string; translationId: string; styleId: string; modelId: string;
  aspectRatio: string; resolution: string; prompt: string; referenceImages: number; billingVersion: string;
}): string {
  return sha256(JSON.stringify({
    operation: "image", policyVersion: BILLING_POLICY_VERSION,
    workId: terms.workId, unitId: terms.unitId, reference: terms.reference, translationId: terms.translationId,
    styleId: terms.styleId, modelId: terms.modelId, aspectRatio: terms.aspectRatio, resolution: terms.resolution,
    promptHash: sha256(terms.prompt), referenceImages: terms.referenceImages, billingVersion: terms.billingVersion,
  }));
}

/**
 * An image's estimate and maximum from its prompt-aware quote. The maximum is twice the quote, and never more than
 * the guest's balance: a guest who is short still runs an explicit image (the spend-down grace), with the hold and
 * the maximum capped to what they have. The estimate never exceeds the maximum. `balance` is null for the owner, who
 * is not charged.
 */
export function imageQuoteAmounts(quotedCredits: number, balance: number | null): { estimateCredits: number; maximumCredits: number } {
  const ceiling = quotedCredits * IMAGE_RESERVATION_HEADROOM_MULTIPLIER;
  const maximumCredits = balance === null ? ceiling : Math.max(1, Math.min(ceiling, Math.floor(balance)));
  return { estimateCredits: Math.min(quotedCredits, maximumCredits), maximumCredits };
}

/** Tokens allowed for the system prompt (guidance, rules and three verses) in a chat turn's maximum; a turn whose prompt estimates higher is refused. */
export const CHAT_SYSTEM_PROMPT_TOKEN_ALLOWANCE = 2000;
/** The most input one chat turn can send: the bounded history plus the system prompt allowance. */
export const CHAT_MAX_INPUT_TOKENS = HISTORY_TOKEN_BUDGET + CHAT_SYSTEM_PROMPT_TOKEN_ALLOWANCE;

export type ChatQuoteTerms = { estimateCredits: number; maximumCredits: number; maxInputTokens: number; maxOutputTokens: number; fingerprint: string };

/**
 * One chat turn's estimate and maximum from the model's prices. The estimate is a typical turn (1,000 tokens in,
 * 1,000 out); the maximum is the most the server will send and accept back (the bounded history and system prompt
 * in, the output cap out). Null when the model cannot be priced.
 */
export function chatQuoteTerms(modelId: string, pricing: TokenPricing & { contextLength?: number }): ChatQuoteTerms | null {
  const maxOutputTokens = maxOutputTokensFor(pricing.contextLength);
  const maximum = quoteTokenUsage(pricing, CHAT_MAX_INPUT_TOKENS, maxOutputTokens);
  const typical = computeChatCreditsCost(pricing);
  if (!maximum || typical === null) return null;
  return {
    estimateCredits: Math.min(typical, maximum.credits), maximumCredits: maximum.credits,
    maxInputTokens: CHAT_MAX_INPUT_TOKENS, maxOutputTokens,
    fingerprint: sha256(JSON.stringify({
      operation: "chat", policyVersion: BILLING_POLICY_VERSION, modelId,
      promptPrice: pricing.prompt ?? null, completionPrice: pricing.completion ?? null,
      maxInputTokens: CHAT_MAX_INPUT_TOKENS, maxOutputTokens,
    })),
  };
}
