import { describe, expect, it } from "vitest";
import {
  getLatestCompletedWindowStart,
  getWindowEnd,
  hasSchedulerLockExpired,
  NOSTR_SCHEDULER_LOCK_TIMEOUT_MS,
  NOSTR_SCHEDULER_WINDOW_MS,
  pickScheduledNostrCandidate,
} from "../nostrScheduling";

describe("getLatestCompletedWindowStart", () => {
  it("returns the previous 4-hour boundary when called exactly on a boundary", () => {
    const now = 3 * NOSTR_SCHEDULER_WINDOW_MS;
    expect(getLatestCompletedWindowStart(now)).toBe(
      2 * NOSTR_SCHEDULER_WINDOW_MS
    );
  });

  it("returns the start of the latest fully completed 4-hour window", () => {
    const now = 3 * NOSTR_SCHEDULER_WINDOW_MS + 90 * 60 * 1000;
    expect(getLatestCompletedWindowStart(now)).toBe(
      2 * NOSTR_SCHEDULER_WINDOW_MS
    );
  });
});

describe("getWindowEnd", () => {
  it("adds exactly one 4-hour window", () => {
    expect(getWindowEnd(1234)).toBe(1234 + NOSTR_SCHEDULER_WINDOW_MS);
  });
});

describe("hasSchedulerLockExpired", () => {
  it("treats missing lock timestamps as expired", () => {
    expect(hasSchedulerLockExpired(undefined, Date.now())).toBe(true);
  });

  it("expires locks once the timeout threshold is reached", () => {
    const startedAt = 10_000;
    expect(
      hasSchedulerLockExpired(
        startedAt,
        startedAt + NOSTR_SCHEDULER_LOCK_TIMEOUT_MS
      )
    ).toBe(true);
  });
});

describe("pickScheduledNostrCandidate", () => {
  it("prefers the highest viewed image", () => {
    const candidate = pickScheduledNostrCandidate(
      [
        { imageId: "a", createdAt: 1, impressionCount: 3, lastImpressionAt: 5 },
        { imageId: "b", createdAt: 2, impressionCount: 8, lastImpressionAt: 6 },
        { imageId: "c", createdAt: 3, impressionCount: 2, lastImpressionAt: 7 },
      ],
      0.2
    );

    expect(candidate?.imageId).toBe("b");
  });

  it("breaks impression ties by most recent impression and creation time", () => {
    const candidate = pickScheduledNostrCandidate(
      [
        { imageId: "a", createdAt: 1, impressionCount: 5, lastImpressionAt: 10 },
        { imageId: "b", createdAt: 2, impressionCount: 5, lastImpressionAt: 20 },
        { imageId: "c", createdAt: 3, impressionCount: 5, lastImpressionAt: 20 },
      ],
      0.2
    );

    expect(candidate?.imageId).toBe("c");
  });

  it("falls back to a random candidate when there are no impressions yet", () => {
    const candidate = pickScheduledNostrCandidate(
      [
        { imageId: "a", createdAt: 1 },
        { imageId: "b", createdAt: 2 },
        { imageId: "c", createdAt: 3 },
      ],
      0.5
    );

    expect(candidate?.imageId).toBe("b");
  });

  it("returns null when no candidates are available", () => {
    expect(pickScheduledNostrCandidate([], 0.1)).toBeNull();
  });
});
