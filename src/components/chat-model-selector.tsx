"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, MessageSquare, Loader2 } from "lucide-react";
import { usePreferences } from "@/context/preferences-context";
import { ChatModel, DEFAULT_CHAT_MODEL, formatContextLength } from "@/lib/chat-models";

interface ChatModelSelectorProps {
  variant?: "compact" | "indicator";
}

interface GroupedModels {
  [provider: string]: ChatModel[];
}

export function ChatModelSelector({ variant = "compact" }: ChatModelSelectorProps) {
  const { chatModel, setChatModel } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef(false);

  // Fetch models when dropdown opens (lazy loading)
  useEffect(() => {
    if (isOpen && !hasFetched.current && models.length === 0) {
      hasFetched.current = true;
      setIsLoading(true);
      setError(null);

      fetch("/api/chat-models")
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
          console.error("Failed to fetch chat models:", err);
          setError("Failed to load models");
          // Set fallback model
          setModels([
            {
              id: DEFAULT_CHAT_MODEL,
              name: "GPT-OSS 120B (Default)",
              provider: "Openai",
              contextLength: 131072,
            },
          ]);
        })
        .finally(() => {
          setIsLoading(false);
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
    setChatModel(modelId);
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
  const currentModel = models.find((m) => m.id === chatModel);
  const displayName = currentModel?.name || chatModel.split("/").pop() || "Model";
  // Compact display: just show a short version
  const compactName = displayName.length > 15 ? displayName.substring(0, 13) + "…" : displayName;

  // Indicator variant - minimal display for chat input area
  if (variant === "indicator") {
    return (
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] rounded-md hover:bg-[var(--surface)]"
          aria-label={`Current chat model: ${displayName}. Click to change.`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <MessageSquare size={12} className="opacity-60" />
          <span className="max-w-[120px] truncate">{compactName}</span>
          <ChevronDown
            size={12}
            className={`transition-transform duration-[var(--motion-fast)] ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isOpen && (
          <div
            className="absolute left-0 bottom-full mb-1 w-80 max-h-80 overflow-y-auto rounded-lg bg-[var(--background)] border border-[var(--divider)] shadow-lg z-50"
            role="listbox"
            aria-label="Select chat model"
          >
            {renderDropdownContent()}
          </div>
        )}
      </div>
    );
  }

  // Compact variant - for header
  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-sm font-medium transition-colors duration-[var(--motion-fast)] min-h-[44px] px-2 text-[var(--muted)] hover:text-[var(--foreground)]"
        aria-label={`Current chat model: ${displayName}. Click to change.`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <MessageSquare size={16} className="opacity-60" />
        <span className="hidden sm:inline">{compactName}</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-[var(--motion-fast)] ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto rounded-lg bg-[var(--background)] border border-[var(--divider)] shadow-lg z-50"
          role="listbox"
          aria-label="Select chat model"
        >
          {renderDropdownContent()}
        </div>
      )}
    </div>
  );

  function renderDropdownContent() {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
          <span className="ml-2 text-sm text-[var(--muted)]">Loading models...</span>
        </div>
      );
    }

    if (error && models.length === 0) {
      return <div className="px-3 py-4 text-sm text-red-500 text-center">{error}</div>;
    }

    return Object.entries(groupedModels).map(([provider, providerModels]) => (
      <div key={provider}>
        <div className="px-3 py-2 text-xs font-medium text-[var(--muted)] uppercase tracking-wider bg-[var(--surface)] sticky top-0">
          {provider}
        </div>
        {providerModels.map((model) => {
          const isSelected = chatModel === model.id;
          return (
            <button
              key={model.id}
              onClick={() => handleSelect(model.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--surface)] transition-colors duration-[var(--motion-fast)] ${
                isSelected ? "bg-[var(--surface)]" : ""
              }`}
              role="option"
              aria-selected={isSelected}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{model.name}</div>
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="truncate">{model.id}</span>
                  <span className="flex-shrink-0">• {formatContextLength(model.contextLength)} ctx</span>
                </div>
              </div>
              {isSelected && (
                <Check size={16} className="text-[var(--accent)] flex-shrink-0 ml-2" />
              )}
            </button>
          );
        })}
      </div>
    ));
  }
}
