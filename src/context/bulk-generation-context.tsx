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
      queue: BulkQueueItem[]
    ) => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;

      let completed = state.completedCount;
      let failed = state.failedCount;
      const skipped = state.skippedCount;
      let creditsUsed = state.totalCreditsUsed;
      let shouldMarkComplete = true;

      const settings = settingsRef.current;
      if (!settings) {
        isRunningRef.current = false;
        return;
      }

      // Get CSRF token
      const csrfCookiePrefix = `${CSRF_COOKIE_NAME}=`;
      const csrfToken = document.cookie
        .split("; ")
        .find((row) => row.startsWith(csrfCookiePrefix))
        ?.slice(csrfCookiePrefix.length);

      if (!csrfToken) {
        isRunningRef.current = false;
        return;
      }

      for (let index = 0; index < queue.length; index++) {
        const item = queue[index];

        // Check pause/cancel
        if (isCancelledRef.current) break;
        if (isPausedRef.current) {
          // Wait for resume
          await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
              if (!isPausedRef.current || isCancelledRef.current) {
                clearInterval(interval);
                resolve();
              }
            }, 500);
          });
          if (isCancelledRef.current) break;
        }

        // Update UI with current verse
        setState((prev) => ({
          ...prev,
          currentVerseReference: item.reference,
        }));

        // Mark verse as generating
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
            requestId: `bulk-${bulkId}-${item.order}-${Date.now()}`,
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
            // Pause without failing the current verse so it can be retried later.
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

        // Update progress in Convex
        await updateProgress({
          id: bulkId,
          completedCount: completed,
          failedCount: failed,
          skippedCount: skipped,
          totalCreditsUsed: creditsUsed,
        });

        // Update local state immediately
        setState((prev) => ({
          ...prev,
          completedCount: completed,
          failedCount: failed,
          skippedCount: skipped,
          totalCreditsUsed: creditsUsed,
        }));

        // Refresh session to get updated credit balance
        void refetchSession();
      }

      if (!isCancelledRef.current && !isPausedRef.current && shouldMarkComplete) {
        setState((prev) => ({
          ...prev,
          status: "completed",
          currentVerseReference: null,
        }));
      }

      isRunningRef.current = false;
    },
    [
      state.completedCount,
      state.failedCount,
      state.skippedCount,
      state.totalCreditsUsed,
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
    void runGenerationLoop(activeBulk._id, pendingQueue);
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

      isPausedRef.current = false;
      isCancelledRef.current = false;
      queueRef.current = params.queue;
      settingsRef.current = {
        modelId: params.modelId,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        translation: params.translation,
      };

      const bulkId = await createBulk({
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
        status: "active",
        bulkId,
        totalVerses: params.queue.length,
        completedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalCreditsUsed: 0,
        currentVerseReference: params.queue[0]?.reference ?? null,
      });

      // Start the loop
      runGenerationLoop(bulkId, params.queue);
    },
    [sid, convexEnabled, createBulk, runGenerationLoop]
  );

  const pauseBulkGeneration = useCallback(() => {
    isPausedRef.current = true;
    if (state.bulkId) {
      pauseBulk({ id: state.bulkId });
    }
    setState((prev) => ({ ...prev, status: "paused" }));
  }, [state.bulkId, pauseBulk]);

  const resumeBulkGeneration = useCallback(() => {
    isPausedRef.current = false;
    if (state.bulkId) {
      resumeBulk({ id: state.bulkId });
    }
    setState((prev) => ({ ...prev, status: "active" }));
  }, [state.bulkId, resumeBulk]);

  const cancelBulkGeneration = useCallback(() => {
    isCancelledRef.current = true;
    isPausedRef.current = false;
    if (state.bulkId) {
      cancelBulk({ id: state.bulkId });
    }
    setState((prev) => ({
      ...prev,
      status: "cancelled",
      currentVerseReference: null,
    }));
  }, [state.bulkId, cancelBulk]);

  const dismissBulkGeneration = useCallback(() => {
    isPausedRef.current = false;
    isCancelledRef.current = false;
    isRunningRef.current = false;
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
