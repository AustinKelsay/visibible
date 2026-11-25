"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { Brush, RefreshCw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { usePreferences } from "@/context/preferences-context";
import { useMomentWord, useWorkScope } from "@/context/work-scope-context";
import { drawGlow } from "@/lib/glow";
import { previewSource } from "@/lib/picture-source";
import { PaintButton, PaintProgress, PRIMARY, usePaintVerse } from "@/components/spread/paint-verse";
import { readableReference } from "@/lib/readable-reference";

interface UnpaintedPictureProps {
  verseId: string;
  reference: string;
  /** The picture rule's style order (`usePictureStyles().order`): the glow is chosen by the same rule as the spread. */
  styles: string[];
}

/**
 * The picture area of a verse with no picture the reader can be shown (in the chosen style or any other visible one).
 * It glows with the nearest earlier picture of the chapter (plain dark when there is none) and offers one button to
 * paint the verse, priced by the server's quote, with the automatic-painting switch under it. Painting runs the
 * existing generation flow; the words page is untouched while it runs, and the saved picture replaces this area as
 * soon as the verse's picture is read.
 *
 * Mount it with `key={verseId}`, so turning the page starts it afresh.
 */
export function UnpaintedPicture({ verseId, reference, styles }: UnpaintedPictureProps) {
  const scope = useWorkScope();
  const word = useMomentWord();
  // A prose moment's id says nothing of its place, so it names its division's earlier moments, nearest first.
  const earlier = useMemo(() => {
    if (!scope) return undefined;
    const moments = scope.divisions.find((division) => division.moments.some((moment) => moment.id === verseId))?.moments ?? [];
    return moments.slice(0, moments.findIndex((moment) => moment.id === verseId)).map((moment) => moment.id).reverse();
  }, [scope, verseId]);
  const glow = useQuery(api.verseImages.getNearestEarlierPicture, earlier ? { verseId, styles, earlier } : { verseId, styles });
  const glowSource = glow ? previewSource(glow) : null;
  const { autoGenerate, setAutoGenerate } = usePreferences();
  // Turning the switch on here paints from the next page on, never the verse on screen by surprise.
  const [switchedHere, setSwitchedHere] = useState(false);
  const paint = usePaintVerse({ verseId, reference, autoGenerateBlocked: switchedHere });
  const { generation, made } = paint;

  if (made && !made.saved) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={made.url} alt={`Picture of ${readableReference(reference)}`} className="absolute inset-0 h-full w-full object-cover object-center" />;
  }

  let body;
  if (paint.painting) {
    body = (
      <div className="w-full max-w-[280px] space-y-3">
        <p className="font-serif text-xl text-ink/90">Painting {readableReference(reference)}</p>
        <PaintProgress paint={paint} reference={reference} />
        <p className="text-xs text-ink/(--quiet-60)">
          {generation.phase === "generating" ? "The picture is being painted." : "Getting the scene ready."} Keep reading; it appears here when it is done.
        </p>
      </div>
    );
  } else if (generation.error) {
    body = (
      <>
        <p role="alert" className="max-w-sm text-sm text-reader-alert">{generation.error}</p>
        <button type="button" className={PRIMARY} onClick={() => generation.generate("spread_retry")}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Try again
        </button>
      </>
    );
  } else if (generation.priceNotice) {
    body = (
      <>
        <p role="status" className="max-w-sm text-sm text-ink/85">{generation.priceNotice}</p>
        <button type="button" className={PRIMARY} onClick={() => generation.generate("spread_paint")}>
          Paint at this price
        </button>
      </>
    );
  } else {
    body = (
      <>
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-ink/10 bg-paper/40 backdrop-blur-md md:h-14 md:w-14">
          <Brush aria-hidden="true" className="h-5 w-5 text-ink/85" />
        </span>
        <p className="font-serif text-xl text-ink/90 md:text-2xl">No picture for {readableReference(reference)} yet</p>
        <PaintButton paint={paint} label={`Paint this ${word}`} />
      </>
    );
  }

  return (
    <section aria-label="Picture" className="reader-dark absolute inset-0 overflow-hidden bg-[#050505]">
      {/* A soft, darkened memory of the last painting, so the book never goes blank. Decorative. */}
      {glowSource ? <Glow src={glowSource} /> : null}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-paper/30 via-paper/20 to-paper/50" />
      <div className="relative flex h-full flex-col items-center justify-center gap-3 px-6 pt-8 pb-6 text-center md:gap-4 md:pr-[calc(var(--words-page-width)+1.5rem)] md:pb-28">
        {body}
        {/* In every state, painting included: a reader who turned it on can always turn it off. */}
        <button
          type="button"
          role="switch"
          aria-checked={autoGenerate}
          onClick={() => {
            setSwitchedHere(true);
            setAutoGenerate(!autoGenerate, "spread_paint_switch");
          }}
          // Under 390px the label is set smaller and closer to the switch, so it fits on one line at 320px.
          className="mt-1 inline-flex min-h-[44px] items-center gap-3 rounded-full px-2 text-sm text-ink/70 hover:text-ink focus-ring max-[389px]:gap-2 max-[389px]:px-1 max-[389px]:text-[13px]"
        >
          <span
            aria-hidden="true"
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${autoGenerate ? "bg-ink/85" : "bg-ink/20"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full shadow motion-safe:transition-[left] ${autoGenerate ? "left-[18px] bg-paper" : "left-0.5 bg-ink"}`}
            />
          </span>
          Paint {word}s automatically as I read
        </button>
      </div>
    </section>
  );
}

/** The glow, blurred once into a canvas rather than by a live CSS blur, which Firefox redraws in visible patches (#531). */
function Glow({ src }: { src: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const picture = new Image();
    const draw = () => drawGlow(element, picture);
    picture.onload = draw;
    // A picture that cannot load leaves no glow, as the old <img> did, rather than the previous one.
    picture.onerror = () => {
      element.width = 0;
    };
    picture.src = src;
    // The canvas is sized to the area it covers, so a resized area is drawn again.
    const resized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    resized?.observe(element);
    return () => {
      picture.onload = null;
      picture.onerror = null;
      resized?.disconnect();
    };
  }, [src]);
  return (
    <canvas
      ref={canvas}
      data-glow={src}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full scale-125 object-cover object-center opacity-60 saturate-75"
    />
  );
}
