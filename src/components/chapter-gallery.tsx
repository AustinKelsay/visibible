"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, ImageOff, Maximize2, X } from "lucide-react";
import { useQuery } from "convex/react";
import { usePreferences } from "@/context/preferences-context";
import { api } from "../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useNavigation } from "@/context/navigation-context";
import { useSession } from "@/context/session-context";
import { useVerseView } from "@/context/verse-view-context";
import {
  buildFlatChapterGalleryItems,
  buildChapterGalleryItems,
  type ChapterGalleryFlatItem,
  type ChapterGalleryVerseRecord,
  normalizeChapterGalleryImages,
} from "@/lib/chapter-gallery";
import {
  trackChapterGalleryItemOpened,
  trackChapterGalleryLayoutChanged,
  trackChapterGalleryViewed,
  trackImageFullscreenOpened,
  trackSavedImageLoadFailed,
} from "@/lib/analytics";
import {
  getNextChapter,
  getPreviousChapter,
} from "@/lib/navigation";
import { BOOK_BY_SLUG } from "@/data/bible-structure";
import { imageModelDisplayName } from "@/lib/image-models";
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
  onExpand?: (item: ChapterGalleryFlatItem) => void;
  onNavigateToReader?: (
    event: ReactMouseEvent<HTMLElement>,
    item: ChapterGalleryFlatItem
  ) => void;
  onImageLoadFailed?: (item: ChapterGalleryFlatItem) => void;
  /** Inside a By verse group, whose header already names the verse: drop the verse badge,
   *  reference and excerpt, and caption the card with its image position only. */
  inGroup?: boolean;
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

function isUnmodifiedPrimaryClick(event: ReactMouseEvent<HTMLElement>) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function GalleryCard({
  item,
  bookName,
  chapter,
  currentVerse,
  isLoading,
  onExpand,
  onNavigateToReader,
  onImageLoadFailed,
  inGroup = false,
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
      aria-label={`${bookName} ${chapter}:${item.verse}${item.isPlaceholder ? ", no image yet" : `, image ${item.cardIndex + 1} of ${item.imageCount}`}`}
      onClick={(event) => onNavigateToReader?.(event, item)}
      className={`group overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--background)] transition-all duration-[var(--motion-base)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] ${
        // The blue verse badge marks the current verse; a blue outline on every one of its cards
        // read as several selected images
        isCurrent
          ? "border-[var(--divider)] shadow-[var(--shadow-sm)]"
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
                onImageLoadFailed?.(item);
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--background)]/75 via-[var(--surface)] to-[var(--surface)]">
            {/* Phone cards are too short for the message; the footer already says "No image yet" */}
            <div className="absolute inset-0 flex items-center justify-center sm:hidden" aria-hidden="true">
              <ImageOff size={20} strokeWidth={1.5} className="text-[var(--muted)]" />
            </div>
            <div className="absolute inset-0 hidden sm:block">
              <VerseImagePlaceholder
                compact
                className="absolute inset-0"
                description={isLoading ? "Looking for saved images in this chapter" : "This verse has not been illustrated yet"}
              />
            </div>
          </div>
        )}


        {!inGroup && (
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm ${
              isCurrent
                ? "bg-[var(--accent)]/85 text-white"
                : "bg-black/70 text-white ring-1 ring-white/30"
            }`}
          >
            {item.verse}
          </span>
        </div>
        )}

        {/* Fullscreen button: shown on hover, keyboard focus and touch screens, since the lightbox is
            where the verse reads alongside its image */}
        {!item.isPlaceholder && item.imageUrl && onExpand ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onExpand(item);
            }}
            // Touch screens always show it, smaller and with a light ring so it reads on dark paintings too
            className="absolute right-3 bottom-3 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 pointer-coarse:right-2 pointer-coarse:bottom-2 pointer-coarse:min-h-8 pointer-coarse:min-w-8 pointer-coarse:bg-black/40 pointer-coarse:ring-1 pointer-coarse:ring-white/25 hover:bg-black/70 hover:text-white backdrop-blur-sm transition-all duration-[var(--motion-base)]"
            aria-label={`Open fullscreen view for ${bookName} ${chapter}:${item.verse}`}
          >
            <Maximize2 size={16} strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      {/* All images cards carry the reference and image position only, the same on phones and
          desktop; the verse itself is shown once per verse in By verse and in the lightbox.
          By verse cards have no caption bar: their group header names the verse and the count. */}
      {!inGroup ? (
        <div className="px-2.5 py-2 sm:px-3.5 sm:py-3">
          {/* The count sits under the reference on phones and beside it from sm up */}
          <p className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-2 text-sm font-medium text-[var(--foreground)]">
            <span>{bookName} {chapter}:{item.verse}</span>
            <span className="shrink-0 text-xs font-normal text-[var(--muted)]">
              {/* Every card gets a second line, so cards in a row stay the same height */}
              {item.isPlaceholder ? "No image yet" : item.imageCount > 1 ? `Image ${item.cardIndex + 1} of ${item.imageCount}` : "1 image"}
            </span>
          </p>
        </div>
      ) : null}
    </Link>
  );
}

interface LightboxImageStageProps {
  alt: string;
  imageUrl: string;
  label: string;
  onLoadError?: () => void;
}

function LightboxImageStage({
  alt,
  imageUrl,
  label,
  onLoadError,
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
            onLoadError?.();
          }}
        />
      )}
    </div>
  );
}

interface ChapterGalleryNavProps {
  book: string;
  chapter: number;
  ariaLabel: string;
}

function ChapterGalleryNav({ book, chapter, ariaLabel }: ChapterGalleryNavProps) {
  const bibleBook = BOOK_BY_SLUG[book];
  if (!bibleBook) return null;

  const prev = getPreviousChapter(bibleBook, chapter);
  const next = getNextChapter(bibleBook, chapter);

  if (!prev && !next) return null;
  const truncateBookName = (name: string): string =>
    name.length > 12 ? `${name.slice(0, 10)}…` : name;
  const withGalleryView = (href: string) => `${href}?view=gallery`;

  return (
    <nav
      aria-label={ariaLabel}
      className="flex items-center justify-between gap-3"
    >
      {prev ? (
        <Link
          href={withGalleryView(`/${prev.book.slug}/${prev.chapter}/1`)}
          className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-[var(--radius-md)] text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface)] active:bg-[var(--surface)] active:scale-[0.97] transition-all duration-[var(--motion-fast)] focus-ring"
          aria-label={`Previous chapter: ${prev.book.name} ${prev.chapter}`}
        >
          <ChevronLeft size={20} strokeWidth={2} className="text-[var(--muted)]" />
          <span className="hidden sm:inline">{prev.book.name} {prev.chapter}</span>
          <span className="sm:hidden">{truncateBookName(prev.book.name)} {prev.chapter}</span>
        </Link>
      ) : (
        <div />
      )}

      {next ? (
        <Link
          href={withGalleryView(`/${next.book.slug}/${next.chapter}/1`)}
          className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-[var(--radius-md)] text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface)] active:bg-[var(--surface)] active:scale-[0.97] transition-all duration-[var(--motion-fast)] focus-ring"
          aria-label={`Next chapter: ${next.book.name} ${next.chapter}`}
        >
          <span className="hidden sm:inline">{next.book.name} {next.chapter}</span>
          <span className="sm:hidden">{truncateBookName(next.book.name)} {next.chapter}</span>
          <ChevronRight size={20} strokeWidth={2} className="text-[var(--muted)]" />
        </Link>
      ) : (
        <div />
      )}
    </nav>
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
  const { effectiveView, setEffectiveView } = useVerseView();
  const isConvexEnabled = useConvexEnabled();
  const { isFullscreen, openFullscreen, closeFullscreen } = useNavigation();
  const { tier, credits, isLoading: sessionLoading } = useSession();
  const [layoutMode, setLayoutMode] = useState<GalleryLayoutMode>("all");
  const [lightboxItem, setLightboxItem] = useState<ChapterGalleryFlatItem | null>(null);
  const fullscreenDialogRef = useRef<HTMLDivElement>(null);
  const lastViewedKeyRef = useRef<string | null>(null);
  const previousLayoutModeRef = useRef<GalleryLayoutMode | null>(null);
  const isLightboxOpen = lightboxItem !== null;
  const isGalleryActive = effectiveView === "gallery" || isLightboxOpen;

  const handleExpand = useCallback((item: ChapterGalleryFlatItem) => {
    setEffectiveView("gallery", "chapter_gallery_card");
    trackImageFullscreenOpened({
      book,
      chapter,
      verse: item.verse,
      source: "chapter_gallery_card",
      imageId: item.imageId,
      tier,
      hasCredits: credits > 0,
    });
    setLightboxItem(item);
    openFullscreen();
  }, [book, chapter, credits, openFullscreen, setEffectiveView, tier]);

  const handleCloseLightbox = useCallback(() => {
    closeFullscreen();
    setLightboxItem(null);
  }, [closeFullscreen]);

  const handleNavigateToReader = useCallback((
    event: ReactMouseEvent<HTMLElement>,
    item: ChapterGalleryFlatItem
  ) => {
    trackChapterGalleryItemOpened({
      book,
      chapter,
      currentVerse,
      verse: item.verse,
      layoutMode,
      hasImage: !item.isPlaceholder,
      imageCount: item.imageCount,
      imageId: item.imageId,
      tier,
      hasCredits: credits > 0,
    });

    if (!isUnmodifiedPrimaryClick(event)) {
      return;
    }

    setEffectiveView("reader", "chapter_gallery_card");
    if (isLightboxOpen) {
      handleCloseLightbox();
    }
  }, [
    book,
    chapter,
    credits,
    currentVerse,
    handleCloseLightbox,
    isLightboxOpen,
    layoutMode,
    setEffectiveView,
    tier,
  ]);

  const { artStyle } = usePreferences();
  const galleryImages = useQuery(
    api.verseImages.getChapterGallery,
    isConvexEnabled && isGalleryActive ? { book, chapter, artStyle } : "skip"
  );

  const normalizedGalleryImages = normalizeChapterGalleryImages(galleryImages);

  // Focus trap runs on open and close only, so stepping through images keeps focus on the control used.
  useEffect(() => {
    if (!isLightboxOpen) {
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
  }, [handleCloseLightbox, isLightboxOpen]);

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

  // Lightbox browsing: every saved image in the chapter, in gallery order
  const viewableItems = flatItems.filter((item) => !item.isPlaceholder && item.imageUrl);
  const itemKey = (item: ChapterGalleryFlatItem) => item.imageId ?? item.imageUrl;
  const lightboxIndex = lightboxItem
    ? viewableItems.findIndex((item) => itemKey(item) === itemKey(lightboxItem))
    : -1;
  const previousLightboxItem = lightboxIndex > 0 ? viewableItems[lightboxIndex - 1] : null;
  const nextLightboxItem = lightboxIndex >= 0 ? viewableItems[lightboxIndex + 1] ?? null : null;

  const handleLightboxArrow = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowLeft" && previousLightboxItem) {
      event.preventDefault();
      setLightboxItem(previousLightboxItem);
    } else if (event.key === "ArrowRight" && nextLightboxItem) {
      event.preventDefault();
      setLightboxItem(nextLightboxItem);
    }
  };
  const placeholderCount = flatItems.filter((item) => item.isPlaceholder).length;
  const filterSummary = isLoading
    ? "Checking saved art..."
    : `${savedImageCount} saved image${savedImageCount === 1 ? "" : "s"}${placeholderCount > 0 ? ` · ${placeholderCount} without an image` : ""}`;

  useEffect(() => {
    if (!isGalleryActive) return;
    if (isLoading || sessionLoading) return;
    const viewKey = `${book}-${chapter}-${currentVerse}`;
    if (lastViewedKeyRef.current === viewKey) return;
    lastViewedKeyRef.current = viewKey;
    trackChapterGalleryViewed({
      book,
      chapter,
      currentVerse,
      layoutMode,
      savedImageCount,
      placeholderCount,
      tier,
      hasCredits: credits > 0,
    });
  }, [
    book,
    chapter,
    credits,
    currentVerse,
    isLoading,
    layoutMode,
    placeholderCount,
    savedImageCount,
    sessionLoading,
    tier,
    isGalleryActive,
  ]);

  useEffect(() => {
    if (!isGalleryActive) return;
    if (sessionLoading) return;
    if (previousLayoutModeRef.current === null) {
      previousLayoutModeRef.current = layoutMode;
      return;
    }
    if (previousLayoutModeRef.current === layoutMode) return;
    previousLayoutModeRef.current = layoutMode;
    trackChapterGalleryLayoutChanged({
      book,
      chapter,
      currentVerse,
      layoutMode,
      tier,
      hasCredits: credits > 0,
    });
  }, [book, chapter, credits, currentVerse, isGalleryActive, layoutMode, sessionLoading, tier]);

  const handleGalleryImageLoadFailed = useCallback((item: ChapterGalleryFlatItem) => {
    trackSavedImageLoadFailed({
      book,
      chapter,
      verse: item.verse,
      surface: "chapter_gallery_card",
      imageId: item.imageId,
      imageUrl: item.imageUrl,
      tier,
      hasCredits: credits > 0,
    });
  }, [book, chapter, credits, tier]);

  const handleLightboxImageLoadFailed = useCallback(() => {
    if (!lightboxItem) return;
    trackSavedImageLoadFailed({
      book,
      chapter,
      verse: lightboxItem.verse,
      surface: "chapter_gallery_lightbox",
      imageId: lightboxItem.imageId,
      imageUrl: lightboxItem.imageUrl,
      tier,
      hasCredits: credits > 0,
    });
  }, [book, chapter, credits, lightboxItem, tier]);

  return (
    <section
      className={fullScreen ? "flex-1 py-4 sm:py-6 md:py-8" : "pb-10"}
      aria-labelledby="chapter-gallery-heading"
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 space-y-4 sm:space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--muted)]">Chapter Gallery</p>
            <h2
              id="chapter-gallery-heading"
              className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]"
            >
              {bookName} {chapter}
            </h2>
          </div>
          <ChapterGalleryNav book={book} chapter={chapter} ariaLabel="Chapter navigation, top" />
        </header>

        <div
          aria-label="Gallery filters"
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
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
            className={`grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 ${fullScreen ? "xl:grid-cols-3" : "lg:grid-cols-3"}`}
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
                onExpand={!item.isPlaceholder && item.imageUrl ? handleExpand : undefined}
                onImageLoadFailed={handleGalleryImageLoadFailed}
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
                  : "No image yet";

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
                    {/* No "Verse n" pill (the reference says it): the count sits beside the reference,
                        on phones and desktop alike, so the images start sooner */}
                    <div className="border-b border-[var(--divider)] bg-[var(--surface)]/55 p-3 sm:p-4 md:p-5 lg:border-b-0 lg:border-r lg:bg-transparent">
                      <div className="space-y-1 lg:space-y-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <Link
                            href={buildReaderHref(item.href, item.cards[0]?.imageId)}
                            aria-current={isCurrent ? "page" : undefined}
                            onClick={(event) => handleNavigateToReader(event, {
                              verse: item.verse,
                              text: item.text,
                              href: item.href,
                              imageCount: item.imageCount,
                              cardIndex: 0,
                              hasImages: item.hasImages,
                              ...(item.cards[0] ?? {
                                imageId: undefined,
                                imageUrl: undefined,
                                model: undefined,
                                createdAt: undefined,
                                isLatest: false,
                                isPlaceholder: !item.hasImages,
                              }),
                            })}
                            className={`block text-lg font-semibold tracking-tight hover:text-[var(--accent)] transition-colors duration-[var(--motion-fast)] ${
                              isCurrent ? "text-[var(--accent)]" : "text-[var(--foreground)]"
                            }`}
                          >
                            {bookName} {chapter}:{item.verse}
                          </Link>
                          <span className="shrink-0 text-xs text-[var(--muted)]">{statusLabel}</span>
                        </div>
                        <p className="text-sm leading-6 text-[var(--foreground)]/75">
                          {item.text}
                        </p>
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 md:p-5">
                      <div
                        aria-label={`Verse ${item.verse} mini-gallery`}
                        className={`grid grid-cols-2 gap-3 sm:gap-4 ${fullScreen ? "2xl:grid-cols-3" : "lg:grid-cols-3"}`}
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
                              onExpand={!card.isPlaceholder && card.imageUrl ? handleExpand : undefined}
                              onImageLoadFailed={handleGalleryImageLoadFailed}
                              inGroup
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

        <ChapterGalleryNav book={book} chapter={chapter} ariaLabel="Chapter navigation, bottom" />
      </div>

      {/* Fullscreen lightbox */}
      {isLightboxOpen && isFullscreen && lightboxItem && (
        <div
          ref={fullscreenDialogRef}
          onKeyDown={handleLightboxArrow}
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
                  onLoadError={handleLightboxImageLoadFailed}
                />
              ) : null}

              {lightboxItem.text ? (
                <p className="mt-4 text-center text-sm sm:text-base text-white/80 leading-relaxed max-w-2xl px-4">
                  {lightboxItem.text}
                </p>
              ) : null}

              {viewableItems.length > 1 && lightboxIndex >= 0 ? (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => previousLightboxItem && setLightboxItem(previousLightboxItem)}
                    aria-disabled={!previousLightboxItem}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors duration-[var(--motion-fast)] aria-disabled:opacity-30 aria-disabled:cursor-default aria-disabled:hover:bg-transparent"
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={20} strokeWidth={1.5} />
                  </button>
                  <span className="text-xs text-white/70 px-2 select-none" aria-live="polite">
                    Image {lightboxIndex + 1} of {viewableItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => nextLightboxItem && setLightboxItem(nextLightboxItem)}
                    aria-disabled={!nextLightboxItem}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors duration-[var(--motion-fast)] aria-disabled:opacity-30 aria-disabled:cursor-default aria-disabled:hover:bg-transparent"
                    aria-label="Next image"
                  >
                    <ChevronRight size={20} strokeWidth={1.5} />
                  </button>
                </div>
              ) : null}

              <div className="mt-2 flex items-center gap-3 text-xs text-white/50">
                {lightboxItem.model ? <span>{imageModelDisplayName(lightboxItem.model)}</span> : null}
                <Link
                  href={buildReaderHref(lightboxItem.href, lightboxItem.imageId)}
                  onClick={(event) => handleNavigateToReader(event, lightboxItem)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-white/25 px-3 text-sm text-white/90 hover:bg-white/10 hover:text-white transition-colors duration-[var(--motion-fast)] focus-ring"
                >
                  Open in reader
                  <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
