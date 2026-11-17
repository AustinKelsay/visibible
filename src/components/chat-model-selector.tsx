"use client";

import { formatModelId } from "@/lib/image-models";
import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check, MessageSquare, Loader2, Search } from "lucide-react";
import {
  ChatModel,
  DEFAULT_CHAT_MODEL,
  formatContextLength,
  getSuggestedChatModels,
} from "@/lib/chat-models";

interface ChatModelSelectorProps {
  /** The chosen model and how to change it. */
  value: string;
  onChange: (modelId: string) => void;
}

interface GroupedModels {
  [provider: string]: ChatModel[];
}

/** Advanced's answering-model choice: a button whose list opens below it, in the flow of the menu. */
export function ChatModelSelector({ value: chatModel, onChange }: ChatModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef(false);

  // Fetch models on mount so the indicator shows a readable name, and when the dropdown opens
  useEffect(() => {
    if ((isOpen || models.length === 0) && !hasFetched.current) {
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
            hasFetched.current = false; // reported failure: retry on the next open
          }
        })
        .catch((err) => {
          console.error("Failed to fetch chat models:", err);
          setError("Failed to load models");
          hasFetched.current = false; // retry on the next open; the fallback list stays meanwhile
          // Set fallback model
          setModels([
            {
              id: DEFAULT_CHAT_MODEL,
              name: "GPT-6 Luna (Default)",
              provider: "Openai",
              contextLength: 1050000,
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
    onChange(modelId);
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

  const suggestedModels = useMemo(() => getSuggestedChatModels(filteredModels), [filteredModels]);

  // Group filtered models by provider, excluding the curated suggestions shown at the top
  const groupedModels = useMemo(() => {
    const suggestedModelIds = new Set(suggestedModels.map((model) => model.id));

    return filteredModels.reduce((acc, model) => {
      if (suggestedModelIds.has(model.id)) {
        return acc;
      }

      const provider = model.provider || "Other";
      if (!acc[provider]) {
        acc[provider] = [];
      }
      acc[provider].push(model);
      return acc;
    }, {} as GroupedModels);
  }, [filteredModels, suggestedModels]);

  // Get current model info
  const currentModel = models.find((m) => m.id === chatModel);
  // Drop only the "Provider: " prefix and the "(Default)" marker; keep qualifiers such as "(free)"
  const displayName = currentModel
    ? currentModel.name.replace(/^[^:]+:\s*/, "").replace(/\s*\(Default\)$/i, "")
    : formatModelId(chatModel);
  const hasVisibleModels = suggestedModels.length > 0 || Object.keys(groupedModels).length > 0;

  return (
    <div ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--foreground)]"
        aria-label={`Answering model: ${displayName}. Change it.`}
        aria-expanded={isOpen}
      >
        <MessageSquare size={14} aria-hidden="true" className="shrink-0 opacity-60" />
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-[var(--motion-fast)] ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div
          className="mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-[var(--divider)] bg-[var(--background)]"
          role="group"
          aria-label="Answering models"
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
        {!hasVisibleModels && !isLoading && models.length > 0 && (
          <div className="px-3 py-8 text-sm text-[var(--muted)] text-center">
            No models found
          </div>
        )}

        {/* Model List */}
        {suggestedModels.length > 0 && (
          <div>
            <div className="px-3 py-2 text-xs font-medium text-[var(--muted)] uppercase tracking-wider bg-[var(--surface)] sticky top-[68px]">
              Suggested
            </div>
            {suggestedModels.map((model) => renderModelOption(model))}
          </div>
        )}

        {Object.entries(groupedModels).map(([provider, providerModels]) => (
          <div key={provider}>
            <div className="px-3 py-2 text-xs font-medium text-[var(--muted)] uppercase tracking-wider bg-[var(--surface)] sticky top-[68px]">
              {provider}
            </div>
            {providerModels.map((model) => renderModelOption(model))}
          </div>
        ))}
      </>
    );
  }

  function renderModelOption(model: ChatModel) {
    const isSelected = chatModel === model.id;

    return (
      <button
        key={model.id}
        type="button"
        onClick={() => handleSelect(model.id)}
        className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--surface)] transition-colors duration-[var(--motion-fast)] ${
          isSelected ? "bg-[var(--surface)]" : ""
        }`}
        aria-pressed={isSelected}
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
  }
}
