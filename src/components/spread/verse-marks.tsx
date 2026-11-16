"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { usePictureStyles } from "@/context/work-scope-context";
import type { TrackPageTurn } from "@/components/spread/page-turn";

export interface VerseMarksProps {
  bookSlug: string;
  bookName: string;
  chapter: number;
  verseNumber: number;
  totalVerses: number;
  onTurn: TrackPageTurn;
}

const NONE_PAINTED: ReadonlySet<number> = new Set();

/**
 * A thin row of marks along the top of the spread, one per verse of the chapter. A painted verse (one the
 * picture rule finds a picture for, in the chosen style or another visible one) is brighter, the current
 * verse is marked, and each mark opens its verse.
 */
export function VerseMarks(props: VerseMarksProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <MarksWithStatus {...props} /> : <MarksRow {...props} painted={NONE_PAINTED} />;
}

function MarksWithStatus(props: VerseMarksProps) {
  const { order } = usePictureStyles();
  const verseIds = useMemo(
    () => Array.from({ length: props.totalVerses }, (_, index) => `${props.bookSlug}-${props.chapter}-${index + 1}`),
    [props.bookSlug, props.chapter, props.totalVerses],
  );
  // The chapter read Contents makes, with the same arguments, so opening Contents finds its wall already loaded.
  const tiles = useQuery(api.verseImages.getChapterContents, { verseIds, styles: order });
  const painted = tiles ? new Set(tiles.flatMap((tile, index) => (tile.picture ? [index + 1] : []))) : NONE_PAINTED;
  return <MarksRow {...props} painted={painted} />;
}

function MarksRow({ bookSlug, bookName, chapter, verseNumber, totalVerses, onTurn, painted }: VerseMarksProps & { painted: ReadonlySet<number> }) {
  const verses = Array.from({ length: totalVerses }, (_, index) => index + 1);
  return (
    <nav
      aria-label={`Verses of ${bookName} ${chapter}`}
      data-fades
      className="spread-marks pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/45 to-transparent px-4 pt-[max(0.25rem,var(--safe-area-inset-top))] pb-3 md:right-[var(--words-page-width)] md:px-8 md:pt-3"
    >
      <ol className="pointer-events-auto flex gap-[2px] md:gap-[3px]">
        {verses.map((verse) => {
          const href = `/${bookSlug}/${chapter}/${verse}`;
          const isCurrent = verse === verseNumber;
          const tone = isCurrent ? "bg-white" : painted.has(verse) ? "bg-white/60" : "bg-white/20";
          return (
            <li key={verse} className="flex min-w-0 flex-1">
              <Link
                href={href}
                // Every mark is on screen, so prefetching them all would fetch the whole chapter.
                prefetch={false}
                aria-label={`Verse ${verse}, ${painted.has(verse) ? "painted" : "unpainted"}`}
                aria-current={isCurrent ? "page" : undefined}
                onClick={() => {
                  if (!isCurrent) onTurn(verse < verseNumber ? "prev" : "next", "mark", href);
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
