"use client";

import { useState } from "react";
import { useSession } from "@/context/session-context";
import { quotePhrase } from "@/lib/quote-display";
import { useVerseGeneration } from "@/lib/use-verse-generation";
import { readableReference } from "@/lib/readable-reference";

export const PILL = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors focus-ring";
export const PRIMARY = `${PILL} bg-ink text-paper hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60`;
/** On a phone narrower than 390px a priced action stacks its price on its own line under the action. */
const PRICE_STACK = "max-[389px]:flex-col max-[389px]:gap-0 max-[389px]:py-1.5 max-[389px]:leading-snug";
/** The " · " before the price: kept for screen readers when the price stacks under the action. */
export const PRICE_SEPARATOR = "max-[389px]:sr-only";

/**
 * Painting a verse in the chosen art style from the spread: the existing generation flow for a verse with no picture
 * in that style (the unpainted verse, and a verse shown in another style). Automatic painting follows the reader's
 * switch only, for the owner too. `made` holds a finished picture until the verse's pictures include it.
 */
export function usePaintVerse({ verseId, reference, autoGenerateBlocked = false }: { verseId: string; reference: string; autoGenerateBlocked?: boolean }) {
  // A made picture: saved (shown once the verse's pictures include it), or only at a URL when nothing persists it.
  const [made, setMade] = useState<{ saved: boolean; url: string } | null>(null);
  const generation = useVerseGeneration({
    verseId,
    reference,
    // Only used once the verse's pictures in the chosen style have loaded and there are none.
    styleImageCount: 0,
    autoGenerateBlocked,
    onAttemptStart: () => setMade(null),
    onImage: ({ savedImageId, url }) => setMade({ saved: savedImageId !== null, url }),
  });
  const painting = generation.isGenerating || made !== null;
  return {
    generation,
    made,
    painting,
    percent: made ? 100 : Math.round(generation.progress * 100),
    quote: generation.showCreditsCost ? generation.quote : null,
  };
}

export type PaintVerse = ReturnType<typeof usePaintVerse>;

/**
 * The one paid control: "{label} · about N credits · at most M" from the server's quote (no price for an admin), "Get credits to
 * paint" when the balance cannot cover it, or the reason painting is unavailable.
 */
export function PaintButton({ paint, label, className = PRIMARY }: { paint: PaintVerse; label: string; className?: string }) {
  const { buyCredits } = useSession();
  const { generation, quote } = paint;
  if (generation.pricingUnavailable) return <p className="max-w-sm text-sm text-ink/(--quiet-60)">{generation.pricingUnavailable}</p>;
  if (!generation.canGenerate && !generation.pricingPending) {
    return (
      <button type="button" className={className} onClick={buyCredits}>
        Get credits to paint
      </button>
    );
  }
  return (
    <button type="button" className={`${className} ${PRICE_STACK}`} disabled={generation.pricingPending} onClick={() => generation.generate("spread_paint")}>
      <span>{label}</span>
      {quote ? (
        <span className="font-normal text-paper/(--quiet-55)">
          <span className={PRICE_SEPARATOR}>{" · "}</span>
          <span>{quotePhrase(quote)}</span>
        </span>
      ) : null}
    </button>
  );
}

/** The progress line while a verse is painted. */
export function PaintProgress({ paint, reference }: { paint: PaintVerse; reference: string }) {
  return (
    <div
      role="progressbar"
      aria-label={`Painting ${readableReference(reference)}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={paint.percent}
      className="h-1 overflow-hidden rounded-full bg-ink/15"
    >
      <div className="h-full rounded-full bg-ink/80 motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${paint.percent}%` }} />
    </div>
  );
}
