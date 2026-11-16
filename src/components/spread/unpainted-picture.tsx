"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Brush, RefreshCw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { usePreferences } from "@/context/preferences-context";
import { useSession } from "@/context/session-context";
import { previewSource } from "@/lib/picture-source";
import { useVerseGeneration } from "@/lib/use-verse-generation";

interface UnpaintedPictureProps {
  verseId: string;
  reference: string;
  artStyle: string;
}

const PILL = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors focus-ring";
const PRIMARY = `${PILL} bg-white text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60`;

/**
 * The picture area of a verse with no picture in the stored art style. It glows with the nearest earlier picture of
 * the chapter (plain dark when there is none) and offers one button to paint the verse, priced by the server's quote,
 * with the automatic-painting switch under it. Painting runs the existing generation flow; the words page is untouched
 * while it runs, and the saved picture replaces this area as soon as the verse's picture list has it.
 *
 * Mount it with `key={verseId}`, so turning the page starts it afresh.
 */
export function UnpaintedPicture({ verseId, reference, artStyle }: UnpaintedPictureProps) {
  const glow = useQuery(api.verseImages.getNearestEarlierPicture, { verseId, artStyle });
  const glowSource = glow ? previewSource(glow) : null;
  const { buyCredits } = useSession();
  const { autoGenerate, setAutoGenerate } = usePreferences();
  // A made picture: saved (shown once the verse's pictures include it), or only at a URL when nothing persists it.
  const [made, setMade] = useState<{ saved: boolean; url: string } | null>(null);
  // Turning the switch on here paints from the next page on, never the verse on screen by surprise.
  const [switchedHere, setSwitchedHere] = useState(false);
  const generation = useVerseGeneration({
    verseId,
    reference,
    // Only mounted once the verse's pictures in this style have loaded and there are none.
    styleImageCount: 0,
    autoGenerateBlocked: switchedHere,
    // The switch is the only way automatic painting starts, for the owner too.
    ownerNeedsNoOptIn: false,
    onAttemptStart: () => setMade(null),
    onImage: ({ savedImageId, url }) => setMade({ saved: savedImageId !== null, url }),
  });

  if (made && !made.saved) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={made.url} alt={`Picture of ${reference}`} className="absolute inset-0 h-full w-full object-cover object-center" />;
  }

  const painting = generation.isGenerating || made !== null;
  const quote = generation.showCreditsCost ? generation.quote : null;

  let body;
  if (painting) {
    const percent = made ? 100 : Math.round(generation.progress * 100);
    body = (
      <div className="w-full max-w-[280px] space-y-3">
        <p className="font-serif text-xl text-white/90">Painting {reference}</p>
        <div
          role="progressbar"
          aria-label={`Painting ${reference}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1 overflow-hidden rounded-full bg-white/15"
        >
          <div className="h-full rounded-full bg-white/80 motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-white/60">
          {generation.phase === "generating" ? "The picture is being painted." : "Getting the scene ready."} Keep reading; it appears here when it is done.
        </p>
      </div>
    );
  } else if (generation.error) {
    body = (
      <>
        <p role="alert" className="max-w-sm text-sm text-red-200">{generation.error}</p>
        <button type="button" className={PRIMARY} onClick={() => generation.generate("spread_retry")}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Try again
        </button>
      </>
    );
  } else if (generation.priceNotice) {
    body = (
      <>
        <p role="status" className="max-w-sm text-sm text-white/85">{generation.priceNotice}</p>
        <button type="button" className={PRIMARY} onClick={() => generation.generate("spread_paint")}>
          Paint at this price
        </button>
      </>
    );
  } else {
    body = (
      <>
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/40 backdrop-blur-md md:h-14 md:w-14">
          <Brush aria-hidden="true" className="h-5 w-5 text-white/85" />
        </span>
        <p className="font-serif text-xl text-white/90 md:text-2xl">No picture for {reference} yet</p>
        {generation.pricingUnavailable ? (
          <p className="max-w-sm text-sm text-white/60">{generation.pricingUnavailable}</p>
        ) : generation.canGenerate || generation.pricingPending ? (
          <button
            type="button"
            className={PRIMARY}
            disabled={generation.pricingPending}
            onClick={() => generation.generate("spread_paint")}
          >
            <span>Paint this verse</span>
            {quote ? (
              <span className="font-normal text-black/55">
                {` · about ${quote.estimateCredits} ${quote.estimateCredits === 1 ? "credit" : "credits"}`}
              </span>
            ) : null}
          </button>
        ) : (
          <button type="button" className={PRIMARY} onClick={buyCredits}>
            Get credits to paint
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={autoGenerate}
          onClick={() => {
            setSwitchedHere(true);
            setAutoGenerate(!autoGenerate, "spread_paint_switch");
          }}
          className="mt-1 inline-flex min-h-[44px] items-center gap-3 rounded-full px-2 text-sm text-white/70 hover:text-white focus-ring"
        >
          <span
            aria-hidden="true"
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${autoGenerate ? "bg-white/85" : "bg-white/20"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full shadow motion-safe:transition-[left] ${autoGenerate ? "left-[18px] bg-black" : "left-0.5 bg-white"}`}
            />
          </span>
          Paint verses automatically as I read
        </button>
      </>
    );
  }

  return (
    <section aria-label="Picture" className="absolute inset-0 overflow-hidden bg-[#050505]">
      {glowSource ? (
        // A soft, darkened memory of the last painting, so the book never goes blank. Decorative.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={glowSource}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-125 object-cover object-center opacity-60 blur-3xl saturate-75"
        />
      ) : null}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/50" />
      <div className="relative flex h-full flex-col items-center justify-center gap-3 px-6 pt-8 pb-6 text-center md:gap-4 md:pr-[calc(var(--words-page-width)+1.5rem)] md:pb-28">
        {body}
      </div>
    </section>
  );
}
