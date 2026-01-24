"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check, MessageSquare, Loader2, Search } from "lucide-react";
import { usePreferences } from "@/context/preferences-context";
import { useSession } from "@/context/session-context";
import { ChatModel, DEFAULT_CHAT_MODEL, formatContextLength } from "@/lib/chat-models";

interface ChatModelSelectorProps {
  variant?: "compact" | "indicator";
}

interface GroupedModels {
  [provider: string]: ChatModel[];
}

export function ChatModelSelector({ variant = "compact" }: ChatModelSelectorProps) {
  const { chatModel, setChatModel } = usePreferences();
  const { tier } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
              isFree: false,
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

  // Reset search when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  const handleSelect = (modelId: string) => {
    setChatModel(modelId);
    setIsOpen(false);
  };

  // Filter models by search query
  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      // Search filter - match name or ID
      const matchesSearch =
        searchQuery === "" ||
        model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.id.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSearch;
    });
  }, [models, searchQuery]);

  // Group filtered models by provider
  const groupedModels: GroupedModels = filteredModels.reduce((acc, model) => {
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
            className="absolute left-0 bottom-full mb-1 w-[calc(100vw-2rem)] sm:w-80 max-h-[60vh] sm:max-h-80 overflow-y-auto rounded-lg bg-[var(--background)] border border-[var(--divider)] shadow-lg z-50"
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
          className="absolute right-0 top-full mt-1 w-[calc(100vw-2rem)] sm:w-80 max-h-[60vh] sm:max-h-96 overflow-y-auto rounded-lg bg-[var(--background)] border border-[var(--divider)] shadow-lg z-50"
          role="listbox"
          aria-label="Select chat model"
        >
          {renderDropdownContent()}
        </div>
      )}
    </div>
  );

  function renderDropdownContent() {
    return (
      <>
        {/* Search Input */}
        <div className="p-3 border-b border-[var(--divider)] sticky top-0 bg-[var(--background)] z-10">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="w-full min-h-[44px] pl-9 pr-4 py-2 bg-[var(--surface)] border border-[var(--divider)] rounded-[var(--radius-md)] text-base sm:text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-shadow duration-[var(--motion-fast)]"
              aria-label="Search chat models"
            />
          </div>
        </div>

        {/* Credits Info */}
        {tier !== "admin" && (
          <div className="px-3 py-2 border-b border-[var(--divider)] text-xs text-[var(--muted)] space-y-1">
            <div className="font-medium text-[var(--foreground)]">Early Access</div>
            <div>Credits are used for AI chats and image generation</div>
            <div>Lightning payments only (no on-chain)</div>
            <div>No refunds during alpha</div>
            <div className="font-medium text-[var(--foreground)] mt-2 pt-2 border-t border-[var(--divider)]">
              ⚠️ No account: Credits are session-only
            </div>
            <div>
              Credits are stored in your browser session. If you clear your cache or use a different browser, your credits will be lost.
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
            <span className="ml-2 text-sm text-[var(--muted)]">Loading models...</span>
          </div>
        )}

        {/* Error State */}
        {error && models.length === 0 && !isLoading && (
          <div className="px-3 py-4 text-sm text-red-500 text-center">{error}</div>
        )}

        {/* Empty State */}
        {Object.keys(groupedModels).length === 0 && !isLoading && models.length > 0 && (
          <div className="px-3 py-8 text-sm text-[var(--muted)] text-center">
            No models found
          </div>
        )}

        {/* Model List */}
        {Object.entries(groupedModels).map(([provider, providerModels]) => (
          <div key={provider}>
            <div className="px-3 py-2 text-xs font-medium text-[var(--muted)] uppercase tracking-wider bg-[var(--surface)] sticky top-[68px]">
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
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{model.name}</span>
                    </div>
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
        ))}
      </>
    );
  }
}
