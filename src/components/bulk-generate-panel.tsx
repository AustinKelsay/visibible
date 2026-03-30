"use client";

import { useEffect, useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Zap, Minus, Plus, BookOpen } from "lucide-react";
import { useSession } from "@/context/session-context";
import { useVerseNav } from "@/context/verse-nav-context";
import { usePreferences } from "@/context/preferences-context";
import { useBulkGeneration } from "@/context/bulk-generation-context";
import { parseVerseLocation, parseVerseUrl } from "@/lib/navigation";
import type { VerseLocation } from "@/lib/navigation";
import {
  buildVerseQueue,
  estimateBulkCost,
  scopeLabel,
  getMaxScopeCount,
  getBookVerseCount,
  type BulkScopeType,
  type BulkScope,
} from "@/lib/bulk-generation";
import {
  canAffordImageGeneration,
  type ImageResolution,
} from "@/lib/image-models";
import { BulkGenerationProgress } from "@/components/bulk-generation-progress";

interface BulkGeneratePanelProps {
  /** Per-verse credit cost estimate (from current model + resolution) */
  perVerseCost: number;
  /** Currently selected model ID */
  modelId: string;
  /** Currently selected aspect ratio */
  aspectRatio: string;
  /** Currently selected resolution */
  resolution: ImageResolution;
  /** Close the parent modal */
  onClose: () => void;
}

function getDefaultCount(type: BulkScopeType) {
  return type === "verses" ? 5 : 1;
}

function clampCount(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(Math.max(1, value), max);
}

export function BulkGeneratePanel({
  perVerseCost,
  modelId,
  aspectRatio,
  resolution,
  onClose,
}: BulkGeneratePanelProps) {
  const { credits, tier, buyCredits } = useSession();
  const { translation } = usePreferences();
  const verseNav = useVerseNav();
  const pathname = usePathname();
  const { state: bulkState, startBulkGeneration } = useBulkGeneration();

  const [scopeType, setScopeTypeRaw] = useState<BulkScopeType>("verses");
  const [count, setCount] = useState(getDefaultCount("verses"));
  const [countInput, setCountInput] = useState(String(getDefaultCount("verses")));
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Wrap setScopeType to also reset count
  const setScopeType = (type: BulkScopeType) => {
    setScopeTypeRaw(type);
    const defaultCount = getDefaultCount(type);
    setCount(defaultCount);
    setCountInput(String(defaultCount));
  };

  const currentLocation: VerseLocation | null = useMemo(() => {
    const pathnameParts = pathname?.split("/").filter(Boolean) ?? [];
    if (pathnameParts.length >= 3) {
      const routeLocation = parseVerseUrl(
        pathnameParts[0],
        pathnameParts[1],
        pathnameParts[2]
      );
      if (routeLocation) {
        return routeLocation;
      }
    }

    if (!verseNav) return null;

    return parseVerseLocation(
      verseNav.book,
      verseNav.chapter,
      verseNav.verseNumber
    );
  }, [pathname, verseNav]);

  const maxCount = useMemo(
    () => (currentLocation ? getMaxScopeCount(scopeType, currentLocation) : 1),
    [scopeType, currentLocation]
  );

  const effectiveCount = useMemo(
    () => Math.min(count, maxCount),
    [count, maxCount]
  );

  useEffect(() => {
    const normalizedCount = clampCount(count, maxCount);

    if (normalizedCount !== count) {
      setCount(normalizedCount);
    }

    if (countInput !== "" && countInput !== String(normalizedCount)) {
      setCountInput(String(normalizedCount));
    }
  }, [count, countInput, maxCount]);

  const scope: BulkScope = useMemo(
    () => ({ type: scopeType, count: effectiveCount }),
    [scopeType, effectiveCount]
  );

  // Build the verse queue
  const queue = useMemo(() => {
    if (!currentLocation) return [];
    return buildVerseQueue(scope, currentLocation);
  }, [scope, currentLocation]);

  // Cost estimate
  const costEstimate = useMemo(
    () => estimateBulkCost(queue.length, perVerseCost),
    [queue.length, perVerseCost]
  );

  // Range display
  const rangeDisplay = useMemo(() => {
    if (queue.length === 0) return "";
    const first = queue[0].reference;
    const last = queue[queue.length - 1].reference;
    if (first === last) return first;
    return `${first} \u2192 ${last}`;
  }, [queue]);

  const canAfford = tier === "admin" || canAffordImageGeneration(credits, costEstimate.totalCredits);
  const creditsNeeded = Math.max(0, costEstimate.totalCredits - credits);

  // If a bulk generation is active/paused/completed/cancelled, show progress
  if (bulkState.status !== "idle") {
    return <BulkGenerationProgress onClose={onClose} />;
  }

  if (!currentLocation) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-[var(--muted)]">
        Navigate to a verse to use bulk generation.
      </div>
    );
  }

  const handleStart = async () => {
    if (isStarting) return;
    if (!currentLocation || queue.length === 0) return;
    setIsStarting(true);
    setStartError(null);
    try {
      await startBulkGeneration({
        scope,
        scopeLabel: scopeLabel(scope, currentLocation),
        queue,
        estimatedTotalCredits: costEstimate.totalCredits,
        modelId,
        aspectRatio,
        resolution,
        translation: translation || "web",
      });
    } catch (error) {
      console.error("Failed to start bulk generation:", error);
      setStartError("Failed to start bulk generation. Please try again.");
    } finally {
      setIsStarting(false);
    }
  };

  const scopeTypes: { type: BulkScopeType; label: string }[] = [
    { type: "verses", label: "Verses" },
    { type: "chapters", label: "Chapters" },
    { type: "book", label: "Book" },
  ];

  const adjustCount = (delta: number) => {
    const nextCount = clampCount(count + delta, maxCount);
    setCount(nextCount);
    setCountInput(String(nextCount));
  };

  const handleCountChange = (value: string) => {
    setCountInput(value);

    if (value === "") return;

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;

    setCount(clampCount(Math.trunc(parsed), maxCount));
  };

  const handleCountBlur = () => {
    if (maxCount <= 0) {
      setCountInput("0");
      setCount(0);
      return;
    }

    if (countInput.trim() === "") {
      setCountInput(String(effectiveCount));
      return;
    }

    const parsed = Number(countInput);
    if (!Number.isFinite(parsed)) {
      setCountInput(String(effectiveCount));
      return;
    }

    const normalizedCount = clampCount(Math.trunc(parsed), maxCount);
    setCount(normalizedCount);
    setCountInput(String(normalizedCount));
  };

  return (
    <div className="space-y-5">
      {/* Scope type pills */}
      <div>
        <span className="text-sm font-medium text-[var(--foreground)]">Scope</span>
        <div className="flex gap-2 mt-2">
          {scopeTypes.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => setScopeType(type)}
              disabled={isStarting}
              className={`flex-1 min-h-[36px] rounded-[var(--radius-md)] text-xs font-medium transition-colors ${
                scopeType === type
                  ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/50"
                  : "bg-[var(--surface)] text-[var(--muted)] border border-transparent hover:bg-[var(--divider)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scope details */}
      <div className="bg-[var(--surface)] rounded-[var(--radius-md)] px-4 py-3">
        {scopeType === "book" ? (
          /* Book scope — just show the book name + total */
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-[var(--muted)] flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-[var(--foreground)]">
                {currentLocation.book.name}
              </div>
              <div className="text-xs text-[var(--muted)]">
                {getBookVerseCount(currentLocation.book.slug)} verses total
              </div>
            </div>
          </div>
        ) : (
          /* Verses or Chapters — stepper */
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--foreground)]">
                Next{" "}
                <span className="font-medium">{effectiveCount}</span>{" "}
                {scopeType === "verses"
                  ? effectiveCount === 1
                    ? "verse"
                    : "verses"
                  : effectiveCount === 1
                    ? "chapter"
                    : "chapters"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => adjustCount(-1)}
                  disabled={effectiveCount <= 1 || isStarting || maxCount <= 0}
                  aria-label="Decrease count by 1"
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--background)] border border-[var(--divider)] text-[var(--foreground)] hover:bg-[var(--divider)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min={maxCount > 0 ? 1 : 0}
                  max={Math.max(0, maxCount)}
                  step={1}
                  inputMode="numeric"
                  value={countInput}
                  onChange={(event) => handleCountChange(event.target.value)}
                  onBlur={handleCountBlur}
                  onFocus={(event) => event.target.select()}
                  disabled={isStarting || maxCount <= 0}
                  aria-label={`Number of ${scopeType}`}
                  className="h-8 w-14 rounded-[var(--radius-sm)] border border-[var(--divider)] bg-[var(--background)] px-2 text-center text-sm font-medium tabular-nums text-[var(--foreground)] outline-none transition-colors [appearance:textfield] disabled:opacity-40 disabled:cursor-not-allowed [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  onClick={() => adjustCount(1)}
                  disabled={effectiveCount >= maxCount || isStarting || maxCount <= 0}
                  aria-label="Increase count by 1"
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--background)] border border-[var(--divider)] text-[var(--foreground)] hover:bg-[var(--divider)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            {rangeDisplay && (
              <div className="text-xs text-[var(--muted)] mt-2">{rangeDisplay}</div>
            )}
          </div>
        )}
      </div>

      {/* Cost estimate */}
      <div className="bg-[var(--surface)] rounded-[var(--radius-md)] px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--foreground)] flex items-center gap-1">
            <Zap size={14} strokeWidth={2} className="text-[var(--accent)]" />
            ~{costEstimate.totalCredits} credits
          </span>
          <span className="text-xs text-[var(--muted)]">
            (${costEstimate.totalUsd.toFixed(2)})
          </span>
        </div>
        <div className="text-xs text-[var(--muted)]">
          {queue.length} verse{queue.length !== 1 ? "s" : ""} &times; ~{perVerseCost} credits
        </div>
        {tier !== "admin" && (
          <div className="text-xs text-[var(--muted)]">
            Balance: {credits} credits
          </div>
        )}
      </div>

      {startError && (
        <div className="text-sm text-[var(--error)]">{startError}</div>
      )}

      {/* Start button */}
      {canAfford ? (
        <button
          onClick={handleStart}
          disabled={queue.length === 0 || isStarting}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{isStarting ? "Starting..." : "Start Generating"}</span>
          <span className="inline-flex items-center gap-0.5 opacity-80">
            <Zap size={12} strokeWidth={2} />
            <span>~{costEstimate.totalCredits}</span>
          </span>
        </button>
      ) : (
        <button
          onClick={buyCredits}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] text-sm font-medium"
        >
          <Zap size={14} strokeWidth={2} />
          <span>Buy Credits (need {creditsNeeded} more)</span>
        </button>
      )}
    </div>
  );
}
