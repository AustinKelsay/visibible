/**
 * What the browser and the routes say about free answers (#493). Whether a free answer is available is the server's
 * decision (convex/freeAnswers.ts); this only names the reasons and words them for the reader.
 */

/** Why a free answer is not available: the session's or the network's daily allowance, or the site's free budget. */
export type FreeAnswerRefusal = "session" | "network" | "day" | "month";

/** The free-answer standing the quote route returns beside (or instead of) a quote. */
export type FreeAnswerStanding = { available: true; remaining: number } | { available: false; reason: FreeAnswerRefusal };

const REFUSALS: readonly FreeAnswerRefusal[] = ["session", "network", "day", "month"];

export function parseFreeAnswerStanding(value: unknown): FreeAnswerStanding | null {
  if (!value || typeof value !== "object") return null;
  const { available, remaining, reason } = value as Record<string, unknown>;
  if (available === true && typeof remaining === "number") return { available: true, remaining };
  if (available === false && REFUSALS.includes(reason as FreeAnswerRefusal)) return { available: false, reason: reason as FreeAnswerRefusal };
  return null;
}

/** The reader-facing reason free answers are not available now. */
export function freeAnswersUsedMessage(reason: FreeAnswerRefusal): string {
  if (reason === "day") return "Free answers are used up across Visibible today.";
  if (reason === "month") return "Free answers are paused.";
  return "You've used today's free answers. They return at midnight UTC.";
}
