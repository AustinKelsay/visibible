/**
 * OpenRouter video provider. Runs in both Next.js and the Convex default runtime,
 * so it uses only web-standard APIs (fetch, AbortController, Blob). Never import
 * Node modules or Next.js APIs here.
 */
import {
  VIDEO_ASPECT_RATIO,
  VIDEO_DURATIONS,
  VIDEO_MODEL_ID,
  VIDEO_RESOLUTIONS,
  videoCreditsForCost,
  type VideoDuration,
  type VideoQuote,
  type VideoResolution,
} from "./video-generation";

const API_URL = "https://openrouter.ai/api/v1/videos";
const JOB_ID = /^[A-Za-z0-9_-]{1,200}$/;
const REQUEST_TIMEOUT_MS = 45_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const CATALOG_TIMEOUT_MS = 15_000;
const CATALOG_CACHE_MS = 5 * 60_000;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
// Completed-clip redirects observed from OpenRouter point at signed GCS URLs.
const CONTENT_HOSTS = new Set(["storage.googleapis.com"]);
// Fail closed on prices outside a sane band rather than quoting a broken catalog entry.
const MAX_PRICE_PER_SECOND_USD = 1;

export type ProviderVideoStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";
export interface ProviderVideoJob {
  id: string;
  status: ProviderVideoStatus;
  costUsd?: number;
  error?: string;
}

/**
 * `ambiguous` means the provider may have accepted the job even though we saw an
 * error (network failure, timeout, 5xx, unreadable 2xx). Callers must not resubmit.
 */
export class VideoRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly ambiguous = false,
  ) {
    super(message);
    this.name = "VideoRequestError";
  }
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key)
    throw new VideoRequestError("OpenRouter API key is not configured.", 503);
  return key;
}

async function timedFetch<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    // Keep the deadline active until the body has been consumed, not just the headers.
    return await read(response);
  } finally {
    clearTimeout(timer);
  }
}

async function providerFetch(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const key = apiKey();
  try {
    return await timedFetch(
      `${API_URL}${path}`,
      {
        ...init,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      },
      REQUEST_TIMEOUT_MS,
      async (response) => {
        if (response.ok) return readJson(response);
        await response.body?.cancel().catch(() => {});
        if (response.status >= 500 || response.status === 408) {
          throw new VideoRequestError(
            "OpenRouter had a temporary error.",
            502,
            true,
          );
        }
        if (response.status === 429)
          throw new VideoRequestError(
            "OpenRouter is busy. Please try again later.",
            429,
          );
        if (response.status === 402)
          throw new VideoRequestError(
            "OpenRouter has insufficient funds for video generation.",
            502,
          );
        throw new VideoRequestError(
          "OpenRouter rejected the video request.",
          502,
        );
      },
    );
  } catch (error) {
    if (error instanceof VideoRequestError) throw error;
    throw new VideoRequestError(
      "OpenRouter did not respond in time.",
      504,
      true,
    );
  }
}

/** Exported for tests. Maps OpenRouter job JSON to our provider status. */
export function parseVideoJob(
  data: unknown,
  expectedId?: string,
): ProviderVideoJob {
  const record =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const id = record.id;
  if (
    typeof id !== "string" ||
    !JOB_ID.test(id) ||
    (expectedId !== undefined && id !== expectedId)
  ) {
    throw new VideoRequestError("Invalid video provider response.", 502, true);
  }
  const usage =
    record.usage && typeof record.usage === "object"
      ? (record.usage as Record<string, unknown>)
      : {};
  const cost = usage.cost;
  const costUsd =
    typeof cost === "number" && Number.isFinite(cost) && cost >= 0
      ? { costUsd: cost }
      : {};
  switch (record.status) {
    case "pending":
    case "queued":
      return { id, status: "queued", ...costUsd };
    case "in_progress":
    case "processing":
      return { id, status: "processing", ...costUsd };
    case "completed":
      return { id, status: "completed", ...costUsd };
    case "failed":
    case "cancelled":
    case "expired":
      return {
        id,
        status: "failed",
        ...costUsd,
        error: `Video generation ${record.status === "failed" ? "failed" : record.status}.`,
      };
    default:
      throw new VideoRequestError(
        "Unrecognized video provider status.",
        502,
        true,
      );
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new VideoRequestError("Invalid video provider response.", 502, true);
  }
}

function assertJobId(id: string) {
  if (!JOB_ID.test(id)) throw new VideoRequestError("Invalid video job.", 400);
}

/** Submits exactly once. Never retry on an ambiguous error: the job may exist. */
export async function submitVideo(input: {
  prompt: string;
  duration: VideoDuration;
  resolution: VideoResolution;
}): Promise<ProviderVideoJob> {
  if (
    !VIDEO_DURATIONS.includes(input.duration) ||
    !VIDEO_RESOLUTIONS.includes(input.resolution) ||
    !input.prompt.trim()
  ) {
    throw new VideoRequestError("Unsupported video settings.", 400);
  }
  const data = await providerFetch("", {
    method: "POST",
    body: JSON.stringify({
      model: VIDEO_MODEL_ID,
      prompt: input.prompt,
      duration: input.duration,
      resolution: input.resolution,
      aspect_ratio: VIDEO_ASPECT_RATIO,
    }),
  });
  return parseVideoJob(data);
}

export async function pollVideo(id: string): Promise<ProviderVideoJob> {
  assertJobId(id);
  return parseVideoJob(await providerFetch(`/${encodeURIComponent(id)}`), id);
}

function isAllowedContentUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (url.port === "" || url.port === "443") &&
    CONTENT_HOSTS.has(url.hostname)
  );
}

/**
 * Downloads the finished MP4. The API key is sent only to OpenRouter; a redirect
 * is followed once, without credentials, and only to an allowlisted HTTPS host.
 */
export async function downloadVideo(id: string): Promise<Blob> {
  assertJobId(id);
  const key = apiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const fail = (message = "Video download is unavailable.") =>
    new VideoRequestError(message, 502);
  try {
    const contentUrl = `${API_URL}/${encodeURIComponent(id)}/content?index=0`;
    let response = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${key}` },
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      let target: URL;
      try {
        target = new URL(location ?? "", contentUrl);
      } catch {
        throw fail();
      }
      if (!location || !isAllowedContentUrl(target))
        throw fail("Video download redirected to an untrusted host.");
      response = await fetch(target, {
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      });
    }
    const contentType = response.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (
      response.status !== 200 ||
      !response.body ||
      contentType !== "video/mp4" ||
      declared > MAX_VIDEO_BYTES
    ) {
      await response.body?.cancel().catch(() => {});
      throw fail();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_VIDEO_BYTES) {
        await reader.cancel().catch(() => {});
        throw fail("Video is too large to store.");
      }
      chunks.push(value);
    }
    const blob = new Blob(chunks as BlobPart[], { type: "video/mp4" });
    const head = new Uint8Array(await blob.slice(4, 8).arrayBuffer());
    if (String.fromCharCode(...head) !== "ftyp")
      throw fail("Video download was not a valid MP4.");
    return blob;
  } catch (error) {
    if (error instanceof VideoRequestError) throw error;
    throw fail();
  } finally {
    clearTimeout(timer);
  }
}

let catalogCache: { expires: number; quotes: VideoQuote[] } | null = null;

/** Exported for tests. Builds quotes from one catalog entry, or null if anything is off. */
export function quotesFromCatalog(data: unknown): VideoQuote[] | null {
  const models =
    data &&
    typeof data === "object" &&
    Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : [];
  const entry = models.find(
    (item): item is Record<string, unknown> =>
      !!item &&
      typeof item === "object" &&
      (item as { id?: unknown }).id === VIDEO_MODEL_ID,
  );
  if (!entry) return null;
  const listIncludes = (field: string, value: unknown) =>
    Array.isArray(entry[field]) && (entry[field] as unknown[]).includes(value);
  if (!listIncludes("supported_aspect_ratios", VIDEO_ASPECT_RATIO)) return null;
  const skus =
    entry.pricing_skus && typeof entry.pricing_skus === "object"
      ? (entry.pricing_skus as Record<string, unknown>)
      : {};
  const quotes: VideoQuote[] = [];
  for (const resolution of VIDEO_RESOLUTIONS) {
    const raw = skus[`duration_seconds_${resolution}`];
    const perSecond =
      typeof raw === "string" && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
    if (
      !listIncludes("supported_resolutions", resolution) ||
      !(perSecond > 0) ||
      perSecond > MAX_PRICE_PER_SECOND_USD
    )
      return null;
    for (const duration of VIDEO_DURATIONS) {
      if (!listIncludes("supported_durations", duration)) return null;
      const providerCostUsd = Math.round(perSecond * duration * 1e6) / 1e6;
      quotes.push({
        duration,
        resolution,
        providerCostUsd,
        credits: videoCreditsForCost(providerCostUsd),
      });
    }
  }
  return quotes;
}

/** Live quotes from the public catalog with a short success-only cache. Throws when unavailable. */
export async function fetchVideoQuotes(): Promise<VideoQuote[]> {
  if (catalogCache && catalogCache.expires > Date.now())
    return catalogCache.quotes;
  let data: unknown;
  try {
    data = await timedFetch(
      `${API_URL}/models`,
      { redirect: "error" },
      CATALOG_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      },
    );
  } catch {
    throw new VideoRequestError("Video pricing is unavailable right now.", 503);
  }
  const quotes = quotesFromCatalog(data);
  if (!quotes)
    throw new VideoRequestError("Video pricing is unavailable right now.", 503);
  catalogCache = { expires: Date.now() + CATALOG_CACHE_MS, quotes };
  return quotes;
}

/** Test hook. */
export function resetVideoQuoteCache() {
  catalogCache = null;
}
