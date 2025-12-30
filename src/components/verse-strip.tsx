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
  imageStatus: Array<{ verse: number }> | null | undefined;
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

  // Create a Set of verses with images for O(1) lookup
  const versesWithImages = new Set(
    imageStatus?.map((v) => v.verse) ?? []
  );

  // Generate array of all verses in chapter
  const verses = Array.from({ length: totalVerses }, (_, i) => ({
    verse: i + 1,
    hasImage: versesWithImages.has(i + 1),
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
              <span
                className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                  v.hasImage
                    ? isCurrent
                      ? "bg-[var(--accent-text)]"
                      : "bg-[var(--accent)]"
                    : "bg-[var(--muted)]"
                }`}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
