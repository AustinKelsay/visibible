"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
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

// Calculate width for stacked dots container
function getDotsWidth(count: number): string {
  const dots = Math.max(1, Math.min(count, 3));
  return `${8 + (dots - 1) * 6}px`; // base 8px + 6px per additional dot
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

  const imageStatus = useQuery(api.verseImages.getChapterImageStatus, {
    book,
    chapter,
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

  // Create a Map of verses to image counts for O(1) lookup
  const imageCountMap = new Map(
    imageStatus?.map((v) => [v.verse, v.imageCount]) ?? []
  );

  // Generate array of all verses in chapter with their image counts
  const verses = Array.from({ length: totalVerses }, (_, i) => ({
    verse: i + 1,
    imageCount: imageCountMap.get(i + 1) ?? 0,
  }));

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="flex gap-1 p-2">
        {verses.map((v) => {
          const isCurrent = v.verse === currentVerse;
          return (
            <Link
              key={v.verse}
              href={`/${book}/${chapter}/${v.verse}`}
              className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center rounded-[var(--radius-md)] transition-colors duration-[var(--motion-fast)] ${
                isCurrent
                  ? "bg-[var(--accent)] text-[var(--accent-text)]"
                  : "bg-[var(--surface)] hover:bg-[var(--divider)]"
              }`}
              aria-current={isCurrent ? "page" : undefined}
            >
              <span className="text-sm font-medium">{v.verse}</span>
              {/* Stacked dots indicator for image count */}
              <div
                className="relative h-2 mt-0.5"
                style={{ width: getDotsWidth(v.imageCount) }}
              >
                {v.imageCount > 0 ? (
                  Array.from({ length: Math.min(v.imageCount, 3) }).map((_, i) => (
                    <span
                      key={i}
                      className={`absolute w-2 h-2 rounded-full border border-[var(--background)]/30 ${
                        isCurrent
                          ? "bg-[var(--accent-text)]"
                          : "bg-[var(--accent)]"
                      }`}
                      style={{ left: `${i * 6}px` }}
                    />
                  ))
                ) : (
                  <span className="absolute w-2 h-2 rounded-full border border-[var(--background)]/30 bg-[var(--muted)]" />
                )}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
