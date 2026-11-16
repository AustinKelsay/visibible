"use client";

import { AskDockButton, AskFoot, AskPage } from "@/components/spread/ask";
import { ContentsButton } from "@/components/spread/contents";
import { useLayer } from "@/components/spread/layers";
import { LookButton, LookTranslationButton } from "@/components/spread/look";
import { usePreferences, type TextSize } from "@/context/preferences-context";
import { PageTurnLink, type TrackPageTurn } from "@/components/spread/page-turn";

/** The verse's size on the words page for each of Look's text sizes, phone then computer. */
const VERSE_SIZE: Record<TextSize, string> = {
  small: "text-[22px] leading-[1.4] md:text-[28px] md:leading-[1.35]",
  medium: "text-[26px] leading-[1.35] md:text-[34px] md:leading-[1.3]",
  large: "text-[31px] leading-[1.3] md:text-[42px] md:leading-[1.25]",
};

const FADE_INTO_FOOT = "linear-gradient(to bottom, #000 calc(100% - 2rem), transparent)";

export interface WordsPageProps {
  bookName: string;
  chapter: number;
  verseNumber: number;
  verseText: string;
  totalVerses: number;
  translationName: string;
  prevUrl?: string;
  nextUrl?: string;
  onTurn: TrackPageTurn;
}

/**
 * The words page: the book and chapter, the verse number, the verse, the place to ask about it, and a
 * foot line with the translation and position. A long verse scrolls inside the page; the foot line stays
 * put. On a phone previous and next sit beside the foot line and the dock's "Ask a question…" replaces
 * the suggestions; on a computer previous and next live in the dock. Asking turns the page over (AskPage).
 * The whole-picture view puts it aside: it slides off to the right on a computer and is hidden on a phone.
 * The verse is set in Look's text size, and the translation name opens Look.
 */
export function WordsPage({
  bookName,
  chapter,
  verseNumber,
  verseText,
  totalVerses,
  translationName,
  prevUrl,
  nextUrl,
  onTurn,
}: WordsPageProps) {
  const aside = useLayer("whole-picture").isOpen;
  const { textSize } = usePreferences();
  return (
    <article
      inert={aside}
      data-text-size={textSize}
      className={`spread-words relative flex min-h-0 flex-1 flex-col bg-reader-page md:absolute md:inset-y-0 md:right-0 md:w-[var(--words-page-width)] md:border-l md:border-ink/10 md:bg-reader-page-glass md:backdrop-blur-2xl md:backdrop-saturate-150 ${aside ? "max-md:hidden" : ""}`}
    >
      {/* A long verse fades into the foot line rather than stopping at a hard edge; the bottom padding
          lets its last line scroll clear of the fade. */}
      <div
        data-turn-in="slide"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-8 md:px-12 md:pt-16 lg:px-14"
        style={{ maskImage: FADE_INTO_FOOT, WebkitMaskImage: FADE_INTO_FOOT }}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink/(--quiet-55)">
          {bookName} · Chapter {chapter}
        </p>
        <h1 className="mt-3 font-serif text-6xl leading-none text-ink/(--quiet-60) md:mt-8 md:text-8xl">
          <span className="sr-only">{bookName} {chapter}:</span>{verseNumber}
        </h1>
        <p className={`mt-4 max-w-[30ch] font-serif text-pretty text-ink/95 md:mt-8 ${VERSE_SIZE[textSize]}`}>
          {verseText}
        </p>
      </div>
      <AskFoot />
      <div className="flex justify-center px-3 pb-2 md:hidden">
        <nav aria-label="Reader" className="liquid-glass spread-dock flex w-full max-w-sm items-center gap-1 rounded-full p-1.5">
          <ContentsButton reference={`${bookName} ${chapter}:${verseNumber}`} variant="phone" />
          <AskDockButton />
          <LookButton variant="phone" />
        </nav>
      </div>
      <footer className="flex items-center gap-2 border-t border-ink/10 md:border-t-0 px-3 pt-1 pb-[max(0.25rem,var(--safe-area-inset-bottom))] text-[11px] font-medium uppercase tracking-[0.18em] text-ink/(--quiet-50) md:mx-12 md:gap-4 md:px-0 md:py-5 lg:mx-14">
        <PageTurnLink direction="prev" href={prevUrl} onTurn={onTurn} className="md:hidden" />
        <span className="flex min-w-0 flex-1 justify-center md:justify-start">
          <LookTranslationButton translationName={translationName} />
        </span>
        <span aria-label={`Verse ${verseNumber} of ${totalVerses}`} className="tabular-nums">
          {verseNumber} / {totalVerses}
        </span>
        <PageTurnLink direction="next" href={nextUrl} onTurn={onTurn} className="md:hidden" />
      </footer>
      <AskPage />
    </article>
  );
}
