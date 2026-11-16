/**
 * Quote terms for paid work (#60), computed on the server from the request it is about to make: the price
 * fingerprint, the estimate and the maximum charge. Convex stores and accepts them (`convex/quotes.ts`); the browser
 * shows them (`quote-display.ts`). Server only: the fingerprint uses Node's crypto.
 */
import { createHash } from "node:crypto";
import { CHAT_SYSTEM_PROMPT_TOKEN_ALLOWANCE, HISTORY_TOKEN_BUDGET, maxOutputTokensFor } from "./chat-request";

export { CHAT_SYSTEM_PROMPT_TOKEN_ALLOWANCE };
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
  /** The catalog rates the quote was priced from. The billing version names the unit scheme and does not change with them. */
  rates: { unit: string; textInputUsd: string; textOutputUsd: string; imageOutputUsd: string; imageInputUsd?: string; imageInputTokens?: { usdPerToken: string; perImage: number } } | undefined;
}): string {
  const rates = terms.rates;
  return sha256(JSON.stringify({
    operation: "image", policyVersion: BILLING_POLICY_VERSION,
    workId: terms.workId, unitId: terms.unitId, reference: terms.reference, translationId: terms.translationId,
    styleId: terms.styleId, modelId: terms.modelId, aspectRatio: terms.aspectRatio, resolution: terms.resolution,
    promptHash: sha256(terms.prompt), referenceImages: terms.referenceImages, billingVersion: terms.billingVersion,
    rates: rates ? {
      unit: rates.unit, textInputUsd: rates.textInputUsd, textOutputUsd: rates.textOutputUsd, imageOutputUsd: rates.imageOutputUsd,
      imageInputUsd: rates.imageInputUsd ?? null,
      imageInputTokens: rates.imageInputTokens ? { usdPerToken: rates.imageInputTokens.usdPerToken, perImage: rates.imageInputTokens.perImage } : null,
    } : null,
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

/** The most one chat message may cost ($1.00). A model whose maximum passes it is refused, so no accepted quote can. */
export const CHAT_MAX_CREDITS_PER_MESSAGE = 100;

export type ChatQuoteTerms = { estimateCredits: number; maximumCredits: number; maxInputTokens: number; maxOutputTokens: number; fingerprint: string };

/** A typical question and the conversation before it, in tokens, on top of the system prompt. */
const TYPICAL_CONVERSATION_TOKENS = 300;
/** A typical answer, in tokens. */
const TYPICAL_ANSWER_TOKENS = 1000;

/**
 * One chat turn's estimate and maximum from the model's prices and the turn's system prompt (its estimated tokens),
 * so both grow with the Scripture the prompt carries. The estimate is a typical turn (the system prompt and a short
 * question in, 1,000 tokens out); the maximum is the most the server will send and accept back (the system prompt and
 * the bounded history in, the output cap out). Null when the model cannot be priced.
 */
export function chatQuoteTerms(modelId: string, pricing: TokenPricing & { contextLength?: number }, systemPromptTokens: number): ChatQuoteTerms | null {
  const maxOutputTokens = maxOutputTokensFor(pricing.contextLength);
  const maxInputTokens = HISTORY_TOKEN_BUDGET + systemPromptTokens;
  const maximum = quoteTokenUsage(pricing, maxInputTokens, maxOutputTokens);
  const typical = quoteTokenUsage(pricing, systemPromptTokens + TYPICAL_CONVERSATION_TOKENS, TYPICAL_ANSWER_TOKENS);
  if (!maximum || !typical) return null;
  return {
    estimateCredits: Math.min(typical.credits, maximum.credits), maximumCredits: maximum.credits,
    maxInputTokens, maxOutputTokens,
    fingerprint: sha256(JSON.stringify({
      operation: "chat", policyVersion: BILLING_POLICY_VERSION, modelId,
      promptPrice: pricing.prompt ?? null, completionPrice: pricing.completion ?? null,
      maxInputTokens, maxOutputTokens,
    })),
  };
}
