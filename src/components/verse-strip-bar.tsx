"use client";

import { Maximize2 } from "lucide-react";
import { VerseStrip } from "@/components/verse-strip";
import { useNavigation } from "@/context/navigation-context";
import { useSession } from "@/context/session-context";
import { trackImageFullscreenOpened } from "@/lib/analytics";

interface VerseStripBarProps {
  book: string;
  chapter: number;
  currentVerse: number;
  totalVerses: number;
}

export function VerseStripBar({ book, chapter, currentVerse, totalVerses }: VerseStripBarProps) {
  const { currentImageId, openFullscreen } = useNavigation();
  const { tier, credits } = useSession();

  return (
    <div className="flex items-center">
      {/* Scrollable verse strip with right-edge fade */}
      <div
        className="flex-1 min-w-0"
        style={{
          maskImage: "linear-gradient(to right, black calc(100% - 32px), transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, black calc(100% - 32px), transparent 100%)",
        }}
      >
        <VerseStrip
          book={book}
          chapter={chapter}
          currentVerse={currentVerse}
          totalVerses={totalVerses}
        />
      </div>

      {/* Subtle vertical divider */}
      <div
        className="w-px self-stretch my-2 shrink-0"
        style={{
          background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.15), transparent)",
        }}
      />

      {/* Fullscreen button — flush with right edge of liquid-glass container */}
      <button
        onClick={() => {
          trackImageFullscreenOpened({
            book,
            chapter,
            verse: currentVerse,
            source: "verse_strip",
            imageId: currentImageId ?? undefined,
            tier,
            hasCredits: credits > 0,
          });
          openFullscreen();
        }}
        className="shrink-0 self-stretch px-3 flex items-center justify-center rounded-r-[var(--radius-lg)] text-white/70 hover:bg-white/15 hover:text-white transition-all duration-[var(--motion-fast)] focus-ring"
        aria-label="Open fullscreen view"
      >
        <Maximize2 size={20} strokeWidth={1.5} />
      </button>
    </div>
  );
}
