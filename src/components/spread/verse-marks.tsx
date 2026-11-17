"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useMomentWord, usePictureStyles } from "@/context/work-scope-context";
import { opensElsewhere, type TrackPageTurn } from "@/components/spread/page-turn";

/** One page of a chapter: where its pictures are kept and its address. */
export type ChapterPlace = { verseId: string; href: string };

/** A Bible chapter's verses as places. */
export function bibleChapterPlaces(bookSlug: string, chapter: number, totalVerses: number): ChapterPlace[] {
  return Array.from({ length: totalVerses }, (_, index) => ({
    verseId: `${bookSlug}-${chapter}-${index + 1}`,
    href: `/${bookSlug}/${chapter}/${index + 1}`,
  }));
}

export interface VerseMarksProps {
  /** The row's name, e.g. "Verses of John 1" or "Passages of The Pool of Tears". */
  label: string;
  /** The chapter's verses (or a prose division's moments), in order. */
  places: readonly ChapterPlace[];
  /** The place on screen, from 1. */
  current: number;
  onTurn: TrackPageTurn;
}

const NONE_PAINTED: ReadonlySet<number> = new Set();

/**
 * A thin row of marks along the top of the spread, one per verse of the chapter (or moment of a prose division). A
 * painted one (that the picture rule finds a picture for, in the chosen style or another visible one) is brighter,
 * the current one is marked, and each mark opens its page.
 */
export function VerseMarks(props: VerseMarksProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <MarksWithStatus {...props} /> : <MarksRow {...props} painted={NONE_PAINTED} />;
}

function MarksWithStatus(props: VerseMarksProps) {
  const { order } = usePictureStyles();
  const verseIds = useMemo(() => props.places.map((place) => place.verseId), [props.places]);
  // The chapter read Contents makes, with the same arguments, so opening Contents finds its wall already loaded.
  const tiles = useQuery(api.verseImages.getChapterContents, { verseIds, styles: order });
  const painted = tiles ? new Set(tiles.flatMap((tile, index) => (tile.picture ? [index + 1] : []))) : NONE_PAINTED;
  return <MarksRow {...props} painted={painted} />;
}

function MarksRow({ label, places, current, onTurn, painted }: VerseMarksProps & { painted: ReadonlySet<number> }) {
  const noun = useMomentWord() === "verse" ? "Verse" : "Passage";
  return (
    <nav
      aria-label={label}
      data-fades
      className="spread-marks pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/45 to-transparent px-4 pt-[max(0.25rem,var(--safe-area-inset-top))] pb-3 md:right-[var(--words-page-width)] md:px-8 md:pt-3"
    >
      <ol className="pointer-events-auto flex gap-[2px] md:gap-[3px]">
        {places.map(({ href }, index) => {
          const number = index + 1;
          const isCurrent = number === current;
          const tone = isCurrent ? "bg-white" : painted.has(number) ? "bg-white/60" : "bg-white/20";
          return (
            <li key={href} className="flex min-w-0 flex-1">
              <Link
                href={href}
                // Every mark is on screen, so prefetching them all would fetch the whole chapter.
                prefetch={false}
                aria-label={`${noun} ${number}, ${painted.has(number) ? "painted" : "unpainted"}`}
                aria-current={isCurrent ? "page" : undefined}
                onClick={(event) => {
                  if (!isCurrent && !opensElsewhere(event)) onTurn(number < current ? "prev" : "next", "mark", href);
                }}
                className="group flex w-full py-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
              >
                <span
                  className={`block w-full rounded-full shadow-[0_0_2px_rgba(0,0,0,0.6)] transition-colors duration-[var(--motion-fast)] group-hover:bg-white ${isCurrent ? "h-[3px]" : "h-[2px]"} ${tone}`}
                />
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
