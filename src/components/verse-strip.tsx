"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
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

interface VerseStripBaseProps extends VerseStripProps {
  imageStatus: Array<{ verse: number; imageCount: number }> | null | undefined;
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

  // Keep the current verse visible in long chapters without scrolling the page
  useEffect(() => {
    const scroller = scrollerRef.current;
    const current = currentRef.current;
    if (!scroller || !current) return;
    const target = current.offsetLeft - scroller.clientWidth / 2 + current.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, target) });
  }, [currentVerse]);

  return (
    <div ref={scrollerRef} className="overflow-x-auto scrollbar-hide">
      <div className="flex gap-1 p-2">
        {verses.map((v) => {
          const isCurrent = v.verse === currentVerse;
          return (
            <Link
              key={v.verse}
              href={`/${book}/${chapter}/${v.verse}`}
              className={`relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-colors duration-[var(--motion-fast)] ${
                isCurrent
                  ? "bg-[var(--accent)] text-[var(--accent-text)]"
                  : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
              }`}
              aria-current={isCurrent ? "page" : undefined}
              ref={isCurrent ? currentRef : undefined}
              title={`Verse ${v.verse}${v.imageCount > 0 ? ` · ${v.imageCount} image${v.imageCount !== 1 ? "s" : ""}` : " · no image yet"}`}
            >
              <span className="text-sm font-medium">{v.verse}</span>
              {v.imageCount === 1 && (
                <span
                  aria-label="1 image"
                  className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${isCurrent ? "bg-[var(--accent-text)]" : "bg-white/70"}`}
                />
              )}
              {v.imageCount > 1 && (
                <span
                  aria-label={`${v.imageCount} images`}
                  className={`absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[11px] font-semibold leading-none px-1 tabular-nums ${
                    isCurrent
                      ? "bg-[var(--accent-text)] text-[var(--accent)]"
                      : "bg-white/25 text-white"
                  }`}
                >
                  {v.imageCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
