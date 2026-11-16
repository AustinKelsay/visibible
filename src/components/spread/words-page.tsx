import { useLayer } from "@/components/spread/layers";
import { PageTurnLink, type TrackPageTurn } from "@/components/spread/page-turn";

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
 * The words page: the book and chapter, the verse number, the verse, and a foot line with the
 * translation and position. A long verse scrolls inside the page; the foot line stays put.
 * On a phone previous and next sit beside the foot line; on a computer they live in the dock.
 * The whole-picture view puts it aside: it slides off to the right on a computer and is hidden on a phone.
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
  return (
    <article
      inert={aside}
      className={`spread-words relative flex min-h-0 flex-1 flex-col bg-[#0b0b0c] md:absolute md:inset-y-0 md:right-0 md:w-[var(--words-page-width)] md:border-l md:border-white/10 md:bg-[rgba(12,12,14,0.78)] md:backdrop-blur-2xl md:backdrop-saturate-150 ${aside ? "max-md:hidden" : ""}`}
    >
      {/* A long verse fades into the foot line rather than stopping at a hard edge; the bottom padding
          lets its last line scroll clear of the fade. */}
      <div
        data-turn-in="slide"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-8 md:px-12 md:pt-16 lg:px-14"
        style={{ maskImage: FADE_INTO_FOOT, WebkitMaskImage: FADE_INTO_FOOT }}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/55">
          {bookName} · Chapter {chapter}
        </p>
        <h1 className="mt-3 font-serif text-6xl leading-none text-white/60 md:mt-8 md:text-8xl">
          <span className="sr-only">{bookName} {chapter}:</span>{verseNumber}
        </h1>
        <p className="mt-4 max-w-[30ch] font-serif text-[26px] leading-[1.35] text-pretty text-white/95 md:mt-8 md:text-[34px] md:leading-[1.3]">
          {verseText}
        </p>
      </div>
      <footer className="flex items-center gap-2 border-t border-white/10 px-3 pt-1 pb-[max(0.25rem,var(--safe-area-inset-bottom))] text-[11px] font-medium uppercase tracking-[0.18em] text-white/50 md:mx-12 md:gap-4 md:px-0 md:py-5 lg:mx-14">
        <PageTurnLink direction="prev" href={prevUrl} onTurn={onTurn} className="md:hidden" />
        <span className="min-w-0 flex-1 truncate text-center md:text-left">{translationName}</span>
        <span aria-label={`Verse ${verseNumber} of ${totalVerses}`} className="tabular-nums">
          {verseNumber} / {totalVerses}
        </span>
        <PageTurnLink direction="next" href={nextUrl} onTurn={onTurn} className="md:hidden" />
      </footer>
    </article>
  );
}
