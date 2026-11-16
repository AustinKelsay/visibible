"use client";

import { LayerProvider } from "@/components/spread/layers";
import { PageTurnLink, useArrival, usePageTurn } from "@/components/spread/page-turn";
import { VerseMarks } from "@/components/spread/verse-marks";
import { useIdle } from "@/components/spread/idle-fade";
import { useSwipeTurn } from "@/components/spread/swipe-turn";
import { PrefetchNextSpread } from "@/components/spread/prefetch-next";
import { SpreadPicture } from "@/components/spread/spread-picture";
import { WordsPage } from "@/components/spread/words-page";

export interface SpreadProps {
  /** Where the verse's pictures are kept ("genesis-1-1"). */
  verseId: string;
  /** The book's address segment ("genesis"). */
  bookSlug: string;
  bookName: string;
  chapter: number;
  verseNumber: number;
  verseText: string;
  totalVerses: number;
  translationName: string;
  prevUrl?: string;
  nextUrl?: string;
  /** Where the next verse's pictures are kept, so the next spread can be fetched ahead. */
  nextVerseId?: string;
}

/**
 * The reader's one screen for one verse. On a computer the picture covers the window and the words
 * page lies over its right side as dark glass, with a floating dock on the picture. On a phone the
 * picture sits above in a square frame and the words page fills the rest. It is dark whatever the
 * system setting is.
 */
export function Spread(props: SpreadProps) {
  return (
    <LayerProvider>
      <SpreadScreen {...props} />
    </LayerProvider>
  );
}

function SpreadScreen({ verseId, bookSlug, bookName, chapter, verseNumber, verseText, totalVerses, translationName, prevUrl, nextUrl, nextVerseId }: SpreadProps) {
  const reference = `${bookName} ${chapter}:${verseNumber}`;
  const onTurn = usePageTurn({ bookName, chapter, verseNumber, prevUrl, nextUrl });
  const swipe = useSwipeTurn({ prevUrl, nextUrl, onTurn });
  const idle = useIdle();
  const arrival = useArrival(`/${bookSlug}/${chapter}/${verseNumber}`);

  return (
    <main
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#050505] text-white [--words-page-width:min(40vw,600px)] md:block"
      style={{ colorScheme: "dark" }}
      data-idle={idle}
      data-arrival={arrival ?? undefined}
      {...swipe}
    >
      <div data-turn-in="fade" className="relative aspect-square max-h-[52svh] w-full shrink-0 overflow-hidden md:absolute md:inset-0 md:aspect-auto md:max-h-none">
        <SpreadPicture verseId={verseId} reference={reference} />
      </div>
      <PrefetchNextSpread nextUrl={nextUrl} nextVerseId={nextVerseId} />

      <VerseMarks
        bookSlug={bookSlug}
        bookName={bookName}
        chapter={chapter}
        verseNumber={verseNumber}
        totalVerses={totalVerses}
        onTurn={onTurn}
      />

      <WordsPage
        bookName={bookName}
        chapter={chapter}
        verseNumber={verseNumber}
        verseText={verseText}
        totalVerses={totalVerses}
        translationName={translationName}
        prevUrl={prevUrl}
        nextUrl={nextUrl}
        onTurn={onTurn}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-8 hidden justify-center md:right-[var(--words-page-width)] md:flex">
        <nav
          aria-label="Turn the page"
          data-fades
          className="liquid-glass spread-dock pointer-events-auto flex items-center gap-1 rounded-full p-1.5"
        >
          <PageTurnLink direction="prev" href={prevUrl} onTurn={onTurn} />
          <span className="px-3 text-sm font-medium text-white/90">{reference}</span>
          <PageTurnLink direction="next" href={nextUrl} onTurn={onTurn} />
        </nav>
      </div>
    </main>
  );
}
