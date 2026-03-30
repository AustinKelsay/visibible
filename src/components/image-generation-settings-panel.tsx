"use client";

import { useMemo } from "react";
import { Check, Loader2, Zap } from "lucide-react";
import { useGeneration } from "@/context/generation-context";
import { usePreferences } from "@/context/preferences-context";
import {
  ASPECT_RATIOS,
  DEFAULT_IMAGE_ESTIMATED_CREDITS_COST,
  RESOLUTIONS,
  getEstimatedCreditsCostForResolution,
  supportsResolution,
  type ImageAspectRatio,
  type ImageModel,
  type ImageResolution,
} from "@/lib/image-models";

interface ImageGenerationSettingsPanelProps {
  models: ImageModel[];
  modelsLoading: boolean;
  modelsError: string | null;
  scenePlannerCreditsCost: number;
}

export function ImageGenerationSettingsPanel({
  models,
  modelsLoading,
  modelsError,
  scenePlannerCreditsCost,
}: ImageGenerationSettingsPanelProps) {
  const { state, setAspectRatio, setResolution } = useGeneration();
  const {
    imageModel,
    imageAspectRatio,
    imageResolution,
    setImageModel,
  } = usePreferences();
  const {
    baseCost,
    displayCostByResolution,
    modelId: generationModelId,
    scenePlannerCreditsCost: generationScenePlannerCreditsCost,
    showCreditsCost,
  } = state;

  const selectedModelId = imageModel || generationModelId;
  const plannerCreditsCost =
    scenePlannerCreditsCost || generationScenePlannerCreditsCost;
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
      resolution,
      plannerCreditsCost
    ) ?? DEFAULT_IMAGE_ESTIMATED_CREDITS_COST;

  const getResolutionDisplayCost = (resolution: ImageResolution) => {
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
        resolution,
        plannerCreditsCost
      ) ??
      DEFAULT_IMAGE_ESTIMATED_CREDITS_COST
    );
  };

  return (
    <div className="space-y-5">
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
                    const isSelected = selectedModelId === model.id;
                    const isPricingAvailable =
                      model.estimatedCreditsByResolution != null ||
                      model.creditsCost != null ||
                      model.reservationCreditsCost != null;

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
                              "Pricing unavailable"
                            ) : (
                              <>~{model.etaSeconds ?? 12}s · About {getModelDisplayCost(model, imageResolution)} credits</>
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

            return (
              <button
                key={resolution}
                onClick={() => setResolution(resolution, "header_generate_modal")}
                className={`flex-1 min-h-[36px] rounded-[var(--radius-md)] text-xs font-medium transition-colors flex flex-col items-center justify-center ${
                  imageResolution === resolution
                    ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/50"
                    : "bg-[var(--surface)] text-[var(--muted)] border border-transparent hover:bg-[var(--divider)]"
                } ${!modelSupportsResolution ? "opacity-60" : ""}`}
              >
                <span>{resolution}</span>
                {showCreditsCost ? (
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
