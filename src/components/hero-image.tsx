"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";
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
  computeAdjustedCreditsCost,
  DEFAULT_IMAGE_ESTIMATED_CREDITS_COST,
  isValidAspectRatio,
} from "@/lib/image-models";
import {
  trackImageGenerated,
  trackImageGenerationStarted,
  trackGenerationError,
  trackCreditsInsufficient,
  trackVerseImagesState,
} from "@/lib/analytics";
import { resolveHasCreditsAfterGeneration } from "@/lib/analytics-event-utils";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf-constants";
import { computeImageGenerationProgress } from "@/lib/image-generation-progress";

interface ChapterTheme {
  setting: string;
  palette: string;
  elements: string;
  style: string;
}

interface VerseContext {
  number: number;
  text: string;
  reference?: string;
}

interface ScenePlan {
  primarySubject: string;
  action: string;
  setting: string;
  secondaryElements?: string;
  mood?: string;
  timeOfDay?: string;
  composition?: string;
}

interface PromptInputs {
  reference?: string;
  aspectRatio?: string;
  styleProfileId?: string;
  scenePlan?: ScenePlan;
  generationNumber?: number;
  prevVerse?: VerseContext;
  nextVerse?: VerseContext;
}

interface HeroImageProps {
  alt?: string;
  caption?: string;
  verseText?: string;
  chapterTheme?: ChapterTheme;
  prevUrl?: string;
  nextUrl?: string;
  prevVerse?: VerseContext;
  nextVerse?: VerseContext;
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

export function HeroImage({
  alt = "Scripture illustration",
  caption = "In the beginning",
  verseText,
  chapterTheme,
  prevUrl,
  nextUrl,
  prevVerse,
  nextVerse,
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
        chapterTheme={chapterTheme}
        prevUrl={prevUrl}
        nextUrl={nextUrl}
        prevVerse={prevVerse}
        nextVerse={nextVerse}
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
      chapterTheme={chapterTheme}
      prevUrl={prevUrl}
      nextUrl={nextUrl}
      prevVerse={prevVerse}
      nextVerse={nextVerse}
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
  chapterTheme?: ChapterTheme;
  generationNumber?: number;
  promptVersion?: string;
  promptInputs?: PromptInputs;
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
  chapterTheme,
  prevUrl,
  nextUrl,
  prevVerse,
  nextVerse,
  currentReference,
  book,
  chapter,
  verse,
  testament,
}: HeroImageProps) {
  // Create verse ID for Convex query
  const verseId = currentReference ? createVerseId(currentReference) : null;
  const [refreshToken, setRefreshToken] = useState(0);

  // Query Convex for all images for this verse (sorted newest first)
  const imageHistory = useQuery(
    api.verseImages.getImageHistory,
    verseId ? { verseId, refreshToken } : "skip"
  );

  const refreshImages = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  const isQueryLoading = imageHistory === undefined && verseId !== null;

  return (
    <HeroImageBase
      alt={alt}
      caption={caption}
      verseText={verseText}
      chapterTheme={chapterTheme}
      prevUrl={prevUrl}
      nextUrl={nextUrl}
      prevVerse={prevVerse}
      nextVerse={nextVerse}
      currentReference={currentReference}
      book={book}
      chapter={chapter}
      verse={verse}
      testament={testament}
      imageHistory={imageHistory}
      isQueryLoading={isQueryLoading}
      imageRefreshKey={refreshToken}
      onRefreshImages={refreshImages}
    />
  );
}

interface ModelPricing {
  creditsCost: number | null;
  etaSeconds: number;
}

function HeroImageBase({
  alt = "Scripture illustration",
  caption = "In the beginning",
  verseText,
  chapterTheme,
  prevUrl,
  nextUrl,
  prevVerse,
  nextVerse,
  currentReference,
  book,
  chapter,
  verse,
  testament,
  imageHistory,
  isQueryLoading,
  imageRefreshKey = 0,
  onRefreshImages,
}: HeroImageBaseProps) {
  const { imageModel, imageAspectRatio, imageResolution, setImageAspectRatio, setImageResolution, translation } = usePreferences();
  const isConvexEnabled = useConvexEnabled();
  const { tier, credits, buyCredits, updateCredits, isLoading: sessionLoading } = useSession();
  const { setCurrentImageId, isFullscreen, openFullscreen, closeFullscreen } = useNavigation();
  const router = useRouter();
  const {
    registerGenerate,
    unregisterGenerate,
    updateState: updateGenerationState,
    registerBuyCredits,
    registerSettings,
  } = useGeneration();

  // Fetch model pricing info
  const [modelPricing, setModelPricing] = useState<ModelPricing>({ creditsCost: null, etaSeconds: 12 });
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const modelPricingCache = useRef<Map<string, ModelPricing>>(new Map());

  useEffect(() => {
    let isCancelled = false;
    setPricingLoaded(false);

    // Check cache first
    const cached = modelPricingCache.current.get(imageModel);
    if (cached) {
      setModelPricing(cached);
      setPricingLoaded(true);
      return;
    }

    // Fetch models to get pricing for current model
    fetch("/api/image-models")
      .then((res) => res.json())
      .then((data) => {
        if (data.models) {
          // Cache all models
          for (const model of data.models) {
            modelPricingCache.current.set(model.id, {
              creditsCost: model.creditsCost,
              etaSeconds: model.etaSeconds ?? 12,
            });
          }
          // Set current model pricing
          const current = data.models.find((m: { id: string }) => m.id === imageModel);
          if (current) {
            setModelPricing({
              creditsCost: current.creditsCost,
              etaSeconds: current.etaSeconds ?? 12,
            });
          }
        }
      })
      .catch(() => {
        // Keep defaults on error
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
  const effectiveCost = computeAdjustedCreditsCost(baseCost, imageResolution, imageModel);
  const effectiveEta = modelPricing.etaSeconds;
  const isAdmin = tier === "admin";
  const pricingPending = isConvexEnabled && !isAdmin && !pricingLoaded;
  const canGenerate =
    !isConvexEnabled ||
    isAdmin ||
    (pricingLoaded &&
      tier === "paid" &&
      canAffordImageGeneration(credits, effectiveCost));
  const canAutoGenerate =
    !isConvexEnabled ||
    isAdmin ||
    (pricingLoaded && tier === "paid" && credits >= effectiveCost);
  const showCreditsCost = isConvexEnabled && !isAdmin && pricingLoaded;

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
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedGeneration, setHasAttemptedGeneration] = useState(false);
  const [imageLoadAttempts, setImageLoadAttempts] = useState(0);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const isMounted = useRef(true);
  const lastDisplayImageKeyRef = useRef<string | null>(null);
  const generationIdRef = useRef(0);
  const generationStartedAtRef = useRef<number | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const handleManualRegenerateRef = useRef<(() => void) | null>(null);
  const trackedImageIdsRef = useRef<Set<Id<"verseImages">>>(new Set());

  const generationRequestStatus = useQuery(
    api.verseImages.getGenerationRequestStatus,
    activeRequestId ? { requestId: activeRequestId } : "skip"
  );
  const recordImageImpression = useMutation(
    api.verseImages.recordImageImpression
  );

  const generationPhaseLabel = generationRequestStatus?.status === "planning"
    ? "Planning scene..."
    : generationRequestStatus?.status === "generating"
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

  const hasImages = Boolean(displayImage) || totalImages > 0;
  const canGoOlder = totalImages > 0 && currentIndex < totalImages - 1;
  const canGoNewer = totalImages > 0 && currentIndex > 0;
  const displayIndex = totalImages - currentIndex;
  const imageCountLabel = totalImages > 0
    ? `${displayIndex} / ${totalImages}${currentIndex === 0 ? " · Latest" : ""}`
      : displayImage
      ? "1 / 1"
      : isQueryLoading
        ? "Loading..."
        : isGenerating
          ? generationPhaseLabel
          : "No images yet";
  const showControls = Boolean(hasImages || isGenerating || isQueryLoading || canGenerate || !pricingPending);

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

  // Sync current image ID to navigation context for ScriptureDetails
  useEffect(() => {
    setCurrentImageId(currentImage?.id || null);
  }, [currentImage?.id, setCurrentImageId]);

  useEffect(() => {
    if (!currentImage?.id) return;
    if (trackedImageIdsRef.current.has(currentImage.id)) return;

    trackedImageIdsRef.current.add(currentImage.id);

    void recordImageImpression({ imageId: currentImage.id }).catch((error) => {
      trackedImageIdsRef.current.delete(currentImage.id);
      console.error("Failed to record image impression:", error);
    });
  }, [currentImage?.id, recordImageImpression]);

  // Generate new image function
  const generateImage = useCallback(async () => {
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
    setError(null);
    setPendingImageId(null);
    setImageLoadAttempts(0);

    // Check if this generation is still current (defined outside try for use in catch)
    const isStale = () => controller.signal.aborted || !isMounted.current || thisGenerationId !== generationIdRef.current;

    const clientRequestId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setActiveRequestId(clientRequestId);

    try {
      const csrfCookiePrefix = `${CSRF_COOKIE_NAME}=`;
      const csrfToken = document.cookie
        .split("; ")
        .find((row) => row.startsWith(csrfCookiePrefix))
        ?.slice(csrfCookiePrefix.length);

      const payload: Record<string, unknown> = {
        text: verseText,
        theme: chapterTheme,
        prevVerse,
        nextVerse,
        reference: currentReference,
        model: imageModel,
        translation,
        aspectRatio: imageAspectRatio,
        resolution: imageResolution,
        requestId: clientRequestId,
      };

      // Pass existing image count to add generation diversity
      const existingImageCount = imageHistory?.length || 0;
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
            errorType: "csrf_missing",
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
        generationNumber,
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
            errorType,
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
            errorType: "unauthorized",
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
        throw new Error(data?.error || "Failed to generate image");
      }

      if (data?.imageUrl) {
        const modelUsed = data.model || imageModel || "unknown";

        // Update credits in session context if returned
        if (typeof data.credits === "number") {
          updateCredits(data.credits);
        }

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
          generationNumber: data.generationNumber || generationNumber,
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
        errorType,
        tier,
        hasCredits: credits > 0,
      });
    } finally {
      // Always clean up if this is still the current generation
      if (thisGenerationId === generationIdRef.current) {
        activeRequest.current = null;
        if (isMounted.current) {
          setActiveRequestId(null);
          setIsGenerating(false);
        }
      }
    }
  }, [
    verseId,
    verseText,
    chapterTheme,
    prevVerse,
    nextVerse,
    currentReference,
    imageModel,
    imageAspectRatio,
    imageResolution,
    translation,
    selectedImageId,
    imageHistory,
    updateCredits,
    tier,
    credits,
    effectiveCost,
  ]);

  // Manual regenerate function - resets load attempts and queues a new image
  const handleManualRegenerate = useCallback(() => {
    setImageLoadAttempts(0);
    setError(null);
    setGeneratedImage(null);
    setPendingImageId(null);
    generateImage();
  }, [generateImage]);

  useEffect(() => {
    handleManualRegenerateRef.current = handleManualRegenerate;
  }, [handleManualRegenerate]);

  const handleImageReload = useCallback(() => {
    if (onRefreshImages) {
      setError(null);
      setIsImageLoading(true);
      setImageLoadAttempts(0);
      onRefreshImages();
      return;
    }
    handleManualRegenerate();
  }, [onRefreshImages, handleManualRegenerate]);

  // Register generation callback with context so header can trigger it
  useEffect(() => {
    registerGenerate(() => {
      handleManualRegenerateRef.current?.();
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
      effectiveCost,
      effectiveEta,
      showCreditsCost,
      generationPhaseLabel,
      aspectRatio: imageAspectRatio,
      resolution: imageResolution,
      baseCost,
      modelId: imageModel,
    });
  }, [
    canGenerate,
    isGenerating,
    pricingPending,
    effectiveCost,
    effectiveEta,
    showCreditsCost,
    generationPhaseLabel,
    imageAspectRatio,
    imageResolution,
    baseCost,
    imageModel,
    updateGenerationState,
  ]);

  // Image navigation functions
  const goToPrevImage = useCallback(() => {
    if (!imageHistory || imageHistory.length === 0) return;
    const idx = selectedImageId
      ? imageHistory.findIndex((img) => img.id === selectedImageId)
      : 0;
    const currentIdx = idx >= 0 ? idx : 0;
    if (currentIdx < imageHistory.length - 1) {
      setSelectedImageId(imageHistory[currentIdx + 1].id); // Older image
      setError(null);
      setImageLoadAttempts(0);
    }
  }, [selectedImageId, imageHistory]);

  const goToNextImage = useCallback(() => {
    if (!imageHistory || imageHistory.length === 0) return;
    const idx = selectedImageId
      ? imageHistory.findIndex((img) => img.id === selectedImageId)
      : 0;
    const currentIdx = idx >= 0 ? idx : 0;
    if (currentIdx > 0) {
      setSelectedImageId(imageHistory[currentIdx - 1].id); // Newer image
      setError(null);
      setImageLoadAttempts(0);
    }
  }, [selectedImageId, imageHistory]);

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
    if (
      imageHistory !== undefined &&
      imageHistory.length === 0 &&
      !isGenerating &&
      !hasAttemptedGeneration &&
      verseId &&
      canAutoGenerate &&
      !sessionLoading
    ) {
      setHasAttemptedGeneration(true);
      pendingFollowLatest.current = true;
      generateImage();
    }
  }, [imageHistory, isGenerating, hasAttemptedGeneration, verseId, generateImage, canAutoGenerate, sessionLoading]);

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
    }
  }, [activeRequestId, generationRequestStatus?.status]);

  // Reset state when verse changes
  useEffect(() => {
    setSelectedImageId(null);
    setGeneratedImage(null);
    setError(null);
    setHasAttemptedGeneration(false);
    setImageLoadAttempts(0);
    setPendingImageId(null);
    setActiveRequestId(null);
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
      return;
    }
    setIsFullscreenImageReady(false);
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

  return (
    <figure className="relative w-full">
      {/* Image Container - taller 4:5 on mobile, user-selected ratio on desktop */}
      <div
        className="relative w-full overflow-hidden bg-[var(--image-stage)] aspect-[4/5] sm:[aspect-ratio:var(--ar)]"
        style={{ "--ar": containerAspectRatioCss } as React.CSSProperties}
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
                label="Loading saved image"
              />
            )}

            {error && !isGenerating && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--image-stage)]/70 backdrop-blur-sm">
                <div className="text-red-500 text-sm px-4 text-center">{error}</div>
                <button
                  onClick={handleImageReload}
                  className="min-h-[44px] px-4 flex items-center gap-2 text-sm bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] focus-ring"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            )}

            {/* Fullscreen toggle button - mobile only (desktop uses VerseStripBar) */}
            <button
              onClick={openFullscreen}
              className="sm:hidden absolute top-3 z-20 right-4 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full bg-[var(--surface)]/90 border border-[var(--divider)] text-[var(--foreground)] hover:bg-[var(--divider)]/50 hover:text-[var(--foreground)] active:scale-95 transition-all duration-[var(--motion-fast)] cursor-pointer focus-ring"
              aria-label="View fullscreen"
            >
              <Maximize2 size={20} strokeWidth={1.5} />
            </button>
          </>
        ) : (
          /* Placeholder with skeleton loader */
          <div className="absolute inset-0 bg-[var(--surface)]">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--background)]/80 via-[var(--surface)] to-[var(--surface)]" />

            {isGenerating && !error && (
              <HeroImageLoadingState
                label={generationPhaseLabel}
                progress={generationProgress}
              />
            )}

            {isQueryLoading && !isGenerating && !error && (
              <ImageLoadingSkeleton
                className="absolute inset-0"
                label="Loading saved image"
              />
            )}

            {/* Error state */}
            {error && !isGenerating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="text-red-500 text-sm px-4 text-center">{error}</div>
                <button
                  onClick={handleManualRegenerate}
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
                className="absolute inset-0"
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
                  ) : canGenerate ? (
                    <button
                      onClick={handleManualRegenerate}
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

        {/* Bottom gradient for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-36 md:h-44 bg-gradient-to-t from-[var(--background)]/90 via-[var(--background)]/40 to-transparent pointer-events-none" />

        {/* Image Browsing Dock - Desktop only, shown when images exist */}
        {totalImages > 0 && (
          <div className="hidden sm:block absolute inset-x-4 md:inset-x-6 bottom-4 z-20">
            <div className="mx-auto w-fit max-w-[calc(100vw-2rem)] md:max-w-[calc(100vw-3rem)]">
              <div className="flex flex-row items-center gap-2 rounded-[var(--radius-lg)] liquid-glass px-2 py-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToNextImage}
                    disabled={!canGoNewer}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-full)] text-white/60 hover:text-white hover:bg-white/15 transition-colors duration-[var(--motion-fast)] disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
                    aria-label="Newer image"
                    title="Newer image"
                  >
                    <ChevronLeft size={18} strokeWidth={1.5} />
                  </button>
                  <div className="flex flex-col items-center leading-tight px-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Images</span>
                    <span className="text-xs text-white/90">{imageCountLabel}</span>
                  </div>
                  <button
                    onClick={goToPrevImage}
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

        {/* Mobile inline image navigation - visible directly on image */}
        {showControls && totalImages > 1 && (
          <div className="sm:hidden">
            {/* Left arrow - newer image */}
            <button
              onClick={goToNextImage}
              disabled={!canGoNewer}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-[var(--surface)]/70 backdrop-blur-sm border border-[var(--divider)]/60 text-[var(--foreground)] disabled:opacity-30 active:scale-95 transition-all"
              aria-label="Newer image"
            >
              <ChevronLeft size={22} strokeWidth={1.5} />
            </button>

            {/* Right arrow - older image */}
            <button
              onClick={goToPrevImage}
              disabled={!canGoOlder}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-[var(--surface)]/70 backdrop-blur-sm border border-[var(--divider)]/60 text-[var(--foreground)] disabled:opacity-30 active:scale-95 transition-all"
              aria-label="Older image"
            >
              <ChevronRight size={22} strokeWidth={1.5} />
            </button>

            {/* Counter pill */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-[var(--surface)]/70 backdrop-blur-sm border border-[var(--divider)]/60 text-xs text-[var(--foreground)]">
              {displayIndex} / {totalImages}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Verse Text Overlay - positioned at bottom of image */}
      {verseText && (
        <div className="sm:hidden absolute inset-x-0 bottom-0 z-10 px-4 pb-4">
          <div className="bg-[var(--background)]/50 backdrop-blur-sm rounded-2xl p-4 mx-auto max-w-lg border border-[rgba(255,255,255,0.04)]">
            <p className="text-pretty text-center text-base leading-relaxed text-[var(--foreground)]">
              {verseText}
            </p>
          </div>
        </div>
      )}

      {/* Caption - hidden on mobile (redundant with ScriptureReader below) */}
      {caption && (
        <figcaption className="hidden sm:block pointer-events-none absolute inset-x-0 sm:bottom-20 md:bottom-24 z-10 px-4 md:px-6">
          <p className="text-center text-2xl md:text-3xl lg:text-4xl font-light italic text-[var(--foreground)]/90">
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
            <button
              onClick={closeFullscreen}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors duration-[var(--motion-fast)]"
              aria-label="Close fullscreen"
            >
              <X size={24} strokeWidth={1.5} />
            </button>
          </div>

          {/* Centered content area */}
          <div className="flex-1 relative flex items-center justify-center min-h-0 px-2">
            {/* Previous verse */}
            {prevUrl && (
              <button
                onClick={() => router.push(prevUrl)}
                className="absolute left-2 sm:left-4 z-10 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors duration-[var(--motion-fast)]"
                aria-label="Previous verse"
              >
                <ChevronLeft size={28} strokeWidth={1.5} />
              </button>
            )}

            {/* Centered column: image + iterator + verse text */}
            <div className="flex flex-col items-center max-w-full max-h-full min-h-0">
              {displayImage?.url ? (
                <div className="relative max-w-full max-h-[70vh] w-full flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--image-stage)]">
                  {!isFullscreenImageReady && isGenerating && (
                    <HeroImageLoadingState
                      label={generationPhaseLabel}
                      fullscreen
                      progress={generationProgress}
                    />
                  )}
                  {!isFullscreenImageReady && !isGenerating && (
                    <ImageLoadingSkeleton
                      className="absolute inset-0"
                      label="Loading saved image"
                      theme="dark"
                    />
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayImage.url}
                    alt={alt}
                    className={`relative z-10 max-w-full max-h-[70vh] bg-[var(--image-stage)] object-contain rounded-[var(--radius-md)] transition-opacity duration-[var(--motion-base)] ${
                      isFullscreenImageReady ? "opacity-100 visible" : "opacity-0 invisible"
                    }`}
                    onLoad={() => setIsFullscreenImageReady(true)}
                    onError={() => setIsFullscreenImageReady(false)}
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
                    onClick={handleManualRegenerate}
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
                    ) : canGenerate ? (
                      <button
                        onClick={handleManualRegenerate}
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

              {/* Image iterator */}
              {totalImages > 1 && (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={goToNextImage}
                    disabled={!canGoNewer}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 transition-colors duration-[var(--motion-fast)] disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Newer image"
                  >
                    <ChevronLeft size={18} strokeWidth={1.5} />
                  </button>
                  <span className="text-xs text-white/70 px-2 select-none">{imageCountLabel}</span>
                  <button
                    onClick={goToPrevImage}
                    disabled={!canGoOlder}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 transition-colors duration-[var(--motion-fast)] disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Older image"
                  >
                    <ChevronRight size={18} strokeWidth={1.5} />
                  </button>
                </div>
              )}

              {/* Verse text */}
              {verseText && (
                <p className="mt-3 text-center text-sm sm:text-base text-white/80 leading-relaxed max-w-2xl px-4">
                  {verseText}
                </p>
              )}
            </div>

            {/* Next verse */}
            {nextUrl && (
              <button
                onClick={() => router.push(nextUrl)}
                className="absolute right-2 sm:right-4 z-10 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors duration-[var(--motion-fast)]"
                aria-label="Next verse"
              >
                <ChevronRight size={28} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      )}
    </figure>
  );
}
