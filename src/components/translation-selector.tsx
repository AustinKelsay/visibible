"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { usePreferences } from "@/context/preferences-context";
import { TRANSLATIONS, TRANSLATION_GROUPS, Translation } from "@/lib/bible-api";

interface TranslationSelectorProps {
  variant?: "compact" | "full";
}

export function TranslationSelector({ variant = "compact" }: TranslationSelectorProps) {
  const { translation, setTranslation, translationInfo } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleSelect = (key: Translation) => {
    setTranslation(key);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 text-sm font-medium transition-colors duration-[var(--motion-fast)] ${
          variant === "compact"
            ? "min-h-[44px] px-3 text-[var(--muted)] hover:text-[var(--foreground)]"
            : "px-3 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)]"
        }`}
        aria-label={`Current translation: ${translationInfo.name}. Click to change.`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span>{translationInfo.code}</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-[var(--motion-fast)] ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-72 max-h-80 overflow-y-auto rounded-lg bg-[var(--background)] border border-[var(--divider)] shadow-lg z-50"
          role="listbox"
          aria-label="Select translation"
        >
          {Object.entries(TRANSLATION_GROUPS).map(([groupName, translations]) => (
            <div key={groupName}>
              <div className="px-3 py-2 text-xs font-medium text-[var(--muted)] uppercase tracking-wider bg-[var(--surface)] sticky top-0">
                {groupName}
              </div>
              {translations.map((key) => {
                const info = TRANSLATIONS[key];
                const isSelected = translation === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleSelect(key)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--surface)] transition-colors duration-[var(--motion-fast)] ${
                      isSelected ? "bg-[var(--surface)]" : ""
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{info.code}</span>
                        {info.year && (
                          <span className="text-xs text-[var(--muted)]">({info.year})</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--muted)] truncate">{info.name}</p>
                    </div>
                    {isSelected && (
                      <Check size={16} className="text-[var(--accent)] flex-shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
