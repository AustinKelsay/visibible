"use client";

import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { ImageIcon, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { usePreferences } from "@/context/preferences-context";
import { useNavigation } from "@/context/navigation-context";
import {
  buildFlatChapterGalleryItems,
  buildChapterGalleryItems,
  type ChapterGalleryFlatItem,
  type ChapterGalleryVerseRecord,
  normalizeChapterGalleryImages,
} from "@/lib/chapter-gallery";
import { ImageLoadingSkeleton } from "@/components/image-loading-skeleton";
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
  onNavigateToReader?: (href: string, imageId?: string) => void;
}

function buildReaderHref(href: string, imageId?: string) {
  if (!imageId) {
    return href;
  }

  const params = new URLSearchParams({ image: imageId });
  return `${href}?${params.toString()}`;
}

function useImageReadyRef(
  setReady: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<boolean>>
) {
  return useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) {
      setReady(true);
      setError(false);
    }
  }, [setError, setReady]);
}

function GalleryCard({
  item,
  bookName,
  chapter,
  currentVerse,
  isLoading,
  onExpand,
  onNavigateToReader,
}: GalleryCardProps) {
  const isCurrent = item.verse === currentVerse;
  const [isImageReady, setIsImageReady] = useState(false);
  const [isImageError, setIsImageError] = useState(false);
  const handleImageRef = useImageReadyRef(setIsImageReady, setIsImageError);
  const readerHref = buildReaderHref(item.href, item.imageId);

  return (
    <Link
      href={readerHref}
      aria-current={isCurrent ? "page" : undefined}
      aria-label={`${bookName} ${chapter}:${item.verse}${item.isPlaceholder ? " placeholder" : ` image ${item.cardIndex + 1}`}`}
      onClick={() => onNavigateToReader?.(item.href, item.imageId)}
      className={`group overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--background)] transition-all duration-[var(--motion-base)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] ${
        isCurrent
          ? "border-[var(--accent)]/40 shadow-[var(--shadow-sm)]"
          : "border-[var(--divider)] hover:border-[var(--divider)]"
      }`}
    >
      <div className="relative aspect-video overflow-hidden bg-[var(--surface)]">
        {!item.isPlaceholder && item.imageUrl && !isImageError ? (
          <>
            {!isImageReady && (
              <ImageLoadingSkeleton
                className="absolute inset-0 z-10"
                compact
                label={`Loading saved image for ${bookName} ${chapter}:${item.verse}`}
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={handleImageRef}
              src={item.imageUrl}
              alt={`${bookName} ${chapter}:${item.verse}`}
              className={`h-full w-full bg-[var(--image-stage)] object-contain transition-[opacity,transform] duration-500 ${
                isImageReady ? "opacity-100" : "opacity-0"
              } group-hover:scale-[1.015]`}
              loading="lazy"
              onLoad={() => {
                setIsImageReady(true);
                setIsImageError(false);
              }}
              onError={() => {
                setIsImageReady(false);
                setIsImageError(true);
              }}
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
            aria-label={`Open full image view for ${bookName} ${chapter}:${item.verse}`}
          >
            <ImageIcon size={16} strokeWidth={1.5} />
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

interface LightboxImageStageProps {
  alt: string;
  imageUrl: string;
  label: string;
}

function LightboxImageStage({
  alt,
  imageUrl,
  label,
}: LightboxImageStageProps) {
  const [isImageReady, setIsImageReady] = useState(false);
  const [isImageError, setIsImageError] = useState(false);
  const handleImageRef = useImageReadyRef(setIsImageReady, setIsImageError);

  return (
    <div className="relative flex items-center justify-center max-w-full max-h-[70vh] rounded-[var(--radius-md)] bg-[var(--image-stage)]">
      {!isImageReady && !isImageError && (
        <ImageLoadingSkeleton
          className="absolute inset-0"
          label={label}
          theme="dark"
        />
      )}
      {isImageError ? (
        <VerseImagePlaceholder
          className="h-[70vh] px-6"
          theme="dark"
          title="Image unavailable"
          description="This saved image could not be loaded."
        />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={handleImageRef}
          src={imageUrl}
          alt={alt}
          className={`max-w-full max-h-[70vh] bg-[var(--image-stage)] object-contain rounded-[var(--radius-md)] transition-opacity duration-500 ${
            isImageReady ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => {
            setIsImageReady(true);
            setIsImageError(false);
          }}
          onError={() => {
            setIsImageReady(false);
            setIsImageError(true);
          }}
        />
      )}
    </div>
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
  const { chapterGalleryEnabled, setChapterGalleryEnabled } = usePreferences();
  const isConvexEnabled = useConvexEnabled();
  const { isFullscreen, openFullscreen, closeFullscreen } = useNavigation();
  const [layoutMode, setLayoutMode] = useState<GalleryLayoutMode>("all");
  const [lightboxItem, setLightboxItem] = useState<ChapterGalleryFlatItem | null>(null);
  const fullscreenDialogRef = useRef<HTMLDivElement>(null);

  const handleExpand = useCallback((item: ChapterGalleryFlatItem) => {
    setLightboxItem(item);
    openFullscreen();
  }, [openFullscreen]);

  const handleCloseLightbox = useCallback(() => {
    closeFullscreen();
    setLightboxItem(null);
  }, [closeFullscreen]);

  const handleNavigateToReader = useCallback((href: string, imageId?: string) => {
    setChapterGalleryEnabled(false);
    if (isFullscreen) {
      handleCloseLightbox();
    }

    // Link handles the actual navigation; this keeps gallery mode from persisting on the destination page.
    void href;
    void imageId;
  }, [handleCloseLightbox, isFullscreen, setChapterGalleryEnabled]);

  const galleryImages = useQuery(
    api.verseImages.getChapterGallery,
    chapterGalleryEnabled && isConvexEnabled ? { book, chapter } : "skip"
  );

  const normalizedGalleryImages = normalizeChapterGalleryImages(galleryImages);

  useEffect(() => {
    if (!isFullscreen || !lightboxItem) {
      return;
    }

    const dialog = fullscreenDialogRef.current;
    if (!dialog) {
      return;
    }

    const previousFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusableElements = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);

    const firstFocusableElement = getFocusableElements()[0];
    (firstFocusableElement ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCloseLightbox();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || activeElement === dialog) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocusedElement?.isConnected) {
        previousFocusedElement.focus();
      }
    };
  }, [handleCloseLightbox, isFullscreen, lightboxItem]);

  if (!chapterGalleryEnabled) {
    return null;
  }

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
                onNavigateToReader={handleNavigateToReader}
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
                            href={buildReaderHref(item.href, item.cards[0]?.imageId)}
                            aria-current={isCurrent ? "page" : undefined}
                            onClick={() => handleNavigateToReader(item.href, item.cards[0]?.imageId)}
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
                              onNavigateToReader={handleNavigateToReader}
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
          ref={fullscreenDialogRef}
          className="fixed inset-0 z-[60] bg-black flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={`${bookName} ${chapter}:${lightboxItem.verse} fullscreen`}
          tabIndex={-1}
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
                <LightboxImageStage
                  key={lightboxItem.imageId ?? lightboxItem.imageUrl}
                  imageUrl={lightboxItem.imageUrl}
                  alt={`${bookName} ${chapter}:${lightboxItem.verse}`}
                  label={`Loading saved image for ${bookName} ${chapter}:${lightboxItem.verse}`}
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
