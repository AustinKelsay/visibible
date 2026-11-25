/**
 * Spend control for paid evaluation runs: each call reserves its most possible cost at catalog prices before it is
 * sent and settles from the provider's reported usage, so a run can never pass its owner-funded cap. Used by
 * `npm run evals:lean` and the sheet scorer.
 */
import { extractOpenRouterUsageUsd } from "../image-response";
import { imageCapabilities, type ImageResolution } from "../image-catalog";

export type CallKind = "text" | "image" | "check";
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type LedgerCall = { phase: string; kind: CallKind; status: string; measuredUsd: number | null };
export type LedgerState = {
  capUsd: number; calls: LedgerCall[]; measuredUsd: number; uncertainUsd: number;
  counts: Record<CallKind, number>; blocked: string | null;
};

/** Replace inline images and long opaque fields with their hashes, and the key with a marker, before anything is logged. */
export function scrubForLog(value: unknown, secret: string, hash: (text: string) => string, inOpaque = false): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:")) return `[data url sha256 ${hash(value)} chars ${value.length}]`;
    if (inOpaque && value.length > 1000) return `[opaque sha256 ${hash(value)} chars ${value.length}]`;
    return secret ? value.replaceAll(secret, "[redacted]") : value;
  }
  if (Array.isArray(value)) return value.map((v) => scrubForLog(v, secret, hash, inOpaque));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "user_id").map(([k, v]) => [k, scrubForLog(v, secret, hash, inOpaque || k === "reasoning_details" || k === "data" || k === "thoughtSignature")]));
  }
  return value;
}

/** A model's catalog prices (USD per token) and its largest output, from OpenRouter's model list. */
export type ModelPricing = { prompt: number; completion: number; imageOutput: number | null; maxCompletionTokens: number | null; overrides: Array<{ minPromptTokens: number; prompt: number; completion: number }> };

/** A catalog price as a finite, nonnegative number, or null unless it is a number or a numeric string ("0.0000001"). */
const price = (value: unknown): number | null => {
  const n = typeof value === "number" ? value
    : typeof value === "string" && /^\d+(\.\d+)?(e[-+]?\d+)?$/i.test(value) ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** One model's pricing from an OpenRouter `/models` entry; undefined unless its prompt and completion rates (and any override's) are valid. */
export function modelPricing(entry: { pricing?: Record<string, unknown>; top_provider?: { max_completion_tokens?: number | null } } | undefined): ModelPricing | undefined {
  if (!entry?.pricing) return undefined;
  const [prompt, completion] = [price(entry.pricing.prompt), price(entry.pricing.completion)];
  if (prompt === null || completion === null) return undefined;
  const overrides: ModelPricing["overrides"] = [];
  for (const o of Array.isArray(entry.pricing.overrides) ? entry.pricing.overrides as Array<Record<string, unknown>> : []) {
    const [minPromptTokens, p, c] = [price(o.min_prompt_tokens), price(o.prompt), price(o.completion)];
    if (minPromptTokens === null || p === null || c === null) return undefined;
    overrides.push({ minPromptTokens, prompt: p, completion: c });
  }
  const max = entry.top_provider?.max_completion_tokens;
  return { prompt, completion, imageOutput: price(entry.pricing.image_output), maxCompletionTokens: typeof max === "number" && Number.isFinite(max) && max > 0 ? max : null, overrides };
}

/** Tokens an attached image may count for, above any provider's default media resolution. */
const IMAGE_INPUT_TOKEN_BOUND = 5000;

/** Gemini Batch API charges 50% of standard Developer API token rates across input and output (including image output). */
export const GEMINI_BATCH_DISCOUNT = 0.5;

/** Compute USD cost from a native Gemini API `usageMetadata` object and catalog per-token rates; null if usage is missing. */
export function geminiUsageUsd(payload: Record<string, unknown>, pricing: ModelPricing, multiplier = 1): number | null {
  const meta = payload.usageMetadata as {
    promptTokenCount?: unknown; candidatesTokenCount?: unknown; thoughtsTokenCount?: unknown;
    candidatesTokensDetails?: Array<{ modality?: unknown; tokenCount?: unknown }>;
  } | undefined;
  if (!meta || typeof meta.promptTokenCount !== "number" || !Number.isFinite(meta.promptTokenCount)) return null;
  const promptTokens = meta.promptTokenCount;
  const candidates = typeof meta.candidatesTokenCount === "number" && Number.isFinite(meta.candidatesTokenCount) ? meta.candidatesTokenCount : 0;
  const thoughts = typeof meta.thoughtsTokenCount === "number" && Number.isFinite(meta.thoughtsTokenCount) ? meta.thoughtsTokenCount : 0;
  const imageOut = Array.isArray(meta.candidatesTokensDetails)
    ? meta.candidatesTokensDetails.filter((d) => d?.modality === "IMAGE" && typeof d.tokenCount === "number").reduce((sum, d) => sum + Number(d.tokenCount), 0)
    : 0;
  if (imageOut > 0 && pricing.imageOutput === null) return null;
  const textOut = Math.max(0, candidates - imageOut) + thoughts;
  const rates = [pricing, ...pricing.overrides.filter((o) => promptTokens >= o.minPromptTokens)];
  const promptRate = Math.max(...rates.map((r) => r.prompt));
  const completionRate = Math.max(...rates.map((r) => r.completion));
  const usd = (promptTokens * promptRate + textOut * completionRate + imageOut * (pricing.imageOutput ?? 0)) * multiplier;
  return Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 1e9) / 1e9 : null;
}

/**
 * The most one request can cost at catalog prices, or null when it cannot be bounded: every character of its text as a
 * token, every attached image at a generous token count, its `max_tokens` (or the model's largest output) as text
 * output, and for an image call the output image tokens at the requested resolution at the model's image price. The
 * ledger reserves this before the call, so the cap holds even when every call in flight costs its most.
 */
export function requestCeilingUsd(
  kind: CallKind,
  request: { model?: unknown; messages?: unknown; contents?: unknown; max_tokens?: unknown; image_config?: { image_size?: unknown }; generationConfig?: { imageConfig?: { imageSize?: unknown } } },
  pricing: ModelPricing | undefined,
): number | null {
  if (!pricing || typeof request.model !== "string") return null;
  const isGemini = request.contents !== undefined && request.messages === undefined;
  let promptTokens: number;
  if (isGemini) {
    const raw = JSON.stringify(request.contents ?? []);
    const images = (raw.match(/"inlineData"\s*:/g) ?? []).length;
    promptTokens = raw.replace(/"data"\s*:\s*"[A-Za-z0-9+/=]+"/g, '"data":""').length + images * IMAGE_INPUT_TOKEN_BOUND;
  } else {
    const text = JSON.stringify(request.messages ?? []);
    const images = (text.match(/data:image\//g) ?? []).length;
    promptTokens = text.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, "").length + images * IMAGE_INPUT_TOKEN_BOUND;
  }
  const completionTokens = typeof request.max_tokens === "number" && Number.isFinite(request.max_tokens) && request.max_tokens > 0 ? request.max_tokens : pricing.maxCompletionTokens;
  if (completionTokens === null) return null;
  let imageCost = 0;
  if (kind === "image") {
    const rawSize = request.image_config?.image_size ?? request.generationConfig?.imageConfig?.imageSize;
    const resolution = (typeof rawSize === "string" ? rawSize : "1K") as ImageResolution;
    const tokens = imageCapabilities(request.model)?.outputTokens[resolution];
    if (!tokens || pricing.imageOutput === null) return null;
    imageCost = tokens * pricing.imageOutput;
  }
  // A long prompt may switch to a dearer override; take the dearest price that could apply.
  const rates = [pricing, ...pricing.overrides.filter((o) => promptTokens >= o.minPromptTokens)];
  const ceiling = promptTokens * Math.max(...rates.map((r) => r.prompt)) + completionTokens * Math.max(...rates.map((r) => r.completion)) + imageCost;
  return Number.isFinite(ceiling) && ceiling >= 0 ? ceiling : null;
}

/**
 * One ledger for every paid call: each call reserves its estimate before it is sent and settles from the provider's
 * reported usage. A call that would pass the cap or a kind's limit is refused, and missing usage, a provider error or
 * an exception blocks every later call, so spend can never silently exceed the owner's grant.
 */
export function createLedger(options: {
  capUsd: number; reserves: Record<CallKind, number>; limits: Record<CallKind, number>; fetch: FetchLike;
  /** The most this request can cost (see requestCeilingUsd), reserved instead of the kind's fixed estimate; null refuses it. */
  ceiling?: (kind: CallKind, request: Record<string, unknown>) => number | null;
  /** How to read measured USD cost from a provider response payload; defaults to OpenRouter's `usage.cost`. */
  extractCost?: (payload: Record<string, unknown>) => number | null;
  /** Called after every change, so the state on disk is never behind the calls made. */
  save: (state: LedgerState) => void;
  /** One provider exchange, already scrubbed. */
  log: (entry: Record<string, unknown>) => void;
  scrub: (value: unknown) => unknown;
  url?: string;
}) {
  const url = options.url ?? "https://openrouter.ai/api/v1/chat/completions";
  const extractCost = options.extractCost ?? extractOpenRouterUsageUsd;
  const state: LedgerState = { capUsd: options.capUsd, calls: [], measuredUsd: 0, uncertainUsd: 0, counts: { text: 0, image: 0, check: 0 }, blocked: null };
  const save = () => options.save(state);
  save();
  const fetchFor = (kind: CallKind, phase: () => string): FetchLike => async (target, init) => {
    if (target !== url) throw new Error(`Unexpected provider URL: ${target}`);
    if (state.blocked) throw new Error(`Evaluation stopped: ${state.blocked}`);
    let request: Record<string, unknown> = {};
    try { request = JSON.parse(String(init.body)); } catch { /* an unreadable body has no ceiling */ }
    const reserve = options.ceiling ? options.ceiling(kind, request) : options.reserves[kind];
    if (reserve === null || !Number.isFinite(reserve) || reserve < 0) {
      state.blocked = `No price ceiling for ${String(request.model)}`; save();
      throw new Error(`Evaluation stopped: ${state.blocked}`);
    }
    if (state.measuredUsd + state.uncertainUsd + reserve > options.capUsd || state.counts[kind] >= options.limits[kind]) {
      state.blocked = "Evaluation cap or call limit reached"; save();
      throw new Error(`Evaluation stopped: ${state.blocked}`);
    }
    const call: LedgerCall = { phase: phase(), kind, status: "in-flight", measuredUsd: null };
    state.calls.push(call); state.uncertainUsd += reserve; state.counts[kind]++;
    save();
    try {
      const response = await options.fetch(target, init);
      const body = await response.clone().text();
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(body); } catch { /* a non-JSON body is a provider error below */ }
      // A moderation refusal is that call's failure, as in production, not the run's: the provider charges nothing for it.
      const moderated = response.status === 403 && /moderation|flagged/i.test(JSON.stringify(payload.error ?? ""));
      const cost = moderated ? 0 : extractCost(payload);
      options.log({ ...call, at: new Date().toISOString(), reservedUsd: reserve, request: options.scrub(Object.keys(request).length ? request : String(init.body).slice(0, 300)),
        status: response.status, response: options.scrub(payload), nonJson: Object.keys(payload).length ? undefined : body.slice(0, 300), measuredUsageUsd: cost });
      call.status = String(response.status); call.measuredUsd = cost;
      if (cost === null) state.blocked = "Missing provider usage";
      // Rounded to a billionth of a dollar, so repeated reservations never leave float residue.
      else { state.uncertainUsd = Math.round((state.uncertainUsd - reserve) * 1e9) / 1e9; state.measuredUsd = Math.round((state.measuredUsd + cost) * 1e9) / 1e9; }
      if (!response.ok && !moderated) state.blocked = `Provider error ${response.status}`;
      else if (cost !== null && options.ceiling && cost > reserve + 1e-9) state.blocked = `A call cost $${cost} against its $${reserve} ceiling`;
      else if (state.measuredUsd > options.capUsd) state.blocked = "Evaluation cap exceeded";
      save();
      return response;
    } catch (error) {
      state.blocked ??= error instanceof Error ? error.message : String(error);
      call.status = "uncertain"; save();
      throw error;
    }
  };
  return { state, fetchFor };
}
