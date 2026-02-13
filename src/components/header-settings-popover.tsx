"use client";

import { useState, useEffect, useRef } from "react";
import { Settings, ChevronDown, Zap } from "lucide-react";
import {
  ASPECT_RATIOS,
  RESOLUTIONS,
  type ImageAspectRatio,
  type ImageResolution,
  computeAdjustedCreditsCost,
  supportsResolution,
} from "@/lib/image-models";
import { useGeneration } from "@/context/generation-context";

export function HeaderSettingsPopover() {
  const { state, isRegistered, setAspectRatio, setResolution } = useGeneration();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { aspectRatio, resolution, baseCost, showCreditsCost, modelId } = state;
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

  if (!isRegistered) return null;

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
        <div className="absolute top-full mt-1 right-0 w-56 rounded-[var(--radius-md)] bg-[var(--background)] border border-[var(--divider)] shadow-lg z-50 overflow-hidden">
          {/* Aspect Ratio Section */}
          <div className="px-3 py-2 border-b border-[var(--divider)]/50">
            <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-1">Aspect Ratio</p>
            {(Object.keys(ASPECT_RATIOS) as ImageAspectRatio[]).map((ratio) => (
              <button
                key={ratio}
                onClick={() => setAspectRatio(ratio)}
                className={`w-full px-2 py-1.5 text-left text-sm rounded-[var(--radius-sm)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface)] ${
                  aspectRatio === ratio ? "bg-[var(--surface)] text-[var(--foreground)]" : "text-[var(--muted)]"
                }`}
              >
                {ASPECT_RATIOS[ratio].label}
              </button>
            ))}
          </div>

          {/* Resolution Section */}
          <div className="px-3 py-2">
            <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider mb-1">Resolution</p>
            {!modelSupportsRes && (
              <p className="text-[10px] text-[var(--muted)] mb-1.5 opacity-70">
                Not supported by this model
              </p>
            )}
            {(Object.keys(RESOLUTIONS) as ImageResolution[]).map((res) => {
              const cost = computeAdjustedCreditsCost(baseCost, res, modelId);
              return (
                <button
                  key={res}
                  onClick={() => setResolution(res)}
                  className={`w-full px-2 py-1.5 flex items-center justify-between text-sm rounded-[var(--radius-sm)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface)] ${
                    resolution === res ? "bg-[var(--surface)] text-[var(--foreground)]" : "text-[var(--muted)]"
                  } ${!modelSupportsRes ? "opacity-60" : ""}`}
                >
                  <span>{RESOLUTIONS[res].label}</span>
                  {showCreditsCost && (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                      <Zap size={12} strokeWidth={2} />
                      ≤{cost}
                    </span>
                  )}
                </button>
              );
            })}
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

  const { aspectRatio, resolution, baseCost, showCreditsCost, modelId } = state;
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

      {/* Resolution Row */}
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
    </>
  );
}
