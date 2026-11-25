/**
 * Gemini Developer API Batch client (`batchGenerateContent` + Files API) for offline-paced evaluation runs at 50% of
 * standard token rates, using the exact same model, prompts, 1K resolution and reference attachments as live runs.
 */
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { supportsResolution } from "../image-models";
import { geminiModelId } from "./adapters";
import { GEMINI_BATCH_DISCOUNT, geminiUsageUsd, type ModelPricing } from "./suite-run";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const GEMINI_FILES_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";

export const geminiBatchUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModelId(model))}:batchGenerateContent`;

export const geminiResourceUrl = (resourceName: string) =>
  `https://generativelanguage.googleapis.com/v1beta/${resourceName.replace(/^\/+/, "")}`;

export const geminiFileDownloadUrl = (fileName: string) =>
  `https://generativelanguage.googleapis.com/download/v1beta/${fileName.replace(/^\/+/, "")}:download?alt=media`;

export const GEMINI_SAFETY_REASONS = /^(SAFETY|IMAGE_SAFETY|PROHIBITED_CONTENT|IMAGE_PROHIBITED_CONTENT|RECITATION|BLOCKLIST|OTHER)$/i;

const TERMINAL_STATES = new Set([
  "BATCH_STATE_SUCCEEDED", "BATCH_STATE_FAILED", "BATCH_STATE_CANCELLED", "BATCH_STATE_EXPIRED",
  "JOB_STATE_SUCCEEDED", "JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED",
]);

export const isGeminiBatchSucceeded = (state: string) => state === "BATCH_STATE_SUCCEEDED" || state === "JOB_STATE_SUCCEEDED";

/** Default per-image input tokens at Gemini 3's standard media resolution, plus generous reasoning allowance for batch budgeting. */
const BATCH_INPUT_IMAGE_TOKENS = 1120;
const BATCH_THOUGHT_TOKEN_ALLOWANCE = 2500;

export interface GeminiUploadedFile {
  name: string;
  uri: string;
}

export type GeminiBatchReference =
  | { kind: "file"; mimeType: string; fileUri: string }
  | { kind: "inline"; mimeType: string; bytes: Uint8Array };

/** Upload bytes once via the Gemini Files resumable upload protocol and return its `{ name, uri }`. */
export async function uploadGeminiFile(options: {
  apiKey: string;
  bytes: Uint8Array;
  mimeType: string;
  displayName: string;
  fetch?: FetchLike;
}): Promise<GeminiUploadedFile> {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const start = await fetchImpl(GEMINI_FILES_UPLOAD_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": options.apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(options.bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": options.mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: options.displayName } }),
  });
  if (!start.ok) {
    const body = await start.text().catch(() => "");
    throw new Error(`Gemini file upload start failed (${start.status}): ${body.slice(0, 300)}`);
  }
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini file upload start returned no x-goog-upload-url header");

  const finalize = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(options.bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: Buffer.from(options.bytes),
  });
  const payload = (await finalize.json().catch(() => ({}))) as { file?: { name?: string; uri?: string; state?: string }; error?: unknown };
  if (!finalize.ok) throw new Error(`Gemini file upload finalize failed (${finalize.status}): ${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
  const name = payload.file?.name;
  const uri = payload.file?.uri;
  if (!name || !uri) throw new Error(`Gemini file upload returned no file name/uri: ${JSON.stringify(payload).slice(0, 300)}`);

  // Images and JSONL are usually ACTIVE immediately; poll briefly if PROCESSING.
  let state = payload.file?.state;
  for (let i = 0; state === "PROCESSING" && i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const check = await fetchImpl(geminiResourceUrl(name), { headers: { "x-goog-api-key": options.apiKey } });
    const info = (await check.json().catch(() => ({}))) as { state?: string; file?: { state?: string } };
    state = info.state ?? info.file?.state;
  }
  if (state === "FAILED") throw new Error(`Gemini uploaded file ${name} entered FAILED state`);
  return { name, uri };
}

/** Best-effort delete of a temporary uploaded file once a batch finishes. */
export async function deleteGeminiFile(options: { apiKey: string; fileName: string; fetch?: FetchLike }): Promise<void> {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  try {
    await fetchImpl(geminiResourceUrl(options.fileName), { method: "DELETE", headers: { "x-goog-api-key": options.apiKey } });
  } catch { /* files auto-expire after 48h */ }
}

/** Build one JSONL entry for `batchGenerateContent` matching live `createGeminiEvalImageProvider` parameters. */
export function buildGeminiBatchLine(options: {
  key: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  references?: readonly GeminiBatchReference[];
}): { key: string; request: Record<string, unknown> } {
  const parts: Array<Record<string, unknown>> = [{ text: options.prompt }];
  for (const ref of options.references ?? []) {
    if (ref.kind === "file") parts.push({ fileData: { mimeType: ref.mimeType, fileUri: ref.fileUri } });
    else parts.push({ inlineData: { mimeType: ref.mimeType, data: Buffer.from(ref.bytes).toString("base64") } });
  }
  return {
    key: options.key,
    request: {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: {
          aspectRatio: options.aspectRatio,
          ...(supportsResolution(options.model) ? { imageSize: options.resolution } : {}),
        },
      },
    },
  };
}

/** Conservative pre-submission cost estimate (USD at 50% batch rates) for one image job so batches stay under cap. */
export function geminiBatchJobBoundUsd(options: {
  promptChars: number;
  referenceCount: number;
  outputTokens1K: number;
  pricing: ModelPricing;
}): number | null {
  const { promptChars, referenceCount, outputTokens1K, pricing } = options;
  if (pricing.imageOutput === null || !Number.isFinite(outputTokens1K) || outputTokens1K <= 0) return null;
  const promptTokens = promptChars + referenceCount * BATCH_INPUT_IMAGE_TOKENS;
  const rates = [pricing, ...pricing.overrides.filter((o) => promptTokens >= o.minPromptTokens)];
  const promptRate = Math.max(...rates.map((r) => r.prompt));
  const completionRate = Math.max(...rates.map((r) => r.completion));
  const usd = (promptTokens * promptRate + BATCH_THOUGHT_TOKEN_ALLOWANCE * completionRate + outputTokens1K * pricing.imageOutput) * GEMINI_BATCH_DISCOUNT;
  return Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 1e9) / 1e9 : null;
}

/** Submit an asynchronous Gemini batch job referencing an uploaded JSONL file (`files/...`). */
export async function submitGeminiBatch(options: {
  apiKey: string;
  model: string;
  inputFileName: string;
  displayName: string;
  fetch?: FetchLike;
}): Promise<{ name: string; state: string; raw: Record<string, unknown> }> {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const response = await fetchImpl(geminiBatchUrl(options.model), {
    method: "POST",
    headers: { "x-goog-api-key": options.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      batch: {
        display_name: options.displayName,
        input_config: { file_name: options.inputFileName },
      },
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Gemini batch submit failed (${response.status}): ${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
  const name = typeof payload.name === "string" ? payload.name : "";
  if (!name) throw new Error(`Gemini batch submit returned no job name: ${JSON.stringify(payload).slice(0, 300)}`);
  const meta = (payload.metadata ?? {}) as Record<string, unknown>;
  const state = typeof meta.state === "string" ? meta.state : typeof payload.state === "string" ? payload.state : "JOB_STATE_PENDING";
  return { name, state, raw: payload };
}

export interface GeminiBatchPollResult {
  name: string;
  state: string;
  responsesFile: string | null;
  error: unknown;
  raw: Record<string, unknown>;
}

/** Read a batch job's state and output file name from a Gemini LRO / Batch response payload. */
export function extractGeminiBatchStatus(batchName: string, payload: Record<string, unknown>): GeminiBatchPollResult {
  const meta = (payload.metadata ?? {}) as Record<string, unknown>;
  const resp = (payload.response ?? {}) as Record<string, unknown>;
  const metaOut = (meta.output ?? {}) as Record<string, unknown>;
  const dest = (payload.dest ?? {}) as Record<string, unknown>;
  const state = typeof meta.state === "string" ? meta.state
    : typeof payload.state === "string" ? payload.state
    : payload.done === true ? (payload.error ? "JOB_STATE_FAILED" : "JOB_STATE_SUCCEEDED") : "JOB_STATE_PENDING";
  const responsesFile = [resp.responsesFile, metaOut.responsesFile, dest.fileName, dest.file_name]
    .find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
  return { name: typeof payload.name === "string" ? payload.name : batchName, state, responsesFile, error: payload.error ?? null, raw: payload };
}

/** Poll a submitted Gemini batch job until it reaches a terminal state or times out. */
export async function pollGeminiBatch(options: {
  apiKey: string;
  batchName: string;
  fetch?: FetchLike;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onPoll?: (status: GeminiBatchPollResult, attempt: number) => void;
}): Promise<GeminiBatchPollResult> {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const pollIntervalMs = options.pollIntervalMs ?? 15_000;
  const deadline = Date.now() + (options.timeoutMs ?? 24 * 60 * 60 * 1000);
  let attempt = 0;
  while (true) {
    attempt++;
    const response = await fetchImpl(geminiResourceUrl(options.batchName), {
      headers: { "x-goog-api-key": options.apiKey },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Gemini batch poll failed (${response.status}): ${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
    const status = extractGeminiBatchStatus(options.batchName, payload);
    options.onPoll?.(status, attempt);
    if (TERMINAL_STATES.has(status.state) || payload.done === true) return status;
    if (Date.now() >= deadline) throw new Error(`Gemini batch ${options.batchName} timed out in state ${status.state}`);
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

/** Download a completed batch's responses JSONL file via the Gemini Files download endpoint. */
export async function downloadGeminiFile(options: { apiKey: string; fileName: string; fetch?: FetchLike }): Promise<string> {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const response = await fetchImpl(geminiFileDownloadUrl(options.fileName), {
    headers: { "x-goog-api-key": options.apiKey },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini file download failed (${response.status}): ${text.slice(0, 300)}`);
  return text;
}

/**
 * Stream a completed batch's responses JSONL file line by line so large image batches (>512 MB with inline
 * base64 images and thought signatures) never exceed V8's maximum string length.
 */
export async function streamGeminiFileLines(options: {
  apiKey: string;
  fileName: string;
  fetch?: FetchLike;
  onLine: (line: string) => void | Promise<void>;
}): Promise<void> {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const response = await fetchImpl(geminiFileDownloadUrl(options.fileName), {
    headers: { "x-goog-api-key": options.apiKey },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gemini file download failed (${response.status}): ${text.slice(0, 300)}`);
  }
  if (!response.body) {
    const text = await response.text();
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (line) await options.onLine(line);
    }
    return;
  }
  const nodeStream = Readable.fromWeb(response.body as unknown as WebReadableStream);
  const rl = createInterface({ input: nodeStream, crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.trim();
    if (line) await options.onLine(line);
  }
}

export type GeminiBatchParsedLine =
  | { key: string; ok: true; bytes: Uint8Array; mimeType: string; costUsd: number | null; providerRequestId: string | null; response: Record<string, unknown> }
  | { key: string; ok: false; moderated: boolean; error: string; costUsd: number | null; response: Record<string, unknown> };

/** Parse one JSONL output line from a Gemini batch responses file and settle its cost at 50% batch rates. */
export function parseGeminiBatchOutputLine(line: string, pricing?: ModelPricing): GeminiBatchParsedLine {
  const parsed = JSON.parse(line) as {
    key?: string;
    metadata?: { key?: string };
    response?: Record<string, unknown>;
    status?: { code?: number; message?: string };
    error?: { code?: number; message?: string };
  };
  const key = parsed.key ?? parsed.metadata?.key ?? "";
  const err = parsed.error ?? (parsed.status?.code ? parsed.status : undefined);
  if (err) {
    return { key, ok: false, moderated: false, error: `Gemini batch error ${err.code ?? ""}: ${err.message ?? JSON.stringify(err)}`.trim(), costUsd: null, response: parsed as Record<string, unknown> };
  }
  const resp = (parsed.response ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(resp.candidates)
    ? resp.candidates as Array<{ finishReason?: string; content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>
    : [];
  const imagePart = candidates.flatMap((c) => c.content?.parts ?? []).find((p) => p?.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const promptFeedback = (resp.promptFeedback ?? {}) as { blockReason?: string };
    const reason = promptFeedback.blockReason ?? candidates[0]?.finishReason ?? "";
    const moderated = GEMINI_SAFETY_REASONS.test(reason);
    const costUsd = moderated ? 0 : (pricing ? geminiUsageUsd(resp, pricing, GEMINI_BATCH_DISCOUNT) : null);
    return {
      key,
      ok: false,
      moderated,
      error: moderated ? `flagged: provider content filter (${reason})` : `Gemini batch returned no image (${reason || "empty"})`,
      costUsd,
      response: resp,
    };
  }
  const mimeType = typeof imagePart.inlineData.mimeType === "string" ? imagePart.inlineData.mimeType : "image/jpeg";
  const costUsd = pricing ? geminiUsageUsd(resp, pricing, GEMINI_BATCH_DISCOUNT) : null;
  return {
    key,
    ok: true,
    bytes: Uint8Array.from(Buffer.from(imagePart.inlineData.data, "base64")),
    mimeType,
    costUsd,
    providerRequestId: typeof resp.responseId === "string" ? resp.responseId : null,
    response: resp,
  };
}
