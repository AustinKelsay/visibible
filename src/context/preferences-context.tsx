"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Translation, DEFAULT_TRANSLATION, TRANSLATIONS } from "@/lib/bible-api";

interface PreferencesContextType {
  translation: Translation;
  setTranslation: (translation: Translation) => void;
  translationInfo: typeof TRANSLATIONS[Translation];
}

const PreferencesContext = createContext<PreferencesContextType | null>(null);

const STORAGE_KEY = "vibible-preferences";
const COOKIE_NAME = "vibible-translation";

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [translation, setTranslationState] = useState<Translation>(DEFAULT_TRANSLATION);
  const [isHydrated, setIsHydrated] = useState(false);
  const router = useRouter();

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const prefs = JSON.parse(stored);
        // Validate that the stored translation is a valid key in TRANSLATIONS
        if (prefs.translation && Object.prototype.hasOwnProperty.call(TRANSLATIONS, prefs.translation)) {
          setTranslationState(prefs.translation as Translation);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage and cookie when translation changes, then refresh page
  const setTranslation = (newTranslation: Translation) => {
    setTranslationState(newTranslation);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ translation: newTranslation }));
      // Set cookie for server-side reading (expires in 1 year)
      document.cookie = `${COOKIE_NAME}=${newTranslation}; path=/; max-age=31536000; SameSite=Lax`;
      // Refresh the page to get new translation from server
      router.refresh();
    } catch {
      // Ignore errors
    }
  };

  return (
    <PreferencesContext.Provider
      value={{
        translation: isHydrated ? translation : DEFAULT_TRANSLATION,
        setTranslation,
        translationInfo: TRANSLATIONS[isHydrated ? translation : DEFAULT_TRANSLATION],
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return context;
}
