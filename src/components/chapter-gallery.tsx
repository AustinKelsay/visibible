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
  fullScreen?: boolean;
}

export function ChapterGallery({
  book,
  bookName,
  chapter,
  currentVerse,
  verses,
  fullScreen = false,
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
    <section
      className={fullScreen ? "flex-1 px-4 md:px-6 py-6 md:py-8" : "px-4 md:px-6 pb-10"}
      aria-labelledby="chapter-gallery-heading"
    >
      <div className={`${fullScreen ? "max-w-[1480px]" : "max-w-6xl"} mx-auto space-y-6`}>
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
        </header>

        <div className="space-y-4 md:space-y-5">
          {items.map((item) => {
            const isCurrent = item.verse === currentVerse;
            const statusLabel = isLoading
              ? "Checking saved art..."
              : item.hasImages
                ? `${item.imageCount} saved image${item.imageCount === 1 ? "" : "s"}`
                : "Placeholder";

            return (
              <section
                key={item.verse}
                className={`overflow-hidden rounded-[var(--radius-2xl)] border bg-[var(--background)]/70 transition-colors duration-[var(--motion-fast)] ${
                  isCurrent
                    ? "border-[var(--accent)] shadow-[0_18px_50px_rgba(0,0,0,0.08)]"
                    : "border-[var(--divider)]"
                }`}
              >
                <div className="grid gap-0 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
                  <div className="border-b border-[var(--divider)] bg-[var(--surface)]/55 p-4 md:p-5 lg:border-b-0 lg:border-r">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--foreground)]">
                          Verse {item.verse}
                        </span>
                        {isCurrent ? (
                          <span className="rounded-full bg-[var(--accent)]/12 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
                            Current
                          </span>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Link
                          href={item.href}
                          aria-current={isCurrent ? "page" : undefined}
                          className="block text-lg font-semibold tracking-tight text-[var(--foreground)] hover:text-[var(--accent)] transition-colors duration-[var(--motion-fast)]"
                        >
                          {bookName} {chapter}:{item.verse}
                        </Link>
                        <p className="text-sm leading-6 text-[var(--foreground)]/75">
                          {item.text}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        <span>{statusLabel}</span>
                        <span>{item.hasImages ? "Mini-gallery" : "Awaiting art"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 md:p-5">
                    <div
                      aria-label={`Verse ${item.verse} mini-gallery`}
                      className={`grid gap-4 ${fullScreen ? "sm:grid-cols-2 2xl:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}
                    >
                      {item.cards.map((card, cardIndex) => (
                        <Link
                          key={card.imageId ?? `${item.verse}-placeholder-${cardIndex}`}
                          href={item.href}
                          aria-label={`${bookName} ${chapter}:${item.verse}${card.isPlaceholder ? " placeholder" : ` image ${cardIndex + 1}`}`}
                          className="group overflow-hidden rounded-[var(--radius-xl)] border border-[var(--divider)] bg-[var(--background)] transition-all duration-[var(--motion-fast)] hover:-translate-y-0.5 hover:border-[var(--foreground)]/15 hover:shadow-[0_18px_50px_rgba(0,0,0,0.08)]"
                        >
                          <div className="relative aspect-video overflow-hidden bg-[var(--surface)]">
                            {!card.isPlaceholder && card.imageUrl ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={card.imageUrl}
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
                              {card.isLatest && !card.isPlaceholder ? (
                                <span className="rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white backdrop-blur-sm">
                                  Latest
                                </span>
                              ) : null}
                              {!card.isPlaceholder && item.imageCount > 1 ? (
                                <span className="rounded-full bg-[var(--background)]/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--foreground)] backdrop-blur-sm">
                                  {cardIndex + 1} of {item.imageCount}
                                </span>
                              ) : null}
                            </div>

                            {!card.isPlaceholder ? (
                              <span className="absolute right-3 top-3 rounded-full bg-[var(--background)]/90 px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] backdrop-blur-sm">
                                {card.model ? card.model.split("/").pop() : "Saved"}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--foreground)]">
                                {bookName} {chapter}:{item.verse}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {card.isPlaceholder ? "Placeholder" : card.isLatest ? "Newest saved image" : "Saved image"}
                              </p>
                            </div>
                            <span className="max-w-[11rem] text-right text-xs text-[var(--muted)]">
                              {item.text}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
