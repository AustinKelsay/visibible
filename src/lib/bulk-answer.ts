/**
 * What the image route's answer means for one verse of a chapter job (#530, #563): the waits a verse sits out before
 * its answer counts, and the outcome that answer gives. The coordinator (`src/context/bulk-generation-context.tsx`)
 * decides what each outcome writes.
 */
import { ART_STYLE_UNAVAILABLE, DAILY_LIMIT_EXCEEDED, ENGINE_BINDING_CHANGED, IMAGES_UNAVAILABLE } from "@/lib/image-errors";
import type { BulkPauseReason } from "@/lib/bulk-pause";

const ITEM_RETRY_LIMIT = 3;
const ITEM_RETRY_DELAY_MS = 2000;
const IN_FLIGHT_WAIT_LIMIT = 20;
const IN_FLIGHT_WAIT_DELAY_MS = 3000;
const RATE_LIMIT_WAIT_LIMIT = 5;

export const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Sends a verse's request and waits out the answers worth waiting for. Retryable refusals (a scene still preparing,
 * a style briefly unavailable) get a few tries. The site's rate limit is waited out and the same request sent again;
 * the daily limit is not. An accepted-but-unfinished earlier attempt (202) is waited on, never repeated. Each wait
 * follows the latest answer, so a retry answered by another kind of refusal is waited out in turn, with a budget for
 * each kind (#552).
 *
 * A refusal before admission started nothing, so after each wait the verse is sent again only while the run still
 * wants it: null when it does not (stopped, paused or handed to another tab), and the verse goes back to the queue.
 * A poll is a fresh admission once the earlier attempt is gone, so it too waits for a run that wants it.
 */
export async function sendWaitingOutRefusals(submit: () => Promise<Response>, stillWanted: () => boolean): Promise<Response | null> {
  let response = await submit();
  const waits = { retryable: 0, rateLimit: 0, inFlight: 0 };
  for (;;) {
    let delayMs: number | null = null;
    if (response.status === 503 && waits.retryable < ITEM_RETRY_LIMIT) {
      const body = await response.clone().json().catch(() => null) as { retryable?: boolean } | null;
      if (body?.retryable) {
        waits.retryable++;
        delayMs = ITEM_RETRY_DELAY_MS;
      }
    } else if (response.status === 429 && waits.rateLimit < RATE_LIMIT_WAIT_LIMIT) {
      const body = await response.clone().json().catch(() => null) as { error?: string; retryAfter?: number } | null;
      if (body?.error !== DAILY_LIMIT_EXCEEDED) {
        waits.rateLimit++;
        const seconds = Number(body?.retryAfter ?? response.headers.get("Retry-After"));
        delayMs = (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
      }
    } else if (response.status === 202 && waits.inFlight < IN_FLIGHT_WAIT_LIMIT) {
      waits.inFlight++;
      delayMs = IN_FLIGHT_WAIT_DELAY_MS;
    }
    if (delayMs === null) return response;
    await sleep(delayMs);
    if (!stillWanted()) return null;
    response = await submit();
  }
}

/** What a verse's final answer means. */
export type VerseAnswer =
  /** Painted and charged; the engine it ran on binds an unbound job (#178). */
  | { kind: "painted"; creditsCost: number; engine?: "legacy" | "generic" }
  /** Refused for credits: other verses' holds may be what the balance lacked. */
  | { kind: "credits" }
  /** The job waits: the verse goes back to the queue, its request id spent when `spentRequest` says so. */
  | { kind: "pause"; reason: BulkPauseReason; spentRequest: boolean }
  /** The verse failed; nothing was charged. */
  | { kind: "failed"; error: string };

/** Reads the route's final answer for a verse. A painted answer whose body cannot be read throws, as a failed request. */
export async function readVerseAnswer(response: Response): Promise<VerseAnswer> {
  if (response.ok && response.status !== 202) {
    const data = await response.json();
    return {
      kind: "painted",
      creditsCost: data.creditsCost ?? 0,
      ...(data.engine === "legacy" || data.engine === "generic" ? { engine: data.engine } : {}),
    };
  }
  // Still running server-side after the wait: left queued, so Resume replays it.
  if (response.status === 202) return { kind: "pause", reason: "in_flight", spentRequest: false };
  if (response.status === 402) return { kind: "credits" };
  if (response.status === 429) {
    const daily = (await response.json().catch(() => null) as { error?: string } | null)?.error === DAILY_LIMIT_EXCEEDED;
    // A daily-limit refusal of the hold can leave its request failed: the requeue marks it spent, and Convex gives the
    // verse its next request id only then (#562).
    return daily ? { kind: "pause", reason: "daily_limit", spentRequest: true } : { kind: "pause", reason: "rate_limited", spentRequest: false };
  }
  const errData = await response.json().catch(() => null) as { error?: string; message?: string; retryable?: boolean } | null;
  if (response.status === 503 && errData?.error === IMAGES_UNAVAILABLE) {
    // The provider could not take any request. Nothing was charged, and the next verse would fail the same way, so
    // the job waits. This request id is spent (sent again it replays the failure), so the verse goes back to the
    // queue with its next one. The server already sent the call again for a rate limit or a full in-flight budget.
    return { kind: "pause", reason: "images_unavailable", spentRequest: true };
  }
  // The job keeps its configuration and completed outcomes; nothing was charged. It waits for the engine or style to
  // be admitted again rather than switching.
  if (response.status === 409 && errData?.error === ENGINE_BINDING_CHANGED) {
    return { kind: "pause", reason: "engine_unavailable", spentRequest: false };
  }
  if (response.status === 503 && errData?.retryable === true) {
    return { kind: "pause", reason: errData.error === ART_STYLE_UNAVAILABLE ? "style_unavailable" : "preparing", spentRequest: false };
  }
  return { kind: "failed", error: errData?.error || errData?.message || `HTTP ${response.status}` };
}
