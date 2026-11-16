"use client";

import { useMemo, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { Brush, Pause, Play, Square } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useBulkGeneration } from "@/context/bulk-generation-context";
import { usePreferences } from "@/context/preferences-context";
import { useSession } from "@/context/session-context";
import { useEffectiveArtStyle } from "@/context/work-scope-context";
import type { BibleBook } from "@/data/bible-structure";
import { trackCreditsInsufficient } from "@/lib/analytics";
import { estimateBulkCost, type BulkQueueItem } from "@/lib/bulk-generation";
import { canAffordImageGeneration } from "@/lib/image-models";
import { useVerseGeneration } from "@/lib/use-verse-generation";

/** Where a verse stands in the reader's bulk job, as its Contents tile shows it. */
export type TileJobStatus = "queued" | "generating" | "completed" | "failed";

/**
 * The reader's bulk job, for the verses on one chapter's wall: verse id → status. Empty with no job, or when the job
 * holds none of them. Skipped verses show as they are, and so do queued ones once the job has ended.
 */
export function useChapterJob(verseIds: string[]): ReadonlyMap<string, TileJobStatus> {
  const { state } = useBulkGeneration();
  const { sid } = useSession();
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(
    api.bulkGenerations.getVerseStatuses,
    isAuthenticated && sid && state.bulkId && state.status !== "idle"
      ? { sid, bulkGenerationId: state.bulkId, verseIds }
      : "skip",
  );
  // A stopped or finished job will not reach its queued verses, so they show as plain unpainted tiles again.
  const ended = state.status === "cancelled" || state.status === "completed";
  return useMemo(
    () => new Map((rows ?? []).flatMap((row) =>
      row.status === "skipped" || (ended && row.status === "queued") ? [] : [[row.verseId, row.status as TileJobStatus] as const])),
    [rows, ended],
  );
}

const PILL = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const PRIMARY = `${PILL} bg-ink text-paper hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60`;
const QUIET = `${PILL} bg-ink/10 text-ink/90 hover:bg-ink/15`;

const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

interface ChapterPaintProps {
  book: BibleBook;
  chapter: number;
  /** The chapter's verses with no picture in the chosen style, in order; undefined while the wall loads. */
  unpaintedVerses: number[] | undefined;
}

/**
 * The wall's one painting control. With no job, "Paint the N unpainted verses · about X credits" starts the existing
 * bulk job for exactly those verses (its limits and charging unchanged), or opens the credits dialog when the balance
 * cannot cover the estimate. While a job exists it shows the job instead: progress and pause, resume and stop, then
 * how it ended until the reader dismisses it.
 */
export function ChapterPaint(props: ChapterPaintProps) {
  const { state } = useBulkGeneration();
  // Only the catalog price is wanted here: with no verse, nothing is quoted or painted. It is read once while
  // Contents is open, so the button is priced as soon as a chapter has unpainted verses.
  const pricing = useVerseGeneration({ verseId: null, reference: undefined, styleImageCount: undefined });
  if (state.status !== "idle") return <JobControls />;
  if (!props.unpaintedVerses || props.unpaintedVerses.length === 0) return null;
  return <PaintChapterButton {...props} unpaintedVerses={props.unpaintedVerses} pricing={pricing} />;
}

function PaintChapterButton({ book, chapter, unpaintedVerses, pricing }: ChapterPaintProps & {
  unpaintedVerses: number[];
  pricing: Pick<ReturnType<typeof useVerseGeneration>, "effectiveCost" | "pricingPending" | "pricingUnavailable">;
}) {
  const { startBulkGeneration } = useBulkGeneration();
  const { tier, credits: balance, buyCredits } = useSession();
  const { translation } = usePreferences();
  const { artStyle } = useEffectiveArtStyle();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const count = unpaintedVerses.length;
  const estimate = estimateBulkCost(count, pricing.effectiveCost);
  const isAdmin = tier === "admin";
  const priced = !pricing.pricingPending && !pricing.pricingUnavailable;
  const affordable = isAdmin || canAffordImageGeneration(balance, estimate.totalCredits);

  const paint = async () => {
    if (!priced || starting) return;
    if (!affordable) {
      trackCreditsInsufficient({ feature: "image", source: "contents_paint", requiredCredits: estimate.totalCredits, tier, hasCredits: balance > 0 });
      buyCredits();
      return;
    }
    const queue: BulkQueueItem[] = unpaintedVerses.map((verse, order) => ({
      verseId: `${book.slug}-${chapter}-${verse}`,
      reference: `${book.name} ${chapter}:${verse}`,
      order,
    }));
    setStarting(true);
    setStartError(null);
    try {
      await startBulkGeneration({
        scope: { type: "chapters", count: 1 },
        scopeLabel: `Unpainted verses of ${book.name} ${chapter}`,
        queue,
        estimatedTotalCredits: estimate.totalCredits,
        // The model, ratio and resolution are the reader's Advanced image settings, which the provider fills in.
        translation: translation || "web",
        artStyleId: artStyle,
      });
    } catch (error) {
      console.error("Failed to start painting the chapter:", error);
      setStartError("Painting could not start. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 md:mb-6">
      <button type="button" className={`${PRIMARY} py-2 max-md:w-full`} disabled={!priced || starting} onClick={paint}>
        <Brush aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0" />
        {/* On a phone the price takes its own line rather than wrapping mid-phrase. */}
        <span className="flex flex-col items-start text-left leading-snug md:block">
          <span>{`Paint the ${count} unpainted ${count === 1 ? "verse" : "verses"}`}</span>
          {priced && !isAdmin ? (
            <span className="font-normal text-paper/(--quiet-55)">
              <span className="max-md:sr-only">{" · "}</span>
              {`about ${credits(estimate.totalCredits)}`}
            </span>
          ) : null}
        </span>
      </button>
      {pricing.pricingUnavailable ? (
        <p className="text-sm text-ink/(--quiet-55)">{pricing.pricingUnavailable}</p>
      ) : priced && !affordable ? (
        <p className="text-sm text-ink/(--quiet-55)">{`You have ${credits(balance)}.`}</p>
      ) : null}
      {startError ? <p role="alert" className="text-sm text-reader-alert">{startError}</p> : null}
    </div>
  );
}

function JobControls() {
  const { state, pauseBulkGeneration, resumeBulkGeneration, cancelBulkGeneration, dismissBulkGeneration } = useBulkGeneration();
  const { status, totalVerses, completedCount, failedCount, skippedCount, totalCreditsUsed, currentVerseReference, errorMessage } = state;
  const processed = completedCount + failedCount + skippedCount;
  const percent = totalVerses > 0 ? Math.round((processed / totalVerses) * 100) : 0;
  const finished = status === "completed" || status === "cancelled";
  const halted = status === "paused" || status === "blocked";

  let summary: string;
  if (status === "completed") summary = `${completedCount} of ${totalVerses} painted`;
  else if (status === "cancelled") summary = `Stopped · ${completedCount} of ${totalVerses} painted`;
  else if (halted) summary = `Paused · ${processed} of ${totalVerses}`;
  else summary = `${currentVerseReference ? `Painting ${currentVerseReference}` : "Painting"} · ${processed} of ${totalVerses}`;
  const details = [
    failedCount > 0 ? `${failedCount} failed` : null,
    finished && totalCreditsUsed > 0 ? `${credits(totalCreditsUsed)} used` : null,
  ].filter(Boolean).join(" · ");
  const note = status === "blocked"
    ? errorMessage ?? "Too many requests right now. Resume when you are ready."
    : status === "paused"
      ? errorMessage ?? "Resume to keep painting."
      : null;

  return (
    // Sticky, so pause and stop stay in reach while the reader scrolls the wall.
    <div role="group" aria-label="Painting the chapter" className="sticky top-0 z-10 mb-4 rounded-2xl border border-ink/10 bg-reader-raised/90 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-xl md:mb-6 md:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-medium text-ink/90 tabular-nums" aria-live="polite">{summary}</p>
          {details || note ? (
            <p className="mt-0.5 text-xs text-ink/(--quiet-55)">{[details, note].filter(Boolean).join(" · ")}</p>
          ) : null}
          {finished ? null : (
            <div
              role="progressbar"
              aria-label="Chapter painting progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="mt-2 h-1 overflow-hidden rounded-full bg-ink/15"
            >
              <div className="h-full rounded-full bg-ink/80 motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {finished ? (
            <button type="button" className={PRIMARY} onClick={dismissBulkGeneration}>Done</button>
          ) : (
            <>
              {halted ? (
                <button type="button" className={PRIMARY} onClick={resumeBulkGeneration}>
                  <Play aria-hidden="true" size={14} strokeWidth={2} />
                  Resume
                </button>
              ) : (
                <button type="button" className={QUIET} onClick={pauseBulkGeneration}>
                  <Pause aria-hidden="true" size={14} strokeWidth={2} />
                  Pause
                </button>
              )}
              <button type="button" className={QUIET} onClick={cancelBulkGeneration}>
                <Square aria-hidden="true" size={12} strokeWidth={2} />
                Stop
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
