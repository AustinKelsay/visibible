"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { usePreferences } from "@/context/preferences-context";
import {
  buildChapterGalleryItems,
  type ChapterGalleryImageRecord,
  type ChapterGalleryVerseRecord,
} from "@/lib/chapter-gallery";
import { VerseImagePlaceholder } from "./verse-image-placeholder";

interface ChapterGalleryProps {
  book: string;
  bookName: string;
  chapter: number;
  currentVerse: number;
  verses: ChapterGalleryVerseRecord[];
}

export function ChapterGallery({
  book,
  bookName,
  chapter,
  currentVerse,
  verses,
}: ChapterGalleryProps) {
  const { chapterGalleryEnabled } = usePreferences();
  const isConvexEnabled = useConvexEnabled();

  const galleryImages = useQuery(
    api.verseImages.getChapterGallery,
    chapterGalleryEnabled && isConvexEnabled ? { book, chapter } : "skip"
  );

  if (!chapterGalleryEnabled) {
    return null;
  }

  const items = buildChapterGalleryItems({
    book,
    chapter,
    verses,
    galleryImages: (galleryImages as ChapterGalleryImageRecord[] | null | undefined) ?? null,
  });
  const isLoading = isConvexEnabled && galleryImages === undefined;

  return (
    <section className="px-4 md:px-6 pb-10" aria-labelledby="chapter-gallery-heading">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
              Chapter Gallery
            </p>
            <h2
              id="chapter-gallery-heading"
              className="text-2xl font-semibold tracking-tight text-[var(--foreground)]"
            >
              {bookName} {chapter}
            </h2>
          </div>
          <p className="text-sm text-[var(--muted)] sm:text-right">
            Latest saved image or placeholder for every verse in the chapter.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const isCurrent = item.verse === currentVerse;
            const statusLabel = isLoading
              ? "Checking saved art..."
              : item.hasImage
                ? `${item.imageCount} saved image${item.imageCount === 1 ? "" : "s"}`
                : "Placeholder";

            return (
              <Link
                key={item.verse}
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={`group overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--background)] transition-all duration-[var(--motion-fast)] ${
                  isCurrent
                    ? "border-[var(--accent)] shadow-[0_18px_50px_rgba(0,0,0,0.08)]"
                    : "border-[var(--divider)] hover:-translate-y-0.5 hover:border-[var(--foreground)]/15 hover:shadow-[0_18px_50px_rgba(0,0,0,0.08)]"
                }`}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-[var(--surface)]">
                  {item.hasImage ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt={`${bookName} ${chapter}:${item.verse}`}
                        className="h-full w-full bg-[var(--image-stage)] object-contain transition-transform duration-300 group-hover:scale-[1.015]"
                        loading="lazy"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
                    </>
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--background)]/75 via-[var(--surface)] to-[var(--surface)]">
                      <VerseImagePlaceholder
                        compact
                        className="absolute inset-0"
                        description={isLoading ? "Looking for saved images in this chapter" : "This verse has not been illustrated yet"}
                      />
                    </div>
                  )}

                  <div className="absolute left-3 top-3 flex items-center gap-2">
                    <span className="rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white backdrop-blur-sm">
                      Verse {item.verse}
                    </span>
                    {isCurrent ? (
                      <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent-text)]">
                        Current
                      </span>
                    ) : null}
                  </div>

                  {item.hasImage ? (
                    <span className="absolute right-3 top-3 rounded-full bg-[var(--background)]/90 px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] backdrop-blur-sm">
                      {item.imageCount} image{item.imageCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {bookName} {chapter}:{item.verse}
                    </p>
                    <span className="text-xs text-[var(--muted)]">
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-[var(--foreground)]/85">
                    {item.text}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
