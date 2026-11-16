"use client";

import { useLayer } from "@/components/spread/layers";
import { PageTurnLink, type TrackPageTurn } from "@/components/spread/page-turn";

interface WholePictureCaptionProps {
  reference: string;
  verseText: string;
  verseNumber: number;
  totalVerses: number;
  prevUrl?: string;
  nextUrl?: string;
  onTurn: TrackPageTurn;
}

/**
 * The whole-picture view's caption: the verse under its reference. On a computer it lies over the foot of
 * the picture, above the dock, and lets taps through to the picture; on a phone it sits below the picture,
 * with previous and next beside the position line (the words page that holds them is put aside).
 */
export function WholePictureCaption({ reference, verseText, verseNumber, totalVerses, prevUrl, nextUrl, onTurn }: WholePictureCaptionProps) {
  const { isOpen } = useLayer("whole-picture");
  if (!isOpen) return null;
  return (
    <>
      <figcaption className="pointer-events-none shrink-0 px-6 pt-5 pb-4 text-center md:absolute md:inset-x-0 md:bottom-0 md:bg-gradient-to-t md:from-black/80 md:via-black/40 md:to-transparent md:px-12 md:pt-40 md:pb-32">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/60 md:text-xs md:text-white/80 md:[text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">{reference}</p>
        <p className="mx-auto mt-3 max-w-[34ch] font-serif text-[22px] leading-[1.35] text-pretty text-white/95 md:max-w-[40ch] md:text-[34px] md:leading-[1.25] md:[text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">
          {verseText}
        </p>
      </figcaption>
      <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-white/10 px-3 pt-1 pb-[max(0.25rem,var(--safe-area-inset-bottom))] text-[11px] font-medium uppercase tracking-[0.18em] text-white/50 md:hidden">
        <PageTurnLink direction="prev" href={prevUrl} onTurn={onTurn} />
        <span aria-label={`Verse ${verseNumber} of ${totalVerses}`} className="min-w-0 flex-1 text-center tabular-nums">
          {verseNumber} / {totalVerses}
        </span>
        <PageTurnLink direction="next" href={nextUrl} onTurn={onTurn} />
      </div>
    </>
  );
}
