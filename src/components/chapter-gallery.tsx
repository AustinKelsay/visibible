"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Maximize2, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { usePreferences } from "@/context/preferences-context";
import { useNavigation } from "@/context/navigation-context";
import {
  buildFlatChapterGalleryItems,
  buildChapterGalleryItems,
  type ChapterGalleryFlatItem,
  type ChapterGalleryImageRecord,
  type ChapterGalleryVerseRecord,
} from "@/lib/chapter-gallery";
import { VerseImagePlaceholder } from "@/components/verse-image-placeholder";

interface ChapterGalleryProps {
  book: string;
  bookName: string;
  chapter: number;
  currentVerse: number;
  verses: ChapterGalleryVerseRecord[];
  fullScreen?: boolean;
}

type GalleryLayoutMode = "all" | "byVerse";

interface GalleryCardProps {
  item: ChapterGalleryFlatItem;
  bookName: string;
  chapter: number;
  currentVerse: number;
  isLoading: boolean;
  onExpand?: () => void;
}

function GalleryCard({
  item,
  bookName,
  chapter,
  currentVerse,
  isLoading,
  onExpand,
}: GalleryCardProps) {
  const isCurrent = item.verse === currentVerse;

  return (
    <Link
      href={item.href}
      aria-current={isCurrent ? "page" : undefined}
      aria-label={`${bookName} ${chapter}:${item.verse}${item.isPlaceholder ? " placeholder" : ` image ${item.cardIndex + 1}`}`}
      className={`group overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--background)] transition-all duration-[var(--motion-base)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] ${
        isCurrent
          ? "border-[var(--accent)]/40 shadow-[var(--shadow-sm)]"
          : "border-[var(--divider)] hover:border-[var(--divider)]"
      }`}
    >
      <div className="relative aspect-video overflow-hidden bg-[var(--surface)]">
        {!item.isPlaceholder && item.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={`${bookName} ${chapter}:${item.verse}`}
              className="h-full w-full bg-[var(--image-stage)] object-contain transition-transform duration-300 group-hover:scale-[1.015]"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/40 to-transparent" />
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

        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm ${
              isCurrent
                ? "bg-[var(--accent)]/85 text-white"
                : "bg-black/50 text-white"
            }`}
          >
            {item.verse}
          </span>
          {!item.isPlaceholder && item.imageCount > 1 ? (
            <span className="rounded-full bg-black/50 px-2 py-1 text-[11px] text-white/80 backdrop-blur-sm">
              {item.cardIndex + 1}/{item.imageCount}
            </span>
          ) : null}
        </div>

        {!item.isPlaceholder && item.imageUrl && onExpand ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onExpand();
            }}
            className="absolute right-3 bottom-3 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-black/70 hover:text-white backdrop-blur-sm transition-all duration-[var(--motion-base)]"
            aria-label={`View ${bookName} ${chapter}:${item.verse} fullscreen`}
          >
            <Maximize2 size={16} strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      <div className="px-3.5 py-3">
        <p className="text-sm font-medium text-[var(--foreground)]">
          {bookName} {chapter}:{item.verse}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)] line-clamp-1">
          {item.isPlaceholder ? "No image yet" : "Saved image"}
        </p>
      </div>
    </Link>
  );
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
  const { isFullscreen, openFullscreen, closeFullscreen } = useNavigation();
  const [layoutMode, setLayoutMode] = useState<GalleryLayoutMode>("all");
  const [lightboxItem, setLightboxItem] = useState<ChapterGalleryFlatItem | null>(null);

  const handleExpand = useCallback((item: ChapterGalleryFlatItem) => {
    setLightboxItem(item);
    openFullscreen();
  }, [openFullscreen]);

  const handleCloseLightbox = useCallback(() => {
    closeFullscreen();
    setLightboxItem(null);
  }, [closeFullscreen]);

  const galleryImages = useQuery(
    api.verseImages.getChapterGallery,
    chapterGalleryEnabled && isConvexEnabled ? { book, chapter } : "skip"
  );

  if (!chapterGalleryEnabled) {
    return null;
  }

  const normalizedGalleryImages =
    (galleryImages as ChapterGalleryImageRecord[] | null | undefined) ?? null;

  const groupedItems = buildChapterGalleryItems({
    book,
    chapter,
    verses,
    galleryImages: normalizedGalleryImages,
  });
  const flatItems = buildFlatChapterGalleryItems({
    book,
    chapter,
    verses,
    galleryImages: normalizedGalleryImages,
  });
  const isLoading = isConvexEnabled && galleryImages === undefined;
  const savedImageCount = flatItems.filter((item) => !item.isPlaceholder).length;
  const placeholderCount = flatItems.filter((item) => item.isPlaceholder).length;
  const filterSummary = isLoading
    ? "Checking saved art..."
    : `${savedImageCount} saved image${savedImageCount === 1 ? "" : "s"} · ${placeholderCount} placeholder${placeholderCount === 1 ? "" : "s"}`;

  return (
    <section
      className={fullScreen ? "flex-1 px-4 py-6 md:px-6 md:py-8" : "px-4 pb-10 md:px-6"}
      aria-labelledby="chapter-gallery-heading"
    >
      <div className={`${fullScreen ? "max-w-[1480px]" : "max-w-6xl"} mx-auto space-y-6`}>
        <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2
            id="chapter-gallery-heading"
            className="text-2xl font-semibold tracking-tight text-[var(--foreground)]"
          >
            {bookName} {chapter}
          </h2>
          <p className="text-sm text-[var(--muted)]">Chapter Gallery</p>
        </header>

        <div
          aria-label="Gallery filters"
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div
            role="radiogroup"
            aria-label="Gallery layout"
            className="inline-flex rounded-[var(--radius-lg)] bg-[var(--surface)]/60 p-1"
          >
            <button
              type="button"
              role="radio"
              onClick={() => setLayoutMode("all")}
              aria-checked={layoutMode === "all"}
              className={`rounded-[var(--radius-md)] px-4 py-1.5 text-sm font-medium transition-all duration-[var(--motion-base)] ${
                layoutMode === "all"
                  ? "bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              All images
            </button>
            <button
              type="button"
              role="radio"
              onClick={() => setLayoutMode("byVerse")}
              aria-checked={layoutMode === "byVerse"}
              className={`rounded-[var(--radius-md)] px-4 py-1.5 text-sm font-medium transition-all duration-[var(--motion-base)] ${
                layoutMode === "byVerse"
                  ? "bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              By verse
            </button>
          </div>

          <p className="text-sm text-[var(--muted)]">
            {filterSummary}
          </p>
        </div>

        {layoutMode === "all" ? (
          <div
            aria-label="All images gallery"
            className={`grid gap-4 md:gap-5 ${fullScreen ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}
          >
            {flatItems.map((item) => (
              <GalleryCard
                key={item.imageId ?? `${item.verse}-placeholder-${item.cardIndex}`}
                item={item}
                bookName={bookName}
                chapter={chapter}
                currentVerse={currentVerse}
                isLoading={isLoading}
                onExpand={!item.isPlaceholder && item.imageUrl ? () => handleExpand(item) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4 md:space-y-5">
            {groupedItems.map((item) => {
              const isCurrent = item.verse === currentVerse;
              const statusLabel = isLoading
                ? "Checking saved art..."
                : item.hasImages
                  ? `${item.imageCount} saved image${item.imageCount === 1 ? "" : "s"}`
                  : "Placeholder";

              return (
                <section
                  key={item.verse}
                  className={`overflow-hidden rounded-[var(--radius-2xl)] border bg-[var(--background)] transition-colors duration-[var(--motion-fast)] ${
                    isCurrent
                      ? "border-[var(--accent)]/40 shadow-[var(--shadow-sm)]"
                      : "border-[var(--divider)]"
                  }`}
                >
                  <div className="grid gap-0 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
                    <div className="border-b border-[var(--divider)] bg-[var(--surface)]/55 p-4 md:p-5 lg:border-b-0 lg:border-r">
                      <div className="space-y-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${
                            isCurrent
                              ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                              : "bg-[var(--surface)] text-[var(--foreground)]"
                          }`}
                        >
                          Verse {item.verse}
                        </span>

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

                        <p className="text-xs text-[var(--muted)]">
                          {statusLabel}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 md:p-5">
                      <div
                        aria-label={`Verse ${item.verse} mini-gallery`}
                        className={`grid gap-4 ${fullScreen ? "sm:grid-cols-2 2xl:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}
                      >
                        {item.cards.map((card, cardIndex) => {
                          const flatItem: ChapterGalleryFlatItem = {
                            verse: item.verse,
                            text: item.text,
                            href: item.href,
                            imageCount: item.imageCount,
                            cardIndex,
                            hasImages: item.hasImages,
                            ...card,
                          };
                          return (
                            <GalleryCard
                              key={card.imageId ?? `${item.verse}-placeholder-${cardIndex}`}
                              item={flatItem}
                              bookName={bookName}
                              chapter={chapter}
                              currentVerse={currentVerse}
                              isLoading={isLoading}
                              onExpand={!card.isPlaceholder && card.imageUrl ? () => handleExpand(flatItem) : undefined}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Fullscreen lightbox */}
      {isFullscreen && lightboxItem && (
        <div
          className="fixed inset-0 z-[60] bg-black flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={`${bookName} ${chapter}:${lightboxItem.verse} fullscreen`}
        >
          {/* Top bar */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3">
            <span className="text-sm text-white/80 font-medium">
              {bookName} {chapter}:{lightboxItem.verse}
            </span>
            <button
              onClick={handleCloseLightbox}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors duration-[var(--motion-fast)]"
              aria-label="Close fullscreen"
            >
              <X size={24} strokeWidth={1.5} />
            </button>
          </div>

          {/* Centered image + verse text */}
          <div className="flex-1 flex items-center justify-center min-h-0 px-4">
            <div className="flex flex-col items-center max-w-full max-h-full min-h-0">
              {lightboxItem.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={lightboxItem.imageUrl}
                  alt={`${bookName} ${chapter}:${lightboxItem.verse}`}
                  className="max-w-full max-h-[70vh] bg-[var(--image-stage)] object-contain rounded-[var(--radius-md)]"
                />
              ) : null}

              {lightboxItem.text ? (
                <p className="mt-4 text-center text-sm sm:text-base text-white/80 leading-relaxed max-w-2xl px-4">
                  {lightboxItem.text}
                </p>
              ) : null}

              {lightboxItem.model ? (
                <p className="mt-2 text-xs text-white/40">
                  {lightboxItem.model.split("/").pop()}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
