"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw, Sparkles, Loader2, Zap, ImageOff, Clock } from "lucide-react";
import { usePreferences } from "@/context/preferences-context";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useSession } from "@/context/session-context";

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

interface PromptInputs {
  reference?: string;
  aspectRatio?: string;
  generationNumber?: number;
  prevVerse?: VerseContext;
  nextVerse?: VerseContext;
}

interface HeroImageProps {
  alt?: string;
  caption?: string;
  verseText?: string;
  chapterTheme?: ChapterTheme;
  prevUrl?: string | null;
  nextUrl?: string | null;
  prevVerse?: VerseContext;
  nextVerse?: VerseContext;
  currentReference?: string;
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

/**
 * Extract a short display name from a model ID.
 * "google/gemini-2.5-flash-image" -> "Gemini 2.5 Flash"
 */
function getShortModelName(modelId: string): string {
  const parts = modelId.split("/");
  const name = parts[parts.length - 1] || modelId;
  return name
    .replace(/-image$/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
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
        imageHistory={[]}
        isQueryLoading={false}
        imageRefreshKey={0}
        onSaveImage={undefined}
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
    />
  );
}

interface ConvexImageData {
  id: string;
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
  onSaveImage?: (args: {
    verseId: string;
    imageUrl: string;
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
    generationId?: string;
  }) => Promise<string | null>;
  onRefreshImages?: () => void;
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
}: HeroImageProps) {
  // Create verse ID for Convex query
  const verseId = currentReference ? createVerseId(currentReference) : null;
  const [refreshToken, setRefreshToken] = useState(0);

  // Query Convex for all images for this verse (sorted newest first)
  const imageHistory = useQuery(
    api.verseImages.getImageHistory,
    verseId ? { verseId, refreshToken } : "skip"
  );

  // Action to save new images (handles both URLs and base64 data)
  const saveImageAction = useAction(api.verseImages.saveImage);

  // Wrap action to match expected signature (Promise<void>)
  const saveImage = useCallback(
    async (args: {
      verseId: string;
      imageUrl: string;
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
      generationId?: string;
    }) => {
      const result = await saveImageAction(args);
      return result?.id ?? null;
    },
    [saveImageAction]
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
      imageHistory={imageHistory}
      isQueryLoading={isQueryLoading}
      imageRefreshKey={refreshToken}
      onSaveImage={saveImage}
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
  imageHistory,
  isQueryLoading,
  imageRefreshKey = 0,
  onSaveImage,
  onRefreshImages,
}: HeroImageBaseProps) {
  const { imageModel, translation } = usePreferences();
  const isConvexEnabled = useConvexEnabled();
  const { tier, credits, buyCredits, updateCredits, isLoading: sessionLoading } = useSession();

  // Fetch model pricing info
  const [modelPricing, setModelPricing] = useState<ModelPricing>({ creditsCost: null, etaSeconds: 12 });
  const modelPricingCache = useRef<Map<string, ModelPricing>>(new Map());

  useEffect(() => {
    // Check cache first
    const cached = modelPricingCache.current.get(imageModel);
    if (cached) {
      setModelPricing(cached);
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
      });
  }, [imageModel]);

  // Determine if user can generate (has sufficient credits or is admin)
  const effectiveCost = modelPricing.creditsCost ?? 20; // Default 20 for unpriced models
  const effectiveEta = modelPricing.etaSeconds;
  const isAdmin = tier === "admin";
  const canGenerate = !isConvexEnabled || isAdmin || (tier === "paid" && credits >= effectiveCost);
  const showCreditsCost = isConvexEnabled && !isAdmin;
  const hasExistingImages = (imageHistory?.length || 0) > 0;

  // Create verse ID for Convex query
  const verseId = currentReference ? createVerseId(currentReference) : null;

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
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedGeneration, setHasAttemptedGeneration] = useState(false);
  const [imageLoadAttempts, setImageLoadAttempts] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const isMounted = useRef(true);
  const generationIdRef = useRef(0);
  const imageElementRef = useRef<HTMLImageElement | null>(null);

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
          ? "Generating..."
          : "No images yet";
  const showControls = Boolean(prevUrl || nextUrl || hasImages || isGenerating || isQueryLoading);

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

    const clientGenerationId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const params = new URLSearchParams();
      if (verseText) params.set("text", verseText);
      if (chapterTheme) params.set("theme", JSON.stringify(chapterTheme));
      if (prevVerse) params.set("prevVerse", JSON.stringify(prevVerse));
      if (nextVerse) params.set("nextVerse", JSON.stringify(nextVerse));
      if (currentReference) params.set("reference", currentReference);
      if (imageModel) params.set("model", imageModel);

      // Pass existing image count to add generation diversity
      const existingImageCount = imageHistory?.length || 0;
      if (existingImageCount > 0) {
        params.set("generation", String(existingImageCount + 1));
      }

      const url = `/api/generate-image?${params.toString()}`;
      const response = await fetch(url, { signal: controller.signal });

      if (isStale()) {
        return;
      }

      if (response.status === 403) {
        if (isMounted.current) {
          setError("Image generation is disabled");
        }
        return;
      }

      if (response.status === 401) {
        if (isMounted.current) {
          setError("Session required - please refresh the page");
        }
        return;
      }

      if (response.status === 402) {
        // Insufficient credits
        if (isMounted.current) {
          setError("Insufficient credits");
        }
        return;
      }

      const data = await response.json();

      if (isStale()) {
        return;
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to generate image");
      }

        if (data?.imageUrl) {
          const modelUsed = data.model || imageModel || "unknown";
          const saveGenerationId = data.generationId || clientGenerationId;

        // Update credits in session context if returned
        if (typeof data.credits === "number") {
          updateCredits(data.credits);
        }

        if (isStale()) {
          return;
        }

        // Save to Convex (action handles both URLs and base64 data)
        if (onSaveImage) {
          const savedId = await onSaveImage({
            verseId,
            imageUrl: data.imageUrl,
            model: modelUsed,
            prompt: data.prompt,
            promptVersion: data.promptVersion,
            promptInputs: data.promptInputs,
            reference: data.reference,
            verseText: data.verseText,
            chapterTheme: data.chapterTheme,
            generationNumber: data.generationNumber,
            translationId: translation,
            provider: data.provider,
            providerRequestId: data.providerRequestId,
            creditsCost: data.creditsCost,
            costUsd: data.costUsd,
            durationMs: data.durationMs,
            aspectRatio: data.aspectRatio,
            generationId: saveGenerationId,
          });

          if (isStale()) {
            return;
          }

          if (savedId) {
            setPendingImageId(savedId);
          }
        }

        if (isStale()) {
          return;
        }

        if (!onSaveImage) {
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
        return;
      }
      if (isStale()) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to generate image");
      console.error("Image generation error:", err);
    } finally {
      // Always clean up if this is still the current generation
      if (thisGenerationId === generationIdRef.current) {
        activeRequest.current = null;
        if (isMounted.current) {
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
    translation,
    onSaveImage,
    selectedImageId,
    imageHistory,
    updateCredits,
  ]);

  // Manual regenerate function - resets load attempts and queues a new image
  const handleManualRegenerate = useCallback(() => {
    setImageLoadAttempts(0);
    setError(null);
    setGeneratedImage(null);
    setPendingImageId(null);
    generateImage();
  }, [generateImage]);

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

  // Auto-generate on first visit if no existing images AND user has credits
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
      canGenerate &&
      !sessionLoading
    ) {
      setHasAttemptedGeneration(true);
      pendingFollowLatest.current = true;
      generateImage();
    }
  }, [imageHistory, isGenerating, hasAttemptedGeneration, verseId, generateImage, canGenerate, sessionLoading]);

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

  // Reset state when verse changes
  useEffect(() => {
    setSelectedImageId(null);
    setGeneratedImage(null);
    setError(null);
    setHasAttemptedGeneration(false);
    setImageLoadAttempts(0);
    setPendingImageId(null);
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
      return;
    }
    const img = imageElementRef.current;
    if (img?.complete) {
      setIsImageLoading(false);
    } else {
      setIsImageLoading(true);
    }
  }, [displayImage?.url]);

  useEffect(() => {
    if (!displayImage?.url) return;
    setImageLoadAttempts(0);
    setError(null);
  }, [displayImage?.id, displayImage?.url]);

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

  return (
    <figure className="relative w-full">
      {/* Image Container */}
      <div className="relative w-full aspect-[16/9] overflow-hidden bg-[var(--surface)]">
        {displayImage?.url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${displayImage.id || displayImage.url}-${imageRefreshKey}`}
              src={displayImage.url}
              alt={alt}
              ref={imageElementRef}
              className="w-full h-full object-contain"
              onLoad={() => {
                setIsImageLoading(false);
                setImageLoadAttempts(0);
                setError(null);
              }}
              onError={() => {
                const nextAttempt = imageLoadAttempts + 1;
                setIsImageLoading(false);
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

            {(isGenerating || isImageLoading) && !error && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--background)]/20 backdrop-blur-[1px] pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 bg-[var(--background)]/70 border border-[var(--divider)]/60 backdrop-blur-sm rounded-[var(--radius-md)]">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-[var(--foreground)]/70">
                    {isGenerating ? "Generating..." : "Loading image..."}
                  </span>
                </div>
              </div>
            )}

            {error && !isGenerating && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--background)]/60 backdrop-blur-sm">
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

            {/* Model badge - subtle top-left indicator */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1 px-2 py-1 text-xs text-[var(--muted)] bg-[var(--background)]/70 border border-[var(--divider)]/60 backdrop-blur-sm rounded-[var(--radius-full)]">
              <Sparkles className="w-3 h-3" />
              {getShortModelName(displayImage.model)}
            </div>
          </>
        ) : (
          /* Placeholder with skeleton loader */
          <div className="absolute inset-0 bg-[var(--surface)]">
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--background)]/80 via-[var(--surface)] to-[var(--surface)]" />

            {/* Loading pulse overlay - shows while loading */}
            {(isQueryLoading || isGenerating) && !error && (
              <div className="absolute inset-0 bg-white/10 dark:bg-white/5 animate-pulse" />
            )}

            {/* Loading text */}
            {(isQueryLoading || isGenerating) && !error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 px-4 py-2 bg-[var(--background)]/70 border border-[var(--divider)]/60 backdrop-blur-sm rounded-[var(--radius-md)]">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-[var(--foreground)]/70">
                    {isQueryLoading ? "Loading..." : "Generating..."}
                  </span>
                </div>
              </div>
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
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                {/* Icon */}
                <div className="w-16 h-16 rounded-full bg-[var(--surface)] border border-[var(--divider)] flex items-center justify-center">
                  <ImageOff size={28} strokeWidth={1.5} className="text-[var(--muted)]" />
                </div>

                {/* Text */}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    No image yet
                  </p>
                  <p className="text-xs text-[var(--muted)] max-w-[240px]">
                    Generate an AI illustration to bring this verse to life
                  </p>
                </div>

                {/* CTA Button - contextual based on canGenerate */}
                {canGenerate ? (
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
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom gradient for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-36 md:h-44 bg-gradient-to-t from-[var(--background)]/90 via-[var(--background)]/40 to-transparent pointer-events-none" />

        {/* Control Dock */}
        {showControls && (
          <div className="absolute inset-x-4 md:inset-x-6 bottom-4 z-20">
            <div className="mx-auto max-w-2xl">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--divider)]/70 bg-[var(--background)]/80 backdrop-blur-md shadow-[var(--shadow-sm)] px-2 py-2">
                <div className="flex items-center gap-1">
                  {prevUrl ? (
                    <Link
                      href={prevUrl}
                      className="min-h-[44px] px-3 inline-flex items-center gap-2 rounded-[var(--radius-full)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)]/70 transition-colors duration-[var(--motion-fast)] focus-ring"
                      aria-label="Previous verse"
                    >
                      <ChevronLeft size={18} strokeWidth={1.5} />
                      <span className="text-sm">Prev verse</span>
                    </Link>
                  ) : (
                    <span className="min-h-[44px] px-3 inline-flex items-center gap-2 rounded-[var(--radius-full)] text-[var(--muted)]/50">
                      <ChevronLeft size={18} strokeWidth={1.5} />
                      <span className="text-sm">Prev verse</span>
                    </span>
                  )}
                  {nextUrl ? (
                    <Link
                      href={nextUrl}
                      className="min-h-[44px] px-3 inline-flex items-center gap-2 rounded-[var(--radius-full)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)]/70 transition-colors duration-[var(--motion-fast)] focus-ring"
                      aria-label="Next verse"
                    >
                      <span className="text-sm">Next verse</span>
                      <ChevronRight size={18} strokeWidth={1.5} />
                    </Link>
                  ) : (
                    <span className="min-h-[44px] px-3 inline-flex items-center gap-2 rounded-[var(--radius-full)] text-[var(--muted)]/50">
                      <span className="text-sm">Next verse</span>
                      <ChevronRight size={18} strokeWidth={1.5} />
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={goToNextImage}
                    disabled={!canGoNewer}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-full)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)]/70 transition-colors duration-[var(--motion-fast)] disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
                    aria-label="Newer image"
                  >
                    <ChevronLeft size={18} strokeWidth={1.5} />
                  </button>
                  <div className="flex flex-col items-center leading-tight px-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Images</span>
                    <span className="text-xs text-[var(--foreground)]">{imageCountLabel}</span>
                  </div>
                  <button
                    onClick={goToPrevImage}
                    disabled={!canGoOlder}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-full)] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)]/70 transition-colors duration-[var(--motion-fast)] disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
                    aria-label="Older image"
                  >
                    <ChevronRight size={18} strokeWidth={1.5} />
                  </button>
                </div>

                {canGenerate ? (
                  <button
                    onClick={handleManualRegenerate}
                    disabled={isGenerating}
                    className="min-h-[44px] px-3 inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--divider)] bg-[var(--background)] text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors duration-[var(--motion-fast)] disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
                    aria-label="Generate new image"
                  >
                    {isGenerating ? (
                      <Loader2 size={18} strokeWidth={2} className="animate-spin" />
                    ) : (
                      <RefreshCw size={18} strokeWidth={1.5} />
                    )}
                    {isGenerating ? (
                      <span className="text-sm">Generating...</span>
                    ) : (
                      <span className="text-sm inline-flex items-center gap-2">
                        Generate
                        {showCreditsCost && (
                          <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                            <Zap size={12} strokeWidth={2} />
                            <span>{effectiveCost}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                          <Clock size={12} strokeWidth={2} />
                          <span>~{effectiveEta}s</span>
                        </span>
                      </span>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={buyCredits}
                    className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-[var(--radius-full)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] focus-ring"
                    aria-label="Buy credits to generate"
                  >
                    <Zap size={18} strokeWidth={2} />
                    <span className="text-sm">Unlock Generation</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Caption */}
      {caption && (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-20 md:bottom-24 z-10 px-4 md:px-6">
          <p className="text-center text-2xl md:text-3xl lg:text-4xl font-light italic text-[var(--foreground)]/90">
            &ldquo;{caption}&rdquo;
          </p>
        </figcaption>
      )}
    </figure>
  );
}
