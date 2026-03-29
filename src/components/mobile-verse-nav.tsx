"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigation } from "@/context/navigation-context";
import { useVerseNav } from "@/context/verse-nav-context";
import { useSession } from "@/context/session-context";
import { trackVerseNavigation } from "@/lib/analytics";

/**
 * Sticky bottom bar for mobile verse navigation.
 * Always visible at the bottom of the viewport on verse pages,
 * hidden during fullscreen view and when chat is open.
 */
export function MobileVerseNav() {
  const verseNav = useVerseNav();
  const { isFullscreen, isChatOpen } = useNavigation();
  const { tier, credits } = useSession();

  const isHidden = !verseNav || isFullscreen || isChatOpen;

  return (
    <nav
      aria-label="Verse navigation"
      aria-hidden={isHidden}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      className={`
        fixed bottom-0 left-0 right-0 z-30
        sm:hidden
        border-t border-[var(--divider)]
        bg-[var(--background)]/95 backdrop-blur-md
        shadow-[0_-4px_16px_rgba(0,0,0,0.08)]
        transition-transform duration-[var(--motion-base)] ease-out
        motion-reduce:transition-none
        ${isHidden ? "translate-y-full" : "translate-y-0"}
      `}
    >
      <div className="flex items-center px-4 py-2">
        {/* Previous button */}
        <div className="flex-1">
          {verseNav?.prevUrl ? (
            <Link
              href={verseNav.prevUrl}
              tabIndex={isHidden ? -1 : undefined}
              onClick={() => {
                trackVerseNavigation({
                  book: verseNav.book,
                  chapter: verseNav.chapter,
                  verse: verseNav.verseNumber,
                  direction: "prev",
                  source: "mobile_nav",
                  targetUrl: verseNav.prevUrl!,
                  tier,
                  hasCredits: credits > 0,
                });
              }}
              className="inline-flex items-center gap-2 min-h-[52px] px-3 -ml-3 rounded-[var(--radius-md)] text-[var(--foreground)] active:bg-[var(--surface)] active:scale-[0.97] transition-all duration-[var(--motion-fast)] focus-ring"
              aria-label="Previous verse"
            >
              <ChevronLeft size={22} strokeWidth={2} />
              <span className="text-sm font-semibold">Previous</span>
            </Link>
          ) : (
            <div className="min-h-[52px]" aria-hidden="true" />
          )}
        </div>

        {/* Verse counter */}
        <div className="shrink-0 text-center px-2">
          <span className="text-sm font-semibold text-[var(--foreground)]">
            {verseNav?.verseNumber ?? 0}
          </span>
          <span className="text-sm text-[var(--muted)]">
            {" / "}
            {verseNav?.totalVerses ?? 0}
          </span>
        </div>

        {/* Next button */}
        <div className="flex-1 flex justify-end">
          {verseNav?.nextUrl ? (
            <Link
              href={verseNav.nextUrl}
              tabIndex={isHidden ? -1 : undefined}
              onClick={() => {
                trackVerseNavigation({
                  book: verseNav.book,
                  chapter: verseNav.chapter,
                  verse: verseNav.verseNumber,
                  direction: "next",
                  source: "mobile_nav",
                  targetUrl: verseNav.nextUrl!,
                  tier,
                  hasCredits: credits > 0,
                });
              }}
              className="inline-flex items-center gap-2 min-h-[52px] px-3 -mr-3 rounded-[var(--radius-md)] text-[var(--foreground)] active:bg-[var(--surface)] active:scale-[0.97] transition-all duration-[var(--motion-fast)] focus-ring"
              aria-label="Next verse"
            >
              <span className="text-sm font-semibold">Next</span>
              <ChevronRight size={22} strokeWidth={2} />
            </Link>
          ) : (
            <div className="min-h-[52px]" aria-hidden="true" />
          )}
        </div>
      </div>
    </nav>
  );
}
