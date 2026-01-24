"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, ImageIcon, Loader2 } from "lucide-react";
import { usePreferences } from "@/context/preferences-context";
import { ImageModel, DEFAULT_IMAGE_MODEL } from "@/lib/image-models";

interface ImageModelSelectorProps {
  variant?: "compact" | "full";
}

interface GroupedModels {
  [provider: string]: ImageModel[];
}

export function ImageModelSelector({ variant = "compact" }: ImageModelSelectorProps) {
  const { imageModel, setImageModel } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<ImageModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef(false);

  // Fetch models when dropdown opens (lazy loading)
  useEffect(() => {
    if (isOpen && !hasFetched.current && models.length === 0) {
      hasFetched.current = true;
      
      // Defer state updates to avoid synchronous setState in effect
      queueMicrotask(() => {
        setIsLoading(true);
        setError(null);

        fetch("/api/image-models")
          .then((res) => res.json())
          .then((data) => {
            if (data.models) {
              setModels(data.models);
            }
            if (data.error) {
              setError(data.error);
            }
          })
          .catch((err) => {
            console.error("Failed to fetch image models:", err);
            setError("Failed to load models");
            // Set fallback model with conservative estimate
            setModels([
              {
                id: DEFAULT_IMAGE_MODEL,
                name: "Gemini 2.5 Flash (Default)",
                provider: "Google",
                creditsCost: 35, // Conservative estimate
                etaSeconds: 12,
              },
            ]);
          })
          .finally(() => {
            setIsLoading(false);
          });
      });
    }
  }, [isOpen, models.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (modelId: string) => {
    setImageModel(modelId);
    setIsOpen(false);
  };

  // Group models by provider
  const groupedModels: GroupedModels = models.reduce((acc, model) => {
    const provider = model.provider || "Other";
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(model);
    return acc;
  }, {} as GroupedModels);

  // Get current model info
  const currentModel = models.find((m) => m.id === imageModel);
  const displayName = currentModel?.name || imageModel.split("/").pop() || "Model";
  // Compact display: just show a short version
  const compactName = displayName.length > 15 ? displayName.substring(0, 13) + "…" : displayName;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 text-sm font-medium transition-colors duration-[var(--motion-fast)] ${
          variant === "compact"
            ? "min-h-[44px] px-2 text-[var(--muted)] hover:text-[var(--foreground)]"
            : "px-3 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)]"
        }`}
        aria-label={`Current image model: ${displayName}. Click to change.`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={`Image model: ${displayName}`}
      >
        <ImageIcon size={16} className="opacity-60" />
        <span className="hidden sm:inline">{compactName}</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-[var(--motion-fast)] ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-[calc(100vw-2rem)] sm:w-80 max-h-[60vh] sm:max-h-96 overflow-y-auto rounded-lg bg-[var(--background)] border border-[var(--divider)] shadow-lg z-50"
          role="listbox"
          aria-label="Select image generation model"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
              <span className="ml-2 text-sm text-[var(--muted)]">Loading models...</span>
            </div>
          ) : error && models.length === 0 ? (
            <div className="px-3 py-4 text-sm text-red-500 text-center">{error}</div>
          ) : (
            <>
              {Object.entries(groupedModels).map(([provider, providerModels]) => (
                <div key={provider}>
                  <div className="px-3 py-2 text-xs font-medium text-[var(--muted)] uppercase tracking-wider bg-[var(--surface)] sticky top-0">
                    {provider}
                  </div>
                  {providerModels.map((model) => {
                    const isSelected = imageModel === model.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => model.creditsCost != null && handleSelect(model.id)}
                        disabled={model.creditsCost == null}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ${
                          model.creditsCost == null
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-[var(--surface)]"
                        } ${isSelected ? "bg-[var(--surface)]" : ""}`}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={model.creditsCost == null}
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
              {/* Refund note */}
              <div className="px-3 py-2 text-[10px] text-[var(--muted)] border-t border-[var(--divider)] bg-[var(--surface)]">
                Unused credits refunded after generation
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
