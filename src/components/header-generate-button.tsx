"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Loader2, Zap, Check, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useGeneration } from "@/context/generation-context";
import { usePreferences } from "@/context/preferences-context";
import {
  ASPECT_RATIOS,
  RESOLUTIONS,
  type ImageAspectRatio,
  type ImageResolution,
  type ImageModel,
  DEFAULT_IMAGE_MODEL,
  computeAdjustedCreditsCost,
  supportsResolution,
} from "@/lib/image-models";

/** Compact generate button for the header. Returns null on non-verse pages. */
export function HeaderGenerateButton() {
  const { state, isRegistered, generate, buyCredits, setAspectRatio, setResolution } = useGeneration();
  const { imageModel, setImageModel } = usePreferences();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Inline model list state (lazy-loaded when modal opens)
  const [models, setModels] = useState<ImageModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const hasFetchedModels = useRef(false);

  const { canGenerate, isGenerating, pricingPending, effectiveCost, showCreditsCost, generationPhaseLabel, aspectRatio, resolution, baseCost, modelId } = state;
  const modelSupportsRes = supportsResolution(modelId);

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

        fetch("/api/image-models")
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`);
            return res.json();
          })
          .then((data) => {
            if (data.models) setModels(data.models);
            if (data.error) setModelsError(data.error);
          })
          .catch((err) => {
            console.error("Failed to fetch image models:", err);
            setModelsError("Failed to load models");
            setModels([
              { id: DEFAULT_IMAGE_MODEL, name: "Gemini 2.5 Flash (Default)", provider: "Google", creditsCost: 35, etaSeconds: 12 },
            ]);
          })
          .finally(() => setModelsLoading(false));
      });
    }
  }, [isModalOpen, modelsError]);

  // Group models by provider
  const groupedModels: Record<string, ImageModel[]> = models.reduce((acc, model) => {
    const provider = model.provider || "Other";
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, ImageModel[]>);

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
          onClick={() => { if (!isGenerating) setIsModalOpen(true); }}
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

        {/* Mobile: bottom-sheet generation modal (portalled) */}
        {isModalOpen && createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setIsModalOpen(false)}
            />

            {/* Modal panel — slides up from bottom */}
            <div className="relative w-full max-h-[85vh] flex flex-col bg-[var(--background)] rounded-t-[var(--radius-lg)] animate-in slide-in-from-bottom duration-[var(--motion-base)]">
              {/* Drag handle */}
              <div className="flex justify-center pt-3">
                <div className="w-10 h-1 rounded-full bg-[var(--divider)]" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-4 pb-4">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Generate Image</h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  aria-label="Close"
                >
                  <X size={20} strokeWidth={2} />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-6" style={{ WebkitOverflowScrolling: "touch" }}>
                <div className="space-y-5 pb-4">
                  {/* Model Section */}
                  <div>
                    <span className="text-sm font-medium text-[var(--foreground)]">Model</span>
                    {modelsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                        <span className="ml-2 text-sm text-[var(--muted)]">Loading models...</span>
                      </div>
                    ) : modelsError && models.length === 0 ? (
                      <div className="py-4 text-sm text-red-500 text-center">{modelsError}</div>
                    ) : (
                      <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--divider)] overflow-hidden">
                        <div className="max-h-48 overflow-y-auto overscroll-contain">
                          {Object.entries(groupedModels).map(([provider, providerModels]) => (
                            <div key={provider}>
                              <div className="px-3 py-1.5 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider bg-[var(--surface)] sticky top-0 border-b border-[var(--divider)]/50">
                                {provider}
                              </div>
                              {providerModels.map((model) => {
                                const isSelected = imageModel === model.id;
                                return (
                                  <button
                                    key={model.id}
                                    onClick={() => { if (model.creditsCost != null) setImageModel(model.id); }}
                                    disabled={model.creditsCost == null}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ${
                                      model.creditsCost == null ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--surface)]"
                                    } ${isSelected ? "bg-[var(--accent)]/10" : ""}`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">{model.name}</div>
                                      <p className="text-xs text-[var(--muted)] truncate">
                                        {model.creditsCost == null ? (
                                          "Pricing unavailable"
                                        ) : (
                                          <>~{model.etaSeconds ?? 12}s · Up to {model.creditsCost} credits</>
                                        )}
                                      </p>
                                    </div>
                                    {isSelected && (
                                      <Check size={16} className="text-[var(--accent)] flex-shrink-0 ml-2" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Aspect Ratio Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[var(--foreground)]">Aspect Ratio</span>
                    </div>
                    <div className="flex gap-2">
                      {(Object.keys(ASPECT_RATIOS) as ImageAspectRatio[]).map((ratio) => (
                        <button
                          key={ratio}
                          onClick={() => setAspectRatio(ratio)}
                          className={`flex-1 min-h-[36px] rounded-[var(--radius-md)] text-xs font-medium transition-colors ${
                            aspectRatio === ratio
                              ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/50"
                              : "bg-[var(--surface)] text-[var(--muted)] border border-transparent hover:bg-[var(--divider)]"
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resolution Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[var(--foreground)]">Resolution</span>
                      {!modelSupportsRes && (
                        <span className="text-[10px] text-[var(--muted)] opacity-70">Not supported</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {(Object.keys(RESOLUTIONS) as ImageResolution[]).map((res) => {
                        const cost = computeAdjustedCreditsCost(baseCost, res, modelId);
                        return (
                          <button
                            key={res}
                            onClick={() => setResolution(res)}
                            className={`flex-1 min-h-[36px] rounded-[var(--radius-md)] text-xs font-medium transition-colors flex flex-col items-center justify-center ${
                              resolution === res
                                ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/50"
                                : "bg-[var(--surface)] text-[var(--muted)] border border-transparent hover:bg-[var(--divider)]"
                            } ${!modelSupportsRes ? "opacity-60" : ""}`}
                          >
                            <span>{res}</span>
                            {showCreditsCost && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] opacity-70">
                                <Zap size={10} strokeWidth={2} />
                                {cost}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky generate button at bottom */}
              <div className="px-6 pt-4 pb-6 border-t border-[var(--divider)]" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    generate();
                  }}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] text-sm font-medium"
                >
                  <Sparkles size={16} strokeWidth={1.5} />
                  <span>Generate</span>
                  {showCreditsCost && (
                    <span className="inline-flex items-center gap-0.5 opacity-80">
                      <Zap size={12} strokeWidth={2} />
                      <span>≤{effectiveCost}</span>
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {/* Desktop: styled pill */}
        <button
          onClick={generate}
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
                  <span>≤{effectiveCost}</span>
                </span>
              )}
            </>
          )}
        </button>
      </>
    );
  }

  // No credits - buy CTA
  return (
    <>
      {/* Mobile: plain icon button */}
      <button
        onClick={buyCredits}
        className={`${mobileIconBtn} text-[var(--accent)] hover:text-[var(--accent-hover)]`}
        aria-label="Get credits to generate"
      >
        <Zap size={20} strokeWidth={1.5} />
      </button>
      {/* Desktop: styled pill */}
      <button
        onClick={buyCredits}
        className="hidden sm:inline-flex min-h-[36px] px-3 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] text-xs font-medium"
        aria-label="Get credits to generate"
      >
        <Zap size={14} strokeWidth={2} />
        <span>Get Credits</span>
      </button>
    </>
  );
}
