"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef, type TouchEvent } from "react";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
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
  canAffordImageGeneration,
  DEFAULT_IMAGE_ESTIMATED_CREDITS_COST,
  getEstimatedCreditsCostForResolution,
  isValidAspectRatio,
  type ImageResolution,
} from "@/lib/image-models";
import {
  type GenerationTriggerSource,
  trackImageGenerated,
  trackImageGenerationStarted,
  trackGenerationError,
  trackCreditsInsufficient,
  trackImageBrowsed,
  trackImageFullscreenOpened,
  trackSavedImageLoadFailed,
  trackVerseImagesState,
} from "@/lib/analytics";
import { resolveHasCreditsAfterGeneration } from "@/lib/analytics-event-utils";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf-constants";
import { computeImageGenerationProgress } from "@/lib/image-generation-progress";
import { artStyleLabel, resolveArtStyle, type ArtStyleAvailability } from "@/lib/art-styles";

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
  testament: "old" | "new";
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
  // Create verse ID for Convex query
  const verseId = currentReference ? createVerseId(currentReference) : null;
  const [refreshToken, setRefreshToken] = useState(0);
  const { artStyle } = usePreferences();
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

interface ModelPricing {
  modelId?: string;
  availability?: "available" | "stale" | "unavailable";
  unavailableReason?: string;
  creditsCost: number | null;
  reservationCreditsCost: number | null;
  estimatedCreditsByResolution?: Partial<Record<ImageResolution, number>>;
  etaSeconds: number;
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
  const { imageModel, imageAspectRatio, imageResolution, setImageAspectRatio, setImageResolution, translation, artStyle } = usePreferences();
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

  // Fetch model pricing info
  const [modelPricing, setModelPricing] = useState<ModelPricing>({
    creditsCost: null,
    reservationCreditsCost: null,
    estimatedCreditsByResolution: undefined,
    etaSeconds: 12,
  });
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const [styleAvailability, setStyleAvailability] = useState<ArtStyleAvailability[] | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setPricingLoaded(false);

    // Fetch models to get pricing for current model
    fetch("/api/image-models", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (isCancelled) return;
        if (Array.isArray(data.artStyles)) setStyleAvailability(data.artStyles);
        if (Array.isArray(data.models)) {
          // Set current model pricing
          const current = data.models.find((m: { id: string }) => m.id === imageModel);
          if (current) {
            setModelPricing({
              modelId: imageModel,
              availability: current.availability,
              unavailableReason: current.unavailableReason,
              creditsCost: current.creditsCost,
              reservationCreditsCost: current.reservationCreditsCost ?? null,
              estimatedCreditsByResolution: current.estimatedCreditsByResolution,
              etaSeconds: current.etaSeconds ?? 12,
            });
          } else {
            setModelPricing({ modelId: imageModel, creditsCost: null, reservationCreditsCost: null, etaSeconds: 12, availability: "unavailable", unavailableReason: "Saved model unavailable. Choose another model." });
          }
        } else {
          throw new Error("Invalid image catalog");
        }
      })
      .catch(() => {
        if (!isCancelled) setModelPricing({ modelId: imageModel, creditsCost: null, reservationCreditsCost: null, etaSeconds: 12, availability: "unavailable", unavailableReason: "Image pricing unavailable. Reopen the reader to retry." });
      })
      .finally(() => {
        if (!isCancelled) {
          setPricingLoaded(true);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [imageModel]);

  // Determine if user can generate (has sufficient credits or is admin)
  const baseCost = modelPricing.creditsCost ?? DEFAULT_IMAGE_ESTIMATED_CREDITS_COST;
  const effectiveCost =
    getEstimatedCreditsCostForResolution(
      {
        id: imageModel,
        creditsCost: modelPricing.creditsCost,
        reservationCreditsCost: modelPricing.reservationCreditsCost,
        estimatedCreditsByResolution: modelPricing.estimatedCreditsByResolution,
      },
      imageResolution
    ) ?? DEFAULT_IMAGE_ESTIMATED_CREDITS_COST;
  const displayBaseCost =
    modelPricing.estimatedCreditsByResolution?.["1K"] ??
    getEstimatedCreditsCostForResolution(
      {
        id: imageModel,
        creditsCost: modelPricing.creditsCost,
        reservationCreditsCost: modelPricing.reservationCreditsCost,
        estimatedCreditsByResolution: modelPricing.estimatedCreditsByResolution,
      },
      "1K"
    ) ??
    DEFAULT_IMAGE_ESTIMATED_CREDITS_COST;
  const displayCostByResolution = modelPricing.estimatedCreditsByResolution;
  const effectiveEta = modelPricing.etaSeconds;
  const isAdmin = tier === "admin";
  const pricingAvailable = pricingLoaded && modelPricing.modelId === imageModel && modelPricing.creditsCost !== null && modelPricing.availability !== "unavailable";
  const pricingPending = isConvexEnabled && (!pricingLoaded || modelPricing.modelId !== imageModel);
  // An offered style the server is not admitting (rollback) disables generation in it; it is never swapped for Classical.
  const resolvedStyle = resolveArtStyle(artStyle, styleAvailability);
  const styleAvailable = resolvedStyle.available !== false;
  const pricingUnavailable = pricingLoaded && !pricingPending && !pricingAvailable
    ? modelPricing.unavailableReason ?? "Image pricing is unavailable right now. Please try again shortly."
    : pricingLoaded && !pricingPending && !styleAvailable
      ? `${artStyleLabel(artStyle)} is temporarily unavailable for new images. Saved images stay available; choose another style to generate.`
      : undefined;
  const canGenerate = pricingAvailable && styleAvailable && (isAdmin ||
    (tier === "paid" && canAffordImageGeneration(credits, effectiveCost)));
  const canAutoGenerate = pricingAvailable && styleAvailable && (isAdmin || (tier === "paid" && credits >= effectiveCost));
  const showCreditsCost = isConvexEnabled && !isAdmin && pricingAvailable;

  // Create verse ID for Convex query
  const verseId = currentReference ? createVerseId(currentReference) : null;

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isDisplayImageReady, setIsDisplayImageReady] = useState(false);
  const [isFullscreenImageReady, setIsFullscreenImageReady] = useState(false);
  const [isFullscreenImageError, setIsFullscreenImageError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedGeneration, setHasAttemptedGeneration] = useState(false);
  const [imageLoadAttempts, setImageLoadAttempts] = useState(0);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [followingRequest, setFollowingRequest] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const isMounted = useRef(true);
  const lastDisplayImageKeyRef = useRef<string | null>(null);
  const generationIdRef = useRef(0);
  const generationStartedAtRef = useRef<number | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  const handleManualRegenerateRef = useRef<((source?: GenerationTriggerSource) => void) | null>(null);
  const trackedImageIdsRef = useRef<Set<Id<"verseImages">>>(new Set());

  const { isAuthenticated } = useConvexAuth();
  const generationRequestStatus = useQuery(
    api.verseImages.getGenerationRequestStatus,
    isAuthenticated && activeRequestId ? { requestId: activeRequestId } : "skip"
  );
  const recordImageImpression = useMutation(
    api.verseImages.recordImageImpression
  );

  const generationPhaseLabel = generationRequestStatus?.status === "generating"
    ? "Generating image..."
    : "Generating...";

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
  const phonePagerBelow = isGenerating || Boolean(error) || showPhonePricingNote;

  useEffect(() => {
    const nextSelectedImageId = requestedImageId && requestedImageId.length > 0
      ? requestedImageId
      : null;

    setSelectedImageId(nextSelectedImageId);
    setError(null);
    setImageLoadAttempts(0);
    pendingFollowLatest.current = nextSelectedImageId === null;
  }, [requestedImageId, verseId]);

  useEffect(() => {
    if (!isGenerating) {
      generationStartedAtRef.current = null;
      setGenerationProgress(0);
      return;
    }

    if (generationStartedAtRef.current === null) {
      generationStartedAtRef.current = Date.now();
    }

    const updateProgress = () => {
      const startedAt = generationStartedAtRef.current;
      if (startedAt === null) return;

      setGenerationProgress(
        computeImageGenerationProgress(Date.now() - startedAt, effectiveEta)
      );
    };

    updateProgress();
    const intervalId = window.setInterval(updateProgress, 200);

    return () => window.clearInterval(intervalId);
  }, [isGenerating, effectiveEta]);

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

  // Generate new image function
  const generateImage = useCallback(async (source: GenerationTriggerSource = "hero_generate") => {
    if (!verseId || !currentReference) return;

    if (activeRequest.current) {
      activeRequest.current.abort();
    }

    const controller = new AbortController();
    activeRequest.current = controller;

    // Track this generation with a unique ID
    const thisGenerationId = ++generationIdRef.current;

    pendingFollowLatest.current = selectedImageId === null;
    setIsGenerating(true);
    setFollowingRequest(false);
    setError(null);
    setPendingImageId(null);
    setImageLoadAttempts(0);

    // Check if this generation is still current (defined outside try for use in catch)
    const isStale = () => controller.signal.aborted || !isMounted.current || thisGenerationId !== generationIdRef.current;

    const clientRequestId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setActiveRequestId(clientRequestId);
    let followExistingRequest = false;

    try {
      const csrfCookiePrefix = `${CSRF_COOKIE_NAME}=`;
      const csrfToken = document.cookie
        .split("; ")
        .find((row) => row.startsWith(csrfCookiePrefix))
        ?.slice(csrfCookiePrefix.length);

      const payload: Record<string, unknown> = {
        reference: currentReference,
        model: imageModel,
        translation,
        aspectRatio: imageAspectRatio,
        resolution: imageResolution,
        style: artStyle,
        requestId: clientRequestId,
      };

      // Pass the selected style's image count to add generation diversity
      const existingImageCount = selectedStyleImageCount ?? imageHistory?.length ?? 0;
      const generationNumber = existingImageCount + 1;
      if (existingImageCount > 0) {
        payload.generation = generationNumber;
      }

      if (!csrfToken) {
        if (isMounted.current) {
          setActiveRequestId(null);
          setError("Security check failed. Please refresh the page and try again.");
          trackGenerationError({
            imageModel,
            artStyle,
            errorType: "csrf_missing",
            source,
            tier,
            hasCredits: credits > 0,
          });
        }
        return;
      }

      trackImageGenerationStarted({
        imageModel: imageModel || "unknown",
        aspectRatio: imageAspectRatio,
        resolution: imageResolution,
        artStyle,
        generationNumber,
        source,
        tier,
        hasCredits: credits > 0,
      });

      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (isStale()) {
        return;
      }

      if (response.status === 403) {
        let errorMessage = "Request blocked. Please refresh the page and try again.";
        let errorType = "forbidden";
        try {
          const responseData = await response.json() as {
            error?: string;
            message?: string;
          };
          const combinedMessage =
            `${responseData.error || ""} ${responseData.message || ""}`.toLowerCase();
          if (combinedMessage.includes("csrf")) {
            errorMessage = "Security check failed. Please refresh the page and try again.";
            errorType = "csrf_failed";
          } else if (combinedMessage.includes("disabled")) {
            errorMessage = "Image generation is disabled";
            errorType = "disabled";
          }
        } catch {
          // Keep the generic forbidden message when error JSON is unavailable.
        }

        if (isMounted.current) {
          setActiveRequestId(null);
          setError(errorMessage);
          trackGenerationError({
            imageModel,
            artStyle,
            errorType,
            source,
            tier,
            hasCredits: credits > 0,
          });
        }
        return;
      }

      if (response.status === 401) {
        if (isMounted.current) {
          setActiveRequestId(null);
          setError("Session required - please refresh the page");
          trackGenerationError({
            imageModel,
            artStyle,
            errorType: "unauthorized",
            source,
            tier,
            hasCredits: credits > 0,
          });
        }
        return;
      }

      if (response.status === 402) {
        // Insufficient credits
        if (isMounted.current) {
          setActiveRequestId(null);
          setError("Insufficient credits");
          trackCreditsInsufficient({
            feature: "image",
            source,
            requiredCredits: effectiveCost,
            tier,
            hasCredits: credits > 0,
          });
        }
        return;
      }

      const data = await response.json();

      if (isStale()) {
        return;
      }

      if (typeof data?.requestId === "string") {
        setActiveRequestId(data.requestId);
      }

      if (!response.ok) {
        // A retryable refusal (a scene still preparing, a style not admitted) carries its own explanation.
        const retryableDetail = response.status === 503 && data?.retryable && typeof data?.message === "string" ? data.message : null;
        throw new Error(retryableDetail ? `${data?.error || "Preparing scene"}: ${retryableDetail}` : data?.error || "Failed to generate image");
      }

      if (response.status === 202 && data?.reused) {
        followExistingRequest = true;
        setFollowingRequest(true);
        return;
      }

      if (data?.imageUrl) {
        const modelUsed = data.model || imageModel || "unknown";

        if (isStale()) {
          return;
        }

        const savedImageId =
          typeof data.savedImageId === "string" ? data.savedImageId : null;
        if (savedImageId) {
          setPendingImageId(savedImageId);
        }

        if (isStale()) {
          return;
        }

        // Track successful image generation (fires regardless of Convex persistence)
        const hasCreditsAfterGeneration = resolveHasCreditsAfterGeneration({
          returnedCredits: data.credits,
          currentCredits: credits,
        });
        trackImageGenerated({
          imageModel: modelUsed,
          aspectRatio: data.aspectRatio || imageAspectRatio,
          resolution: imageResolution,
          artStyle: typeof data.style === "string" ? data.style : artStyle,
          generationNumber: data.generationNumber || generationNumber,
          source,
          durationMs: data.durationMs,
          tier,
          hasCredits: hasCreditsAfterGeneration,
        });

        if (!savedImageId) {
          // No Convex persistence; show the generated URL immediately.
          setGeneratedImage({
            url: data.imageUrl,
            model: modelUsed,
          });
        }
      } else {
        throw new Error("Missing image URL");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (isMounted.current) {
          setActiveRequestId(null);
        }
        return;
      }
      if (isStale()) {
        return;
      }
      const errorMessage = err instanceof Error ? err.message : "Failed to generate image";
      setError(errorMessage);
      console.error("Image generation error:", err);
      // Sanitize error type for analytics (avoid leaking sensitive details)
      const errorType =
        err instanceof TypeError ? "network_error" :
        errorMessage.includes("Missing image URL") ? "missing_url" :
        errorMessage.includes("timed out") ? "timeout" :
        "generation_failed";
      trackGenerationError({
        imageModel,
        artStyle,
        errorType,
        source,
        tier,
        hasCredits: credits > 0,
      });
    } finally {
      // Always clean up if this is still the current generation
      if (thisGenerationId === generationIdRef.current) {
        activeRequest.current = null;
        if (isMounted.current && !followExistingRequest) {
          setActiveRequestId(null);
          setIsGenerating(false);
        }
      }
    }
  }, [
    verseId,
    currentReference,
    artStyle,
    selectedStyleImageCount,
    imageModel,
    imageAspectRatio,
    imageResolution,
    translation,
    selectedImageId,
    imageHistory,
    tier,
    credits,
    effectiveCost,
  ]);

  // Manual regenerate function - resets load attempts and queues a new image
  const handleManualRegenerate = useCallback((source: GenerationTriggerSource = "hero_retry") => {
    if (pricingPending || pricingUnavailable) return;
    setImageLoadAttempts(0);
    setError(null);
    setGeneratedImage(null);
    setPendingImageId(null);
    generateImage(source);
  }, [generateImage, pricingPending, pricingUnavailable]);

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
  }, [onRefreshImages, handleManualRegenerate]);

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
  }, [selectedImageId, imageHistory, book, chapter, verse, tier, credits]);

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
  }, [selectedImageId, imageHistory, book, chapter, verse, tier, credits]);

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

  // Auto-generate on first visit only when the user can strictly cover the estimate.
  // The spend-down grace is reserved for explicit generate actions.
  useEffect(() => {
    // Only auto-generate if:
    // 1. Convex query has loaded (imageHistory is not undefined)
    // 2. No existing images found (empty array)
    // 3. Not already generating
    // 4. Haven't already attempted generation for this verse
    // 5. User has sufficient credits (paid tier)
    // 6. Session has loaded
    const selectedStyleEmpty = selectedStyleImageCount !== undefined ? selectedStyleImageCount === 0 : imageHistory !== undefined && imageHistory.length === 0;
    if (
      imageHistory !== undefined &&
      selectedStyleEmpty &&
      !showingOtherStyles &&
      !isGenerating &&
      !hasAttemptedGeneration &&
      verseId &&
      canAutoGenerate &&
      !sessionLoading
    ) {
      setHasAttemptedGeneration(true);
      pendingFollowLatest.current = true;
      generateImage("auto_generate");
    }
  }, [imageHistory, selectedStyleImageCount, showingOtherStyles, isGenerating, hasAttemptedGeneration, verseId, generateImage, canAutoGenerate, sessionLoading]);

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

  useEffect(() => {
    if (!activeRequestId) return;
    if (
      generationRequestStatus?.status === "succeeded" ||
      generationRequestStatus?.status === "failed"
    ) {
      setActiveRequestId(null);
      if (followingRequest) {
        setIsGenerating(false);
        setFollowingRequest(false);
        if (generationRequestStatus.status === "failed") {
          setError(generationRequestStatus.error || "The original generation failed");
        }
      }
    }
  }, [activeRequestId, generationRequestStatus?.status, generationRequestStatus?.error, followingRequest]);

  // Reset state when verse changes
  useEffect(() => {
    setSelectedImageId(null);
    setGeneratedImage(null);
    setError(null);
    setHasAttemptedGeneration(false);
    setImageLoadAttempts(0);
    setPendingImageId(null);
    setActiveRequestId(null);
    setIsGenerating(false);
    setFollowingRequest(false);
    setIsImageLoading(false);
    pendingFollowLatest.current = true;
    if (activeRequest.current) {
      activeRequest.current.abort();
    }
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
  }, [displayImage?.id, displayImage?.url, verseId]);

  useEffect(() => {
    if (!isFullscreen || !displayImage?.url) {
      setIsFullscreenImageReady(false);
      setIsFullscreenImageError(false);
      return;
    }
    setIsFullscreenImageReady(false);
    setIsFullscreenImageError(false);
  }, [displayImage?.id, displayImage?.url, isFullscreen]);

  useEffect(() => {
    // Ensure isMounted is reset correctly in React Strict Mode (dev double-invokes effects)
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (activeRequest.current) {
        activeRequest.current.abort();
      }
    };
  }, []);

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
  const fullscreenVerseLinks = (
    <>
      {prevUrl ? (
        <Link href={prevUrl} className={fullscreenVerseLinkClass} aria-label="Previous verse">
          <ChevronLeft size={18} strokeWidth={1.5} />
          <span>Previous verse</span>
        </Link>
      ) : (
        <span className={`${fullscreenVerseLinkClass} opacity-40 sm:hidden`} aria-hidden="true">
          <ChevronLeft size={18} strokeWidth={1.5} />
          <span>Previous verse</span>
        </span>
      )}
      {nextUrl ? (
        <Link href={nextUrl} className={fullscreenVerseLinkClass} aria-label="Next verse">
          <span>Next verse</span>
          <ChevronRight size={18} strokeWidth={1.5} />
        </Link>
      ) : (
        <span className={`${fullscreenVerseLinkClass} opacity-40 sm:hidden`} aria-hidden="true">
          <span>Next verse</span>
          <ChevronRight size={18} strokeWidth={1.5} />
        </span>
      )}
    </>
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

            {/* Empty state - no image yet */}
            {!isQueryLoading && !isGenerating && !error && (
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
                    <button
                      onClick={() => handleManualRegenerate("hero_generate")}
                      className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-[var(--radius-full)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] focus-ring"
                    >
                      <Sparkles size={18} strokeWidth={1.5} />
                      <span className="text-sm font-medium">Generate Image</span>
                    </button>
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
                      <button
                        onClick={() => handleManualRegenerate("hero_generate")}
                        className="min-h-[44px] px-5 inline-flex items-center gap-2 rounded-full bg-white text-black hover:bg-white/90 transition-colors duration-[var(--motion-fast)]"
                      >
                        <Sparkles size={18} strokeWidth={1.5} />
                        <span className="text-sm font-medium">Generate Image</span>
                      </button>
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
