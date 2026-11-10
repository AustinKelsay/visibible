/**
 * Image quotes for the generic engine (#173, spec #165 §6): the actual assembled prompt length
 * and every reference image that will be sent are counted, not a flat text estimate. The same
 * function serves as the missing-usage fallback for settlement, since it describes the request
 * that was actually made. Shared preparation (reading, canon, sheets) is never part of a guest's
 * quote.
 */
import { imageCapabilities, type ImageBilling, type ImageResolution, IMAGE_BILLING_VERSION } from "../image-catalog";
import { quoteBillableUnits } from "../token-pricing";

/** Gemini image models count about four characters of prompt per text token. */
export const PROMPT_CHARS_PER_TOKEN = 4;
/** Text tokens the model returns alongside the image (captions, refusals); a small fixed allowance. */
export const RESPONSE_TEXT_TOKENS = 100;
/** Models that bill reasoning with every image: Nano Banana 2.1 averaged 585 such tokens over 254 calls (median 545, p90 704). */
const RESPONSE_TEXT_TOKENS_BY_MODEL: Record<string, number> = { "google/gemini-nano-banana-2.1": 600 };
/** An image never costs more than about ten credits; a prompt quoted above that is refused before any call. */
export const IMAGE_ENVELOPE_CREDITS = 10;

export type GenericImageQuote = {
  providerUsd: number;
  credits: number;
  promptTokens: number;
  referenceImages: number;
  outputTokens: number;
  withinEnvelope: boolean;
};

export function quoteGenericImage(args: { modelId: string; billing: ImageBilling | undefined; resolution: ImageResolution; promptChars: number; referenceImages: number }): GenericImageQuote | null {
  const { billing } = args;
  if (!Number.isSafeInteger(args.referenceImages) || args.referenceImages < 0) return null;
  const outputTokens = imageCapabilities(args.modelId)?.outputTokens[args.resolution];
  if (!outputTokens || !billing || billing.unit !== "token" || billing.version !== IMAGE_BILLING_VERSION) return null;
  const imageInput = billing.imageInputUsd !== undefined
    ? { price: billing.imageInputUsd, units: args.referenceImages }
    : billing.imageInputTokens
      ? { price: billing.imageInputTokens.usdPerToken, units: args.referenceImages * billing.imageInputTokens.perImage }
      : null;
  if (args.referenceImages > 0 && !imageInput) return null;
  const promptTokens = Math.ceil(args.promptChars / PROMPT_CHARS_PER_TOKEN);
  const quote = quoteBillableUnits([
    { price: billing.textInputUsd, units: promptTokens },
    { price: billing.textOutputUsd, units: RESPONSE_TEXT_TOKENS_BY_MODEL[args.modelId] ?? RESPONSE_TEXT_TOKENS },
    { price: billing.imageOutputUsd, units: outputTokens },
    ...(args.referenceImages > 0 && imageInput ? [imageInput] : []),
  ]);
  if (!quote) return null;
  return { ...quote, promptTokens, referenceImages: args.referenceImages, outputTokens, withinEnvelope: quote.credits <= IMAGE_ENVELOPE_CREDITS };
}
