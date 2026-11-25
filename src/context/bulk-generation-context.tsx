"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { bulkItemRequestId } from "../../convex/_helpers/bulkRequestId";
import { ART_STYLE_UNAVAILABLE, DAILY_LIMIT_EXCEEDED, ENGINE_BINDING_CHANGED, IMAGES_UNAVAILABLE } from "@/lib/image-errors";
import { BULK_PAUSES, bulkPauseMessage, isBulkPauseReason, type BulkPauseReason } from "@/lib/bulk-pause";
import { useSession } from "@/context/session-context";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf-constants";
import { useAdvancedSettings } from "@/lib/advanced-settings";
import type { BulkScope, BulkQueueItem } from "@/lib/bulk-generation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BulkGenerationStatus =
  | "idle"
  | "active"
  | "blocked"
  | "paused"
  | "completed"
  | "cancelled";

export interface BulkGenerationState {
  status: BulkGenerationStatus;
  bulkId: Id<"bulkGenerations"> | null;
  totalVerses: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  totalCreditsUsed: number;
  currentVerseReference: string | null;
  errorMessage: string | null;
}

interface BulkGenerationCounters {
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  totalCreditsUsed: number;
}

type BulkGenerationVerse = Doc<"bulkGenerationVerses">;
type BulkVerseStatus = BulkGenerationVerse["status"];
type VerseWriteExtra = {
  expectedCurrentStatus?: BulkVerseStatus;
  creditsCost?: number;
  error?: string;
  spentRequest?: boolean;
};

interface BulkGenerationContextType {
  state: BulkGenerationState;
  /** Start a new bulk generation */
  startBulkGeneration: (params: {
    scope: BulkScope;
    scopeLabel: string;
    queue: BulkQueueItem[];
    estimatedTotalCredits: number;
    /** The model, ratio and resolution for every item. Default: the reader's Advanced settings. */
    modelId?: string;
    aspectRatio?: string;
    resolution?: string;
    translation: string;
    /** The art style for every item; Classical until the reader can choose one. */
    artStyleId?: string;
  }) => Promise<void>;
  /** Pause the running bulk generation */
  pauseBulkGeneration: () => Promise<void>;
  /** Resume a paused bulk generation */
  resumeBulkGeneration: () => Promise<void>;
  /** Cancel the bulk generation */
  cancelBulkGeneration: () => Promise<void>;
  /** Reset state after completion/cancellation (dismiss the results view) */
  dismissBulkGeneration: () => void;
}

const DEFAULT_STATE: BulkGenerationState = {
  status: "idle",
  bulkId: null,
  totalVerses: 0,
  completedCount: 0,
  failedCount: 0,
  skippedCount: 0,
  totalCreditsUsed: 0,
  currentVerseReference: null,
  errorMessage: null,
};

const RUN_LOCK_TTL_MS = 15000;
const RUN_LOCK_HEARTBEAT_MS = 5000;
const RUN_LOCK_RETRY_JITTER_MS = 250;
const RUNNER_VERSE_PAGE_SIZE = 100;
const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ITEM_RETRY_LIMIT = 3;
const ITEM_RETRY_DELAY_MS = 2000;
const IN_FLIGHT_WAIT_LIMIT = 20;
const IN_FLIGHT_WAIT_DELAY_MS = 3000;
const BULK_CONCURRENCY = 4;
/** The owner (an admin session) paints eight at once; the route allows it twice the image requests (#552). */
const OWNER_BULK_CONCURRENCY = 8;
const RATE_LIMIT_WAIT_LIMIT = 5;
/** A run that ended on a failed Convex write starts again after this long, this many times in a row (#552). */
const SAVE_RETRY_DELAY_MS = 5000;
const SAVE_RETRY_LIMIT = 3;
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** A Convex write that failed. It ends the run for the save recovery rather than failing the verse it was about (#552). */
class SaveFailed extends Error {}
const saved = <T,>(write: Promise<T>) =>
  write.catch((error: unknown) => {
    throw new SaveFailed(error instanceof Error ? error.message : String(error), { cause: error });
  });

/** A job's counters as its verse rows record them, never lower than the job's own (a progress write can fail). */
function countersFrom(verses: BulkGenerationVerse[], job: BulkGenerationCounters): BulkGenerationCounters {
  const done = verses.filter((verse) => verse.status === "completed");
  return {
    completedCount: Math.max(job.completedCount, done.length),
    failedCount: Math.max(job.failedCount, verses.filter((verse) => verse.status === "failed").length),
    skippedCount: Math.max(job.skippedCount, verses.filter((verse) => verse.status === "skipped").length),
    totalCreditsUsed: Math.max(job.totalCreditsUsed, done.reduce((sum, verse) => sum + (verse.creditsCost ?? 0), 0)),
  };
}

const BulkGenerationContext = createContext<BulkGenerationContextType | null>(
  null
);

export function BulkGenerationProvider({ children }: { children: ReactNode }) {
  const { sid, credits, tier } = useSession();
  const convexEnabled = useConvexEnabled();
  const { isAuthenticated } = useConvexAuth();
  const convex = useConvex();

  const [state, setState] = useState<BulkGenerationState>(DEFAULT_STATE);
  const [runLoopTrigger, setRunLoopTrigger] = useState(0);
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  // Set while a Stop is on its way to Convex, so an older "active" snapshot can't undo it.
  const cancellingRef = useRef(false);
  // Set while the reader's Pause is on its way: no run starts, and no snapshot clears the pause, until it settles.
  const pausingRef = useRef(false);
  // The job Convex last reported, and its status: only that job's failed saves are retried, and only while active.
  const bulkJobRef = useRef<{ id: Id<"bulkGenerations">; status: string } | null>(null);
  // Bumped by Dismiss: a reply that arrives for work begun before it leaves the next job's recovery and lock alone.
  const dismissalsRef = useRef(0);
  // The settlement of interrupted verses now in flight: one at a time holds the run lock. A sync that finds it in
  // flight marks it, and that settlement starts a fresh sync once it gives the lock back.
  const reconcilingRef = useRef<{ bulkId: Id<"bulkGenerations">; skippedSync: boolean } | null>(null);
  // A Resume that lands while a run is still draining finds no runner to start, so that run restarts once it ends.
  const resumedDuringRunRef = useRef(false);
  // Bumped by each run and by Dismiss; a run whose number is stale leaves shared run state to its successor.
  const runGenerationRef = useRef(0);
  // Runs in a row that ended on a failed save; a painted verse resets it.
  const saveFailuresRef = useRef(0);
  const saveRetryTimeoutRef = useRef<number | null>(null);
  const tierRef = useRef(tier);
  useEffect(() => {
    tierRef.current = tier;
  }, [tier]);
  const isRunningRef = useRef(false);
  const lostLockRef = useRef(false);
  const pausedResolverRef = useRef<(() => void) | null>(null);
  const queueRef = useRef<BulkQueueItem[]>([]);
  // Bulk painting uses the reader's Advanced image settings unless the caller names its own.
  const advanced = useAdvancedSettings();
  const advancedRef = useRef(advanced);
  useEffect(() => {
    advancedRef.current = advanced;
  });
  const runLockBulkIdRef = useRef<Id<"bulkGenerations"> | null>(null);
  const runLockHeartbeatRef = useRef<number | null>(null);
  const runLockLeaseCheckRef = useRef<number | null>(null);
  const runLockRetryTimeoutRef = useRef<number | null>(null);
  const runLockLastHeartbeatAtRef = useRef<number>(0);
  const acquireRunLockRef = useRef<(bulkId: Id<"bulkGenerations">) => boolean>(() => false);
  const runLockChannelRef = useRef<BroadcastChannel | null>(null);
  const settingsRef = useRef<{
    modelId: string;
    aspectRatio: string;
    resolution: string;
    translation: string;
    /** The job's art style and, once the first item is accepted, its bound engine (#178). */
    artStyleId: string;
    engine?: "legacy" | "generic";
  } | null>(null);
  const reconciledBulkIdRef = useRef<Id<"bulkGenerations"> | null>(null);
  const sessionCreditsRef = useRef(credits);

  // Convex mutations
  const createBulk = useMutation(api.bulkGenerations.create);
  const updateVerseStatus = useMutation(api.bulkGenerations.updateVerseStatus);
  const updateProgress = useMutation(api.bulkGenerations.updateProgress);
  const pauseBulk = useMutation(api.bulkGenerations.pause);
  const resumeBulk = useMutation(api.bulkGenerations.resume);
  const cancelBulk = useMutation(api.bulkGenerations.cancel);
  const bindEngine = useMutation(api.bulkGenerations.bindEngine);
  const reconcileInterrupted = useMutation(api.bulkGenerations.reconcileInterrupted);

  const getRunLockStorageKey = useCallback(
    (bulkId: Id<"bulkGenerations">) => `bulk-gen-lock-${bulkId}`,
    []
  );

  const readCsrfToken = useCallback(() => {
    const csrfCookiePrefix = `${CSRF_COOKIE_NAME}=`;
    return document.cookie
      .split("; ")
      .find((row) => row.startsWith(csrfCookiePrefix))
      ?.slice(csrfCookiePrefix.length);
  }, []);

  const stopRunLockHeartbeat = useCallback(() => {
    if (runLockHeartbeatRef.current !== null) {
      window.clearInterval(runLockHeartbeatRef.current);
      runLockHeartbeatRef.current = null;
    }
    if (runLockLeaseCheckRef.current !== null) {
      window.clearInterval(runLockLeaseCheckRef.current);
      runLockLeaseCheckRef.current = null;
    }
    if (runLockRetryTimeoutRef.current !== null) {
      window.clearTimeout(runLockRetryTimeoutRef.current);
      runLockRetryTimeoutRef.current = null;
    }
  }, []);

  const scheduleRunLockRetry = useCallback((bulkId: Id<"bulkGenerations">, delayMs: number) => {
    if (runLockRetryTimeoutRef.current !== null) {
      window.clearTimeout(runLockRetryTimeoutRef.current);
    }
    runLockRetryTimeoutRef.current = window.setTimeout(() => {
      runLockRetryTimeoutRef.current = null;
      if (!isRunningRef.current && !isCancelledRef.current) {
        const acquired = acquireRunLockRef.current(bulkId);
        if (acquired) {
          setRunLoopTrigger((value) => value + 1);
        }
      }
    }, Math.max(0, delayMs));
  }, []);

  const releaseRunLock = useCallback((bulkId?: Id<"bulkGenerations"> | null) => {
    const targetBulkId = bulkId ?? runLockBulkIdRef.current;
    if (!targetBulkId) return;

    stopRunLockHeartbeat();

    const storageKey = getRunLockStorageKey(targetBulkId);
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as { owner: string };
        if (parsed.owner === TAB_ID) {
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    runLockChannelRef.current?.postMessage({
      type: "release",
      bulkId: targetBulkId,
      owner: TAB_ID,
    });
    runLockChannelRef.current?.close();
    runLockChannelRef.current = null;
    runLockBulkIdRef.current = null;
    runLockLastHeartbeatAtRef.current = 0;
    lostLockRef.current = false;
  }, [getRunLockStorageKey, stopRunLockHeartbeat]);

  const ownsRunLock = useCallback((bulkId: Id<"bulkGenerations">) => {
    const raw = window.localStorage.getItem(getRunLockStorageKey(bulkId));
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { owner: string; expiresAt: number };
      return parsed.owner === TAB_ID && parsed.expiresAt > Date.now();
    } catch {
      return false;
    }
  }, [getRunLockStorageKey]);

  const acquireRunLock = useCallback((bulkId: Id<"bulkGenerations">) => {
    const storageKey = getRunLockStorageKey(bulkId);
    const now = Date.now();
    const existingRaw = window.localStorage.getItem(storageKey);

    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as { owner: string; expiresAt: number };
        if (existing.owner !== TAB_ID && existing.expiresAt > now) {
          const delay = existing.expiresAt - now + RUN_LOCK_RETRY_JITTER_MS;
          scheduleRunLockRetry(bulkId, delay);
          return false;
        }
      } catch {
        // Replace malformed lock state below.
      }
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        owner: TAB_ID,
        expiresAt: now + RUN_LOCK_TTL_MS,
      })
    );

    if (!ownsRunLock(bulkId)) {
      return false;
    }

    stopRunLockHeartbeat();
    runLockChannelRef.current?.close();
    runLockChannelRef.current =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(`bulk-gen-${bulkId}`)
        : null;
    runLockBulkIdRef.current = bulkId;
    runLockLastHeartbeatAtRef.current = Date.now();
    lostLockRef.current = false;

    if (runLockChannelRef.current) {
      runLockChannelRef.current.onmessage = (event: MessageEvent) => {
        const message = event.data as
          | { type?: string; bulkId?: string; owner?: string }
          | undefined;
        if (!message || message.bulkId !== bulkId || message.owner === TAB_ID) {
          return;
        }
        if (message.type === "heartbeat") {
          runLockLastHeartbeatAtRef.current = Date.now();
          return;
        }
        if (message.type === "takeover") {
          lostLockRef.current = true;
          isPausedRef.current = true;
          pausedResolverRef.current?.();
          pausedResolverRef.current = null;
          scheduleRunLockRetry(bulkId, RUN_LOCK_RETRY_JITTER_MS);
          return;
        }
        if (message.type !== "heartbeat") {
          scheduleRunLockRetry(bulkId, RUN_LOCK_RETRY_JITTER_MS);
        }
      };

      runLockChannelRef.current.postMessage({
        type: "takeover",
        bulkId,
        owner: TAB_ID,
      });
    }

    runLockHeartbeatRef.current = window.setInterval(() => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          owner: TAB_ID,
          expiresAt: Date.now() + RUN_LOCK_TTL_MS,
        })
      );
      runLockChannelRef.current?.postMessage({
        type: "heartbeat",
        bulkId,
        owner: TAB_ID,
      });
    }, RUN_LOCK_HEARTBEAT_MS);

    runLockLeaseCheckRef.current = window.setInterval(() => {
      const nowMs = Date.now();
      if (nowMs - runLockLastHeartbeatAtRef.current > RUN_LOCK_TTL_MS) {
        scheduleRunLockRetry(bulkId, RUN_LOCK_RETRY_JITTER_MS);
      }
    }, RUN_LOCK_HEARTBEAT_MS);

    return true;
  }, [getRunLockStorageKey, ownsRunLock, scheduleRunLockRetry, stopRunLockHeartbeat]);

  useEffect(() => {
    acquireRunLockRef.current = acquireRunLock;
  }, [acquireRunLock]);

  useEffect(() => {
    sessionCreditsRef.current = credits;
  }, [credits]);

  // Reactive query for active bulk job (enables resume on refresh)
  const activeBulk = useQuery(
    api.bulkGenerations.getActive,
    convexEnabled && isAuthenticated && sid ? { sid } : "skip"
  );
  const subscribedBulk = useQuery(
    api.bulkGenerations.get,
    convexEnabled && isAuthenticated && sid && state.bulkId ? { id: state.bulkId, sid } : "skip"
  );
  const bulkForState = subscribedBulk ?? activeBulk;

  const loadAllVerses = useCallback(
    async (bulkGenerationId: Id<"bulkGenerations">) => {
      if (!sid) {
        return [];
      }

      const verses: BulkGenerationVerse[] = [];
      let offset = 0;

      while (true) {
        const page = await convex.query(api.bulkGenerations.getVerses, {
          sid,
          bulkGenerationId,
          limit: RUNNER_VERSE_PAGE_SIZE,
          offset,
        });
        if (page.length === 0) break;

        verses.push(...page);
        if (page.length < RUNNER_VERSE_PAGE_SIZE) break;

        offset += page.length;
      }

      return verses;
    },
    [convex, sid]
  );

  // Sync Convex state → local state (for reactive UI updates)
  useEffect(() => {
    if (!bulkForState) return;

    if (isPausedRef.current && bulkForState.status === "active" && isRunningRef.current) {
      resumedDuringRunRef.current = true;
    }
    bulkJobRef.current = { id: bulkForState._id, status: bulkForState.status };
    isPausedRef.current = bulkForState.status === "paused" || pausingRef.current;
    isCancelledRef.current = bulkForState.status === "cancelled" || cancellingRef.current;
    if (bulkForState.status !== "paused") {
      pausedResolverRef.current?.();
      pausedResolverRef.current = null;
    }
    // The job's own configuration, never current UI defaults: style and bound engine included (#178).
    settingsRef.current = {
      modelId: bulkForState.modelId,
      aspectRatio: bulkForState.aspectRatio,
      resolution: bulkForState.resolution,
      translation: bulkForState.translation,
      artStyleId: bulkForState.artStyleId ?? "classical",
      engine: bulkForState.engine ?? settingsRef.current?.engine,
    };

    setState((prev) => ({
      ...prev,
      bulkId: bulkForState._id,
      // A pause shows as the table says, live and after a reload (#552).
      status: bulkForState.status === "paused" && isBulkPauseReason(bulkForState.pausedReason)
        ? BULK_PAUSES[bulkForState.pausedReason].shows
        : bulkForState.status as BulkGenerationStatus,
      totalVerses: bulkForState.totalVerses,
      completedCount: bulkForState.completedCount,
      failedCount: bulkForState.failedCount,
      skippedCount: bulkForState.skippedCount,
      totalCreditsUsed: bulkForState.totalCreditsUsed,
      // A recorded reason shows its own message, whichever tab wrote it (#552); otherwise a pause's message stands
      // through the progress that verses still painting write after it (#530).
      errorMessage:
        bulkForState.status === "paused" && isBulkPauseReason(bulkForState.pausedReason)
          ? bulkPauseMessage(bulkForState.pausedReason)
          : bulkForState.status === "paused" && (prev.status === "blocked" || prev.status === "paused")
            ? prev.errorMessage
            : null,
    }));
  }, [bulkForState]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      const bulkId = runLockBulkIdRef.current;
      if (!bulkId || event.key !== getRunLockStorageKey(bulkId)) return;

      if (!event.newValue) {
        scheduleRunLockRetry(bulkId, RUN_LOCK_RETRY_JITTER_MS);
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue) as { owner: string; expiresAt?: number };
        if (parsed.owner !== TAB_ID) {
          lostLockRef.current = true;
          isPausedRef.current = true;
          pausedResolverRef.current?.();
          pausedResolverRef.current = null;
          const now = Date.now();
          const delay =
            typeof parsed.expiresAt === "number" && parsed.expiresAt > now
              ? parsed.expiresAt - now + RUN_LOCK_RETRY_JITTER_MS
              : RUN_LOCK_RETRY_JITTER_MS;
          scheduleRunLockRetry(bulkId, delay);
        }
      } catch {
        // Ignore malformed cross-tab lock updates.
        scheduleRunLockRetry(bulkId, RUN_LOCK_RETRY_JITTER_MS);
      }
    };

    const handleBeforeUnload = () => {
      releaseRunLock();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (saveRetryTimeoutRef.current !== null) window.clearTimeout(saveRetryTimeoutRef.current);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      releaseRunLock();
    };
  }, [getRunLockStorageKey, releaseRunLock, scheduleRunLockRetry]);

  // A Convex write failed (a claim, an outcome, progress, reconciliation): the job starts again shortly, a few times
  // in a row, then shows why it stopped. The server job is paused too if that write gets through (#552).
  const scheduleSaveRetry = useCallback((bulkId: Id<"bulkGenerations">, dismissals: number) => {
    // A job the reader stopped or paused stays as they left it.
    // A reply from a dismissed job leaves its successor's recovery alone.
    const job = bulkJobRef.current;
    if (
      !sid ||
      dismissals !== dismissalsRef.current ||
      isCancelledRef.current ||
      pausingRef.current ||
      (job !== null && (job.id !== bulkId || job.status !== "active"))
    ) return;
    saveFailuresRef.current++;
    if (saveFailuresRef.current <= SAVE_RETRY_LIMIT) {
      // A claim whose reply was lost may still have landed: the next run settles such verses from their request
      // records first, as after a reload.
      reconciledBulkIdRef.current = null;
      const generation = runGenerationRef.current;
      if (saveRetryTimeoutRef.current !== null) window.clearTimeout(saveRetryTimeoutRef.current);
      saveRetryTimeoutRef.current = window.setTimeout(() => {
        saveRetryTimeoutRef.current = null;
        if (runGenerationRef.current === generation) setRunLoopTrigger((value) => value + 1);
      }, SAVE_RETRY_DELAY_MS);
      return;
    }
    saveFailuresRef.current = 0;
    isPausedRef.current = true;
    setState((prev) => ({ ...prev, status: BULK_PAUSES.save_failed.shows, errorMessage: bulkPauseMessage("save_failed") }));
    void pauseBulk({ id: bulkId, sid, reason: "save_failed" }).catch((error) => {
      console.error("Failed to pause bulk generation after failed saves:", error);
    });
  }, [pauseBulk, sid]);

  // ---------------------------------------------------------------------------
  // Generation loop
  // ---------------------------------------------------------------------------

  const runGenerationLoop = useCallback(
    async (
      bulkId: Id<"bulkGenerations">,
      queue: BulkQueueItem[],
      initialCounters: BulkGenerationCounters
    ) => {
      if (!sid) return;
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      const generation = ++runGenerationRef.current;
      const dismissals = dismissalsRef.current;
      // A Convex write (a claim, an outcome, progress) failed: the run ends, then starts again (#552).
      let saveFailed = false;

      try {
        let completed = initialCounters.completedCount;
        let failed = initialCounters.failedCount;
        const skipped = initialCounters.skippedCount;
        let creditsUsed = initialCounters.totalCreditsUsed;
        let shouldMarkComplete = true;

        // Pauses a job that cannot start: nothing was claimed yet.
        const pauseBeforeStart = async (reason: BulkPauseReason) => {
          shouldMarkComplete = false;
          await saved(pauseBulk({ id: bulkId, sid, reason }));
          isPausedRef.current = true;
          setState((prev) => ({
            ...prev,
            status: BULK_PAUSES[reason].shows,
            currentVerseReference: null,
            errorMessage: bulkPauseMessage(reason),
          }));
        };

        const settings = settingsRef.current;
        if (!settings) {
          console.error("Bulk generation aborted: missing settingsRef.current", {
            bulkId,
          });
          await pauseBeforeStart("settings_lost");
          return;
        }

        const initialCsrfToken = readCsrfToken();
        if (!initialCsrfToken) {
          console.error("Bulk generation aborted: missing csrfToken", {
            bulkId,
            csrfCookieName: CSRF_COOKIE_NAME,
            hasCookieString: document.cookie.length > 0,
            csrfToken: initialCsrfToken ?? null,
          });
          await pauseBeforeStart("security_token");
          return;
        }

        // Up to four verses are painted at once (#530). Each is claimed queued → generating, so no two workers take one.
        const pending = [...queue];
        // Verses refused for credits while others were painting: their holds may be what the balance lacked, so these
        // are tried again one at a time once the parallel workers drain.
        const deferred: BulkQueueItem[] = [];
        const inFlight = new Map<number, string>();
        // An outcome that pauses the job starts no new verses; those already sent finish and record their outcomes.
        // The first such outcome owns the pause: its reason and message stand.
        // Once the reader dismisses this job, a later run owns the shared state: this one's late results stay out of it.
        const current = () => runGenerationRef.current === generation;
        const setRunState: typeof setState = (update) => { if (current()) setState(update); };
        let halted = false;
        let workerFailed = false;
        // Stops this run's workers taking verses. The shared pause flag waits for the pause to be saved: if that write
        // fails, the save recovery starts the job again (#552). A dismissed run leaves the server pause to its successor.
        const halt = () => {
          const first = !halted && current();
          halted = true;
          shouldMarkComplete = false;
          return first;
        };
        // Records the job's pause and shows its message. A job stopped meanwhile stays stopped: only a job this pause
        // reached shows it.
        const pauseJob = async (reason: BulkPauseReason) => {
          const paused = await saved(pauseBulk({ id: bulkId, sid, reason }));
          if (paused?.updated === false) return;
          if (current()) isPausedRef.current = true;
          setRunState((prev) => ({ ...prev, status: BULK_PAUSES[reason].shows, errorMessage: bulkPauseMessage(reason) }));
        };
        // Whether a verse refused before admission may be sent again after a wait: not once the job stops or pauses.
        const stillWanted = () => !halted && !workerFailed && !isCancelledRef.current && !isPausedRef.current && !lostLockRef.current && ownsRunLock(bulkId);
        const showInFlight = () => {
          const earliest = [...inFlight.entries()].sort(([a], [b]) => a - b)[0];
          setRunState((prev) => ({ ...prev, currentVerseReference: earliest?.[1] ?? null }));
        };
        // A reader's pause holds every worker after its current verse; resume releases them together.
        let resumed: Promise<void> | null = null;
        const waitForResume = () => resumed ??= new Promise<void>((resolve) => {
          pausedResolverRef.current = () => {
            pausedResolverRef.current = null;
            resumed = null;
            resolve();
          };
        });

        /** Paints one verse; false when this worker should take no more. */
        const paintItem = async (item: BulkQueueItem): Promise<boolean> => {
          const writeVerse = (status: BulkVerseStatus, extra: VerseWriteExtra, claim?: number) =>
            saved(updateVerseStatus({ sid, bulkGenerationId: bulkId, verseId: item.verseId, status, ...(claim !== undefined ? { claim } : {}), ...extra }));
          const claimResult = await writeVerse("generating", { expectedCurrentStatus: "queued" });
          if (!claimResult?.updated) {
            return true;
          }
          // Every later write for this verse carries the claim it belongs to, so one from a replaced claim changes nothing (#552).
          const claim = "claim" in claimResult ? claimResult.claim : undefined;
          const setVerse = (status: BulkVerseStatus, extra: VerseWriteExtra = {}) => writeVerse(status, extra, claim);
          const requeue = (spentRequest = false) =>
            setVerse("queued", { expectedCurrentStatus: "generating", ...(spentRequest ? { spentRequest: true } : {}) });
          // The verse goes back to the queue and the run takes no more. Only the run's first pause writes the job's
          // reason and shows its message; a job that was stopped meanwhile stays stopped.
          // A requeue Convex refused belongs to a replaced claim: the tab that holds the verse now decides about the job.
          const pauseFor = async (reason: BulkPauseReason, options: { spentRequest?: boolean } = {}) => {
            const first = halt();
            const moved = await requeue(options.spentRequest);
            if (first && moved?.updated) await pauseJob(reason);
            return false;
          };

          try {
            const payload: Record<string, unknown> = {
              reference: item.reference,
              model: settings.modelId,
              translation: settings.translation,
              aspectRatio: settings.aspectRatio,
              resolution: settings.resolution,
              style: settings.artStyleId,
              // No guest accepts a quote for each item: the server quotes it and requires the whole estimate.
              automatic: true,
              // The bound engine, once known: the route refuses rather than admits on another engine.
              ...(settings.engine ? { engine: settings.engine } : {}),
              requestId: bulkItemRequestId(bulkId, item.order, item.attempt),
            };
            const csrfToken = readCsrfToken();
            if (!csrfToken) {
              console.error("Bulk generation paused: missing csrfToken before fetch", {
                bulkId,
                verseId: item.verseId,
                csrfCookieName: CSRF_COOKIE_NAME,
                hasCookieString: document.cookie.length > 0,
                csrfToken: null,
              });
              return await pauseFor("security_token");
            }

            const submit = () => fetch("/api/generate-image", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                [CSRF_HEADER_NAME]: csrfToken,
              },
              body: JSON.stringify(payload),
            });
            // Retryable refusals (a scene still preparing, a style briefly unavailable) get a few
            // tries; an accepted-but-unfinished earlier attempt (202) is waited on, never repeated.
            // A refusal before admission started nothing: after its wait the verse goes back to the queue rather than
            // being sent once the job is stopped, paused or handed to another tab.
            const putBack = async () => {
              // After losing the run lock the new owner reconciles this verse: writing it back could undo that owner's claim.
              if (!current()) return false;
              if (lostLockRef.current || !ownsRunLock(bulkId)) {
                lostLockRef.current = true;
                return false;
              }
              if (!(await requeue())?.updated) return false;
              pending.unshift(item);
              return true;
            };
            // Stop, Pause or another tab may have taken over while the claim was out: nothing is sent then.
            if (!stillWanted()) return await putBack();
            const overlappedAtSend = inFlight.size > 1;
            let response = await submit();
            for (let attempt = 0; attempt < ITEM_RETRY_LIMIT && response.status === 503; attempt++) {
              const body = await response.clone().json().catch(() => null);
              if (!body?.retryable) break;
              await sleep(ITEM_RETRY_DELAY_MS);
              if (!stillWanted()) return await putBack();
              response = await submit();
            }
            // The site's rate limit is waited out and the same request sent again; the daily limit is not.
            for (let waits = 0; waits < RATE_LIMIT_WAIT_LIMIT && response.status === 429; waits++) {
              const body = await response.clone().json().catch(() => null) as { error?: string; retryAfter?: number } | null;
              if (body?.error === DAILY_LIMIT_EXCEEDED) break;
              const seconds = Number(body?.retryAfter ?? response.headers.get("Retry-After"));
              await sleep((Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000);
              if (!stillWanted()) return await putBack();
              response = await submit();
            }
            for (let waited = 0; waited < IN_FLIGHT_WAIT_LIMIT && response.status === 202; waited++) {
              await sleep(IN_FLIGHT_WAIT_DELAY_MS);
              // A poll is a fresh admission once the earlier attempt is gone, so it too waits for a run that wants it.
              if (!stillWanted()) return await putBack();
              response = await submit();
            }

            if (response.ok && response.status !== 202) {
              const data = await response.json();
              const cost = data.creditsCost ?? 0;
              if (!settings.engine && (data.engine === "legacy" || data.engine === "generic")) {
                // The first accepted item binds the job; every later item is submitted with this engine.
                settings.engine = data.engine;
                await bindEngine({ sid, id: bulkId, engine: data.engine }).catch((error) => {
                  console.error("Failed to bind bulk job engine:", error);
                });
              }

              // Counted only once saved: a refused write means another tab's claim holds the verse, and it records the outcome.
              if (!(await setVerse("completed", { expectedCurrentStatus: "generating", creditsCost: cost }))?.updated) return false;
              completed++;
              creditsUsed += cost;
              saveFailuresRef.current = 0;
            } else if (response.status === 202) {
              // Still running server-side after the wait: leave it queued so resume replays it.
              return await pauseFor("in_flight");
            } else if (response.status === 402) {
              // Other verses' holds may be what the balance lacked: this one is tried again, alone, once they settle.
              if (overlappedAtSend || inFlight.size > 1) {
                if ((await requeue())?.updated) deferred.push(item);
                return false;
              }
              return await pauseFor("credits");
            } else if (response.status === 429) {
              const daily = (await response.json().catch(() => null) as { error?: string } | null)?.error === DAILY_LIMIT_EXCEEDED;
              return await pauseFor(daily ? "daily_limit" : "rate_limited");
            } else {
              const errData = await response.json().catch(() => null) as { error?: string; message?: string; retryable?: boolean } | null;
              const errorMsg = errData?.error || errData?.message || `HTTP ${response.status}`;
              if (response.status === 503 && errData?.error === IMAGES_UNAVAILABLE) {
                // The provider could not take any request. Nothing was charged, and the next verse would fail the
                // same way, so the job waits. This request id is spent (sent again it replays the failure), so the
                // verse goes back to the queue with its next one.
                // The server already sent the call again for a rate limit or a full in-flight budget before answering this.
                return await pauseFor("images_unavailable", { spentRequest: true });
              }
              // The job keeps its configuration and completed outcomes; nothing was charged. It waits for the engine
              // or style to be admitted again rather than switching.
              if (response.status === 409 && errData?.error === ENGINE_BINDING_CHANGED) {
                return await pauseFor("engine_unavailable");
              }
              if (response.status === 503 && errData?.retryable === true) {
                return await pauseFor(errData.error === ART_STYLE_UNAVAILABLE ? "style_unavailable" : "preparing");
              }
              if (!(await setVerse("failed", { expectedCurrentStatus: "generating", error: errorMsg }))?.updated) return false;
              failed++;
            }
          } catch (err) {
            // Only the image request and its answer fail the verse; a failed save ends the run for the save recovery.
            if (err instanceof SaveFailed) throw err;
            if (!(await setVerse("failed", { expectedCurrentStatus: "generating", error: err instanceof Error ? err.message : "Unknown error" }))?.updated) return false;
            failed++;
          }

          await updateProgress({
            sid,
            id: bulkId,
            completedCount: completed,
            failedCount: failed,
            skippedCount: skipped,
            totalCreditsUsed: creditsUsed,
          });

          setRunState((prev) => ({
            ...prev,
            completedCount: completed,
            failedCount: failed,
            skippedCount: skipped,
            totalCreditsUsed: creditsUsed,
            // A pause, this run's or one another tab recorded, keeps its message through late progress.
            errorMessage: halted || prev.status === "paused" || prev.status === "blocked" ? prev.errorMessage : null,
          }));
          return !halted;
        };

        const worker = async (limit = Infinity) => {
          for (let taken = 0; !halted && !workerFailed && taken < limit; taken++) {
            // A dismissed run's lease is gone because another job may hold the lock now, not because this one lost it.
            if (!current()) return;
            if (lostLockRef.current || !ownsRunLock(bulkId)) {
              lostLockRef.current = true;
              return;
            }
            if (isCancelledRef.current) return;
            if (isPausedRef.current) {
              await waitForResume();
              taken--;
              continue;
            }
            const item = pending.shift();
            if (!item) return;
            inFlight.set(item.order, item.reference);
            showInFlight();
            try {
              if (!(await paintItem(item))) return;
            } catch (error) {
              // A failed write stops new claims; the run lock is released only once every worker has settled, so
              // workers waiting for Resume are woken to finish.
              workerFailed = true;
              saveFailed = true;
              pausedResolverRef.current?.();
              throw error;
            } finally {
              inFlight.delete(item.order);
              showInFlight();
            }
          }
        };
        const runWorkers = async (count: number, limit?: number) => {
          const settled = await Promise.allSettled(Array.from({ length: count }, () => worker(limit)));
          const rejected = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
          if (rejected) throw rejected.reason;
        };
        // An unbound job paints one verse at a time until one binds it, so every later verse goes out bound (#178).
        while (current() && !settings.engine && pending.length > 0 && !halted && !isCancelledRef.current && !lostLockRef.current) {
          await runWorkers(1, 1);
        }
        await runWorkers(tierRef.current === "admin" ? OWNER_BULK_CONCURRENCY : BULK_CONCURRENCY);
        // Verses refused for credits while others painted are tried again one at a time; a refusal now pauses the job.
        if (deferred.length > 0) {
          pending.unshift(...deferred.splice(0));
          await runWorkers(1);
        }

        if (
          current() &&
          !lostLockRef.current &&
          !isCancelledRef.current &&
          !isPausedRef.current &&
          shouldMarkComplete
        ) {
          setState((prev) => ({
            ...prev,
            status: "completed",
            currentVerseReference: null,
            errorMessage: null,
          }));
        }
      } catch (error) {
        if (error instanceof SaveFailed) saveFailed = true;
        console.error("Bulk generation loop failed:", error);
      } finally {
        // Dismiss already released this job's lock; the heartbeat now belongs to the successor.
        if (runGenerationRef.current === generation) {
          const lostLock = lostLockRef.current;
          releaseRunLock(bulkId);
          pausedResolverRef.current = null;
          isRunningRef.current = false;
          const resumed = resumedDuringRunRef.current;
          resumedDuringRunRef.current = false;
          // A failed write may still have landed (a claim whose reply was lost): the next sync settles such verses from
          // their request records, whether or not this run tries again.
          if (saveFailed) reconciledBulkIdRef.current = null;
          // The reader's Resume restarts the job at once; otherwise a run that ended on a failed save tries again shortly.
          if (resumed && !isPausedRef.current && !isCancelledRef.current) {
            setRunLoopTrigger((value) => value + 1);
          } else if (saveFailed && !lostLock && !isPausedRef.current && !isCancelledRef.current) {
            scheduleSaveRetry(bulkId, dismissals);
          }
        }
      }
    },
    [
      ownsRunLock,
      updateVerseStatus,
      updateProgress,
      pauseBulk,
      bindEngine,
      readCsrfToken,
      releaseRunLock,
      scheduleSaveRetry,
      sid,
    ]
  );

  useEffect(() => {
    if (!bulkForState) return;

    let cancelled = false;

    const syncRunnerQueue = async () => {
      const bulkId = bulkForState._id;
      const dismissals = dismissalsRef.current;
      // Nothing is written or started while a failed save waits out its delay, while the reader's Pause or Stop is on
      // its way, or while a settlement of this job is in flight; each of those starts a fresh sync when it ends. Checked
      // again after every read, since each can outlast the start of any of them (#552).
      // The run lock this sync took to settle interrupted verses goes back unless the run it starts holds it.
      let settlement: { bulkId: Id<"bulkGenerations">; skippedSync: boolean } | null = null;
      let launched = false;
      const held = () => {
        const inFlight = reconcilingRef.current;
        if (inFlight && inFlight !== settlement && inFlight.bulkId === bulkId) {
          inFlight.skippedSync = true;
          return true;
        }
        return saveRetryTimeoutRef.current !== null || pausingRef.current || cancellingRef.current;
      };
      if (held()) return;
      try {
        let verses = await loadAllVerses(bulkId);
        if (cancelled || held()) return;
        // Items left "generating" by an interrupted browser are settled from their request records
        // before anything is submitted: saved outcomes are kept, accepted work is replayed, never repeated.
        if (
          sid &&
          !isRunningRef.current &&
          reconciledBulkIdRef.current !== bulkId &&
          verses.some((verse: BulkGenerationVerse) => verse.status === "generating")
        ) {
          // Only the run-lock owner may treat "generating" items as interrupted: another tab's
          // in-flight item must not be requeued and counted twice.
          if (!acquireRunLock(bulkId)) return;
          settlement = { bulkId, skippedSync: false };
          reconcilingRef.current = settlement;
          try {
            await reconcileInterrupted({ sid, id: bulkId });
          } catch (error) {
            // Not settled: the job tries again like any failed save (#552).
            scheduleSaveRetry(bulkId, dismissals);
            throw error;
          }
          reconciledBulkIdRef.current = bulkId;
          if (!cancelled) verses = await loadAllVerses(bulkId);
          // A newer snapshot met this settlement in flight: the fresh sync it is owed picks the job up.
          if (cancelled || settlement.skippedSync) return;
        }

        const generatingVerse = verses.find(
          (verse: BulkGenerationVerse) => verse.status === "generating"
        );
        if (generatingVerse) {
          setState((prev) =>
            prev.currentVerseReference === generatingVerse.reference
              ? prev
              : {
                  ...prev,
                  currentVerseReference: generatingVerse.reference,
                }
          );
        }

        const pendingQueue: BulkQueueItem[] = verses
          .filter((verse: BulkGenerationVerse) => verse.status === "queued")
          .map((verse: BulkGenerationVerse) => ({
            verseId: verse.verseId,
            reference: verse.reference,
            order: verse.order,
            attempt: verse.attempt,
          }));

        queueRef.current = pendingQueue;
        // The rows are the record of each verse's outcome; a progress write that failed leaves the job's counters behind.
        const counters = countersFrom(verses, bulkForState);

        // Every verse has an outcome but the job never heard: its last progress write failed. Save it from the rows.
        if (
          sid &&
          bulkForState.status === "active" &&
          !isRunningRef.current &&
          !generatingVerse &&
          pendingQueue.length === 0 &&
          counters.completedCount + counters.failedCount + counters.skippedCount >= bulkForState.totalVerses
        ) {
          if (held()) return;
          try {
            await updateProgress({ sid, id: bulkId, ...counters });
          } catch (error) {
            if (!cancelled) scheduleSaveRetry(bulkId, dismissals);
            throw error;
          }
        }

        if (
          bulkForState.status !== "active" ||
          isPausedRef.current ||
          isRunningRef.current ||
          // A run that failed to save starts again when its wait ends, and a Pause or Stop on its way settles first.
          saveRetryTimeoutRef.current !== null ||
          pausingRef.current ||
          cancellingRef.current ||
          pendingQueue.length === 0
        ) {
          return;
        }

        if (!acquireRunLock(bulkForState._id)) {
          return;
        }

        isPausedRef.current = false;
        isCancelledRef.current = false;
        lostLockRef.current = false;
        launched = true;
        void runGenerationLoop(bulkForState._id, pendingQueue, counters);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load bulk generation queue:", error);
        }
      } finally {
        if (settlement) {
          if (reconcilingRef.current === settlement) reconcilingRef.current = null;
          // Dismiss gave this lock back already; the lease held now may be the next job's.
          if (!launched && dismissals === dismissalsRef.current && runLockBulkIdRef.current === bulkId) releaseRunLock(bulkId);
          // A sync this settlement held belonged to its job: after Done there is none to owe.
          if (!launched && settlement.skippedSync && dismissals === dismissalsRef.current) setRunLoopTrigger((value) => value + 1);
        }
      }
    };

    void syncRunnerQueue();

    return () => {
      cancelled = true;
    };
  }, [acquireRunLock, bulkForState, loadAllVerses, reconcileInterrupted, releaseRunLock, runGenerationLoop, runLoopTrigger, scheduleSaveRetry, sid, updateProgress]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const startBulkGeneration = useCallback(
    async (params: {
      scope: BulkScope;
      scopeLabel: string;
      queue: BulkQueueItem[];
      estimatedTotalCredits: number;
      modelId?: string;
      aspectRatio?: string;
      resolution?: string;
      translation: string;
      artStyleId?: string;
    }) => {
      if (!sid || !convexEnabled || !isAuthenticated) return;
      const advanced = advancedRef.current;
      const modelId = params.modelId ?? advanced.imageModel;
      const aspectRatio = params.aspectRatio ?? advanced.aspectRatio;
      const resolution = params.resolution ?? advanced.resolution;
      if (params.queue.length === 0) {
        throw new Error("Cannot start bulk generation with an empty queue");
      }

      const bulk = await createBulk({
        sid,
        scopeType: params.scope.type,
        scopeLabel: params.scopeLabel,
        startVerseId: params.queue[0]?.verseId ?? "",
        estimatedTotalCredits: params.estimatedTotalCredits,
        modelId,
        aspectRatio,
        resolution,
        translation: params.translation,
        artStyleId: params.artStyleId ?? "classical",
        verses: params.queue.map((v) => ({
          verseId: v.verseId,
          reference: v.reference,
          order: v.order,
        })),
      });

      setState((prev) => ({
        status: bulk.status,
        bulkId: bulk.bulkId,
        totalVerses: bulk.totalVerses,
        completedCount: bulk.completedCount,
        failedCount: bulk.failedCount,
        skippedCount: bulk.skippedCount,
        totalCreditsUsed: bulk.totalCreditsUsed,
        currentVerseReference: bulk.created
          ? params.queue[0]?.reference ?? null
          : prev.currentVerseReference,
        errorMessage: null,
      }));

      if (!bulk.created) {
        return;
      }

      isPausedRef.current = false;
      isCancelledRef.current = false;
      queueRef.current = params.queue;
      settingsRef.current = {
        modelId,
        aspectRatio,
        resolution,
        translation: params.translation,
        artStyleId: params.artStyleId ?? "classical",
      };

      if (acquireRunLock(bulk.bulkId)) {
        lostLockRef.current = false;
        void runGenerationLoop(bulk.bulkId, params.queue, {
          completedCount: bulk.completedCount,
          failedCount: bulk.failedCount,
          skippedCount: bulk.skippedCount,
          totalCreditsUsed: bulk.totalCreditsUsed,
        });
      }
    },
    [sid, convexEnabled, isAuthenticated, acquireRunLock, createBulk, runGenerationLoop]
  );

  const pauseBulkGeneration = useCallback(async () => {
    if (!state.bulkId || !sid) return;
    const previousStatus = state.status;
    isPausedRef.current = true;
    pausingRef.current = true;
    // A worker may have parked for this Pause while it was being sent: one that did not take wakes it again, and a
    // job that a sync left alone meanwhile is picked up again.
    const rollBackPause = () => {
      pausingRef.current = false;
      isPausedRef.current = previousStatus === "paused" || previousStatus === "blocked";
      if (!isPausedRef.current) pausedResolverRef.current?.();
      if (!isRunningRef.current) setRunLoopTrigger((value) => value + 1);
    };
    try {
      const result = await pauseBulk({ id: state.bulkId, sid });
      if (!result?.updated) {
        rollBackPause();
        return;
      }
      setState((prev) => ({ ...prev, status: "paused", errorMessage: null }));
    } catch (error) {
      rollBackPause();
      console.error("Failed to pause bulk generation:", error);
      setState((prev) => ({ ...prev, status: previousStatus }));
    } finally {
      pausingRef.current = false;
    }
  }, [sid, state.bulkId, state.status, pauseBulk]);

  const resumeBulkGeneration = useCallback(async () => {
    if (!state.bulkId || !sid) return;
    const previousStatus = state.status;
    try {
      // The reader's Resume ends any wait after a failed save.
      if (saveRetryTimeoutRef.current !== null) window.clearTimeout(saveRetryTimeoutRef.current);
      saveRetryTimeoutRef.current = null;
      const result = await resumeBulk({ id: state.bulkId, sid });
      if (!result?.updated) {
        // Failed saves can show a job as blocked that the server never paused: Resume starts it again.
        if (bulkForState?.status === "active" && !isRunningRef.current) {
          isPausedRef.current = false;
          saveFailuresRef.current = 0;
          setState((prev) => ({ ...prev, status: "active", errorMessage: null }));
          setRunLoopTrigger((value) => value + 1);
        }
        return;
      }
      saveFailuresRef.current = 0;
      setState((prev) => ({ ...prev, status: "active", errorMessage: null }));
      if (isRunningRef.current) resumedDuringRunRef.current = true;
      isPausedRef.current = false;
      lostLockRef.current = false;
      pausedResolverRef.current?.();
      pausedResolverRef.current = null;
    } catch (error) {
      isPausedRef.current = previousStatus === "paused" || previousStatus === "blocked";
      console.error("Failed to resume bulk generation:", error);
      setState((prev) => ({ ...prev, status: previousStatus }));
    }
  }, [sid, state.bulkId, state.status, resumeBulk, bulkForState]);

  const cancelBulkGeneration = useCallback(async () => {
    if (!state.bulkId || !sid) return;
    const previousStatus = state.status;
    const previousCurrentVerseReference = state.currentVerseReference;
    isCancelledRef.current = true;
    cancellingRef.current = true;
    isPausedRef.current = false;
    pausedResolverRef.current?.();
    pausedResolverRef.current = null;
    try {
      const result = await cancelBulk({ id: state.bulkId, sid });
      if (!result?.updated) {
        isCancelledRef.current = previousStatus === "cancelled";
        isPausedRef.current = previousStatus === "paused" || previousStatus === "blocked";
        if (!isRunningRef.current) setRunLoopTrigger((value) => value + 1);
        return;
      }
      // A stopped job's failed saves are not retried.
      if (saveRetryTimeoutRef.current !== null) window.clearTimeout(saveRetryTimeoutRef.current);
      saveRetryTimeoutRef.current = null;
      saveFailuresRef.current = 0;
      setState((prev) => ({
        ...prev,
        status: "cancelled",
        currentVerseReference: null,
        errorMessage: null,
      }));
      releaseRunLock(state.bulkId);
    } catch (error) {
      isCancelledRef.current = previousStatus === "cancelled";
      isPausedRef.current = previousStatus === "paused" || previousStatus === "blocked";
      console.error("Failed to cancel bulk generation:", error);
      setState((prev) => ({
        ...prev,
        status: previousStatus,
        currentVerseReference: previousCurrentVerseReference,
      }));
      if (!isRunningRef.current) setRunLoopTrigger((value) => value + 1);
    } finally {
      cancellingRef.current = false;
    }
  }, [sid, state.bulkId, state.currentVerseReference, state.status, cancelBulk, releaseRunLock]);

  const dismissBulkGeneration = useCallback(() => {
    runGenerationRef.current++;
    dismissalsRef.current++;
    if (saveRetryTimeoutRef.current !== null) window.clearTimeout(saveRetryTimeoutRef.current);
    saveRetryTimeoutRef.current = null;
    saveFailuresRef.current = 0;
    bulkJobRef.current = null;
    resumedDuringRunRef.current = false;
    isPausedRef.current = false;
    isCancelledRef.current = false;
    isRunningRef.current = false;
    pausedResolverRef.current = null;
    queueRef.current = [];
    settingsRef.current = null;
    releaseRunLock();
    setState(DEFAULT_STATE);
  }, [releaseRunLock]);

  return (
    <BulkGenerationContext.Provider
      value={{
        state,
        startBulkGeneration,
        pauseBulkGeneration,
        resumeBulkGeneration,
        cancelBulkGeneration,
        dismissBulkGeneration,
      }}
    >
      {children}
    </BulkGenerationContext.Provider>
  );
}

export function useBulkGeneration() {
  const context = useContext(BulkGenerationContext);
  if (!context) {
    throw new Error(
      "useBulkGeneration must be used within BulkGenerationProvider"
    );
  }
  return context;
}
