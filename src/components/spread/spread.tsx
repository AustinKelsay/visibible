"use client";

import { ContentsButton, ContentsLayer } from "@/components/spread/contents";
import { LayerProvider } from "@/components/spread/layers";
import { PageTurnLink, usePageTurn } from "@/components/spread/page-turn";
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
}

/**
 * The reader's one screen for one verse. On a computer the picture covers the window and the words
 * page lies over its right side as dark glass, with a floating dock on the picture. On a phone the
 * picture sits above in a square frame and the words page fills the rest. It is dark whatever the
 * system setting is.
 */
export function Spread({ verseId, bookSlug, bookName, chapter, verseNumber, verseText, totalVerses, translationName, prevUrl, nextUrl }: SpreadProps) {
  const reference = `${bookName} ${chapter}:${verseNumber}`;
  const onTurn = usePageTurn({ bookName, chapter, verseNumber, prevUrl, nextUrl });

  return (
    <LayerProvider>
      <main
        className="fixed inset-0 flex flex-col overflow-hidden bg-[#050505] text-white [--words-page-width:min(40vw,600px)] md:block"
        style={{ colorScheme: "dark" }}
      >
        <div className="relative aspect-square max-h-[52svh] w-full shrink-0 overflow-hidden md:absolute md:inset-0 md:aspect-auto md:max-h-none">
          <SpreadPicture verseId={verseId} reference={reference} />
        </div>

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
            className="liquid-glass spread-dock pointer-events-auto flex items-center gap-1 rounded-full p-1.5"
          >
            <PageTurnLink direction="prev" href={prevUrl} onTurn={onTurn} />
            <ContentsButton reference={reference} variant="dock" />
            <PageTurnLink direction="next" href={nextUrl} onTurn={onTurn} />
          </nav>
        </div>

        <div className="flex shrink-0 justify-center bg-[#0b0b0c] px-4 pt-1 pb-[max(0.75rem,var(--safe-area-inset-bottom))] md:hidden">
          <nav aria-label="Reader" className="liquid-glass spread-dock flex items-center gap-1 rounded-full p-1">
            <ContentsButton reference={reference} variant="phone" />
          </nav>
        </div>

        <ContentsLayer bookSlug={bookSlug} chapter={chapter} verse={verseNumber} />
      </main>
    </LayerProvider>
  );
}
