export const NOSTR_SCHEDULER_WINDOW_MS = 4 * 60 * 60 * 1000;
export const NOSTR_SCHEDULER_LOCK_TIMEOUT_MS = 30 * 60 * 1000;
export const NOSTR_PUBLISHING_STATE_KEY = "default";

export interface ScheduledNostrCandidate {
  imageId: string;
  createdAt: number;
  impressionCount?: number;
  lastImpressionAt?: number;
}

export function getLatestCompletedWindowStart(now: number): number {
  const currentWindowStart =
    Math.floor(now / NOSTR_SCHEDULER_WINDOW_MS) * NOSTR_SCHEDULER_WINDOW_MS;
  return Math.max(0, currentWindowStart - NOSTR_SCHEDULER_WINDOW_MS);
}

export function getWindowEnd(windowStart: number): number {
  return windowStart + NOSTR_SCHEDULER_WINDOW_MS;
}

export function hasSchedulerLockExpired(
  processingStartedAt: number | undefined,
  now: number
): boolean {
  if (processingStartedAt === undefined) return true;
  return now - processingStartedAt >= NOSTR_SCHEDULER_LOCK_TIMEOUT_MS;
}

export function pickScheduledNostrCandidate<T extends ScheduledNostrCandidate>(
  candidates: T[],
  randomValue: number
): T | null {
  if (candidates.length === 0) {
    return null;
  }

  const viewedCandidates = candidates
    .filter((candidate) => (candidate.impressionCount ?? 0) > 0)
    .sort((a, b) => {
      const impressionDelta =
        (b.impressionCount ?? 0) - (a.impressionCount ?? 0);
      if (impressionDelta !== 0) return impressionDelta;

      const lastImpressionDelta =
        (b.lastImpressionAt ?? 0) - (a.lastImpressionAt ?? 0);
      if (lastImpressionDelta !== 0) return lastImpressionDelta;

      const createdAtDelta = b.createdAt - a.createdAt;
      if (createdAtDelta !== 0) return createdAtDelta;

      return a.imageId.localeCompare(b.imageId);
    });

  if (viewedCandidates.length > 0) {
    return viewedCandidates[0];
  }

  const normalizedRandomValue = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 0.999999999999)
    : 0;
  const randomIndex = Math.floor(normalizedRandomValue * candidates.length);
  return candidates[randomIndex] ?? candidates[0];
}
