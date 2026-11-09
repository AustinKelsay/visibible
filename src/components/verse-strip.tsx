"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import { useQuery } from "convex/react";
import { usePreferences } from "@/context/preferences-context";
import { api } from "../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";

interface VerseStripProps {
  book: string;
  chapter: number;
  currentVerse: number;
  totalVerses: number;
}

const FADE_END = {
  maskImage: "linear-gradient(to right, #000 calc(100% - 2.5rem), transparent)",
  WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 2.5rem), transparent)",
} as const;

interface VerseStripBaseProps extends VerseStripProps {
  imageStatus: Array<{ verse: number; imageCount: number }> | null | undefined;
}

/** Accessible name for a verse tile, e.g. "Verse 3, 18 saved images". */
export function verseTileLabel(verse: number, imageCount: number): string {
  if (imageCount <= 0) return `Verse ${verse}, no image yet`;
  return `Verse ${verse}, ${imageCount} saved image${imageCount === 1 ? "" : "s"}`;
}

/**
 * Saved-image count under a verse number: a small image icon and the number, so it reads as
 * "images" without a legend. The same mark is used for one image and for many.
 */
export function VerseImageCount({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span aria-hidden="true" className={`inline-flex items-center gap-0.5 text-xs font-medium leading-3 tabular-nums ${className}`}>
      <ImageIcon size={10} strokeWidth={2} />
      {count}
    </span>
  );
}

export function VerseStrip(props: VerseStripProps) {
  const isConvexEnabled = useConvexEnabled();

  if (!isConvexEnabled) {
    return <VerseStripBase {...props} imageStatus={null} />;
  }

  return <VerseStripWithConvex {...props} />;
}

function VerseStripWithConvex(props: VerseStripProps) {
  const { book, chapter } = props;
  const { artStyle } = usePreferences();

  const imageStatus = useQuery(api.verseImages.getChapterImageStatus, {
    book,
    chapter,
    artStyle,
  });

  return <VerseStripBase {...props} imageStatus={imageStatus} />;
}

function VerseStripBase({
  book,
  chapter,
  currentVerse,
  totalVerses,
  imageStatus,
}: VerseStripBaseProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLAnchorElement>(null);

  // Create a Map of verses to image counts for O(1) lookup
  const imageCountMap = new Map(
    imageStatus?.map((v) => [v.verse, v.imageCount]) ?? []
  );

  // Generate array of all verses in chapter with their image counts
  const verses = Array.from({ length: totalVerses }, (_, i) => ({
    verse: i + 1,
    imageCount: imageCountMap.get(i + 1) ?? 0,
  }));

  const [canScroll, setCanScroll] = useState({ back: false, forward: false });

  const updateScrollState = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const back = scroller.scrollLeft > 1;
    const forward = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
    setCanScroll((prev) => (prev.back === back && prev.forward === forward ? prev : { back, forward }));
  }, []);

  // Keep the current verse visible in long chapters without scrolling the page
  useEffect(() => {
    const scroller = scrollerRef.current;
    const current = currentRef.current;
    if (!scroller || !current) return;
    const target = current.offsetLeft - scroller.clientWidth / 2 + current.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, target) });
    updateScrollState();
  }, [currentVerse, updateScrollState]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [updateScrollState, totalVerses]);

  const scrollByPage = (direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * scroller.clientWidth * 0.8, behavior: "smooth" });
  };

  const hasOverflow = canScroll.back || canScroll.forward;

  return (
    <div className="relative flex items-stretch">
      {/* The back arrow floats over the start (it only appears after scrolling), so the first verse
          starts at the bar's edge. The forward arrow has its own column, so it never covers a verse. */}
      <button
        type="button"
        onClick={() => scrollByPage(-1)}
        disabled={!canScroll.back}
        className="absolute inset-y-0 left-0 z-10 w-11 flex items-center justify-start pl-1.5 rounded-l-[var(--radius-lg)] bg-gradient-to-r from-black/85 via-black/60 to-transparent text-white/80 hover:text-white transition-opacity duration-[var(--motion-fast)] focus-ring disabled:opacity-0 disabled:pointer-events-none"
        aria-label="Earlier verses"
      >
        <ChevronLeft size={18} strokeWidth={1.75} />
      </button>
      {/* When more verses follow, the strip fades out before the arrow rather than cutting a tile in half */}
      <div
        ref={scrollerRef}
        onScroll={updateScrollState}
        className="flex-1 min-w-0 overflow-x-auto scrollbar-hide"
        style={canScroll.forward ? FADE_END : undefined}
      >
        <div className="flex gap-1 p-2">
          {verses.map((v) => {
            const isCurrent = v.verse === currentVerse;
            return (
              <Link
                key={v.verse}
                href={`/${book}/${chapter}/${v.verse}`}
                className={`min-h-[44px] min-w-[44px] px-1 flex flex-col items-center justify-center rounded-[var(--radius-md)] transition-colors duration-[var(--motion-fast)] ${
                  isCurrent
                    ? "bg-[var(--accent)] text-[var(--accent-text)]"
                    : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
                }`}
                aria-current={isCurrent ? "page" : undefined}
                ref={isCurrent ? currentRef : undefined}
                aria-label={verseTileLabel(v.verse, v.imageCount)}
                title={verseTileLabel(v.verse, v.imageCount)}
              >
                <span className="text-sm font-medium leading-4">{v.verse}</span>
                <VerseImageCount
                  count={v.imageCount}
                  className={`mt-0.5 ${isCurrent ? "text-[var(--accent-text)]/90" : "text-white/65"}`}
                />
              </Link>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => scrollByPage(1)}
        disabled={!canScroll.forward}
        className={`shrink-0 w-9 items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-[var(--motion-fast)] focus-ring disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-default ${
          hasOverflow ? "flex" : "hidden"
        }`}
        aria-label="Later verses"
      >
        <ChevronRight size={18} strokeWidth={1.75} />
      </button>
    </div>
  );
}
