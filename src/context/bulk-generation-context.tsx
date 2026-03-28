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
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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
  pauseBulkGeneration: () => void;
  /** Resume a paused bulk generation */
  resumeBulkGeneration: () => void;
  /** Cancel the bulk generation */
  cancelBulkGeneration: () => void;
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
};

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
  const pausedResolverRef = useRef<(() => void) | null>(null);
  const queueRef = useRef<BulkQueueItem[]>([]);
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
          return;
        }

        const csrfCookiePrefix = `${CSRF_COOKIE_NAME}=`;
        const csrfToken = document.cookie
          .split("; ")
          .find((row) => row.startsWith(csrfCookiePrefix))
          ?.slice(csrfCookiePrefix.length);

        if (!csrfToken) {
          return;
        }

        for (let index = 0; index < queue.length; index++) {
          const item = queue[index];

          if (isCancelledRef.current) break;
          if (isPausedRef.current) {
            await new Promise<void>((resolve) => {
              pausedResolverRef.current = () => {
                pausedResolverRef.current = null;
                resolve();
              };
            });
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
              setState((prev) => ({ ...prev, status: "paused" }));
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
                error: errorMsg,
              });
            }
          } catch (err) {
            failed++;
            await updateVerseStatus({
              bulkGenerationId: bulkId,
              verseId: item.verseId,
              status: "failed",
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
          }));

          void refetchSession();
        }

        if (!isCancelledRef.current && !isPausedRef.current && shouldMarkComplete) {
          setState((prev) => ({
            ...prev,
            status: "completed",
            currentVerseReference: null,
          }));
        }
      } catch (error) {
        console.error("Bulk generation loop failed:", error);
      } finally {
        pausedResolverRef.current = null;
        isRunningRef.current = false;
      }
    },
    [
      updateVerseStatus,
      updateProgress,
      pauseBulk,
      refetchSession,
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

    isPausedRef.current = false;
    isCancelledRef.current = false;
    void runGenerationLoop(activeBulk._id, pendingQueue, {
      completedCount: activeBulk.completedCount,
      failedCount: activeBulk.failedCount,
      skippedCount: activeBulk.skippedCount,
      totalCreditsUsed: activeBulk.totalCreditsUsed,
    });
  }, [activeBulk, activeVerses, runGenerationLoop]);

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
      });

      if (!bulk.created) {
        return;
      }

      void runGenerationLoop(bulk.bulkId, params.queue, {
        completedCount: bulk.completedCount,
        failedCount: bulk.failedCount,
        skippedCount: bulk.skippedCount,
        totalCreditsUsed: bulk.totalCreditsUsed,
      });
    },
    [sid, convexEnabled, createBulk, runGenerationLoop]
  );

  const pauseBulkGeneration = useCallback(async () => {
    if (!state.bulkId) return;
    const previousStatus = state.status;
    isPausedRef.current = true;
    try {
      await pauseBulk({ id: state.bulkId });
      setState((prev) => ({ ...prev, status: "paused" }));
    } catch (error) {
      isPausedRef.current = previousStatus === "paused";
      console.error("Failed to pause bulk generation:", error);
      setState((prev) => ({ ...prev, status: previousStatus }));
    }
  }, [state.bulkId, state.status, pauseBulk]);

  const resumeBulkGeneration = useCallback(async () => {
    if (!state.bulkId) return;
    const previousStatus = state.status;
    isPausedRef.current = false;
    pausedResolverRef.current?.();
    pausedResolverRef.current = null;
    try {
      await resumeBulk({ id: state.bulkId });
      setState((prev) => ({ ...prev, status: "active" }));
    } catch (error) {
      isPausedRef.current = previousStatus === "paused";
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
      }));
    } catch (error) {
      isCancelledRef.current = previousStatus === "cancelled";
      isPausedRef.current = previousStatus === "paused";
      console.error("Failed to cancel bulk generation:", error);
      setState((prev) => ({
        ...prev,
        status: previousStatus,
        currentVerseReference: previousCurrentVerseReference,
      }));
    }
  }, [state.bulkId, state.currentVerseReference, state.status, cancelBulk]);

  const dismissBulkGeneration = useCallback(() => {
    isPausedRef.current = false;
    isCancelledRef.current = false;
    isRunningRef.current = false;
    pausedResolverRef.current = null;
    queueRef.current = [];
    settingsRef.current = null;
    setState(DEFAULT_STATE);
  }, []);

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
