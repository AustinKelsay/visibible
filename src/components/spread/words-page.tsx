"use client";

import { AskDockButton, AskFoot, AskPage } from "@/components/spread/ask";
import { ContentsButton } from "@/components/spread/contents";
import { useLayer } from "@/components/spread/layers";
import { LookButton, LookTranslationButton } from "@/components/spread/look";
import { usePreferences, type TextSize } from "@/context/preferences-context";
import { PageTurnLink, type TrackPageTurn } from "@/components/spread/page-turn";
import { withItalics } from "@/components/spread/prose-text";

/** The verse's size on the words page for each of Look's text sizes, phone then computer. */
const VERSE_SIZE: Record<TextSize, string> = {
  small: "text-[22px] leading-[1.4] md:text-[28px] md:leading-[1.35]",
  medium: "text-[26px] leading-[1.35] md:text-[34px] md:leading-[1.3]",
  large: "text-[31px] leading-[1.3] md:text-[42px] md:leading-[1.25]",
};

/** A prose moment's paragraphs are longer than a verse, so each text size sets them smaller. */
const PROSE_SIZE: Record<TextSize, string> = {
  small: "text-[17px] leading-[1.55] md:text-[19px] md:leading-[1.6]",
  medium: "text-[19px] leading-[1.55] md:text-[22px] md:leading-[1.55]",
  large: "text-[22px] leading-[1.5] md:text-[26px] md:leading-[1.5]",
};

const FADE_INTO_FOOT = "linear-gradient(to bottom, #000 calc(100% - 2rem), transparent)";

export interface WordsPageProps {
  bookName: string;
  chapter: number;
  /** A prose division's name; the words page then heads the moment with it instead of a verse number. */
  chapterLabel?: string;
  reference: string;
  verseNumber: number;
  verseText: string;
  /** A prose moment's paragraphs, shown in place of the verse. */
  paragraphs?: readonly string[];
  totalVerses: number;
  /** The Bible translation, which opens Look; a prose moment has none. */
  translationName?: string;
  prevUrl?: string;
  nextUrl?: string;
  onTurn: TrackPageTurn;
  /** Whether the page offers Ask (the Bible does; a prose work does not). Ask needs an `AskProvider` around it. */
  offersAsk: boolean;
}

/**
 * The words page: the book and chapter, the verse number, the verse, the place to ask about it, and a
 * foot line with the translation and position. A long verse scrolls inside the page; the foot line stays
 * put. On a phone previous and next sit beside the foot line and the dock's "Ask a question…" replaces
 * the suggestions; on a computer previous and next live in the dock. Asking turns the page over (AskPage).
 * The whole-picture view puts it aside: it slides off to the right on a computer and is hidden on a phone.
 * The verse is set in Look's text size, and the translation name opens Look.
 *
 * A prose moment's page names the work and its division, then its paragraphs; it has no translation and no Ask.
 */
export function WordsPage({
  bookName,
  chapter,
  chapterLabel,
  reference,
  verseNumber,
  verseText,
  paragraphs,
  totalVerses,
  translationName,
  prevUrl,
  nextUrl,
  onTurn,
  offersAsk,
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
        {paragraphs ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink/(--quiet-55)">{bookName}</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-balance text-ink/70 md:mt-8 md:text-5xl">{chapterLabel}</h1>
            <div className={`mt-5 max-w-[36ch] space-y-[0.8em] font-serif text-ink/95 md:mt-8 ${PROSE_SIZE[textSize]}`}>
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="text-pretty">{withItalics(paragraph)}</p>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink/(--quiet-55)">
              {bookName} · Chapter {chapter}
            </p>
            <h1 className="mt-3 font-serif text-6xl leading-none lining-nums text-ink/(--quiet-60) md:mt-8 md:text-8xl">
              <span className="sr-only">{bookName} {chapter}:</span>{verseNumber}
            </h1>
            <p className={`mt-4 max-w-[30ch] font-serif text-pretty text-ink/95 md:mt-8 ${VERSE_SIZE[textSize]}`}>
              {verseText}
            </p>
          </>
        )}
      </div>
      {offersAsk ? <AskFoot /> : null}
      <div className="flex justify-center px-3 pb-2 md:hidden">
        <nav aria-label="Reader" className={`liquid-glass spread-dock flex items-center gap-1 rounded-full p-1.5 ${offersAsk ? "w-full max-w-sm" : ""}`}>
          <ContentsButton reference={reference} variant="phone" />
          {offersAsk ? <AskDockButton /> : null}
          <LookButton variant="phone" />
        </nav>
      </div>
      <footer className="flex items-center gap-2 border-t border-ink/10 md:border-t-0 px-3 pt-1 pb-[max(0.25rem,var(--safe-area-inset-bottom))] text-[11px] font-medium uppercase tracking-[0.18em] text-ink/(--quiet-50) md:mx-12 md:gap-4 md:px-0 md:py-5 lg:mx-14">
        <PageTurnLink direction="prev" href={prevUrl} onTurn={onTurn} className="md:hidden" />
        {translationName ? (
          <span className="flex min-w-0 flex-1 justify-center md:justify-start">
            <LookTranslationButton translationName={translationName} />
          </span>
        ) : null}
        {/* With no translation beside it (a prose moment), the position takes the middle of the line. */}
        <span
          aria-label={`${paragraphs ? "Passage" : "Verse"} ${verseNumber} of ${totalVerses}`}
          className={`tabular-nums ${translationName ? "" : "flex-1 text-center md:text-right"}`}
        >
          {verseNumber} / {totalVerses}
        </span>
        <PageTurnLink direction="next" href={nextUrl} onTurn={onTurn} className="md:hidden" />
      </footer>
      {offersAsk ? <AskPage /> : null}
    </article>
  );
}
