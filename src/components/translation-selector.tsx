"use client";

import { usePreferences } from "@/context/preferences-context";
import { TRANSLATIONS, Translation } from "@/lib/bible-api";

interface TranslationSelectorProps {
  variant?: "compact" | "full";
}

export function TranslationSelector({ variant = "compact" }: TranslationSelectorProps) {
  const { translation, setTranslation, translationInfo } = usePreferences();

  const toggleTranslation = () => {
    setTranslation(translation === "web" ? "kjv" : "web");
  };

  if (variant === "compact") {
    return (
      <button
        onClick={toggleTranslation}
        className="min-h-[44px] px-3 flex items-center justify-center text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
        aria-label={`Current translation: ${translationInfo.name}. Click to switch.`}
      >
        {translationInfo.code}
      </button>
    );
  }

  // Full variant with both options shown
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface)]">
      {(Object.keys(TRANSLATIONS) as Translation[]).map((key) => (
        <button
          key={key}
          onClick={() => setTranslation(key)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-[var(--motion-fast)] ${
            translation === key
              ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
          aria-pressed={translation === key}
        >
          {TRANSLATIONS[key].code}
        </button>
      ))}
    </div>
  );
}
