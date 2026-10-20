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
import { useSession } from "@/context/session-context";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf-constants";
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

interface BulkGenerationContextType {
  state: BulkGenerationState;
  /** Start a new bulk generation */
  startBulkGeneration: (params: {
    scope: BulkScope;
    scopeLabel: string;
    queue: BulkQueueItem[];
    estimatedTotalCredits: number;
    modelId: string;
    aspectRatio: string;
    resolution: string;
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
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const BulkGenerationContext = createContext<BulkGenerationContextType | null>(
  null
);

export function BulkGenerationProvider({ children }: { children: ReactNode }) {
  const { sid, credits } = useSession();
  const convexEnabled = useConvexEnabled();
  const { isAuthenticated } = useConvexAuth();
  const convex = useConvex();

  const [state, setState] = useState<BulkGenerationState>(DEFAULT_STATE);
  const [runLoopTrigger, setRunLoopTrigger] = useState(0);
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const isRunningRef = useRef(false);
  const lostLockRef = useRef(false);
  const pausedResolverRef = useRef<(() => void) | null>(null);
  const queueRef = useRef<BulkQueueItem[]>([]);
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

    isPausedRef.current = bulkForState.status === "paused";
    isCancelledRef.current = bulkForState.status === "cancelled";
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
      errorMessage:
        bulkForState.status === "paused" && prev.status === "blocked"
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

      try {
        let completed = initialCounters.completedCount;
        let failed = initialCounters.failedCount;
        const skipped = initialCounters.skippedCount;
        let creditsUsed = initialCounters.totalCreditsUsed;
        let shouldMarkComplete = true;

        const settings = settingsRef.current;
        if (!settings) {
          const errorMessage = "Bulk generation settings were lost. Resume to try again.";
          console.error("Bulk generation aborted: missing settingsRef.current", {
            bulkId,
          });
          isPausedRef.current = true;
          shouldMarkComplete = false;
          await pauseBulk({ id: bulkId, sid });
          setState((prev) => ({
            ...prev,
            status: "blocked",
            currentVerseReference: null,
            errorMessage,
          }));
          return;
        }

        const initialCsrfToken = readCsrfToken();
        if (!initialCsrfToken) {
          const errorMessage = "Security token missing. Resume to refresh the session and continue.";
          console.error("Bulk generation aborted: missing csrfToken", {
            bulkId,
            csrfCookieName: CSRF_COOKIE_NAME,
            hasCookieString: document.cookie.length > 0,
            csrfToken: initialCsrfToken ?? null,
          });
          isPausedRef.current = true;
          shouldMarkComplete = false;
          await pauseBulk({ id: bulkId, sid });
          setState((prev) => ({
            ...prev,
            status: "blocked",
            currentVerseReference: null,
            errorMessage,
          }));
          return;
        }

        for (let index = 0; index < queue.length; index++) {
          const item = queue[index];

          if (lostLockRef.current || !ownsRunLock(bulkId)) {
            lostLockRef.current = true;
            break;
          }
          if (isCancelledRef.current) break;
          if (isPausedRef.current) {
            await new Promise<void>((resolve) => {
              pausedResolverRef.current = () => {
                pausedResolverRef.current = null;
                resolve();
              };
            });
            if (lostLockRef.current || !ownsRunLock(bulkId)) break;
            if (isCancelledRef.current) break;
          }

          setState((prev) => ({
            ...prev,
            currentVerseReference: item.reference,
          }));

          const claimResult = await updateVerseStatus({
            sid,
            bulkGenerationId: bulkId,
            verseId: item.verseId,
            status: "generating",
            expectedCurrentStatus: "queued",
          });
          if (!claimResult?.updated) {
            continue;
          }

          try {
            const payload: Record<string, unknown> = {
              reference: item.reference,
              model: settings.modelId,
              translation: settings.translation,
              aspectRatio: settings.aspectRatio,
              resolution: settings.resolution,
              style: settings.artStyleId,
              // The bound engine, once known: the route refuses rather than admits on another engine.
              ...(settings.engine ? { engine: settings.engine } : {}),
              requestId: `bulk-${bulkId}-${item.order}`,
            };
            const csrfToken = readCsrfToken();
            if (!csrfToken) {
              const errorMessage = "Security token missing. Resume to refresh the session and continue.";
              console.error("Bulk generation paused: missing csrfToken before fetch", {
                bulkId,
                verseId: item.verseId,
                csrfCookieName: CSRF_COOKIE_NAME,
                hasCookieString: document.cookie.length > 0,
                csrfToken: null,
              });
              isPausedRef.current = true;
              shouldMarkComplete = false;
              await updateVerseStatus({
                sid,
                bulkGenerationId: bulkId,
                verseId: item.verseId,
                status: "queued",
                expectedCurrentStatus: "generating",
              });
              await pauseBulk({ id: bulkId, sid });
              setState((prev) => ({
                ...prev,
                status: "blocked",
                currentVerseReference: null,
                errorMessage,
              }));
              break;
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
            let response = await submit();
            for (let attempt = 0; attempt < ITEM_RETRY_LIMIT && response.status === 503; attempt++) {
              const body = await response.clone().json().catch(() => null);
              if (!body?.retryable) break;
              await sleep(ITEM_RETRY_DELAY_MS);
              response = await submit();
            }
            for (let waited = 0; waited < IN_FLIGHT_WAIT_LIMIT && response.status === 202; waited++) {
              await sleep(IN_FLIGHT_WAIT_DELAY_MS);
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

              await updateVerseStatus({
                sid,
                bulkGenerationId: bulkId,
                verseId: item.verseId,
                status: "completed",
                expectedCurrentStatus: "generating",
                creditsCost: cost,
              });
            } else if (response.status === 202) {
              // Still running server-side after the wait: leave it queued so resume replays it.
              isPausedRef.current = true;
              shouldMarkComplete = false;
              await updateVerseStatus({ sid, bulkGenerationId: bulkId, verseId: item.verseId, status: "queued", expectedCurrentStatus: "generating" });
              await pauseBulk({ id: bulkId, sid, reason: "in_flight" });
              setState((prev) => ({ ...prev, status: "blocked", errorMessage: "An earlier attempt for this verse is still running. Resume in a moment to pick up its result." }));
              break;
            } else if (response.status === 402) {
              isPausedRef.current = true;
              shouldMarkComplete = false;
              await pauseBulk({ id: bulkId, sid, reason: "credits" });
              await updateVerseStatus({
                sid,
                bulkGenerationId: bulkId,
                verseId: item.verseId,
                status: "queued",
              });
              setState((prev) => ({ ...prev, status: "paused", errorMessage: null }));
              break;
            } else if (response.status === 429) {
              isPausedRef.current = true;
              shouldMarkComplete = false;
              await updateVerseStatus({
                sid,
                bulkGenerationId: bulkId,
                verseId: item.verseId,
                status: "queued",
                expectedCurrentStatus: "generating",
              });
              await pauseBulk({ id: bulkId, sid, reason: "rate_limited" });
              setState((prev) => ({
                ...prev,
                status: "blocked",
                errorMessage: "Rate limited. Resume to continue when capacity is available.",
              }));
              break;
            } else {
              const errData = await response.json().catch(() => null) as { error?: string; message?: string; retryable?: boolean } | null;
              const errorMsg = errData?.error || errData?.message || `HTTP ${response.status}`;
              const bindingChanged = response.status === 409 && errData?.error === "Engine binding changed";
              const stillRetryable = response.status === 503 && errData?.retryable === true;
              if (bindingChanged || stillRetryable) {
                // The job keeps its configuration and completed outcomes; nothing was charged. It
                // waits for the engine or style to be admitted again rather than switching.
                isPausedRef.current = true;
                shouldMarkComplete = false;
                await updateVerseStatus({ sid, bulkGenerationId: bulkId, verseId: item.verseId, status: "queued", expectedCurrentStatus: "generating" });
                await pauseBulk({ id: bulkId, sid, reason: bindingChanged ? "engine_unavailable" : errData?.error === "Art style unavailable" ? "style_unavailable" : "preparing" });
                setState((prev) => ({ ...prev, status: "blocked", errorMessage: `${errData?.message || errorMsg} The job is paused; resume when it is available again.` }));
                break;
              }
              failed++;
              await updateVerseStatus({
                sid,
                bulkGenerationId: bulkId,
                verseId: item.verseId,
                status: "failed",
                expectedCurrentStatus: "generating",
                error: errorMsg,
              });
            }
          } catch (err) {
            failed++;
            await updateVerseStatus({
              sid,
              bulkGenerationId: bulkId,
              verseId: item.verseId,
              status: "failed",
              expectedCurrentStatus: "generating",
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }

          await updateProgress({
            sid,
            id: bulkId,
            completedCount: completed,
            failedCount: failed,
            skippedCount: skipped,
            totalCreditsUsed: creditsUsed,
          });

          setState((prev) => ({
            ...prev,
            completedCount: completed,
            failedCount: failed,
            skippedCount: skipped,
            totalCreditsUsed: creditsUsed,
            errorMessage: null,
          }));
        }

        if (
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
        pausedResolverRef.current = null;
        isRunningRef.current = false;
        releaseRunLock(bulkId);
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
      modelId: string;
      aspectRatio: string;
      resolution: string;
      translation: string;
      artStyleId?: string;
    }) => {
      if (!sid || !convexEnabled || !isAuthenticated) return;
      if (params.queue.length === 0) {
        throw new Error("Cannot start bulk generation with an empty queue");
      }

      const bulk = await createBulk({
        sid,
        scopeType: params.scope.type,
        scopeLabel: params.scopeLabel,
        startVerseId: params.queue[0]?.verseId ?? "",
        estimatedTotalCredits: params.estimatedTotalCredits,
        modelId: params.modelId,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
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
        modelId: params.modelId,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
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
    try {
      const result = await pauseBulk({ id: state.bulkId, sid });
      if (!result?.updated) {
        isPausedRef.current = previousStatus === "paused" || previousStatus === "blocked";
        return;
      }
      setState((prev) => ({ ...prev, status: "paused", errorMessage: null }));
    } catch (error) {
      isPausedRef.current = previousStatus === "paused" || previousStatus === "blocked";
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
        return;
      }
      setState((prev) => ({ ...prev, status: "active", errorMessage: null }));
      isPausedRef.current = false;
      lostLockRef.current = false;
      pausedResolverRef.current?.();
      pausedResolverRef.current = null;
    } catch (error) {
      isPausedRef.current = previousStatus === "paused" || previousStatus === "blocked";
      console.error("Failed to resume bulk generation:", error);
      setState((prev) => ({ ...prev, status: previousStatus }));
    }
  }, [sid, state.bulkId, state.status, resumeBulk]);

  const cancelBulkGeneration = useCallback(async () => {
    if (!state.bulkId || !sid) return;
    const previousStatus = state.status;
    const previousCurrentVerseReference = state.currentVerseReference;
    isCancelledRef.current = true;
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
    }
  }, [sid, state.bulkId, state.currentVerseReference, state.status, cancelBulk, releaseRunLock]);

  const dismissBulkGeneration = useCallback(() => {
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
