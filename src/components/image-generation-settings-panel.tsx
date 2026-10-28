"use client";

import { useMemo } from "react";
import { Check, Loader2, Zap } from "lucide-react";
import { useGeneration } from "@/context/generation-context";
import { usePreferences } from "@/context/preferences-context";
import { ART_STYLES, type ArtStyleAvailability } from "@/lib/art-styles";
import {
  ASPECT_RATIOS,
  DEFAULT_IMAGE_ESTIMATED_CREDITS_COST,
  RESOLUTIONS,
  getEstimatedCreditsCostForResolution,
  supportsResolution,
  imageCapabilities,
  type ImageAspectRatio,
  type ImageModel,
  type ImageResolution,
} from "@/lib/image-models";

interface ImageGenerationSettingsPanelProps {
  models: ImageModel[];
  modelsLoading: boolean;
  modelsError: string | null;
  /** Which art styles generation admits right now, from the catalog response; null while unknown. */
  artStyles?: ArtStyleAvailability[] | null;
}

export function ImageGenerationSettingsPanel({
  models,
  modelsLoading,
  modelsError,
  artStyles = null,
}: ImageGenerationSettingsPanelProps) {
  const { state, setAspectRatio, setResolution } = useGeneration();
  const {
    imageModel,
    imageAspectRatio,
    imageResolution,
    setImageModel,
    artStyle,
    setArtStyle,
  } = usePreferences();
  const styleOptions = artStyles ?? ART_STYLES.map((style) => ({ ...style, available: true, reason: null }));
  const selectedStyle = styleOptions.find((style) => style.id === artStyle);
  const {
    baseCost,
    displayCostByResolution,
    modelId: generationModelId,
    showCreditsCost,
  } = state;

  const selectedModelId = imageModel || generationModelId;
  const modelSupportsResolution = supportsResolution(selectedModelId);
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId),
    [models, selectedModelId]
  );

  const groupedModels = useMemo(
    () =>
      models.reduce((acc, model) => {
        const provider = model.provider || "Other";
        if (!acc[provider]) acc[provider] = [];
        acc[provider].push(model);
        return acc;
      }, {} as Record<string, ImageModel[]>),
    [models]
  );

  const getModelDisplayCost = (model: ImageModel, resolution: ImageResolution) =>
    getEstimatedCreditsCostForResolution(
      model,
      resolution
    );

  const getResolutionDisplayCost = (resolution: ImageResolution) => {
    if (!imageCapabilities(selectedModelId)?.resolutions.includes(resolution)) return null;
    if (selectedModel) {
      return getModelDisplayCost(selectedModel, resolution);
    }

    const fallbackModelId = selectedModelId || generationModelId;
    return (
      displayCostByResolution?.[resolution] ??
      getEstimatedCreditsCostForResolution(
        {
          id: fallbackModelId,
          creditsCost: baseCost,
          reservationCreditsCost: null,
        },
        resolution
      ) ??
      DEFAULT_IMAGE_ESTIMATED_CREDITS_COST
    );
  };

  return (
    <div className="space-y-5">
      <div>
        {modelsError && models.length > 0 && <p className="text-xs text-[var(--muted)]">{modelsError}</p>}
        {!modelsLoading && (state.pricingUnavailable || (models.length > 0 && !selectedModel)) && <p className="text-xs">{state.pricingUnavailable ?? "Saved model unavailable. Choose another model."}</p>}
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
                    const isSelected = selectedModelId === model.id;
                    const isPricingAvailable = model.availability !== "unavailable" &&
                      getEstimatedCreditsCostForResolution(model, "1K") !== null;

                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          if (isPricingAvailable) {
                            setImageModel(model.id, "header_generate_modal");
                          }
                        }}
                        disabled={!isPricingAvailable}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ${
                          !isPricingAvailable
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-[var(--surface)]"
                        } ${isSelected ? "bg-[var(--accent)]/10" : ""}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{model.name}</div>
                          <p className="text-xs text-[var(--muted)] truncate">
                            {model.creditsCost == null && model.reservationCreditsCost == null ? (
                              model.unavailableReason ?? "Pricing unavailable"
                            ) : (
                              <>{model.availability === "stale" ? "Cached pricing · " : ""}~{model.etaSeconds ?? 12}s · About {getModelDisplayCost(model, imageResolution)} credits</>
                            )}
                          </p>
                        </div>
                        {isSelected ? (
                          <Check size={16} className="text-[var(--accent)] flex-shrink-0 ml-2" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[var(--foreground)]">Style</span>
          {selectedStyle && !selectedStyle.available ? (
            <span className="text-[10px] text-[var(--muted)] opacity-70">Temporarily unavailable</span>
          ) : null}
        </div>
        <div role="radiogroup" aria-label="Art style" className="flex flex-col gap-2">
          {styleOptions.map((style) => {
            const isSelected = artStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setArtStyle(style.id, "header_generate_modal")}
                className={`w-full min-h-[44px] rounded-[var(--radius-md)] px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? "bg-[var(--accent)]/15 border border-[var(--accent)]/50"
                    : "bg-[var(--surface)] border border-transparent hover:bg-[var(--divider)]"
                } ${!style.available ? "opacity-70" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium ${isSelected ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>{style.label}</span>
                  {isSelected ? <Check size={16} className="text-[var(--accent)] flex-shrink-0" /> : null}
                </div>
                <p className="text-xs text-[var(--muted)]">{style.available ? style.description : style.reason ?? "Temporarily unavailable for generation; saved images stay available."}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[var(--foreground)]">Aspect Ratio</span>
        </div>
        <div className="flex gap-2">
          {(Object.keys(ASPECT_RATIOS) as ImageAspectRatio[]).map((ratio) => (
            <button
              key={ratio}
              onClick={() => setAspectRatio(ratio, "header_generate_modal")}
              className={`flex-1 min-h-[36px] rounded-[var(--radius-md)] text-xs font-medium transition-colors ${
                imageAspectRatio === ratio
                  ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/50"
                  : "bg-[var(--surface)] text-[var(--muted)] border border-transparent hover:bg-[var(--divider)]"
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[var(--foreground)]">Resolution</span>
          {!modelSupportsResolution ? (
            <span className="text-[10px] text-[var(--muted)] opacity-70">Not supported</span>
          ) : null}
        </div>
        <div className="flex gap-2">
          {(Object.keys(RESOLUTIONS) as ImageResolution[]).map((resolution) => {
            const cost = getResolutionDisplayCost(resolution);
            const resolutionAvailable = cost !== null && (modelSupportsResolution || resolution === "1K");

            return (
              <button
                key={resolution}
                onClick={() => {
                  if (resolutionAvailable) {
                    setResolution(resolution, "header_generate_modal");
                  }
                }}
                disabled={!resolutionAvailable}
                aria-disabled={!resolutionAvailable}
                className={`flex-1 min-h-[36px] rounded-[var(--radius-md)] text-xs font-medium transition-colors flex flex-col items-center justify-center ${
                  imageResolution === resolution
                    ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/50"
                    : `bg-[var(--surface)] text-[var(--muted)] border border-transparent ${
                        modelSupportsResolution ? "hover:bg-[var(--divider)]" : ""
                      }`
                } ${!resolutionAvailable ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <span>{resolution}</span>
                {showCreditsCost && cost !== null ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] opacity-70">
                    <Zap size={10} strokeWidth={2} />
                    {cost}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
