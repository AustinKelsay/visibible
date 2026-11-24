"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { usePreferences } from "@/context/preferences-context";
import { useAdvancedSettings } from "@/lib/advanced-settings";
import { useSession } from "@/context/session-context";
import { imageModelsUrl, useEffectiveArtStyle, useWorkScope } from "@/context/work-scope-context";
import {
  canAffordImageGeneration,
  DEFAULT_IMAGE_ESTIMATED_CREDITS_COST,
  getEstimatedCreditsCostForResolution,
  type ImageResolution,
} from "@/lib/image-models";
import {
  type GenerationTriggerSource,
  trackCreditsInsufficient,
  trackGenerationError,
  trackImageGenerated,
  trackImageGenerationStarted,
} from "@/lib/analytics";
import { resolveHasCreditsAfterGeneration } from "@/lib/analytics-event-utils";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf-constants";
import { computeImageGenerationProgress } from "@/lib/image-generation-progress";
import { artStyleLabel, resolveArtStyle, type ArtStyleAvailability } from "@/lib/art-styles";
import { formatQuote, parseQuote, parseStaleQuote, sameQuoteNumbers, type DisplayQuote } from "@/lib/quote-display";
import { IMAGES_UNAVAILABLE } from "@/lib/image-errors";

/** How long the moment and settings must hold still before their quote is read. */
const QUOTE_DEBOUNCE_MS = 400;

function readCsrfToken(): string | undefined {
  const prefix = `${CSRF_COOKIE_NAME}=`;
  return document.cookie.split("; ").find((row) => row.startsWith(prefix))?.slice(prefix.length);
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

export interface VerseGenerationOptions {
  /** Where the moment's images are kept ("genesis-1-1", or a prose moment's first unit). */
  verseId: string | null;
  /** The reference the request names ("Genesis 1:1"). */
  reference: string | undefined;
  /** The moment's images in the selected art style; undefined while they load. Automatic generation waits for it. */
  styleImageCount: number | undefined;
  /** Hold automatic generation back (for example while other styles' images are on view). */
  autoGenerateBlocked?: boolean;
  /** An attempt is starting. */
  onAttemptStart?: () => void;
  /** The image was made: saved under `savedImageId`, or (without persistence) only at `url`. */
  onImage?: (image: { savedImageId: string | null; url: string; model: string }) => void;
}

/**
 * One moment's single-image generation, as the reader meets it: the catalog price and availability, the server's
 * quote, the paid request with its stale-quote handling, the following of a reused request, progress, and automatic
 * generation behind the guest's own opt-in. The flow, limits and charging live on the server; this only drives them.
 */
export function useVerseGeneration({
  verseId,
  reference,
  styleImageCount,
  autoGenerateBlocked = false,
  onAttemptStart,
  onImage,
}: VerseGenerationOptions) {
  const { translation, autoGenerate } = usePreferences();
  const advanced = useAdvancedSettings();
  // The reader's Advanced settings (their defaults when Advanced is absent).
  const { imageModel, aspectRatio: imageAspectRatio, resolution: imageResolution } = advanced;
  const scope = useWorkScope();
  const { artStyle, offered: offeredStyles } = useEffectiveArtStyle();
  const catalogUrl = imageModelsUrl(scope);
  const isConvexEnabled = useConvexEnabled();
  const { tier, credits, isLoading: sessionLoading } = useSession();

  // The callbacks are read at call time, so a caller need not keep them stable.
  const callbacksRef = useRef({ onAttemptStart, onImage });
  useEffect(() => {
    callbacksRef.current = { onAttemptStart, onImage };
  });

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

    fetch(catalogUrl, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (isCancelled) return;
        if (Array.isArray(data.artStyles)) setStyleAvailability(data.artStyles);
        if (Array.isArray(data.models)) {
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
        if (!isCancelled) setPricingLoaded(true);
      });
    return () => {
      isCancelled = true;
    };
  }, [imageModel, catalogUrl]);

  const pricedModel = {
    id: imageModel,
    creditsCost: modelPricing.creditsCost,
    reservationCreditsCost: modelPricing.reservationCreditsCost,
    estimatedCreditsByResolution: modelPricing.estimatedCreditsByResolution,
  };
  const baseCost = modelPricing.creditsCost ?? DEFAULT_IMAGE_ESTIMATED_CREDITS_COST;
  const effectiveCost = getEstimatedCreditsCostForResolution(pricedModel, imageResolution) ?? DEFAULT_IMAGE_ESTIMATED_CREDITS_COST;
  const displayBaseCost =
    modelPricing.estimatedCreditsByResolution?.["1K"] ??
    getEstimatedCreditsCostForResolution(pricedModel, "1K") ??
    DEFAULT_IMAGE_ESTIMATED_CREDITS_COST;
  const displayCostByResolution = modelPricing.estimatedCreditsByResolution;
  const effectiveEta = modelPricing.etaSeconds;
  const isAdmin = tier === "admin";
  const pricingAvailable = pricingLoaded && modelPricing.modelId === imageModel && modelPricing.creditsCost !== null && modelPricing.availability !== "unavailable";
  const pricingPending = isConvexEnabled && (!pricingLoaded || modelPricing.modelId !== imageModel);
  // An offered style the server is not admitting (rollback) disables generation in it; it is never swapped for Classical.
  const resolvedStyle = resolveArtStyle(artStyle, styleAvailability, offeredStyles);
  const styleAvailable = resolvedStyle.available !== false;
  const pricingUnavailable = pricingLoaded && !pricingPending && !pricingAvailable
    ? modelPricing.unavailableReason ?? "Image pricing is unavailable right now. Please try again shortly."
    : pricingLoaded && !pricingPending && !styleAvailable
      ? `${artStyleLabel(artStyle)} is temporarily unavailable for new images. Saved images stay available; choose another style to generate.`
      : undefined;
  const canGenerate = pricingAvailable && styleAvailable && (isAdmin ||
    (tier === "paid" && canAffordImageGeneration(credits, effectiveCost)));
  // A guest is charged for an automatic image without seeing its price, so it runs only once they have turned it on
  // themselves, and only when the balance strictly covers the estimate. The owner is not charged, but turns it on too.
  const canAutoGenerate = pricingAvailable && styleAvailable &&
    (isAdmin ? autoGenerate : autoGenerate && tier === "paid" && credits >= effectiveCost);
  const showCreditsCost = isConvexEnabled && !isAdmin && pricingAvailable;

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A fresh quote is waiting for the guest to accept it: at a different price than the one shown ("changed"), or
  // because no price was on screen when they clicked ("unconfirmed").
  const [priceToConfirm, setPriceToConfirm] = useState<"changed" | "unconfirmed" | null>(null);
  const [hasAttemptedGeneration, setHasAttemptedGeneration] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [followingRequest, setFollowingRequest] = useState(false);
  const [progress, setProgress] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const isMounted = useRef(true);
  const generationIdRef = useRef(0);
  const generationStartedAtRef = useRef<number | null>(null);

  const { isAuthenticated } = useConvexAuth();
  const generationRequestStatus = useQuery(
    api.verseImages.getGenerationRequestStatus,
    isAuthenticated && activeRequestId ? { requestId: activeRequestId } : "skip"
  );
  /** "generating" once the server has started the image itself. */
  const phase: "starting" | "generating" = generationRequestStatus?.status === "generating" ? "generating" : "starting";
  const phaseLabel = phase === "generating" ? "Generating image..." : "Generating...";

  useEffect(() => {
    if (!isGenerating) {
      generationStartedAtRef.current = null;
      setProgress(0);
      return;
    }
    if (generationStartedAtRef.current === null) generationStartedAtRef.current = Date.now();
    const updateProgress = () => {
      const startedAt = generationStartedAtRef.current;
      if (startedAt === null) return;
      setProgress(computeImageGenerationProgress(Date.now() - startedAt, effectiveEta));
    };
    updateProgress();
    const intervalId = window.setInterval(updateProgress, 200);
    return () => window.clearInterval(intervalId);
  }, [isGenerating, effectiveEta]);

  // What both the quote and the generation are asked for.
  const imageRequest = useMemo(() => ({
    reference,
    model: imageModel,
    translation,
    aspectRatio: imageAspectRatio,
    resolution: imageResolution,
    style: artStyle,
    // A prose moment names its work and unit; the reference is then only a label.
    ...(scope ? { workId: scope.workId, unitId: scope.unitId } : {}),
  }), [reference, imageModel, translation, imageAspectRatio, imageResolution, artStyle, scope]);

  // The server's quote for this image (#60): the estimate and maximum the generate controls show, and the id a click
  // accepts. It is read again when the moment, a setting or the balance changes, and after each attempt, since a
  // quote is accepted once.
  const [quoteEpoch, setQuoteEpoch] = useState(0);
  const [quoteState, setQuoteState] = useState<{ key: string; quote: DisplayQuote } | null>(null);
  const quoteKey = verseId && reference ? JSON.stringify([verseId, imageRequest, credits, quoteEpoch]) : null;
  const quote = quoteState && quoteState.key === quoteKey ? quoteState.quote : null;
  // The owner is not charged and a guest without credits cannot accept, so neither is quoted.
  const quoteWanted = isConvexEnabled && !sessionLoading && tier === "paid" && credits > 0 && pricingAvailable && styleAvailable && !isGenerating;
  const quoteLabel = quote ? formatQuote(quote) : null;
  const priceNotice = priceToConfirm && quoteLabel
    ? `${priceToConfirm === "changed" ? "The price changed." : "Please confirm the price."} ${quoteLabel}.`
    : null;

  useEffect(() => {
    if (!quoteKey || !quoteWanted) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const csrfToken = readCsrfToken();
      if (!csrfToken) return;
      try {
        const response = await fetch("/api/generate-image/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: csrfToken },
          body: JSON.stringify(imageRequest),
          signal: controller.signal,
        });
        const fresh = response.ok ? parseQuote((await response.json())?.quote) : null;
        if (!controller.signal.aborted) setQuoteState(fresh ? { key: quoteKey, quote: fresh } : null);
      } catch {
        // No price is shown; a click still asks the server, which answers with the quote to accept.
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [quoteKey, quoteWanted, imageRequest]);

  const generateImage = useCallback(async (source: GenerationTriggerSource) => {
    if (!verseId || !reference) return;

    if (activeRequest.current) activeRequest.current.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const thisGenerationId = ++generationIdRef.current;

    callbacksRef.current.onAttemptStart?.();
    // Any attempt for this moment, the guest's own included, ends automatic generation for it: an automatic request
    // must never follow a click whose price is still waiting to be confirmed.
    setHasAttemptedGeneration(true);
    setIsGenerating(true);
    setFollowingRequest(false);
    setError(null);
    setPriceToConfirm(null);
    // The quote on screen when the guest clicked: the price they accepted.
    const acceptedQuote = quote;
    let keepQuote = false;

    const isStale = () => controller.signal.aborted || !isMounted.current || thisGenerationId !== generationIdRef.current;

    const clientRequestId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setActiveRequestId(clientRequestId);
    let followExistingRequest = false;

    try {
      const csrfToken = readCsrfToken();

      const payload: Record<string, unknown> = {
        ...imageRequest,
        requestId: clientRequestId,
        // An automatic image has no click to accept a quote; the server then requires the whole estimate.
        ...(source === "auto_generate" ? { automatic: true } : acceptedQuote ? { quoteId: acceptedQuote.quoteId } : {}),
      };

      // Pass the selected style's image count to add generation diversity
      const existingImageCount = styleImageCount ?? 0;
      const generationNumber = existingImageCount + 1;
      if (existingImageCount > 0) payload.generation = generationNumber;

      if (!csrfToken) {
        if (isMounted.current) {
          setActiveRequestId(null);
          setError("Security check failed. Please refresh the page and try again.");
          trackGenerationError({ imageModel, artStyle, errorType: "csrf_missing", source, tier, hasCredits: credits > 0 });
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

      const submit = () => fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: csrfToken },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      let response = await submit();

      // A quote that no longer holds: nothing was started, and the answer carries a fresh quote. At the price the
      // guest just accepted (the quote had only expired) it is accepted for them, once; at any other price, or when
      // none was on screen, it is shown and waits for another click.
      let conflictBody: unknown;
      for (let attempt = 0; response.status === 409; attempt++) {
        conflictBody = await response.json().catch(() => null);
        const fresh = parseStaleQuote(response.status, conflictBody);
        if (!fresh) break;
        if (isStale()) return;
        keepQuote = true;
        if (quoteKey) setQuoteState({ key: quoteKey, quote: fresh });
        if (attempt > 0 || !sameQuoteNumbers(fresh, acceptedQuote)) {
          setPriceToConfirm(acceptedQuote ? "changed" : "unconfirmed");
          setActiveRequestId(null);
          return;
        }
        keepQuote = false;
        payload.quoteId = fresh.quoteId;
        conflictBody = undefined;
        response = await submit();
      }

      if (isStale()) return;

      if (response.status === 403) {
        let errorMessage = "Request blocked. Please refresh the page and try again.";
        let errorType = "forbidden";
        try {
          const responseData = await response.json() as { error?: string; message?: string };
          const combinedMessage = `${responseData.error || ""} ${responseData.message || ""}`.toLowerCase();
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
          trackGenerationError({ imageModel, artStyle, errorType, source, tier, hasCredits: credits > 0 });
        }
        return;
      }

      if (response.status === 401) {
        if (isMounted.current) {
          setActiveRequestId(null);
          setError("Session required - please refresh the page");
          trackGenerationError({ imageModel, artStyle, errorType: "unauthorized", source, tier, hasCredits: credits > 0 });
        }
        return;
      }

      if (response.status === 402) {
        if (isMounted.current) {
          setActiveRequestId(null);
          setError("Insufficient credits");
          trackCreditsInsufficient({ feature: "image", source, requiredCredits: effectiveCost, tier, hasCredits: credits > 0 });
        }
        return;
      }

      const data = conflictBody !== undefined ? conflictBody as Record<string, unknown> | null : await response.json();

      if (isStale()) return;

      if (typeof data?.requestId === "string") setActiveRequestId(data.requestId);

      if (!response.ok) {
        // A retryable refusal (a scene still preparing, a style not admitted) and an outage carry their own explanation.
        const explained = data?.retryable || data?.error === IMAGES_UNAVAILABLE;
        const detail = response.status === 503 && explained && typeof data?.message === "string" ? data.message : null;
        throw new Error(detail ? `${data?.error || "Preparing scene"}: ${detail}` : String(data?.error || "Failed to generate image"));
      }

      if (response.status === 202 && data?.reused) {
        followExistingRequest = true;
        setFollowingRequest(true);
        return;
      }

      if (typeof data?.imageUrl === "string" && data.imageUrl) {
        const modelUsed = typeof data.model === "string" && data.model ? data.model : imageModel || "unknown";
        const savedImageId = typeof data.savedImageId === "string" ? data.savedImageId : null;

        trackImageGenerated({
          imageModel: modelUsed,
          aspectRatio: typeof data.aspectRatio === "string" && data.aspectRatio ? data.aspectRatio : imageAspectRatio,
          resolution: imageResolution,
          artStyle: typeof data.style === "string" ? data.style : artStyle,
          generationNumber: typeof data.generationNumber === "number" && data.generationNumber ? data.generationNumber : generationNumber,
          source,
          durationMs: typeof data.durationMs === "number" ? data.durationMs : undefined,
          tier,
          hasCredits: resolveHasCreditsAfterGeneration({
            returnedCredits: typeof data.credits === "number" ? data.credits : undefined,
            currentCredits: credits,
          }),
        });

        callbacksRef.current.onImage?.({ savedImageId, url: data.imageUrl, model: modelUsed });
      } else {
        throw new Error("Missing image URL");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (isMounted.current) setActiveRequestId(null);
        return;
      }
      if (isStale()) return;
      const errorMessage = err instanceof Error ? err.message : "Failed to generate image";
      setError(errorMessage);
      console.error("Image generation error:", err);
      // Sanitize error type for analytics (avoid leaking sensitive details)
      const errorType =
        err instanceof TypeError ? "network_error" :
        errorMessage.includes("Missing image URL") ? "missing_url" :
        errorMessage.includes("timed out") ? "timeout" :
        "generation_failed";
      trackGenerationError({ imageModel, artStyle, errorType, source, tier, hasCredits: credits > 0 });
    } finally {
      if (thisGenerationId === generationIdRef.current) {
        activeRequest.current = null;
        if (isMounted.current && !followExistingRequest) {
          setActiveRequestId(null);
          setIsGenerating(false);
        }
        // The quote was used by this attempt (or was never read): read a new one, unless a fresh one is waiting.
        if (isMounted.current && !keepQuote) setQuoteEpoch((epoch) => epoch + 1);
      }
    }
  }, [verseId, reference, imageRequest, quote, quoteKey, artStyle, styleImageCount, imageModel, imageAspectRatio, imageResolution, tier, credits, effectiveCost]);

  /** The reader asked for an image. Nothing happens while the price is loading or unavailable. */
  const generate = useCallback((source: GenerationTriggerSource) => {
    if (pricingPending || pricingUnavailable) return;
    void generateImage(source);
  }, [generateImage, pricingPending, pricingUnavailable]);

  // Automatic generation: once per moment, only when its images have loaded and none is in the selected style, and
  // only when allowed (the guest's own opt-in and a balance that covers the estimate, or the owner). The spend-down
  // grace is reserved for explicit actions.
  useEffect(() => {
    if (
      styleImageCount === 0 &&
      !autoGenerateBlocked &&
      !isGenerating &&
      !hasAttemptedGeneration &&
      verseId &&
      canAutoGenerate &&
      !sessionLoading
    ) {
      setHasAttemptedGeneration(true);
      void generateImage("auto_generate");
    }
  }, [styleImageCount, autoGenerateBlocked, isGenerating, hasAttemptedGeneration, verseId, generateImage, canAutoGenerate, sessionLoading]);

  // A reused request is followed until the server says how it ended.
  useEffect(() => {
    if (!activeRequestId) return;
    if (generationRequestStatus?.status === "succeeded" || generationRequestStatus?.status === "failed") {
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

  // A new moment starts clean.
  useEffect(() => {
    setError(null);
    setPriceToConfirm(null);
    setHasAttemptedGeneration(false);
    setActiveRequestId(null);
    setIsGenerating(false);
    setFollowingRequest(false);
    if (activeRequest.current) activeRequest.current.abort();
  }, [verseId]);

  useEffect(() => {
    // Ensure isMounted is reset correctly in React Strict Mode (dev double-invokes effects)
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (activeRequest.current) activeRequest.current.abort();
    };
  }, []);

  return {
    isAdmin,
    canGenerate,
    pricingPending,
    pricingUnavailable,
    effectiveCost,
    effectiveEta,
    baseCost,
    displayBaseCost,
    displayCostByResolution,
    showCreditsCost,
    quote,
    quoteLabel,
    priceNotice,
    isGenerating,
    progress,
    phase,
    phaseLabel,
    error,
    setError,
    generate,
  };
}
