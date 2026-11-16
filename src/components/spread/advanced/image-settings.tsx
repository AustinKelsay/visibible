"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { AdvancedItem } from "@/components/spread/advanced/item";
import { useSession } from "@/context/session-context";
import { imageModelsUrl, useWorkScope } from "@/context/work-scope-context";
import { offerAdvancedSettings, setAdvancedSetting, useAdvancedSettings } from "@/lib/advanced-settings";
import { trackPreferenceChanged } from "@/lib/analytics";
import {
  ASPECT_RATIOS,
  RESOLUTIONS,
  getEstimatedCreditsCostForResolution,
  imageCapabilities,
  isImageModelSelectable,
  normalizeResolutionForModel,
  resolutionChoice,
  shortImageModelName,
  soleImageModel,
  type ImageAspectRatio,
  type ImageModel,
  type ImageResolution,
} from "@/lib/image-models";

// This item lets the reader change these; without it they stay at their defaults.
offerAdvancedSettings("imageModel", "aspectRatio", "resolution");

const OPTION =
  "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white";

/**
 * Image settings: the model, aspect ratio and resolution new pictures are painted with, behaving as the old image
 * settings did. A choice the server declines is shown as unavailable. They apply to the paint button, "paint
 * another", automatic painting and bulk painting.
 */
export function ImageSettingsItem() {
  const { imageModel, aspectRatio, resolution } = useAdvancedSettings();
  const { tier, credits } = useSession();
  const catalogUrl = imageModelsUrl(useWorkScope());
  // The catalog as read for one address, so another work's catalog never shows while this one loads.
  const [catalog, setCatalog] = useState<{ url: string; models: ImageModel[]; failed: boolean } | null>(null);
  const current = catalog?.url === catalogUrl ? catalog : null;
  const models = current ? current.models : null;
  const failed = current?.failed ?? false;

  // A fresh model list and prices each time the item opens.
  useEffect(() => {
    let cancelled = false;
    fetch(catalogUrl, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const loaded = Array.isArray(data.models) && data.models.length > 0;
        setCatalog({ url: catalogUrl, models: loaded ? data.models : [], failed: !loaded });
      })
      .catch(() => {
        if (!cancelled) setCatalog({ url: catalogUrl, models: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [catalogUrl]);

  const selected = models?.find((model) => model.id === imageModel);
  const showPrices = tier !== "admin";
  const track = (preference: "imageModel" | "imageAspectRatio" | "imageResolution", value: string) =>
    trackPreferenceChanged({ preference, value, source: "advanced", tier, hasCredits: credits > 0 });

  const chooseModel = (model: ImageModel) => {
    setAdvancedSetting("imageModel", model.id);
    const nextResolution = normalizeResolutionForModel(model.id, resolution);
    if (nextResolution !== resolution) setAdvancedSetting("resolution", nextResolution);
    track("imageModel", model.id);
  };
  const aspectRatios = imageCapabilities(imageModel)?.aspectRatios ?? (Object.keys(ASPECT_RATIOS) as ImageAspectRatio[]);
  const sole = models ? soleImageModel(models, imageModel) : null;

  return (
    <AdvancedItem title="Image settings">
      <p className="px-3 pb-1 text-xs text-white/60">For the next pictures painted.</p>

      <p id="advanced-image-model" className="px-3 pt-1 text-sm font-medium text-white/85">Model</p>
      {models === null && !failed ? (
        <p className="px-3 py-2 text-sm text-white/60">Loading models…</p>
      ) : failed && !models?.length ? (
        <p className="px-3 py-2 text-sm text-white/60">The model list is unavailable. Reopen to try again.</p>
      ) : sole ? (
        // One usable model: name it, with nothing to choose.
        <p className="px-3 py-2 text-sm text-white/90">{shortImageModelName(sole.name)}</p>
      ) : (
        <div role="radiogroup" aria-labelledby="advanced-image-model">
          {models!.map((model) => {
            const available = isImageModelSelectable(model);
            const cost = getEstimatedCreditsCostForResolution(model, resolution);
            const isSelected = model.id === imageModel;
            return (
              <button
                key={model.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-disabled={!available}
                onClick={() => available && chooseModel(model)}
                className={`${OPTION} ${available ? "text-white/90 hover:bg-white/10" : "cursor-not-allowed text-white/45"}`}
              >
                <Check size={14} aria-hidden="true" className={`shrink-0 ${isSelected ? "" : "invisible"}`} />
                <span className="min-w-0 flex-1 truncate">{shortImageModelName(model.name)}</span>
                <span className="shrink-0 text-xs text-white/55">
                  {!available ? "Unavailable" : showPrices && cost !== null ? `About ${cost} credits` : null}
                </span>
              </button>
            );
          })}
          {models && models.length > 0 && !selected ? (
            <p className="px-3 py-1 text-xs text-white/60">The chosen model is unavailable. Choose another.</p>
          ) : null}
          {selected && !isImageModelSelectable(selected) && selected.unavailableReason ? (
            <p className="px-3 py-1 text-xs text-white/60">{selected.unavailableReason}</p>
          ) : null}
        </div>
      )}

      <p id="advanced-aspect-ratio" className="px-3 pt-2 text-sm font-medium text-white/85">Aspect ratio</p>
      <div role="radiogroup" aria-labelledby="advanced-aspect-ratio">
        {(Object.keys(ASPECT_RATIOS) as ImageAspectRatio[]).map((ratio) => {
          const available = aspectRatios.includes(ratio);
          const isSelected = ratio === aspectRatio;
          return (
            <button
              key={ratio}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={!available}
              onClick={() => {
                if (!available || isSelected) return;
                setAdvancedSetting("aspectRatio", ratio);
                track("imageAspectRatio", ratio);
              }}
              className={`${OPTION} ${available ? "text-white/90 hover:bg-white/10" : "cursor-not-allowed text-white/45"}`}
            >
              <Check size={14} aria-hidden="true" className={`shrink-0 ${isSelected ? "" : "invisible"}`} />
              <span className="flex-1">{ASPECT_RATIOS[ratio].label}</span>
              {!available ? <span className="shrink-0 text-xs text-white/55">Not available</span> : null}
            </button>
          );
        })}
      </div>

      <p id="advanced-resolution" className="px-3 pt-2 text-sm font-medium text-white/85">Resolution</p>
      <div role="radiogroup" aria-labelledby="advanced-resolution">
        {(Object.keys(RESOLUTIONS) as ImageResolution[]).map((option) => {
          const { available, cost } = resolutionChoice(imageModel, selected, option);
          const isSelected = option === resolution;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={!available}
              onClick={() => {
                if (!available || isSelected) return;
                setAdvancedSetting("resolution", option);
                track("imageResolution", option);
              }}
              className={`${OPTION} ${available ? "text-white/90 hover:bg-white/10" : "cursor-not-allowed text-white/45"}`}
            >
              <Check size={14} aria-hidden="true" className={`shrink-0 ${isSelected ? "" : "invisible"}`} />
              <span className="flex-1">{RESOLUTIONS[option].label}</span>
              <span className="shrink-0 text-xs text-white/55">
                {!available ? "Not available" : showPrices && cost !== null ? `About ${cost} credits` : null}
              </span>
            </button>
          );
        })}
      </div>
    </AdvancedItem>
  );
}
