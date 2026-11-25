/**
 * What holds a chapter job's recovery back, in one place (#552, #563). The coordinator
 * (`src/context/bulk-generation-context.tsx`) keeps one of these for the life of the page.
 *
 * These are not one state: a Pause and a Stop can both be on their way while a settlement of interrupted verses runs,
 * and a failed save can wait out its delay through any of them. So each is its own field, and the two decisions that
 * read them together are methods: whether a sync must wait (`holds`), and whether a failed save is retried
 * (`countFailedSave`).
 */
import type { Id } from "../../convex/_generated/dataModel";

type BulkId = Id<"bulkGenerations">;

/** A settlement of interrupted verses in flight. A sync that finds it marks it, and is owed a fresh sync after it. */
export type Settlement = { bulkId: BulkId; skippedSync: boolean };

/** A run that ended on a failed Convex write starts again after this long, this many times in a row (#552). */
const SAVE_RETRY_DELAY_MS = 5000;
const SAVE_RETRY_LIMIT = 3;

export class BulkRecovery {
  private pause = false;
  private stop = false;
  private job: { id: BulkId; status: string } | null = null;
  private dismissed = 0;
  private inFlight: Settlement | null = null;
  /** Runs in a row that ended on a failed save; a painted verse resets it. */
  private saveFailures = 0;
  private retryTimer: number | null = null;

  /** The reader's Pause is on its way to Convex: no run starts, and no snapshot clears the pause, until it settles. */
  get pausing() {
    return this.pause;
  }

  setPausing(pausing: boolean) {
    this.pause = pausing;
  }

  /** The reader's Stop is on its way, so an older "active" snapshot can't undo it. */
  get stopping() {
    return this.stop;
  }

  setStopping(stopping: boolean) {
    this.stop = stopping;
  }

  /** The job Convex last reported, and its status: only that job's failed saves are retried, and only while active. */
  report(id: BulkId, status: string) {
    this.job = { id, status };
  }

  /** Bumped by Done: a reply that arrives for work begun before it leaves the next job's recovery and lock alone. */
  get dismissals() {
    return this.dismissed;
  }

  /** A failed save is waiting out its delay before the job starts again. */
  get retryPending() {
    return this.retryTimer !== null;
  }

  /**
   * Whether a sync of this job must write and start nothing: while a failed save waits out its delay, while the
   * reader's Pause or Stop is on its way, or while another settlement of this job is in flight. Each of those starts a
   * fresh sync when it ends; a settlement in flight is marked so it does. `own` is the settlement the asking sync
   * runs, which never holds it.
   */
  holds(bulkId: BulkId, own: Settlement | null = null) {
    const inFlight = this.inFlight;
    if (inFlight && inFlight !== own && inFlight.bulkId === bulkId) {
      inFlight.skippedSync = true;
      return true;
    }
    return this.retryPending || this.pausing || this.stopping;
  }

  /** The settlement of interrupted verses begins: one at a time holds the run lock. */
  startSettlement(bulkId: BulkId): Settlement {
    this.inFlight = { bulkId, skippedSync: false };
    return this.inFlight;
  }

  endSettlement(settlement: Settlement) {
    if (this.inFlight === settlement) this.inFlight = null;
  }

  /**
   * Counts a failed save of this job, begun when Done had been pressed `dismissals` times, and says what follows:
   * nothing (the reader stopped or paused it, or dismissed it since), a retry, or, after the limit, the job blocked.
   */
  countFailedSave(bulkId: BulkId, dismissals: number, stopped: boolean): "none" | "retry" | "block" {
    const job = this.job;
    if (
      dismissals !== this.dismissed ||
      stopped ||
      this.pausing ||
      (job !== null && (job.id !== bulkId || job.status !== "active"))
    ) return "none";
    this.saveFailures++;
    if (this.saveFailures <= SAVE_RETRY_LIMIT) return "retry";
    this.saveFailures = 0;
    return "block";
  }

  /** Starts the job again after the delay, replacing any wait already scheduled. */
  scheduleRetry(start: () => void) {
    this.clearRetry();
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      start();
    }, SAVE_RETRY_DELAY_MS);
  }

  clearRetry() {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** A verse was painted and saved, or the reader resumed or stopped the job: failed saves in a row start from none. */
  resetSaveFailures() {
    this.saveFailures = 0;
  }

  /** Done: work begun before it leaves the next job alone. */
  dismiss() {
    this.dismissed++;
    this.clearRetry();
    this.saveFailures = 0;
    this.job = null;
  }
}
