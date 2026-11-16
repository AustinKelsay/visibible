"use client";

import { AskProvider } from "@/components/spread/ask";
import { ContentsButton, ContentsLayer } from "@/components/spread/contents";
import { CornerMenu } from "@/components/spread/corner-menu";
import { LayerProvider, useLayer } from "@/components/spread/layers";
import { PageTurnLink, useArrival, useArrivesInWholePicture, usePageTurn } from "@/components/spread/page-turn";
import { VerseMarks } from "@/components/spread/verse-marks";
import { useIdle } from "@/components/spread/idle-fade";
import { useSwipeTurn } from "@/components/spread/swipe-turn";
import { PrefetchNextSpread } from "@/components/spread/prefetch-next";
import { SpreadPicture } from "@/components/spread/spread-picture";
import { WordsPage } from "@/components/spread/words-page";
import { WholePictureCaption } from "@/components/spread/whole-picture";
import { useSession } from "@/context/session-context";
import { trackWholePictureOpened } from "@/lib/analytics";

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
  // A page turned from the whole-picture view opens in it, so a reader can stay there for a chapter.
  const arrivesWhole = useArrivesInWholePicture(`/${props.bookSlug}/${props.chapter}/${props.verseNumber}`);
  return (
    <LayerProvider initialLayer={arrivesWhole ? "whole-picture" : null}>
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
  const whole = useLayer("whole-picture").isOpen;
  const { tier, credits } = useSession();
  const onShowWhole = (imageId: string) =>
    trackWholePictureOpened({ book: bookName, chapter, verse: verseNumber, imageId, tier, hasCredits: credits > 0 });

  return (
    <main
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#050505] text-white [--words-page-width:min(40vw,600px)] md:block"
      style={{ colorScheme: "dark" }}
      data-idle={idle}
      data-arrival={arrival ?? undefined}
      data-whole-picture={whole || undefined}
      {...swipe}
    >
      {/* In the whole-picture view the frame takes the whole window; on a phone the picture and its caption
          sit centred above the page-turn row. On a phone the picture gives the turned-over words page (Ask)
          more room. */}
      <figure
        data-turn-in="fade"
        className={`relative w-full overflow-hidden md:absolute md:inset-0 md:block md:aspect-auto md:max-h-none ${
          whole
            ? "flex min-h-0 flex-1 flex-col pt-8 md:pt-0"
            : "aspect-square max-h-[52svh] shrink-0 transition-[max-height] duration-300 motion-reduce:transition-none max-md:[main:has([data-ask-page])_&]:max-h-[30svh]"
        }`}
      >
        <SpreadPicture verseId={verseId} reference={reference} onShowWhole={onShowWhole} />
        <WholePictureCaption
          reference={reference}
          verseText={verseText}
          verseNumber={verseNumber}
          totalVerses={totalVerses}
          prevUrl={prevUrl}
          nextUrl={nextUrl}
          onTurn={onTurn}
        />
      </figure>
      <PrefetchNextSpread nextUrl={nextUrl} nextVerseId={nextVerseId} />

      <VerseMarks
        bookSlug={bookSlug}
        bookName={bookName}
        chapter={chapter}
        verseNumber={verseNumber}
        totalVerses={totalVerses}
        onTurn={onTurn}
      />

      <CornerMenu verseId={verseId} bookName={bookName} chapter={chapter} verseNumber={verseNumber} />

      {/* Keyed by the verse: turning the page clears the conversation. */}
      <AskProvider key={verseId} verse={{ bookName, chapter, verseNumber, verseText }}>
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
      </AskProvider>

      <div className={`pointer-events-none absolute inset-x-0 bottom-8 hidden justify-center md:flex ${whole ? "md:right-0" : "md:right-[var(--words-page-width)]"}`}>
        <nav
          aria-label="Turn the page"
          data-fades
          className="liquid-glass spread-dock pointer-events-auto flex items-center gap-1 rounded-full p-1.5"
        >
          <PageTurnLink direction="prev" href={prevUrl} onTurn={onTurn} />
          <ContentsButton reference={reference} variant="dock" />
          <PageTurnLink direction="next" href={nextUrl} onTurn={onTurn} />
        </nav>
      </div>

      <ContentsLayer bookSlug={bookSlug} chapter={chapter} verse={verseNumber} />
    </main>
  );
}
