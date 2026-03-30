"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Sparkles, Loader2, Zap, X, Layers } from "lucide-react";
import { createPortal } from "react-dom";
import { useGeneration } from "@/context/generation-context";
import { useSession } from "@/context/session-context";
import { trackCreditsInsufficient } from "@/lib/analytics";
import {
  type ImageModel,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_ESTIMATED_CREDITS_COST,
  getEstimatedCreditsCostForResolution,
} from "@/lib/image-models";
import { BulkGeneratePanel } from "@/components/bulk-generate-panel";
import { ImageGenerationSettingsPanel } from "@/components/image-generation-settings-panel";

/** Compact generate button for the header. Returns null on non-verse pages. */
export function HeaderGenerateButton() {
  const { state, isRegistered, generate, buyCredits } = useGeneration();
  const { tier, credits } = useSession();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  // Inline model list state (lazy-loaded when modal opens)
  const [models, setModels] = useState<ImageModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [scenePlannerCreditsCost, setScenePlannerCreditsCost] = useState(0);
  const hasFetchedModels = useRef(false);
  const singleTabRef = useRef<HTMLButtonElement | null>(null);
  const bulkTabRef = useRef<HTMLButtonElement | null>(null);

  const {
    canGenerate,
    isGenerating,
    pricingPending,
    showCreditsCost,
    generationPhaseLabel,
    aspectRatio,
    resolution,
    baseCost,
    displayCostByResolution,
    scenePlannerCreditsCost: generationScenePlannerCreditsCost,
    modelId,
  } = state;
  const displayEffectiveCost =
    displayCostByResolution?.[resolution] ??
    getEstimatedCreditsCostForResolution(
      {
        id: modelId,
        creditsCost: baseCost,
        reservationCreditsCost: null,
      },
      resolution,
      generationScenePlannerCreditsCost
    ) ??
    DEFAULT_IMAGE_ESTIMATED_CREDITS_COST;

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isModalOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [isModalOpen]);

  // Reset fetch guard on close so a failed fetch can be retried on next open
  useEffect(() => {
    if (!isModalOpen && modelsError) {
      hasFetchedModels.current = false;
      queueMicrotask(() => {
        setModelsError(null);
        setModels([]);
      });
    }
  }, [isModalOpen, modelsError]);

  // Lazy-fetch models when modal opens
  useEffect(() => {
    if (isModalOpen && !hasFetchedModels.current && !modelsError) {
      hasFetchedModels.current = true;

      queueMicrotask(() => {
        setModelsLoading(true);
        setModelsError(null);

        fetch("/api/image-models", { cache: "no-store" })
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`);
            return res.json();
          })
          .then((data) => {
            setScenePlannerCreditsCost(
              typeof data.scenePlannerCreditsCost === "number"
                ? data.scenePlannerCreditsCost
                : 0
            );
            if (data.models) setModels(data.models);
            if (data.error) setModelsError(data.error);
          })
          .catch((err) => {
            console.error("Failed to fetch image models:", err);
            setModelsError("Failed to load models");
            setModels([
              {
                id: DEFAULT_IMAGE_MODEL,
                name: "Gemini 2.5 Flash (Default)",
                provider: "Google",
                creditsCost: DEFAULT_IMAGE_ESTIMATED_CREDITS_COST,
                etaSeconds: 12,
              },
            ]);
            setScenePlannerCreditsCost(0);
          })
          .finally(() => setModelsLoading(false));
          });
    }
  }, [isModalOpen, modelsError]);

  const openGenerateModal = (tab: "single" | "bulk" = "single") => {
    if (isGenerating) return;
    setActiveTab(tab);
    setIsModalOpen(true);
  };

  const focusTab = (tab: "single" | "bulk") => {
    (tab === "single" ? singleTabRef.current : bulkTabRef.current)?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let nextTab: "single" | "bulk" | null = null;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextTab = activeTab === "single" ? "bulk" : "single";
        break;
      case "ArrowRight":
      case "ArrowDown":
        nextTab = activeTab === "single" ? "bulk" : "single";
        break;
      case "Home":
        nextTab = "single";
        break;
      case "End":
        nextTab = "bulk";
        break;
      default:
        break;
    }

    if (!nextTab) return;

    event.preventDefault();
    setActiveTab(nextTab);
    queueMicrotask(() => focusTab(nextTab));
  };

  if (!isRegistered) return null;

  // Shared mobile icon-button style (matches chat/book/menu buttons in header)
  const mobileIconBtn =
    "sm:hidden min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors duration-[var(--motion-fast)]";

  // Pricing loading state
  if (pricingPending) {
    return (
      <>
        {/* Mobile: plain icon button */}
        <button
          type="button"
          disabled
          className={`${mobileIconBtn} text-[var(--muted)] opacity-70 cursor-not-allowed`}
          aria-label="Loading pricing"
        >
          <Loader2 size={20} strokeWidth={1.5} className="animate-spin" />
        </button>
        {/* Desktop: styled pill */}
        <button
          type="button"
          disabled
          className="hidden sm:inline-flex min-h-[36px] px-3 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--surface)] text-[var(--muted)] text-xs opacity-70 cursor-not-allowed"
          aria-label="Loading pricing"
        >
          <Loader2 size={14} strokeWidth={2} className="animate-spin" />
          <span>Loading...</span>
        </button>
      </>
    );
  }

  // Has credits - generate action
  if (canGenerate) {
    return (
      <>
        {/* Mobile: icon button that opens modal */}
        <button
          onClick={() => openGenerateModal("single")}
          disabled={isGenerating}
          className={`${mobileIconBtn} text-[var(--accent)] hover:text-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label="Generate new image"
        >
          {isGenerating ? (
            <Loader2 size={20} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Sparkles size={20} strokeWidth={1.5} />
          )}
        </button>

        {/* Generation modal (bottom sheet on mobile, dialog on desktop) */}
        {isModalOpen && createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-image-title"
            className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setIsModalOpen(false)}
            />

            {/* Modal panel */}
            <div className="relative w-full max-h-[85vh] flex flex-col bg-[var(--background)] rounded-t-[var(--radius-lg)] animate-in slide-in-from-bottom duration-[var(--motion-base)] sm:max-w-2xl sm:max-h-[90vh] sm:rounded-[var(--radius-lg)] sm:border sm:border-[var(--divider)]">
              {/* Drag handle */}
              <div className="flex justify-center pt-3 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-[var(--divider)]" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-4 pb-2">
                <h2 id="generate-image-title" className="text-lg font-semibold text-[var(--foreground)]">
                  Generate Image
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  aria-label="Close"
                >
                  <X size={20} strokeWidth={2} />
                </button>
              </div>

              {/* Tab bar */}
              <div
                role="tablist"
                aria-label="Generation mode"
                className="flex gap-1 mx-6 mb-4 p-1 rounded-[var(--radius-md)] bg-[var(--surface)]"
              >
                <button
                  id="single-tab"
                  type="button"
                  ref={singleTabRef}
                  onClick={() => setActiveTab("single")}
                  onKeyDown={handleTabKeyDown}
                  role="tab"
                  aria-selected={activeTab === "single"}
                  aria-controls="single-panel"
                  tabIndex={activeTab === "single" ? 0 : -1}
                  className={`flex-1 min-h-[32px] flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors ${
                    activeTab === "single"
                      ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Sparkles size={12} strokeWidth={1.5} />
                  Single
                </button>
                <button
                  id="bulk-tab"
                  type="button"
                  ref={bulkTabRef}
                  onClick={() => setActiveTab("bulk")}
                  onKeyDown={handleTabKeyDown}
                  role="tab"
                  aria-selected={activeTab === "bulk"}
                  aria-controls="bulk-panel"
                  tabIndex={activeTab === "bulk" ? 0 : -1}
                  className={`flex-1 min-h-[32px] flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors ${
                    activeTab === "bulk"
                      ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Layers size={12} strokeWidth={1.5} />
                  Bulk
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-6" style={{ WebkitOverflowScrolling: "touch" }}>
                {activeTab === "bulk" ? (
                  <div id="bulk-panel" role="tabpanel" aria-labelledby="bulk-tab" className="space-y-5 pb-4">
                    <ImageGenerationSettingsPanel
                      models={models}
                      modelsLoading={modelsLoading}
                      modelsError={modelsError}
                      scenePlannerCreditsCost={scenePlannerCreditsCost}
                    />
                    <BulkGeneratePanel
                      perVerseCost={displayEffectiveCost}
                      modelId={modelId}
                      aspectRatio={aspectRatio}
                      resolution={resolution}
                      onClose={() => setIsModalOpen(false)}
                    />
                  </div>
                ) : (
                <div id="single-panel" role="tabpanel" aria-labelledby="single-tab" className="space-y-5 pb-4">
                  <ImageGenerationSettingsPanel
                    models={models}
                    modelsLoading={modelsLoading}
                    modelsError={modelsError}
                    scenePlannerCreditsCost={scenePlannerCreditsCost}
                  />
                </div>
                )}
              </div>

              {/* Sticky generate button at bottom (single tab only) */}
              {activeTab === "single" && (
              <div className="px-6 pt-4 pb-6 border-t border-[var(--divider)]" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    generate("header_generate");
                  }}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] text-sm font-medium"
                >
                  <Sparkles size={16} strokeWidth={1.5} />
                  <span>Generate</span>
                  {showCreditsCost && (
                    <span className="inline-flex items-center gap-0.5 opacity-80">
                      <Zap size={12} strokeWidth={2} />
                      <span>About {displayEffectiveCost}</span>
                    </span>
                  )}
                </button>
              </div>
              )}
            </div>
          </div>,
          document.body,
        )}

        {/* Desktop: styled pill */}
        <button
          onClick={() => openGenerateModal("single")}
          disabled={isGenerating}
          className="hidden sm:inline-flex min-h-[36px] px-3 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--accent)]/40 bg-[var(--accent)]/5 text-[var(--foreground)] hover:border-[var(--accent)]/70 hover:bg-[var(--accent)]/15 transition-colors duration-[var(--motion-fast)] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
          aria-label="Generate new image"
        >
          {isGenerating ? (
            <>
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
              <span>{generationPhaseLabel}</span>
            </>
          ) : (
            <>
              <Sparkles size={14} strokeWidth={1.5} />
              <span>Generate</span>
              {showCreditsCost && (
                <span className="inline-flex items-center gap-0.5 text-[var(--muted)]" title="Unused credits refunded after generation">
                  <Zap size={10} strokeWidth={2} />
                  <span>About {displayEffectiveCost}</span>
                </span>
              )}
            </>
          )}
        </button>
      </>
    );
  }

  // No credits - buy CTA (mobile icon hidden — CreditsBadge already handles buy)
  return (
    <>
      {/* Desktop: styled pill */}
      <button
        onClick={() => {
          trackCreditsInsufficient({
            feature: "image",
            source: "header_get_credits",
            tier,
            hasCredits: credits > 0,
          });
          buyCredits();
        }}
        className="hidden sm:inline-flex min-h-[36px] px-3 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] text-xs font-medium"
        aria-label="Get credits to generate"
      >
        <Zap size={14} strokeWidth={2} />
        <span>Get Credits</span>
      </button>
    </>
  );
}
