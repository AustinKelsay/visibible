import { IMAGES_UNAVAILABLE } from "@/lib/image-errors";

/**
 * Why a bulk job paused, as stored in `pausedReason`, with what the reader is shown for it (#552). A job paused by the
 * reader stores no reason. The live run and a reloaded page read the same table, so both show the same message.
 */
export const BULK_PAUSES = {
  /** An earlier attempt for a verse is still running after the wait. */
  in_flight: { shows: "blocked", message: "An earlier attempt for this verse is still running. Resume in a moment to pick up its result." },
  /** A verse was refused for credits with nothing else painting. */
  credits: { shows: "paused", message: null },
  /** The site's rate limit outlasted the waits. */
  rate_limited: { shows: "blocked", message: "Rate limited. Resume to continue when capacity is available." },
  daily_limit: { shows: "blocked", message: "This session has reached today's spending limit. Resume tomorrow to paint the rest." },
  images_unavailable: { shows: "blocked", message: `${IMAGES_UNAVAILABLE}. The job is paused; resume when painting is back.` },
  /** The bound engine, the style, or a scene isn't admitting work; the route's own explanation leads when there is one. */
  engine_unavailable: { shows: "blocked", message: "This job's engine isn't taking new pictures right now. The job is paused; resume when it is available again." },
  style_unavailable: { shows: "blocked", message: "This job's art style isn't available right now. The job is paused; resume when it is available again." },
  preparing: { shows: "blocked", message: "A scene is still being prepared. The job is paused; resume when it is available again." },
  /** Progress could not be saved, after the run had tried again. */
  save_failed: { shows: "blocked", message: "Couldn't save progress. Resume to try again." },
  settings_lost: { shows: "blocked", message: "Bulk generation settings were lost. Resume to try again." },
  security_token: { shows: "blocked", message: "Security token missing. Resume to refresh the session and continue." },
} as const satisfies Record<string, { shows: "paused" | "blocked"; message: string | null }>;

export type BulkPauseReason = keyof typeof BULK_PAUSES;

/** The message for a pause. `detail` is the route's explanation for an engine, style or scene pause, when known. */
export function bulkPauseMessage(reason: BulkPauseReason, detail?: string): string | null {
  if (detail && (reason === "engine_unavailable" || reason === "style_unavailable" || reason === "preparing")) {
    return `${detail} The job is paused; resume when it is available again.`;
  }
  return BULK_PAUSES[reason].message;
}

export function isBulkPauseReason(value: unknown): value is BulkPauseReason {
  return typeof value === "string" && Object.hasOwn(BULK_PAUSES, value);
}
