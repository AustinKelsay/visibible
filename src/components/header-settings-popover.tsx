"use client";

import { useState, useEffect, useRef } from "react";
import { Settings, ChevronDown, Zap, Check } from "lucide-react";
import {
  ASPECT_RATIOS,
  getEstimatedCreditsCostForResolution,
  shortImageModelName,
  type ImageModel,
  RESOLUTIONS,
  type ImageAspectRatio,
  type ImageResolution,
  supportsResolution,
} from "@/lib/image-models";
import { useGeneration } from "@/context/generation-context";
import { usePreferences } from "@/context/preferences-context";

// Selected rows get the same blue tint as the mobile settings, plus a check, so they differ from hover
const rowClassName = (selected: boolean) =>
  `w-full px-2 py-1.5 flex items-center gap-2 text-left text-sm rounded-[var(--radius-sm)] transition-colors duration-[var(--motion-fast)] ${
    selected ? "bg-[var(--accent)]/10 text-[var(--foreground)] font-medium" : "text-[var(--muted)] hover:bg-[var(--surface)]"
  }`;

function SelectedMark({ selected }: { selected: boolean }) {
  return <Check size={14} strokeWidth={2} aria-hidden="true" className={`shrink-0 text-[var(--accent)] ${selected ? "" : "invisible"}`} />;
}

export function HeaderSettingsPopover() {
  const { state, isRegistered, setAspectRatio, setResolution } = useGeneration();
  const { imageModel, setImageModel, imageAspectRatio, imageResolution } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<ImageModel[]>([]);
  const [modelsFailed, setModelsFailed] = useState(false);

  // Fresh model list and prices each time the popover opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch("/api/image-models", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const loaded = Array.isArray(data.models) && data.models.length > 0;
        if (loaded) setModels(data.models);
        setModelsFailed(!loaded);
      })
      .catch((error) => {
        console.error("Failed to fetch image models:", error);
        if (!cancelled) setModelsFailed(true);
      });
    return () => { cancelled = true; };
  }, [isOpen]);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { aspectRatio, resolution, displayCostByResolution, showCreditsCost, modelId } = state;
  const modelSupportsRes = supportsResolution(modelId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isRegistered) {
    return (
      <span
        className="min-h-[36px] px-2.5 flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] opacity-60 cursor-default"
        title="Image settings apply on the Images tab"
      >
        <Settings size={14} strokeWidth={1.5} />
        <span>{imageAspectRatio} · {imageResolution}</span>
      </span>
    );
  }

  return (
    <div ref={popoverRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-[36px] px-2.5 flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] rounded-[var(--radius-md)] transition-colors duration-[var(--motion-fast)]"
        aria-label="Image settings"
        aria-expanded={isOpen}
      >
        <Settings size={14} strokeWidth={1.5} />
        <span>{aspectRatio} · {resolution}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-[var(--motion-fast)] ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="absolute top-full mt-1 right-0 w-80 max-h-[calc(100svh-5rem)] overflow-y-auto rounded-[var(--radius-md)] bg-[var(--background)] border border-[var(--divider)] shadow-lg z-50">
          {/* Model Section */}
          {(models.length > 0 || modelsFailed) && (
            <div className="px-3 py-2 border-b border-[var(--divider)]/50">
              <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-1">Model</p>
              {models.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-[var(--muted)]">Model list unavailable. Reopen to try again.</p>
              )}
              {models.map((model) => {
                const available = model.availability !== "unavailable" &&
                  getEstimatedCreditsCostForResolution(model, "1K") !== null;
                const cost = getEstimatedCreditsCostForResolution(model, resolution);
                return (
                  <button
                    key={model.id}
                    type="button"
                    aria-pressed={imageModel === model.id}
                    onClick={() => available && setImageModel(model.id, "header_settings_popover")}
                    disabled={!available}
                    className={`${rowClassName(imageModel === model.id)} ${!available ? "opacity-60" : ""}`}
                  >
                    <SelectedMark selected={imageModel === model.id} />
                    <span className="flex-1 truncate">{shortImageModelName(model.name)}</span>
                    {showCreditsCost && cost !== null && (
                      <span className="shrink-0 text-xs font-normal text-[var(--muted)]">About {cost} credits</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Aspect Ratio Section */}
          <div className="px-3 py-2 border-b border-[var(--divider)]/50">
            <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-1">Aspect Ratio</p>
            {(Object.keys(ASPECT_RATIOS) as ImageAspectRatio[]).map((ratio) => (
              <button
                key={ratio}
                type="button"
                aria-pressed={aspectRatio === ratio}
                onClick={() => setAspectRatio(ratio, "header_settings_popover")}
                className={rowClassName(aspectRatio === ratio)}
              >
                <SelectedMark selected={aspectRatio === ratio} />
                {ASPECT_RATIOS[ratio].label}
              </button>
            ))}
          </div>

          {/* Resolution Section */}
          <div className="px-3 py-2">
            <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-1">Resolution</p>
            {(Object.keys(RESOLUTIONS) as ImageResolution[]).map((res) => {
              const cost = displayCostByResolution?.[res];
              const resolutionAvailable = displayCostByResolution ? cost !== undefined : modelSupportsRes;
              return (
                <button
                  key={res}
                  onClick={() => {
                    if (resolutionAvailable) {
                      setResolution(res, "header_settings_popover");
                    }
                  }}
                  type="button"
                  aria-pressed={resolution === res}
                  disabled={!resolutionAvailable}
                  aria-disabled={!resolutionAvailable}
                  className={`${rowClassName(resolution === res)} ${!resolutionAvailable ? "opacity-60" : ""}`}
                >
                  <SelectedMark selected={resolution === res} />
                  <span className="flex-1">{RESOLUTIONS[res].label}</span>
                  {showCreditsCost && cost !== undefined && (
                    <span className="shrink-0 text-xs font-normal text-[var(--muted)]">About {cost} credits</span>
                  )}
                </button>
              );
            })}
            {!modelSupportsRes && (
              <p className="mt-1.5 px-2 text-xs text-[var(--muted)]">2K and 4K are not available for this model</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline settings rows for mobile hamburger dropdown.
 * Renders aspect ratio and resolution as labeled rows matching existing dropdown style.
 */
export function MobileSettingsRows() {
  const { state, isRegistered, setAspectRatio, setResolution } = useGeneration();

  if (!isRegistered) return null;

  const { aspectRatio, resolution, displayCostByResolution, showCreditsCost, modelId } = state;
  const modelSupportsRes = supportsResolution(modelId);

  return (
    <>
      {/* Aspect Ratio Row */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[var(--foreground)]">Aspect Ratio</span>
        </div>
        <div className="flex gap-2">
          {(Object.keys(ASPECT_RATIOS) as ImageAspectRatio[]).map((ratio) => (
            <button
              key={ratio}
              onClick={() => setAspectRatio(ratio, "mobile_header_menu")}
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

      {/* Resolution Row */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[var(--foreground)]">Resolution</span>
          {!modelSupportsRes && (
            <span className="text-[10px] text-[var(--muted)]">2K and 4K unavailable for this model</span>
          )}
        </div>
        <div className="flex gap-2">
          {(Object.keys(RESOLUTIONS) as ImageResolution[]).map((res) => {
            const cost = displayCostByResolution?.[res];
              const resolutionAvailable = displayCostByResolution ? cost !== undefined : modelSupportsRes;
            return (
              <button
                key={res}
                onClick={() => {
                  if (resolutionAvailable) {
                    setResolution(res, "mobile_header_menu");
                  }
                }}
                disabled={!resolutionAvailable}
                aria-disabled={!resolutionAvailable}
                className={`flex-1 min-h-[36px] rounded-[var(--radius-md)] text-xs font-medium transition-colors flex flex-col items-center justify-center ${
                  resolution === res
                    ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/50"
                    : "bg-[var(--surface)] text-[var(--muted)] border border-transparent hover:bg-[var(--divider)]"
                } ${!resolutionAvailable ? "opacity-60" : ""}`}
              >
                <span>{res}</span>
                {showCreditsCost && cost !== undefined && (
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
    </>
  );
}
