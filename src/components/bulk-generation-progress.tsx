"use client";

import { Check, X, Loader2, Pause, Play, Zap, CircleDot, Minus } from "lucide-react";
import { useBulkGeneration } from "@/context/bulk-generation-context";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

interface BulkGenerationProgressProps {
  onClose: () => void;
}

export function BulkGenerationProgress({ onClose }: BulkGenerationProgressProps) {
  const {
    state,
    pauseBulkGeneration,
    resumeBulkGeneration,
    cancelBulkGeneration,
    dismissBulkGeneration,
  } = useBulkGeneration();

  const verses = useQuery(
    api.bulkGenerations.getVerses,
    state.bulkId ? { bulkGenerationId: state.bulkId } : "skip"
  );

  const {
    status,
    totalVerses,
    completedCount,
    failedCount,
    skippedCount,
    totalCreditsUsed,
    currentVerseReference,
    errorMessage,
  } = state;

  const processedCount = completedCount + failedCount + skippedCount;
  const progressPercent = totalVerses > 0 ? (processedCount / totalVerses) * 100 : 0;
  const isFinished = status === "completed" || status === "cancelled";

  // ---------------------------------------------------------------------------
  // Completion / Cancelled view
  // ---------------------------------------------------------------------------
  if (isFinished) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          {status === "completed" ? (
            <div className="w-8 h-8 rounded-full bg-[var(--success)]/15 flex items-center justify-center">
              <Check size={16} className="text-[var(--success)]" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-[var(--muted)]/15 flex items-center justify-center">
              <X size={16} className="text-[var(--muted)]" />
            </div>
          )}
          <h3 className="text-base font-semibold text-[var(--foreground)]">
            {status === "completed" ? "Generation Complete" : "Generation Cancelled"}
          </h3>
        </div>

        <div className="bg-[var(--surface)] rounded-[var(--radius-md)] px-4 py-3 space-y-1.5">
          <div className="text-sm text-[var(--foreground)]">
            {completedCount} of {totalVerses} succeeded
          </div>
          {failedCount > 0 && (
            <div className="text-sm text-[var(--error)]">
              {failedCount} failed
            </div>
          )}
          {skippedCount > 0 && (
            <div className="text-sm text-[var(--muted)]">
              {skippedCount} skipped
            </div>
          )}
          <div className="flex items-center gap-1 text-sm text-[var(--muted)]">
            <Zap size={12} strokeWidth={2} />
            <span>{totalCreditsUsed} credits used</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              dismissBulkGeneration();
              onClose();
            }}
            className="flex-1 min-h-[44px] flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Active / Paused view
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-[var(--foreground)]">
          {status === "paused" || status === "blocked"
            ? "Generation Paused"
            : "Generating Images"}
        </h3>
        {status === "paused" && (
          <p className="text-xs text-[var(--muted)] mt-1">
            Paused. Resume to continue generating.
          </p>
        )}
        {status === "blocked" && (
          <p className="text-xs text-[var(--muted)] mt-1">
            Rate limited. Resume to continue when capacity is available.
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium tabular-nums text-[var(--foreground)]">
            {processedCount} of {totalVerses}
          </span>
          <span className="text-xs text-[var(--muted)]">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-[var(--divider)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Current verse + credits */}
      <div className="bg-[var(--surface)] rounded-[var(--radius-md)] px-4 py-3 space-y-1">
        {errorMessage && (
          <div className="text-xs text-[var(--error)]">
            {errorMessage}
          </div>
        )}
        {currentVerseReference && (
          <div className="text-sm text-[var(--foreground)]">
            Current: <span className="font-medium">{currentVerseReference}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-[var(--muted)]">
          <Zap size={11} strokeWidth={2} />
          <span>{totalCreditsUsed} credits used</span>
        </div>
        {failedCount > 0 && (
          <div className="text-xs text-[var(--error)]">
            {failedCount} failed
          </div>
        )}
      </div>

      {/* Verse list */}
      {verses && verses.length > 0 && (
        <div className="max-h-36 overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-[var(--divider)]">
          <div className="divide-y divide-[var(--divider)]">
            {verses.map((v) => (
              <div
                key={v._id}
                className="flex items-center gap-2.5 px-3 py-2"
              >
                <VerseStatusIcon status={v.status} />
                <span className="text-xs text-[var(--foreground)] flex-1 truncate">
                  {v.reference}
                </span>
                {v.creditsCost != null && (
                  <span className="text-[10px] text-[var(--muted)] tabular-nums flex items-center gap-0.5">
                    <Zap size={9} strokeWidth={2} />
                    {v.creditsCost}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3">
        {status === "paused" || status === "blocked" ? (
          <button
            onClick={resumeBulkGeneration}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors text-sm font-medium"
          >
            <Play size={14} />
            <span>Resume</span>
          </button>
        ) : (
          <button
            onClick={pauseBulkGeneration}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface)] text-[var(--foreground)] border border-[var(--divider)] hover:bg-[var(--divider)] transition-colors text-sm font-medium"
          >
            <Pause size={14} />
            <span>Pause</span>
          </button>
        )}
        <button
          onClick={cancelBulkGeneration}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface)] text-[var(--muted)] border border-[var(--divider)] hover:text-[var(--error)] hover:border-[var(--error)]/50 transition-colors"
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function VerseStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <div className="w-4 h-4 rounded-full bg-[var(--success)]/15 flex items-center justify-center flex-shrink-0">
          <Check size={10} className="text-[var(--success)]" />
        </div>
      );
    case "generating":
      return (
        <Loader2
          size={14}
          className="animate-spin text-[var(--accent)] flex-shrink-0"
        />
      );
    case "failed":
      return (
        <div className="w-4 h-4 rounded-full bg-[var(--error)]/15 flex items-center justify-center flex-shrink-0">
          <X size={10} className="text-[var(--error)]" />
        </div>
      );
    case "skipped":
      return (
        <div className="w-4 h-4 rounded-full bg-[var(--muted)]/15 flex items-center justify-center flex-shrink-0">
          <Minus size={10} className="text-[var(--muted)]" />
        </div>
      );
    default:
      return (
        <CircleDot size={14} className="text-[var(--divider)] flex-shrink-0" />
      );
  }
}
