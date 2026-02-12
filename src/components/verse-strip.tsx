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
              className={`relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-md)] transition-colors duration-[var(--motion-fast)] ${
                isCurrent
                  ? "bg-[var(--accent)] text-[var(--accent-text)]"
                  : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
              }`}
              aria-current={isCurrent ? "page" : undefined}
            >
              <span className="text-sm font-medium">{v.verse}</span>
              {v.imageCount > 0 && (
                <span
                  aria-label={`${v.imageCount} image${v.imageCount !== 1 ? "s" : ""}`}
                  className={`absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 rounded-full text-[10px] font-bold leading-none px-0.5 ${
                    isCurrent
                      ? "bg-[var(--accent-text)] text-[var(--accent)]"
                      : "bg-[var(--accent)] text-[var(--accent-text)]"
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
