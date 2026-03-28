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
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
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
const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const BulkGenerationContext = createContext<BulkGenerationContextType | null>(
  null
);

export function BulkGenerationProvider({ children }: { children: ReactNode }) {
  const { sid, refetch: refetchSession } = useSession();
  const convexEnabled = useConvexEnabled();

  const [state, setState] = useState<BulkGenerationState>(DEFAULT_STATE);
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const isRunningRef = useRef(false);
  const lostLockRef = useRef(false);
  const pausedResolverRef = useRef<(() => void) | null>(null);
  const queueRef = useRef<BulkQueueItem[]>([]);
  const runLockBulkIdRef = useRef<Id<"bulkGenerations"> | null>(null);
  const runLockHeartbeatRef = useRef<number | null>(null);
  const runLockChannelRef = useRef<BroadcastChannel | null>(null);
  const settingsRef = useRef<{
    modelId: string;
    aspectRatio: string;
    resolution: string;
    translation: string;
  } | null>(null);

  // Convex mutations
  const createBulk = useMutation(api.bulkGenerations.create);
  const updateVerseStatus = useMutation(api.bulkGenerations.updateVerseStatus);
  const updateProgress = useMutation(api.bulkGenerations.updateProgress);
  const pauseBulk = useMutation(api.bulkGenerations.pause);
  const resumeBulk = useMutation(api.bulkGenerations.resume);
  const cancelBulk = useMutation(api.bulkGenerations.cancel);

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
    lostLockRef.current = false;

    if (runLockChannelRef.current) {
      runLockChannelRef.current.onmessage = (event: MessageEvent) => {
        const message = event.data as
          | { type?: string; bulkId?: string; owner?: string }
          | undefined;
        if (!message || message.bulkId !== bulkId || message.owner === TAB_ID) {
          return;
        }
        if (message.type === "takeover") {
          lostLockRef.current = true;
          isPausedRef.current = true;
          pausedResolverRef.current?.();
          pausedResolverRef.current = null;
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

    return true;
  }, [getRunLockStorageKey, ownsRunLock, stopRunLockHeartbeat]);

  // Reactive query for active bulk job (enables resume on refresh)
  const activeBulk = useQuery(
    api.bulkGenerations.getActive,
    convexEnabled && sid ? { sid } : "skip"
  );
  const activeVerses = useQuery(
    api.bulkGenerations.getVerses,
    convexEnabled && activeBulk?._id
      ? { bulkGenerationId: activeBulk._id }
      : "skip"
  );

  // Sync Convex state → local state (for reactive UI updates)
  useEffect(() => {
    if (!activeBulk) return;

    isPausedRef.current = activeBulk.status === "paused";
    isCancelledRef.current = activeBulk.status === "cancelled";
    if (activeBulk.status !== "paused") {
      pausedResolverRef.current?.();
      pausedResolverRef.current = null;
    }
    settingsRef.current = {
      modelId: activeBulk.modelId,
      aspectRatio: activeBulk.aspectRatio,
      resolution: activeBulk.resolution,
      translation: activeBulk.translation,
    };

    setState((prev) => ({
      ...prev,
      bulkId: activeBulk._id,
      status: activeBulk.status as BulkGenerationStatus,
      totalVerses: activeBulk.totalVerses,
      completedCount: activeBulk.completedCount,
      failedCount: activeBulk.failedCount,
      skippedCount: activeBulk.skippedCount,
      totalCreditsUsed: activeBulk.totalCreditsUsed,
      errorMessage:
        activeBulk.status === "paused" && prev.status === "blocked"
          ? prev.errorMessage
          : null,
    }));
  }, [activeBulk]);

  useEffect(() => {
    if (!activeVerses) return;

    const generatingVerse = activeVerses.find((verse) => verse.status === "generating");
    if (!generatingVerse) return;

    setState((prev) => ({
      ...prev,
      currentVerseReference: generatingVerse.reference,
    }));
  }, [activeVerses]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      const bulkId = runLockBulkIdRef.current;
      if (!bulkId || event.key !== getRunLockStorageKey(bulkId)) return;

      if (!event.newValue) {
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue) as { owner: string };
        if (parsed.owner !== TAB_ID) {
          lostLockRef.current = true;
          isPausedRef.current = true;
          pausedResolverRef.current?.();
          pausedResolverRef.current = null;
        }
      } catch {
        // Ignore malformed cross-tab lock updates.
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
  }, [getRunLockStorageKey, releaseRunLock]);

  // ---------------------------------------------------------------------------
  // Generation loop
  // ---------------------------------------------------------------------------

  const runGenerationLoop = useCallback(
    async (
      bulkId: Id<"bulkGenerations">,
      queue: BulkQueueItem[],
      initialCounters: BulkGenerationCounters
    ) => {
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
          await pauseBulk({ id: bulkId });
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
          await pauseBulk({ id: bulkId });
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

          await updateVerseStatus({
            bulkGenerationId: bulkId,
            verseId: item.verseId,
            status: "generating",
            expectedCurrentStatus: "queued",
          });

          try {
            const payload: Record<string, unknown> = {
              reference: item.reference,
              model: settings.modelId,
              translation: settings.translation,
              aspectRatio: settings.aspectRatio,
              resolution: settings.resolution,
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
              await pauseBulk({ id: bulkId });
              setState((prev) => ({
                ...prev,
                status: "blocked",
                currentVerseReference: null,
                errorMessage,
              }));
              break;
            }

            const response = await fetch("/api/generate-image", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                [CSRF_HEADER_NAME]: csrfToken,
              },
              body: JSON.stringify(payload),
            });

            if (response.ok) {
              const data = await response.json();
              const cost = data.creditsCost ?? 0;
              completed++;
              creditsUsed += cost;

              await updateVerseStatus({
                bulkGenerationId: bulkId,
                verseId: item.verseId,
                status: "completed",
                expectedCurrentStatus: "generating",
                creditsCost: cost,
              });
            } else if (response.status === 402) {
              isPausedRef.current = true;
              shouldMarkComplete = false;
              await pauseBulk({ id: bulkId });
              await updateVerseStatus({
                bulkGenerationId: bulkId,
                verseId: item.verseId,
                status: "queued",
              });
              setState((prev) => ({ ...prev, status: "paused", errorMessage: null }));
              break;
            } else if (response.status === 429) {
              isPausedRef.current = true;
              shouldMarkComplete = false;
              await pauseBulk({ id: bulkId });
              setState((prev) => ({
                ...prev,
                status: "blocked",
                errorMessage: "Rate limited. Resume to continue when capacity is available.",
              }));
              break;
            } else {
              let errorMsg = `HTTP ${response.status}`;
              try {
                const errData = await response.json();
                errorMsg = errData.error || errData.message || errorMsg;
              } catch {
                // keep generic
              }
              failed++;
              await updateVerseStatus({
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
              bulkGenerationId: bulkId,
              verseId: item.verseId,
              status: "failed",
              expectedCurrentStatus: "generating",
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }

          await updateProgress({
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

          try {
            await refetchSession();
          } catch (error) {
            console.error("Failed to refetch session during bulk generation:", error);
          }
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
      refetchSession,
      readCsrfToken,
      releaseRunLock,
    ]
  );

  useEffect(() => {
    if (!activeBulk || !activeVerses) return;

    const pendingQueue: BulkQueueItem[] = activeVerses
      .filter((verse) => verse.status === "queued" || verse.status === "generating")
      .map((verse) => ({
        verseId: verse.verseId,
        reference: verse.reference,
        order: verse.order,
      }));

    queueRef.current = pendingQueue;

    if (
      activeBulk.status !== "active" ||
      isPausedRef.current ||
      isRunningRef.current ||
      pendingQueue.length === 0
    ) {
      return;
    }

    if (!acquireRunLock(activeBulk._id)) {
      return;
    }

    isPausedRef.current = false;
    isCancelledRef.current = false;
    lostLockRef.current = false;
    void runGenerationLoop(activeBulk._id, pendingQueue, {
      completedCount: activeBulk.completedCount,
      failedCount: activeBulk.failedCount,
      skippedCount: activeBulk.skippedCount,
      totalCreditsUsed: activeBulk.totalCreditsUsed,
    });
  }, [acquireRunLock, activeBulk, activeVerses, runGenerationLoop]);

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
    }) => {
      if (!sid || !convexEnabled) return;
      if (params.queue.length === 0) {
        throw new Error("Cannot start bulk generation with an empty queue");
      }

      isPausedRef.current = false;
      isCancelledRef.current = false;
      queueRef.current = params.queue;
      settingsRef.current = {
        modelId: params.modelId,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        translation: params.translation,
      };

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
        verses: params.queue.map((v) => ({
          verseId: v.verseId,
          reference: v.reference,
          order: v.order,
        })),
      });

      setState({
        status: bulk.status,
        bulkId: bulk.bulkId,
        totalVerses: bulk.totalVerses,
        completedCount: bulk.completedCount,
        failedCount: bulk.failedCount,
        skippedCount: bulk.skippedCount,
        totalCreditsUsed: bulk.totalCreditsUsed,
        currentVerseReference: params.queue[0]?.reference ?? null,
        errorMessage: null,
      });

      if (!bulk.created) {
        return;
      }

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
    [sid, convexEnabled, acquireRunLock, createBulk, runGenerationLoop]
  );

  const pauseBulkGeneration = useCallback(async () => {
    if (!state.bulkId) return;
    const previousStatus = state.status;
    isPausedRef.current = true;
    try {
      await pauseBulk({ id: state.bulkId });
      setState((prev) => ({ ...prev, status: "paused", errorMessage: null }));
    } catch (error) {
      isPausedRef.current = previousStatus === "paused" || previousStatus === "blocked";
      console.error("Failed to pause bulk generation:", error);
      setState((prev) => ({ ...prev, status: previousStatus }));
    }
  }, [state.bulkId, state.status, pauseBulk]);

  const resumeBulkGeneration = useCallback(async () => {
    if (!state.bulkId) return;
    const previousStatus = state.status;
    try {
      await resumeBulk({ id: state.bulkId });
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
  }, [state.bulkId, state.status, resumeBulk]);

  const cancelBulkGeneration = useCallback(async () => {
    if (!state.bulkId) return;
    const previousStatus = state.status;
    const previousCurrentVerseReference = state.currentVerseReference;
    isCancelledRef.current = true;
    isPausedRef.current = false;
    pausedResolverRef.current?.();
    pausedResolverRef.current = null;
    try {
      await cancelBulk({ id: state.bulkId });
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
  }, [state.bulkId, state.currentVerseReference, state.status, cancelBulk, releaseRunLock]);

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
