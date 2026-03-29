"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useQuery } from "convex/react";
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
}: GalleryCardProps) {
  const isCurrent = item.verse === currentVerse;
  const [isImageReady, setIsImageReady] = useState(false);
  const [isImageError, setIsImageError] = useState(false);
  const handleImageRef = useImageReadyRef(setIsImageReady, setIsImageError);
  const readerHref = buildReaderHref(item.href, item.imageId);
  const hasExpandableImage = Boolean(!item.isPlaceholder && item.imageUrl && onExpand);

  return (
    <Link
      href={readerHref}
      aria-current={isCurrent ? "page" : undefined}
      aria-label={`${bookName} ${chapter}:${item.verse}${item.isPlaceholder ? " placeholder" : ` image ${item.cardIndex + 1}`}`}
      onClick={(event) => onNavigateToReader?.(event, item)}
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
                onImageLoadFailed?.(item);
              }}
            />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
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

        {item.text ? (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 ${
              hasExpandableImage ? "pr-14" : ""
            }`}
          >
            <div className="rounded-[18px] border border-white/10 bg-black/30 px-3 py-2 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
              <p className="line-clamp-3 text-[13px] leading-5 text-white/92 sm:text-sm">
                {item.text}
              </p>
            </div>
          </div>
        ) : null}

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
              onExpand(item);
            }}
            className="absolute right-3 bottom-3 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-black/70 hover:text-white backdrop-blur-sm transition-all duration-[var(--motion-base)]"
            aria-label={`Open fullscreen view for ${bookName} ${chapter}:${item.verse}`}
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

  const galleryImages = useQuery(
    api.verseImages.getChapterGallery,
    isConvexEnabled && isGalleryActive ? { book, chapter } : "skip"
  );

  const normalizedGalleryImages = normalizeChapterGalleryImages(galleryImages);

  useEffect(() => {
    if (!isLightboxOpen || !lightboxItem) {
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
  }, [handleCloseLightbox, isLightboxOpen, lightboxItem]);

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

        <ChapterGalleryNav book={book} chapter={chapter} ariaLabel="Chapter navigation, top" />

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
                              onExpand={!card.isPlaceholder && card.imageUrl ? handleExpand : undefined}
                              onImageLoadFailed={handleGalleryImageLoadFailed}
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
