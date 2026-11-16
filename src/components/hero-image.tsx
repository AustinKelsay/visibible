"use client";

/* eslint-disable react-hooks/set-state-in-effect -- The stage's own effects are unchanged; the compiler skipped this
   component while it held the generation flow (now useVerseGeneration). It serves only the owner's prose reader
   until that reader moves onto the spread (#451) and this file is deleted. */

import Link from "next/link";
import { useEffect, useState, useCallback, useRef, type TouchEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw, Sparkles, Loader2, Zap, ImageOff, Maximize2, X } from "lucide-react";
import { usePreferences } from "@/context/preferences-context";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useSession } from "@/context/session-context";
import { useNavigation } from "@/context/navigation-context";
import { useGeneration } from "@/context/generation-context";
import { ImageLoadingSkeleton } from "@/components/image-loading-skeleton";
import { VerseImagePlaceholder } from "@/components/verse-image-placeholder";
import {
  ASPECT_RATIOS,
  ImageAspectRatio,
  isValidAspectRatio,
} from "@/lib/image-models";
import {
  type GenerationTriggerSource,
  trackImageBrowsed,
  trackImageFullscreenOpened,
  trackSavedImageLoadFailed,
  trackVerseImagesState,
} from "@/lib/analytics";
import { artStyleLabel } from "@/lib/art-styles";
import { useEffectiveArtStyle, useWorkScope } from "@/context/work-scope-context";
import { useVerseGeneration } from "@/lib/use-verse-generation";

interface HeroImageProps {
  alt?: string;
  caption?: string;
  verseText?: string;
  prevUrl?: string;
  nextUrl?: string;
  currentReference?: string;
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new" | "prose";
}

/**
 * Create a verse ID from a reference string.
 * "Genesis 1:1" -> "genesis-1-1"
 * "1 John 3:16" -> "1-john-3-16"
 */
function createVerseId(reference: string): string {
  return reference
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/:/g, "-");
}

const imageSwipeThresholdPx = 48;

function isInteractiveTouchTarget(target: EventTarget | null): boolean {
  return target instanceof Element &&
    Boolean(
      target.closest(
        "button, a, input, textarea, select, label, [role=\"button\"], [role=\"link\"], [contenteditable], [tabindex]"
      )
    );
}

export function HeroImage({
  alt = "Scripture illustration",
  caption = "In the beginning",
  verseText,
  prevUrl,
  nextUrl,
  currentReference,
  book,
  chapter,
  verse,
  testament,
}: HeroImageProps) {
  const isConvexEnabled = useConvexEnabled();

  if (!isConvexEnabled) {
    return (
      <HeroImageBase
        alt={alt}
        caption={caption}
        verseText={verseText}
        prevUrl={prevUrl}
        nextUrl={nextUrl}
        currentReference={currentReference}
        book={book}
        chapter={chapter}
        verse={verse}
        testament={testament}
        imageHistory={[]}
        isQueryLoading={false}
        imageRefreshKey={0}
      />
    );
  }

  return (
    <HeroImageWithConvex
      alt={alt}
      caption={caption}
      verseText={verseText}
      prevUrl={prevUrl}
      nextUrl={nextUrl}
      currentReference={currentReference}
      book={book}
      chapter={chapter}
      verse={verse}
      testament={testament}
    />
  );
}

interface ConvexImageData {
  id: Id<"verseImages">;
  imageUrl: string | undefined;
  model: string;
  prompt?: string;
  reference?: string;
  verseText?: string;
  generationNumber?: number;
  promptVersion?: string;
  translationId?: string;
  provider?: string;
  providerRequestId?: string;
  creditsCost?: number;
  costUsd?: number;
  durationMs?: number;
  aspectRatio?: string;
  sourceImageUrl?: string;
  imageMimeType?: string;
  imageSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
  createdAt: number;
}

interface HeroImageBaseProps extends HeroImageProps {
  imageHistory: ConvexImageData[] | undefined;
  isQueryLoading: boolean;
  imageRefreshKey?: number;
  onRefreshImages?: () => void;
  /** Images of this verse in the selected art style; variation counts and auto-generation follow it (#177). */
  selectedStyleImageCount?: number;
  /** Images of this verse in every other style, shown through a deliberate view. */
  otherStylesCount?: number;
  showingOtherStyles?: boolean;
  onToggleOtherStyles?: () => void;
}

function HeroImageLoadingState({
  label,
  fullscreen = false,
  progress,
}: {
  label: string;
  fullscreen?: boolean;
  progress?: number;
}) {
  const hasProgress = typeof progress === "number";

  return (
    <div className={`absolute inset-0 ${fullscreen ? "" : "z-10"} overflow-hidden bg-[#050505] text-white`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_42%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
      <div className="relative flex h-full flex-col items-center justify-center px-6">
        <div className="w-full max-w-[260px] space-y-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
            <RefreshCw className="h-4 w-4 animate-spin text-white/70" />
          </div>
          <div className="space-y-3">
            <div className="h-px overflow-hidden rounded-full bg-white/10">
              <div
                aria-hidden="true"
                className={`h-full rounded-full bg-white/40 ${
                  hasProgress ? "transition-[width] duration-300 ease-out" : "w-1/3 animate-pulse"
                }`}
                style={hasProgress ? { width: `${Math.round(progress * 100)}%` } : undefined}
              />
            </div>
            <p className="text-center text-[11px] font-medium uppercase tracking-[0.24em] text-white/45">
              {label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroImageWithConvex({
  alt = "Scripture illustration",
  caption = "In the beginning",
  verseText,
  prevUrl,
  nextUrl,
  currentReference,
  book,
  chapter,
  verse,
  testament,
}: HeroImageProps) {
  // Images are kept under the verse, or under a prose moment's first unit.
  const scope = useWorkScope();
  const verseId = scope ? scope.unitId : currentReference ? createVerseId(currentReference) : null;
  const [refreshToken, setRefreshToken] = useState(0);
  const { artStyle } = useEffectiveArtStyle();
  // The other-styles view is keyed to the verse and style it was opened for, so changing either returns to the style's own images.
  const [otherStylesViewKey, setOtherStylesViewKey] = useState<string | null>(null);
  const viewKey = `${verseId ?? ""}|${artStyle}`;
  const showingOtherStyles = otherStylesViewKey === viewKey;

  // The selected style's images (newest first) and, separately, every other style's for the other-styles view.
  const styleHistory = useQuery(
    api.verseImages.getImageHistory,
    verseId ? { verseId, refreshToken, artStyle } : "skip"
  );
  const otherStylesHistory = useQuery(
    api.verseImages.getImageHistory,
    verseId ? { verseId, refreshToken, artStyle, otherStyles: true } : "skip"
  );
  const imageHistory = showingOtherStyles ? otherStylesHistory : styleHistory;

  const refreshImages = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);
  const toggleOtherStyles = useCallback(() => {
    setOtherStylesViewKey((current) => (current === viewKey ? null : viewKey));
  }, [viewKey]);

  const isQueryLoading = imageHistory === undefined && verseId !== null;

  return (
    <HeroImageBase
      alt={alt}
      caption={caption}
      verseText={verseText}
      prevUrl={prevUrl}
      nextUrl={nextUrl}
      currentReference={currentReference}
      book={book}
      chapter={chapter}
      verse={verse}
      testament={testament}
      imageHistory={imageHistory}
      isQueryLoading={isQueryLoading}
      imageRefreshKey={refreshToken}
      onRefreshImages={refreshImages}
      selectedStyleImageCount={styleHistory?.length}
      otherStylesCount={otherStylesHistory?.length ?? 0}
      showingOtherStyles={showingOtherStyles}
      onToggleOtherStyles={toggleOtherStyles}
    />
  );
}

function HeroImageBase({
  alt = "Scripture illustration",
  caption = "In the beginning",
  verseText,
  prevUrl,
  nextUrl,
  currentReference,
  book,
  chapter,
  verse,
  testament,
  imageHistory,
  isQueryLoading,
  imageRefreshKey = 0,
  onRefreshImages,
  selectedStyleImageCount,
  otherStylesCount = 0,
  showingOtherStyles = false,
  onToggleOtherStyles,
}: HeroImageBaseProps) {
  const { imageModel, imageAspectRatio, imageResolution, setImageAspectRatio, setImageResolution } = usePreferences();
  const scope = useWorkScope();
  const { artStyle } = useEffectiveArtStyle();
  const isConvexEnabled = useConvexEnabled();
  const { tier, credits, buyCredits, isLoading: sessionLoading } = useSession();
  const { setCurrentImageId, setCaptionClamped, isFullscreen, openFullscreen, closeFullscreen } = useNavigation();
  const captionTextRef = useRef<HTMLParagraphElement>(null);
  const searchParams = useSearchParams();
  const {
    registerGenerate,
    unregisterGenerate,
    updateState: updateGenerationState,
    registerBuyCredits,
    registerSettings,
  } = useGeneration();

  const verseId = scope ? scope.unitId : currentReference ? createVerseId(currentReference) : null;

  const hasTrackedImagesStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;

    const trackKey = `${book}-${chapter}-${verse}-${isConvexEnabled ? "convex" : "no-convex"}`;
    if (hasTrackedImagesStateRef.current === trackKey) return;

    if (!isConvexEnabled) {
      hasTrackedImagesStateRef.current = trackKey;
      trackVerseImagesState({
        book,
        chapter,
        verse,
        testament,
        imageState: "unknown",
        tier,
        hasCredits: credits > 0,
      });
      return;
    }

    if (imageHistory === undefined) return;

    hasTrackedImagesStateRef.current = trackKey;
    const imageCount = imageHistory.length;
    trackVerseImagesState({
      book,
      chapter,
      verse,
      testament,
      imageState: "known",
      imageCount,
      hasImages: imageCount > 0,
      tier,
      hasCredits: credits > 0,
    });
  }, [
    book,
    chapter,
    verse,
    testament,
    isConvexEnabled,
    imageHistory,
    tier,
    credits,
    sessionLoading,
  ]);

  // Image navigation state: null = show newest, string = show specific image by ID
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [pendingImageId, setPendingImageId] = useState<string | null>(null);
  const pendingFollowLatest = useRef(true);
  const requestedImageId = searchParams.get("image");

  // Local state for newly generated image (before it's saved and reflected in query)
  const [generatedImage, setGeneratedImage] = useState<{
    url: string;
    model: string;
    id?: string;
  } | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isDisplayImageReady, setIsDisplayImageReady] = useState(false);
  const [isFullscreenImageReady, setIsFullscreenImageReady] = useState(false);
  const [isFullscreenImageError, setIsFullscreenImageError] = useState(false);
  const [imageLoadAttempts, setImageLoadAttempts] = useState(0);
  const lastDisplayImageKeyRef = useRef<string | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  const handleManualRegenerateRef = useRef<((source?: GenerationTriggerSource) => void) | null>(null);
  const trackedImageIdsRef = useRef<Set<Id<"verseImages">>>(new Set());

  const recordImageImpression = useMutation(
    api.verseImages.recordImageImpression
  );

  const {
    canGenerate,
    pricingPending,
    pricingUnavailable,
    effectiveCost,
    effectiveEta,
    baseCost,
    displayBaseCost,
    displayCostByResolution,
    showCreditsCost,
    quoteLabel,
    priceNotice,
    isGenerating,
    progress: generationProgress,
    phaseLabel: generationPhaseLabel,
    error,
    setError,
    generate,
  } = useVerseGeneration({
    verseId,
    reference: currentReference,
    styleImageCount: selectedStyleImageCount ?? imageHistory?.length,
    autoGenerateBlocked: showingOtherStyles,
    onAttemptStart: () => {
      pendingFollowLatest.current = selectedImageId === null;
      setPendingImageId(null);
      setImageLoadAttempts(0);
    },
    onImage: ({ savedImageId, url, model }) => {
      if (savedImageId) setPendingImageId(savedImageId);
      // No Convex persistence; show the generated URL immediately.
      else setGeneratedImage({ url, model });
    },
  });

  // Maximum number of retries before giving up
  const maxLoadAttempts = 3;

  // Image history helpers - simplified: null = show newest (index 0)
  const totalImages = imageHistory?.length || 0;
  const selectedIndex = selectedImageId && imageHistory
    ? imageHistory.findIndex((img) => img.id === selectedImageId)
    : -1;
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const currentImage = totalImages > 0 ? imageHistory![currentIndex] : null;

  // Determine what image to display
  const displayImage = generatedImage || (currentImage?.imageUrl ? {
    url: currentImage.imageUrl,
    model: currentImage.model,
    id: currentImage.id,
  } : null);
  const savedDisplayImage = !generatedImage && currentImage?.imageUrl ? currentImage : null;

  const hasImages = Boolean(displayImage) || totalImages > 0;
  const canGoOlder = totalImages > 0 && currentIndex < totalImages - 1;
  const canGoNewer = totalImages > 0 && currentIndex > 0;
  // Newest image is 1; the "older" arrow moves forward through the count.
  const displayIndex = currentIndex + 1;
  const imageCountLabel = totalImages > 0
    ? `Image ${displayIndex} of ${totalImages}`
      : displayImage
      ? "1 / 1"
      : isQueryLoading
        ? "Loading..."
        : isGenerating
          ? generationPhaseLabel
          : "No images yet";
  const showControls = Boolean(hasImages || isGenerating || isQueryLoading || canGenerate || !pricingPending);
  const showPhonePager = showControls && totalImages > 1;
  // Phones explain missing pricing under a saved image (the empty state already says it)
  const showPhonePricingNote = Boolean(pricingUnavailable) && Boolean(displayImage?.url);
  // While something sits under or on the stage, the phone pager moves to a row under the painting
  const phonePagerBelow = isGenerating || Boolean(error) || Boolean(priceNotice) || showPhonePricingNote;

  useEffect(() => {
    const nextSelectedImageId = requestedImageId && requestedImageId.length > 0
      ? requestedImageId
      : null;

    setSelectedImageId(nextSelectedImageId);
    setError(null);
    setImageLoadAttempts(0);
    pendingFollowLatest.current = nextSelectedImageId === null;
  }, [requestedImageId, verseId, setError]);

  // Tell ScriptureReader whether the desktop caption shows the whole verse or is cut off by its
  // three-line clamp, so the text below is hidden only when nothing is lost. Hidden (phones): unknown.
  useEffect(() => {
    const el = captionTextRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setCaptionClamped?.(el.clientHeight > 0 ? el.scrollHeight > el.clientHeight + 1 : null);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      setCaptionClamped?.(null);
    };
  }, [caption, displayImage?.url, setCaptionClamped]);

  // Sync current image ID to navigation context for ScriptureDetails
  useEffect(() => {
    setCurrentImageId(currentImage?.id || null);
  }, [currentImage?.id, setCurrentImageId]);

  // Manual regenerate function - resets load attempts and queues a new image
  const handleManualRegenerate = useCallback((source: GenerationTriggerSource = "hero_retry") => {
    if (pricingPending || pricingUnavailable) return;
    setImageLoadAttempts(0);
    setGeneratedImage(null);
    setPendingImageId(null);
    generate(source);
  }, [generate, pricingPending, pricingUnavailable]);

  useEffect(() => {
    handleManualRegenerateRef.current = handleManualRegenerate;
  }, [handleManualRegenerate]);

  const handleImageReload = useCallback((source: GenerationTriggerSource = "hero_retry") => {
    if (onRefreshImages) {
      setError(null);
      setIsImageLoading(true);
      setImageLoadAttempts(0);
      onRefreshImages();
      return;
    }
    handleManualRegenerate(source);
  }, [onRefreshImages, handleManualRegenerate, setError]);

  const handleFullscreenImageReload = useCallback(() => {
    setIsFullscreenImageError(false);
    setIsFullscreenImageReady(false);
    handleImageReload("fullscreen_retry");
  }, [handleImageReload]);

  // Register generation callback with context so header can trigger it
  useEffect(() => {
    registerGenerate((source) => {
      handleManualRegenerateRef.current?.(source ?? "header_generate");
    });
    return () => unregisterGenerate();
  }, [registerGenerate, unregisterGenerate]);

  // Register buyCredits with context
  useEffect(() => {
    registerBuyCredits(buyCredits);
  }, [buyCredits, registerBuyCredits]);

  // Register settings callbacks with context
  useEffect(() => {
    registerSettings({
      setAspectRatio: setImageAspectRatio,
      setResolution: setImageResolution,
    });
  }, [setImageAspectRatio, setImageResolution, registerSettings]);

  // Push derived generation state to context for header consumption
  useEffect(() => {
    updateGenerationState({
      canGenerate,
      isGenerating,
      pricingPending,
      pricingUnavailable,
      effectiveCost,
      effectiveEta,
      showCreditsCost,
      quoteLabel,
      priceChanged: Boolean(priceNotice),
      generationPhaseLabel,
      aspectRatio: imageAspectRatio,
      resolution: imageResolution,
      baseCost,
      displayBaseCost,
      displayCostByResolution,
      modelId: imageModel,
    });
  }, [
    canGenerate,
    isGenerating,
    pricingPending,
    pricingUnavailable,
    effectiveCost,
    effectiveEta,
    showCreditsCost,
    quoteLabel,
    priceNotice,
    generationPhaseLabel,
    imageAspectRatio,
    imageResolution,
    baseCost,
    displayBaseCost,
    displayCostByResolution,
    imageModel,
    updateGenerationState,
  ]);

  // Image navigation functions
  const goToPrevImage = useCallback((surface: "desktop_dock" | "overlay" | "fullscreen") => {
    if (!imageHistory || imageHistory.length === 0) return;
    const idx = selectedImageId
      ? imageHistory.findIndex((img) => img.id === selectedImageId)
      : 0;
    const currentIdx = idx >= 0 ? idx : 0;
    if (currentIdx < imageHistory.length - 1) {
      const targetImage = imageHistory[currentIdx + 1];
      setSelectedImageId(targetImage.id); // Older image
      setError(null);
      setImageLoadAttempts(0);
      trackImageBrowsed({
        book,
        chapter,
        verse,
        direction: "older",
        surface,
        currentIndex: currentIdx + 2,
        totalImages: imageHistory.length,
        imageId: targetImage.id,
        tier,
        hasCredits: credits > 0,
      });
    }
  }, [selectedImageId, imageHistory, book, chapter, verse, tier, credits, setError]);

  const goToNextImage = useCallback((surface: "desktop_dock" | "overlay" | "fullscreen") => {
    if (!imageHistory || imageHistory.length === 0) return;
    const idx = selectedImageId
      ? imageHistory.findIndex((img) => img.id === selectedImageId)
      : 0;
    const currentIdx = idx >= 0 ? idx : 0;
    if (currentIdx > 0) {
      const targetImage = imageHistory[currentIdx - 1];
      setSelectedImageId(targetImage.id); // Newer image
      setError(null);
      setImageLoadAttempts(0);
      trackImageBrowsed({
        book,
        chapter,
        verse,
        direction: "newer",
        surface,
        currentIndex: currentIdx,
        totalImages: imageHistory.length,
        imageId: targetImage.id,
        tier,
        hasCredits: credits > 0,
      });
    }
  }, [selectedImageId, imageHistory, book, chapter, verse, tier, credits, setError]);

  const handleSwipeStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      swipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      ignore: isInteractiveTouchTarget(event.target),
    };
  }, []);

  const handleSwipeEnd = useCallback((
    event: TouchEvent<HTMLDivElement>,
    surface: "overlay" | "fullscreen",
  ) => {
    const swipeStart = swipeStartRef.current;
    swipeStartRef.current = null;

    if (!swipeStart || swipeStart.ignore || totalImages <= 1 || event.changedTouches.length !== 1) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - swipeStart.x;
    const deltaY = touch.clientY - swipeStart.y;

    if (Math.abs(deltaX) < imageSwipeThresholdPx || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    if (deltaX > 0) {
      goToNextImage(surface);
      return;
    }

    goToPrevImage(surface);
  }, [goToNextImage, goToPrevImage, totalImages]);

  const resetSwipe = useCallback(() => {
    swipeStartRef.current = null;
  }, []);

  // When a new image is saved, navigate only after it exists in history
  useEffect(() => {
    if (!pendingImageId || !imageHistory) return;
    const exists = imageHistory.some((img) => img.id === pendingImageId);
    if (!exists) return;
    if (pendingFollowLatest.current) {
      setSelectedImageId(null);
    } else {
      setSelectedImageId(pendingImageId);
    }
    setPendingImageId(null);
  }, [pendingImageId, imageHistory]);

  // Reset state when verse changes (the generation resets its own)
  useEffect(() => {
    setSelectedImageId(null);
    setGeneratedImage(null);
    setImageLoadAttempts(0);
    setPendingImageId(null);
    setIsImageLoading(false);
    pendingFollowLatest.current = true;
  }, [verseId]);

  // If selected image no longer exists in history, reset to newest
  useEffect(() => {
    if (!selectedImageId || !imageHistory) return;
    const exists = imageHistory.some((img) => img.id === selectedImageId);
    if (!exists) {
      setSelectedImageId(null);
    }
  }, [selectedImageId, imageHistory]);

  useEffect(() => {
    if (!displayImage?.url) {
      setIsImageLoading(false);
      setIsDisplayImageReady(false);
      return;
    }
    const img = imageElementRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setIsImageLoading(false);
      setIsDisplayImageReady(true);
    } else {
      setIsImageLoading(true);
      setIsDisplayImageReady(false);
    }
  }, [displayImage?.id, displayImage?.url, imageRefreshKey]);

  useEffect(() => {
    if (!displayImage?.url) return;
    const displayImageKey = `${verseId ?? "unknown"}:${displayImage.id ?? displayImage.url}`;
    if (lastDisplayImageKeyRef.current === displayImageKey) {
      return;
    }
    lastDisplayImageKeyRef.current = displayImageKey;
    setImageLoadAttempts(0);
    setError(null);
  }, [displayImage?.id, displayImage?.url, verseId, setError]);

  useEffect(() => {
    if (!isFullscreen || !displayImage?.url) {
      setIsFullscreenImageReady(false);
      setIsFullscreenImageError(false);
      return;
    }
    setIsFullscreenImageReady(false);
    setIsFullscreenImageError(false);
  }, [displayImage?.id, displayImage?.url, isFullscreen]);

  // Use the displayed image's aspect ratio when available, fall back to user preference
  const containerAspectRatio: ImageAspectRatio =
    currentImage?.aspectRatio && isValidAspectRatio(currentImage.aspectRatio)
      ? currentImage.aspectRatio
      : imageAspectRatio;
  const containerAspectRatioCss =
    currentImage?.imageWidth && currentImage?.imageHeight
      ? `${currentImage.imageWidth} / ${currentImage.imageHeight}`
      : ASPECT_RATIOS[containerAspectRatio].cssRatio;

  // Phone image pager, shared by the on-image pill and the row under the painting
  const phonePager = (
    <div className="flex items-center rounded-full bg-black/55 backdrop-blur-sm border border-white/15 text-white">
      <button
        onClick={() => goToNextImage("overlay")}
        disabled={!canGoNewer}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/80 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all focus-ring"
        aria-label="Newer image"
      >
        <ChevronLeft size={20} strokeWidth={1.5} />
      </button>
      <span className="text-xs select-none">Image {displayIndex} of {totalImages}</span>
      <button
        onClick={() => goToPrevImage("overlay")}
        disabled={!canGoOlder}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/80 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all focus-ring"
        aria-label="Older image"
      >
        <ChevronRight size={20} strokeWidth={1.5} />
      </button>
    </div>
  );

  // Verse links in fullscreen. A missing neighbour keeps its slot (disabled), so "Next verse"
  // stays in the same place on the first verse.
  const fullscreenVerseLinkClass =
    "min-h-[44px] px-3 inline-flex items-center gap-1 rounded-full text-sm text-white/90 hover:text-white hover:bg-white/10 transition-colors duration-[var(--motion-fast)] focus-ring";
  const stepNoun = scope ? "passage" : "verse";
  const fullscreenVerseLinks = (
    <>
      {prevUrl ? (
        <Link href={prevUrl} className={fullscreenVerseLinkClass} aria-label={`Previous ${stepNoun}`}>
          <ChevronLeft size={18} strokeWidth={1.5} />
          <span>Previous {stepNoun}</span>
        </Link>
      ) : (
        <span className={`${fullscreenVerseLinkClass} opacity-40 sm:hidden`} aria-hidden="true">
          <ChevronLeft size={18} strokeWidth={1.5} />
          <span>Previous {stepNoun}</span>
        </span>
      )}
      {nextUrl ? (
        <Link href={nextUrl} className={fullscreenVerseLinkClass} aria-label={`Next ${stepNoun}`}>
          <span>Next {stepNoun}</span>
          <ChevronRight size={18} strokeWidth={1.5} />
        </Link>
      ) : (
        <span className={`${fullscreenVerseLinkClass} opacity-40 sm:hidden`} aria-hidden="true">
          <span>Next {stepNoun}</span>
          <ChevronRight size={18} strokeWidth={1.5} />
        </span>
      )}
    </>
  );


  const acceptPriceButton = (
    <button
      onClick={() => handleManualRegenerate("hero_generate")}
      className="min-h-[44px] px-4 flex items-center gap-2 text-sm bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] focus-ring"
    >
      <Sparkles className="w-4 h-4" />
      Generate at this price
    </button>
  );
  return (
    <figure className="relative w-full">
      {/* Image Container - follows the image's shape. On larger screens it leaves room under it for
          the labelled verse navigation (header + tabs 6.75rem, navigation row 6rem), so the first
          screen always shows how to reach the next verse. An empty verse gets a short stage. */}
      <div
        className={`relative w-full overflow-hidden bg-[var(--image-stage)] [aspect-ratio:var(--ar)] ${
          !displayImage?.url && !isQueryLoading && !isGenerating
            ? "min-h-[17rem] max-h-[45svh] sm:min-h-0 sm:max-h-[22rem]"
            : "max-h-[70svh] sm:max-h-[calc(100svh-12.75rem)]"
        }`}
        style={{ "--ar": containerAspectRatioCss, touchAction: "pan-y" } as React.CSSProperties}
        data-testid="hero-swipe-overlay"
        onTouchStart={handleSwipeStart}
        onTouchEnd={(event) => handleSwipeEnd(event, "overlay")}
        onTouchCancel={resetSwipe}
      >
        {displayImage?.url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${displayImage.id || displayImage.url}-${imageRefreshKey}`}
              src={displayImage.url}
              alt={alt}
              ref={imageElementRef}
              className={`w-full h-full bg-[var(--image-stage)] object-contain transition-opacity duration-300 ${
                isDisplayImageReady ? "opacity-100 visible" : "opacity-0 invisible"
              }`}
              onLoad={() => {
                setIsImageLoading(false);
                setIsDisplayImageReady(true);
                setImageLoadAttempts(0);
                setError(null);

                if (savedDisplayImage?.id && !trackedImageIdsRef.current.has(savedDisplayImage.id)) {
                  trackedImageIdsRef.current.add(savedDisplayImage.id);

                  void recordImageImpression({ imageId: savedDisplayImage.id }).catch((error) => {
                    trackedImageIdsRef.current.delete(savedDisplayImage.id);
                    console.error("Failed to record image impression:", error);
                  });
                }
              }}
              onError={() => {
                const nextAttempt = imageLoadAttempts + 1;
                setIsImageLoading(false);
                setIsDisplayImageReady(false);
                setImageLoadAttempts(nextAttempt);

                if (onRefreshImages && nextAttempt <= maxLoadAttempts) {
                  setError(null);
                  setIsImageLoading(true);
                  onRefreshImages();
                  return;
                }

                setError("Failed to load image. Please try generating a new image.");
                if (savedDisplayImage?.imageUrl) {
                  trackSavedImageLoadFailed({
                    book,
                    chapter,
                    verse,
                    surface: "hero",
                    imageId: savedDisplayImage.id,
                    imageUrl: savedDisplayImage.imageUrl,
                    attempt: nextAttempt,
                    tier,
                    hasCredits: credits > 0,
                  });
                }
              }}
            />

            {isGenerating && !error && (
              <HeroImageLoadingState
                label={generationPhaseLabel}
                progress={generationProgress}
              />
            )}

            {!isGenerating && isImageLoading && !error && (
              <ImageLoadingSkeleton
                className="absolute inset-0 z-10"
                isLiveRegion
                label="Loading saved image"
              />
            )}

            {totalImages === 0 && !isGenerating && !error && !isQueryLoading && onToggleOtherStyles && (otherStylesCount > 0 || showingOtherStyles) ? (
              <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center">
                <button
                  type="button"
                  onClick={onToggleOtherStyles}
                  aria-pressed={showingOtherStyles}
                  className="min-h-[36px] rounded-[var(--radius-full)] bg-black/50 px-4 text-xs text-white/90 backdrop-blur-sm hover:bg-black/70 focus-ring"
                >
                  {showingOtherStyles ? `Back to ${artStyleLabel(artStyle)}` : `${otherStylesCount} in other styles`}
                </button>
              </div>
            ) : null}
            {error && !isGenerating && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--image-stage)]/70 backdrop-blur-sm">
                <div className="text-red-500 text-sm px-4 text-center">{error}</div>
                <button
                  onClick={() => handleImageReload("hero_retry")}
                  className="min-h-[44px] px-4 flex items-center gap-2 text-sm bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] focus-ring"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            )}
            {priceNotice && !error && !isGenerating && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--image-stage)]/70 backdrop-blur-sm">
                <div role="status" className="text-white/90 text-sm px-4 text-center">{priceNotice}</div>
                {acceptPriceButton}
              </div>
            )}

            {/* Fullscreen toggle button - mobile only (desktop uses VerseStripBar) */}
            <button
              onClick={() => {
                trackImageFullscreenOpened({
                  book,
                  chapter,
                  verse,
                  source: "hero_mobile",
                  imageId: displayImage.id,
                  totalImages,
                  tier,
                  hasCredits: credits > 0,
                });
                openFullscreen();
              }}
              className="sm:hidden absolute top-3 z-20 right-4 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-black/45 backdrop-blur-sm border border-white/15 text-white hover:bg-black/60 active:scale-95 transition-all duration-[var(--motion-fast)] cursor-pointer focus-ring"
              aria-label="Open fullscreen view"
            >
              <Maximize2 size={20} strokeWidth={1.5} />
            </button>
          </>
        ) : (
          /* Placeholder with skeleton loader - stays on the dark stage */
          <div className="absolute inset-0 bg-[var(--image-stage)]">

            {isGenerating && !error && (
              <HeroImageLoadingState
                label={generationPhaseLabel}
                progress={generationProgress}
              />
            )}

            {isQueryLoading && !isGenerating && !error && (
              <ImageLoadingSkeleton
                className="absolute inset-0"
                isLiveRegion
                label="Loading saved image"
              />
            )}

            {/* Error state */}
            {totalImages === 0 && !isGenerating && !error && !isQueryLoading && onToggleOtherStyles && (otherStylesCount > 0 || showingOtherStyles) ? (
              <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center">
                <button
                  type="button"
                  onClick={onToggleOtherStyles}
                  aria-pressed={showingOtherStyles}
                  className="min-h-[36px] rounded-[var(--radius-full)] bg-black/50 px-4 text-xs text-white/90 backdrop-blur-sm hover:bg-black/70 focus-ring"
                >
                  {showingOtherStyles ? `Back to ${artStyleLabel(artStyle)}` : `${otherStylesCount} in other styles`}
                </button>
              </div>
            ) : null}
            {error && !isGenerating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="text-red-500 text-sm px-4 text-center">{error}</div>
                <button
                  onClick={() => handleManualRegenerate("hero_retry")}
                  className="min-h-[44px] px-4 flex items-center gap-2 text-sm bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] focus-ring"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            )}
            {priceNotice && !error && !isGenerating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div role="status" className="text-white/90 text-sm px-4 text-center">{priceNotice}</div>
                {acceptPriceButton}
              </div>
            )}

            {/* Empty state - no image yet */}
            {!isQueryLoading && !isGenerating && !error && !priceNotice && (
              <VerseImagePlaceholder
                // On larger screens the verse strip floats over the top of the stage, so the
                // message centres in the space below it
                className="absolute inset-0 sm:pt-20"
                theme="dark"
                action={
                  pricingPending ? (
                    <button
                      type="button"
                      disabled
                      title="Fetching live model pricing..."
                      className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-[var(--radius-full)] bg-[var(--surface)] text-[var(--muted)] border border-[var(--divider)]/70 opacity-80 cursor-not-allowed"
                    >
                      <Loader2 size={18} strokeWidth={2} className="animate-spin" />
                      <span className="text-sm font-medium">Loading pricing...</span>
                    </button>
                  ) : pricingUnavailable ? (
                    <p className="text-sm text-[var(--muted)] px-4 text-center">{pricingUnavailable}</p>
                  ) : canGenerate ? (
                    <div className="flex flex-col items-center gap-2">
                      <button
                        onClick={() => handleManualRegenerate("hero_generate")}
                        className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-[var(--radius-full)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] focus-ring"
                      >
                        <Sparkles size={18} strokeWidth={1.5} />
                        <span className="text-sm font-medium">Generate Image</span>
                      </button>
                      {showCreditsCost && quoteLabel ? <p className="text-xs text-white/70">{quoteLabel}</p> : null}
                    </div>
                  ) : (
                    <button
                      onClick={buyCredits}
                      className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-[var(--radius-full)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] focus-ring"
                    >
                      <Zap size={18} strokeWidth={2} />
                      <span className="text-sm font-medium">Get Credits to Generate</span>
                    </button>
                  )
                }
              />
            )}
          </div>
        )}

        {/* Bottom gradient for the caption - only over a painting */}
        {displayImage?.url ? <div className="hidden sm:block absolute inset-x-0 bottom-0 h-48 md:h-56 bg-gradient-to-t from-[var(--image-stage)]/90 via-[var(--image-stage)]/50 to-transparent pointer-events-none" /> : null}

        {/* Image Browsing Dock - Desktop only, shown when images exist */}
        {totalImages > 0 && (
          <div className="hidden sm:block absolute inset-x-4 md:inset-x-6 bottom-4 z-20">
            <div className="mx-auto w-fit max-w-[calc(100vw-2rem)] md:max-w-[calc(100vw-3rem)]">
              <div className="flex flex-row items-center gap-2 rounded-[var(--radius-lg)] liquid-glass px-2 py-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToNextImage("desktop_dock")}
                    disabled={!canGoNewer}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-full)] text-white/60 hover:text-white hover:bg-white/15 transition-colors duration-[var(--motion-fast)] disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
                    aria-label="Newer image"
                    title="Newer image"
                  >
                    <ChevronLeft size={18} strokeWidth={1.5} />
                  </button>
                  <div className="flex flex-col items-center leading-tight px-2">
                    <span className="text-xs text-white/90">{imageCountLabel}</span>
                    {onToggleOtherStyles && (otherStylesCount > 0 || showingOtherStyles) ? (
                      <button
                        type="button"
                        onClick={onToggleOtherStyles}
                        aria-pressed={showingOtherStyles}
                        className="ml-2 text-xs text-white/70 underline-offset-2 hover:text-white hover:underline focus-ring"
                      >
                        {showingOtherStyles ? `Back to ${artStyleLabel(artStyle)}` : `${otherStylesCount} in other styles`}
                      </button>
                    ) : null}
                  </div>
                  <button
                    onClick={() => goToPrevImage("desktop_dock")}
                    disabled={!canGoOlder}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-full)] text-white/60 hover:text-white hover:bg-white/15 transition-colors duration-[var(--motion-fast)] disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
                    aria-label="Older image"
                    title="Older image"
                  >
                    <ChevronRight size={18} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Phone image navigation: one "‹ Image n of N ›" pill, like the desktop dock. It sits on the
          bottom of the painting, and moves to a row under it while an error or a generation is
          showing, so it never covers Try Again or the progress label. One element whose classes
          change, so keyboard focus survives the move. */}
      {showPhonePager && (
        <div
          className={
            phonePagerBelow
              ? "sm:hidden flex justify-center bg-[var(--image-stage)] py-2"
              : "sm:hidden absolute inset-x-0 bottom-3 z-20 flex justify-center"
          }
        >
          {phonePager}
        </div>
      )}

      {/* Phones: say why generation is off when a saved image is showing (the empty state already says
          it), since the header's model button can be icon-only on the narrowest screens */}
      {showPhonePricingNote ? (
        <p className="sm:hidden px-4 py-2 text-center text-xs text-[var(--muted)]">{pricingUnavailable}</p>
      ) : null}

      {/* Caption over the painting - desktop only; ScriptureReader repeats the verse below only when it is too long for this caption */}
      {caption && displayImage?.url && (
        <figcaption className="hidden sm:block pointer-events-none absolute inset-x-0 sm:bottom-20 md:bottom-24 z-10 px-4 md:px-6">
          <p className="mb-2 text-center text-xs uppercase tracking-[0.2em] text-white/70">
            {book} {chapter}:{verse}
          </p>
          <p ref={captionTextRef} className="mx-auto max-w-4xl line-clamp-3 text-pretty text-center text-2xl md:text-3xl lg:text-4xl font-light text-white/95 [text-shadow:0_1px_12px_rgba(0,0,0,0.45)]">
            &ldquo;{caption}&rdquo;
          </p>
        </figcaption>
      )}

      {/* Fullscreen Image Overlay */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-[60] bg-black flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen image view"
        >
          {/* Top bar */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3">
            <span className="text-sm text-white/80 font-medium">
              {currentReference || ""}
            </span>
            <div className="flex items-center gap-1">
              {/* Phones put verse navigation at the bottom, next to the image controls */}
              <div className="hidden sm:flex items-center gap-1">{fullscreenVerseLinks}</div>
            <button
              onClick={closeFullscreen}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors duration-[var(--motion-fast)]"
              aria-label="Close fullscreen"
            >
              <X size={24} strokeWidth={1.5} />
            </button>
            </div>
          </div>

          {/* Centered content area */}
          <div className="flex-1 relative flex items-center justify-center min-h-0 px-2">

            {/* Centered column: image, verse text, then image navigation.
                It scrolls on short screens so a long verse cannot push the controls out of reach. */}
            <div className="flex flex-col items-center max-w-full max-h-full min-h-0 overflow-y-auto">
              {displayImage?.url ? (
                <div
                  className="relative max-w-full max-h-[70vh] w-full flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--image-stage)]"
                  style={{ touchAction: "pan-y" }}
                  data-testid="hero-swipe-fullscreen"
                  onTouchStart={handleSwipeStart}
                  onTouchEnd={(event) => handleSwipeEnd(event, "fullscreen")}
                  onTouchCancel={resetSwipe}
                >
                  {!isFullscreenImageReady && isGenerating && (
                    <HeroImageLoadingState
                      label={generationPhaseLabel}
                      fullscreen
                      progress={generationProgress}
                    />
                  )}
                  {!isFullscreenImageReady && !isGenerating && !isFullscreenImageError && (
                    <ImageLoadingSkeleton
                      className="absolute inset-0"
                      isLiveRegion
                      label="Loading saved image"
                      theme="dark"
                    />
                  )}
                  {isFullscreenImageError && !isGenerating && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-6 text-center">
                      <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                        <ImageOff size={24} strokeWidth={1.5} className="text-white/70" />
                      </div>
                      <p className="text-sm text-red-300 max-w-md">
                        This saved image could not be loaded.
                      </p>
                      <button
                        onClick={handleFullscreenImageReload}
                        className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-full bg-white text-black hover:bg-white/90 transition-colors duration-[var(--motion-fast)]"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-sm font-medium">Try Again</span>
                      </button>
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={`${displayImage.id || displayImage.url}-${imageRefreshKey}`}
                    src={displayImage.url}
                    alt={alt}
                    className={`relative z-10 max-w-full max-h-[70vh] bg-[var(--image-stage)] object-contain rounded-[var(--radius-md)] transition-opacity duration-[var(--motion-base)] ${
                      isFullscreenImageReady && !isFullscreenImageError ? "opacity-100 visible" : "opacity-0 invisible"
                    }`}
                    onLoad={() => {
                      setIsFullscreenImageReady(true);
                      setIsFullscreenImageError(false);
                    }}
                    onError={() => {
                      setIsFullscreenImageReady(false);
                      setIsFullscreenImageError(true);
                      if (savedDisplayImage?.imageUrl) {
                        trackSavedImageLoadFailed({
                          book,
                          chapter,
                          verse,
                          surface: "fullscreen",
                          imageId: savedDisplayImage.id,
                          imageUrl: savedDisplayImage.imageUrl,
                          tier,
                          hasCredits: credits > 0,
                        });
                      }
                    }}
                  />
                </div>
              ) : isQueryLoading || isGenerating ? (
                <div className="relative h-[70vh] w-full max-w-full">
                  {isGenerating ? (
                    <HeroImageLoadingState
                      label={generationPhaseLabel}
                      fullscreen
                      progress={generationProgress}
                    />
                  ) : (
                    <ImageLoadingSkeleton
                      className="h-full w-full"
                      isLiveRegion
                      label="Loading saved image"
                      theme="dark"
                    />
                  )}
                </div>
              ) : error ? (
                <div className="h-[70vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                    <ImageOff size={24} strokeWidth={1.5} className="text-white/70" />
                  </div>
                  <p className="text-sm text-red-300 max-w-md">{error}</p>
                  <button
                    onClick={() => handleManualRegenerate("fullscreen_retry")}
                    className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-full bg-white text-black hover:bg-white/90 transition-colors duration-[var(--motion-fast)]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-sm font-medium">Try Again</span>
                  </button>
                </div>
              ) : (
                <VerseImagePlaceholder
                  className="h-[70vh] px-6"
                  theme="dark"
                  action={
                    pricingPending ? (
                      <button
                        type="button"
                        disabled
                        title="Fetching live model pricing..."
                        className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-full bg-white/10 text-white/70 border border-white/20 opacity-80 cursor-not-allowed"
                      >
                        <Loader2 size={18} strokeWidth={2} className="animate-spin" />
                        <span className="text-sm font-medium">Loading pricing...</span>
                      </button>
                    ) : pricingUnavailable ? (
                    <p className="text-sm text-[var(--muted)] px-4 text-center">{pricingUnavailable}</p>
                  ) : canGenerate ? (
                      <div className="flex flex-col items-center gap-2">
                        <button
                          onClick={() => handleManualRegenerate("hero_generate")}
                          className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-full bg-white text-black hover:bg-white/90 transition-colors duration-[var(--motion-fast)]"
                        >
                          <Sparkles size={18} strokeWidth={1.5} />
                          <span className="text-sm font-medium">Generate Image</span>
                        </button>
                        {showCreditsCost && (priceNotice ?? quoteLabel) ? <p role={priceNotice ? "status" : undefined} className="text-xs text-white/70">{priceNotice ?? quoteLabel}</p> : null}
                      </div>
                    ) : (
                      <button
                        onClick={buyCredits}
                        className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)]"
                      >
                        <Zap size={18} strokeWidth={2} />
                        <span className="text-sm font-medium">Get Credits to Generate</span>
                      </button>
                    )
                  }
                />
              )}

              {/* Verse text (same order as the gallery lightbox: image, verse, image navigation) */}
              {verseText && (
                <p className="mt-3 text-center text-sm sm:text-base text-white/80 leading-relaxed max-w-2xl px-4">
                  {verseText}
                </p>
              )}

              {/* Image iterator */}
              {totalImages > 1 && (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => goToNextImage("fullscreen")}
                    disabled={!canGoNewer}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 transition-colors duration-[var(--motion-fast)] disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Newer image"
                  >
                    <ChevronLeft size={18} strokeWidth={1.5} />
                  </button>
                  <span className="text-xs text-white/70 px-2 select-none">Image {displayIndex} of {totalImages}</span>
                  {onToggleOtherStyles && (otherStylesCount > 0 || showingOtherStyles) ? (
                    <button
                      type="button"
                      onClick={onToggleOtherStyles}
                      aria-pressed={showingOtherStyles}
                      className="text-xs text-white/70 px-2 underline-offset-2 hover:text-white hover:underline focus-ring"
                    >
                      {showingOtherStyles ? `Back to ${artStyleLabel(artStyle)}` : `${otherStylesCount} in other styles`}
                    </button>
                  ) : null}
                  <button
                    onClick={() => goToPrevImage("fullscreen")}
                    disabled={!canGoOlder}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 transition-colors duration-[var(--motion-fast)] disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Older image"
                  >
                    <ChevronRight size={18} strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Phones: verse navigation along the bottom edge, within reach of the thumb */}
          <div
            className="sm:hidden shrink-0 flex items-center justify-between px-2 pt-2 border-t border-white/10"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          >
            {fullscreenVerseLinks}
          </div>
        </div>
      )}
    </figure>
  );
}
