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
    isPausedRef.current = bulkForState.status === "paused";
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
      status: bulkForState.status as BulkGenerationStatus,
      totalVerses: bulkForState.totalVerses,
      completedCount: bulkForState.completedCount,
      failedCount: bulkForState.failedCount,
      skippedCount: bulkForState.skippedCount,
      totalCreditsUsed: bulkForState.totalCreditsUsed,
      // A pause's own message stands through the progress that verses still painting write after it (#530).
      errorMessage:
        bulkForState.status === "paused" && (prev.status === "blocked" || prev.status === "paused")
          ? prev.errorMessage
          : bulkForState.status === "paused" && isBulkPauseReason(bulkForState.pausedReason)
            ? bulkPauseMessage(bulkForState.pausedReason)
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
          isPausedRef.current = true;
          shouldMarkComplete = false;
          await pauseBulk({ id: bulkId, sid, reason });
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
        // A dismissed run stops itself but leaves the shared pause flag, and the server pause, to the run that owns them.
        const halt = () => {
          const first = !halted && current();
          halted = true;
          if (current()) isPausedRef.current = true;
          shouldMarkComplete = false;
          return first;
        };
        // Records the job's pause and shows its message. A job stopped meanwhile stays stopped: only a job this pause
        // reached shows it.
        const pauseJob = async (reason: BulkPauseReason, detail?: string) => {
          const paused = await pauseBulk({ id: bulkId, sid, reason });
          if (paused?.updated === false) return;
          setRunState((prev) => ({ ...prev, status: BULK_PAUSES[reason].shows, errorMessage: bulkPauseMessage(reason, detail) }));
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
            updateVerseStatus({ sid, bulkGenerationId: bulkId, verseId: item.verseId, status, ...(claim !== undefined ? { claim } : {}), ...extra });
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
          const pauseFor = async (reason: BulkPauseReason, options: { spentRequest?: boolean; detail?: string } = {}) => {
            const first = halt();
            await requeue(options.spentRequest);
            if (first) await pauseJob(reason, options.detail);
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
              await requeue();
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
              completed++;
              creditsUsed += cost;
              if (!settings.engine && (data.engine === "legacy" || data.engine === "generic")) {
                // The first accepted item binds the job; every later item is submitted with this engine.
                settings.engine = data.engine;
                await bindEngine({ sid, id: bulkId, engine: data.engine }).catch((error) => {
                  console.error("Failed to bind bulk job engine:", error);
                });
              }

              await setVerse("completed", { expectedCurrentStatus: "generating", creditsCost: cost });
              saveFailuresRef.current = 0;
            } else if (response.status === 202) {
              // Still running server-side after the wait: leave it queued so resume replays it.
              return await pauseFor("in_flight");
            } else if (response.status === 402) {
              // Other verses' holds may be what the balance lacked: this one is tried again, alone, once they settle.
              if (overlappedAtSend || inFlight.size > 1) {
                await requeue();
                deferred.push(item);
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
                return await pauseFor("engine_unavailable", { detail: errData?.message || errorMsg });
              }
              if (response.status === 503 && errData?.retryable === true) {
                return await pauseFor(errData.error === ART_STYLE_UNAVAILABLE ? "style_unavailable" : "preparing", { detail: errData?.message || errorMsg });
              }
              failed++;
              await setVerse("failed", { expectedCurrentStatus: "generating", error: errorMsg });
            }
          } catch (err) {
            failed++;
            await setVerse("failed", { expectedCurrentStatus: "generating", error: err instanceof Error ? err.message : "Unknown error" });
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
            errorMessage: halted ? prev.errorMessage : null,
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
          // The reader's Resume restarts the job at once; otherwise a run that ended on a failed save tries again shortly.
          if (resumed && !isPausedRef.current && !isCancelledRef.current) {
            setRunLoopTrigger((value) => value + 1);
          } else if (saveFailed && !lostLock && !isPausedRef.current && !isCancelledRef.current) {
            saveFailuresRef.current++;
            if (saveFailuresRef.current <= SAVE_RETRY_LIMIT) {
              // A claim whose reply was lost may still have landed: the next run settles such verses from their
              // request records first, as after a reload.
              reconciledBulkIdRef.current = null;
              saveRetryTimeoutRef.current = window.setTimeout(() => {
                saveRetryTimeoutRef.current = null;
                if (runGenerationRef.current === generation) setRunLoopTrigger((value) => value + 1);
              }, SAVE_RETRY_DELAY_MS);
            } else {
              // Still failing: the reader sees why the job stopped, and the server job is paused if that write gets through.
              saveFailuresRef.current = 0;
              isPausedRef.current = true;
              setState((prev) => ({ ...prev, status: BULK_PAUSES.save_failed.shows, errorMessage: bulkPauseMessage("save_failed") }));
              void pauseBulk({ id: bulkId, sid, reason: "save_failed" }).catch((error) => {
                console.error("Failed to pause bulk generation after failed saves:", error);
              });
            }
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
      sid,
    ]
  );

  useEffect(() => {
    if (!bulkForState) return;

    let cancelled = false;

    const syncRunnerQueue = async () => {
      try {
        let verses = await loadAllVerses(bulkForState._id);
        if (cancelled) return;
        // Items left "generating" by an interrupted browser are settled from their request records
        // before anything is submitted: saved outcomes are kept, accepted work is replayed, never repeated.
        let lockTakenToReconcile = false;
        if (
          sid &&
          !isRunningRef.current &&
          reconciledBulkIdRef.current !== bulkForState._id &&
          verses.some((verse: BulkGenerationVerse) => verse.status === "generating")
        ) {
          // Only the run-lock owner may treat "generating" items as interrupted: another tab's
          // in-flight item must not be requeued and counted twice.
          if (!acquireRunLock(bulkForState._id)) return;
          lockTakenToReconcile = true;
          reconciledBulkIdRef.current = bulkForState._id;
          await reconcileInterrupted({ sid, id: bulkForState._id });
          if (cancelled) { releaseRunLock(bulkForState._id); return; }
          verses = await loadAllVerses(bulkForState._id);
          if (cancelled) { releaseRunLock(bulkForState._id); return; }
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

        if (
          bulkForState.status !== "active" ||
          isPausedRef.current ||
          isRunningRef.current ||
          pendingQueue.length === 0
        ) {
          if (lockTakenToReconcile) releaseRunLock(bulkForState._id);
          return;
        }

        if (!acquireRunLock(bulkForState._id)) {
          return;
        }

        isPausedRef.current = false;
        isCancelledRef.current = false;
        lostLockRef.current = false;
        void runGenerationLoop(bulkForState._id, pendingQueue, {
          completedCount: bulkForState.completedCount,
          failedCount: bulkForState.failedCount,
          skippedCount: bulkForState.skippedCount,
          totalCreditsUsed: bulkForState.totalCreditsUsed,
        });
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load bulk generation queue:", error);
        }
      }
    };

    void syncRunnerQueue();

    return () => {
      cancelled = true;
    };
  }, [acquireRunLock, bulkForState, loadAllVerses, reconcileInterrupted, releaseRunLock, runGenerationLoop, runLoopTrigger, sid]);

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
    // A worker may have parked for this Pause while it was being sent: one that did not take wakes it again.
    const rollBackPause = () => {
      isPausedRef.current = previousStatus === "paused" || previousStatus === "blocked";
      if (!isPausedRef.current) pausedResolverRef.current?.();
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
    }
  }, [sid, state.bulkId, state.status, pauseBulk]);

  const resumeBulkGeneration = useCallback(async () => {
    if (!state.bulkId || !sid) return;
    const previousStatus = state.status;
    try {
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
        return;
      }
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
    } finally {
      cancellingRef.current = false;
    }
  }, [sid, state.bulkId, state.currentVerseReference, state.status, cancelBulk, releaseRunLock]);

  const dismissBulkGeneration = useCallback(() => {
    runGenerationRef.current++;
    if (saveRetryTimeoutRef.current !== null) window.clearTimeout(saveRetryTimeoutRef.current);
    saveRetryTimeoutRef.current = null;
    saveFailuresRef.current = 0;
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
