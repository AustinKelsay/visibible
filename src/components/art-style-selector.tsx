"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Palette } from "lucide-react";
import { usePreferences } from "@/context/preferences-context";
import { ART_STYLES, type ArtStyleAvailability } from "@/lib/art-styles";
import type { PreferenceChangeSource } from "@/lib/analytics";

interface ArtStyleSelectorProps {
  variant?: "compact" | "full";
  /** Which control the change is attributed to in analytics. */
  source?: PreferenceChangeSource;
}

/** The reader's art style, beside the model (#177): Classical, Ink & Watercolor, Byzantine Icon in the brief's order. */
export function ArtStyleSelector({ variant = "compact", source = "art_style_selector" }: ArtStyleSelectorProps) {
  const { artStyle, setArtStyle } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [availability, setAvailability] = useState<ArtStyleAvailability[] | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef(false);

  // Availability comes from the catalog route, which applies the same admission decision as generation;
  // it is fetched again each time the selector opens so a changed rollout mode shows without a reload.
  useEffect(() => {
    if (!isOpen) { hasFetched.current = false; return; }
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetch("/api/image-models", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data.artStyles)) setAvailability(data.artStyles); })
      .catch(() => { /* availability stays unknown; selection still works */ });
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options = availability ?? ART_STYLES.map((style) => ({ ...style, available: true, reason: null }));
  const current = options.find((style) => style.id === artStyle) ?? options[0];

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Art style: ${current.label}`}
        className={`flex items-center text-sm font-medium transition-colors duration-[var(--motion-fast)] ${
          variant === "compact"
            ? "min-h-[44px] min-w-[44px] justify-center gap-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
            : "gap-1 px-3 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)]"
        }`}
      >
        <Palette size={16} strokeWidth={1.5} />
        {variant === "full" ? <span>{current.label}</span> : null}
        <ChevronDown size={12} strokeWidth={1.5} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <div role="listbox" aria-label="Art style" className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--background)] shadow-lg">
          {options.map((style) => {
            const isSelected = style.id === artStyle;
            return (
              <button
                key={style.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { setArtStyle(style.id, source); setIsOpen(false); }}
                className={`flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface)] ${isSelected ? "bg-[var(--accent)]/10" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{style.label}</span>
                  <span className="block text-xs text-[var(--muted)]">{style.available ? style.description : "Temporarily unavailable for generation"}</span>
                </span>
                {isSelected ? <Check size={16} className="mt-0.5 flex-shrink-0 text-[var(--accent)]" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
