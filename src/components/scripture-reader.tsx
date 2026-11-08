"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSession } from "@/context/session-context";
import { useNavigation } from "@/context/navigation-context";
import { trackVerseNavigation } from "@/lib/analytics";
import { getVerseNavigationDirection } from "@/lib/verse-keyboard-navigation";

interface Verse {
  number: number;
  text: string;
}

/** Longest verse the desktop image caption shows in full (it clamps at three lines). */
export const CAPTION_FULL_VERSE_CHARS = 140;

interface ScriptureReaderProps {
  book: string;
  chapter: number;
  verse: Verse;
  verseNumber: number;
  totalVerses: number;
  prevUrl?: string;
  nextUrl?: string;
}

export function ScriptureReader({
  book = "Genesis",
  chapter = 1,
  verse,
  verseNumber,
  totalVerses,
  prevUrl,
  nextUrl,
}: ScriptureReaderProps) {
  const router = useRouter();
  const { tier, credits, isLoading } = useSession();
  // On desktop a saved image carries the verse as its caption (up to three lines). When the whole
  // verse fits there, the heading and text here would only repeat it, so desktop shows just the
  // verse navigation; phones, long verses and verses without an image keep the full block.
  const { currentImageId } = useNavigation();
  const captionShowsVerse = Boolean(currentImageId) && verse.text.length <= CAPTION_FULL_VERSE_CHARS;
  const desktopHidden = captionShowsVerse ? "sm:hidden" : "";
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isLoading) return;
      const direction = getVerseNavigationDirection(event);

      if (direction === "prev" && prevUrl) {
        event.preventDefault();
        trackVerseNavigation({
          book,
          chapter,
          verse: verseNumber,
          direction: "prev",
          source: "keyboard",
          targetUrl: prevUrl,
          tier,
          hasCredits: credits > 0,
        });
        router.push(prevUrl);
      }

      if (direction === "next" && nextUrl) {
        event.preventDefault();
        trackVerseNavigation({
          book,
          chapter,
          verse: verseNumber,
          direction: "next",
          source: "keyboard",
          targetUrl: nextUrl,
          tier,
          hasCredits: credits > 0,
        });
        router.push(nextUrl);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [book, chapter, nextUrl, prevUrl, router, verseNumber, tier, credits, isLoading]);

  return (
    <article className={`px-4 md:px-6 py-3 max-w-2xl mx-auto ${captionShowsVerse ? "sm:py-0" : "sm:py-6"}`}>
      {/* Verse Header */}
      <header className={`mb-3 sm:mb-6 text-center ${desktopHidden}`}>
        <p className="text-[var(--muted)] text-xs sm:text-sm uppercase tracking-widest mb-1 sm:mb-2">
          {book} {chapter}
        </p>
        <h1 className="text-xl sm:text-3xl font-light tracking-tight">
          Verse {verseNumber}
        </h1>
      </header>

      {/* Scripture Text - plain reading copy; desktop also shows it as the image caption */}
      <div className={`text-xl md:text-2xl leading-relaxed ${desktopHidden}`}>
        <p className={`mx-auto max-w-[60ch] text-pretty text-[var(--foreground)] ${verse.text.length > 140 ? "text-left" : "text-center"}`}>{verse.text}</p>
      </div>

      {/* Verse Navigation - Desktop only (mobile has top nav) */}
      <nav className={`hidden sm:flex items-center ${captionShowsVerse ? "" : "mt-8 pt-6 border-t border-[var(--divider)]"}`}>
        <div className="flex-1 flex justify-start">
          {prevUrl ? (
            <Link
              href={prevUrl}
              onClick={() => {
                trackVerseNavigation({
                  book,
                  chapter,
                  verse: verseNumber,
                  direction: "prev",
                  source: "desktop_nav",
                  targetUrl: prevUrl,
                  tier,
                  hasCredits: credits > 0,
                });
              }}
              className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] min-h-[44px] px-3 -ml-3"
              aria-label="Previous verse"
            >
              <ChevronLeft size={20} strokeWidth={1.5} />
              <span className="text-sm">Previous</span>
            </Link>
          ) : null}
        </div>

        <span className="text-[var(--muted)] text-sm">
          {verseNumber} of {totalVerses}
        </span>

        <div className="flex-1 flex justify-end">
          {nextUrl ? (
            <Link
              href={nextUrl}
              onClick={() => {
                trackVerseNavigation({
                  book,
                  chapter,
                  verse: verseNumber,
                  direction: "next",
                  source: "desktop_nav",
                  targetUrl: nextUrl,
                  tier,
                  hasCredits: credits > 0,
                });
              }}
              className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] min-h-[44px] px-3 -mr-3"
              aria-label="Next verse"
            >
              <span className="text-sm">Next</span>
              <ChevronRight size={20} strokeWidth={1.5} />
            </Link>
          ) : null}
        </div>
      </nav>
    </article>
  );
}
