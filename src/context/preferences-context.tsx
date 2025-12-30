"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Translation, DEFAULT_TRANSLATION, TRANSLATIONS } from "@/lib/bible-api";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";

interface PreferencesContextType {
  translation: Translation;
  setTranslation: (translation: Translation) => void;
  translationInfo: typeof TRANSLATIONS[Translation];
  imageModel: string;
  setImageModel: (model: string) => void;
  chatModel: string;
  setChatModel: (model: string) => void;
}

const PreferencesContext = createContext<PreferencesContextType | null>(null);

const STORAGE_KEY = "visibible-preferences";
const COOKIE_NAME = "visibible-translation";
const IMAGE_MODEL_COOKIE = "visibible-image-model";
const CHAT_MODEL_COOKIE = "visibible-chat-model";

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [translation, setTranslationState] = useState<Translation>(DEFAULT_TRANSLATION);
  const [imageModel, setImageModelState] = useState<string>(DEFAULT_IMAGE_MODEL);
  const [chatModel, setChatModelState] = useState<string>(DEFAULT_CHAT_MODEL);
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
        // Load image model preference
        if (prefs.imageModel) {
          setImageModelState(prefs.imageModel);
        }
        // Load chat model preference
        if (prefs.chatModel) {
          setChatModelState(prefs.chatModel);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    setIsHydrated(true);
  }, []);

  // Helper to save all preferences
  const savePreferences = (prefs: { translation: Translation; imageModel: string; chatModel: string }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore errors
    }
  };

  // Save to localStorage and cookie when translation changes, then refresh page
  const setTranslation = (newTranslation: Translation) => {
    setTranslationState(newTranslation);
    savePreferences({ translation: newTranslation, imageModel, chatModel });
    // Set cookie for server-side reading (expires in 1 year)
    document.cookie = `${COOKIE_NAME}=${newTranslation}; path=/; max-age=31536000; SameSite=Lax`;
    // Refresh the page to get new translation from server
    router.refresh();
  };

  // Save image model preference
  const setImageModel = (newModel: string) => {
    setImageModelState(newModel);
    savePreferences({ translation, imageModel: newModel, chatModel });
    // Set cookie for server-side reading (expires in 1 year)
    document.cookie = `${IMAGE_MODEL_COOKIE}=${encodeURIComponent(newModel)}; path=/; max-age=31536000; SameSite=Lax`;
    // Refresh to regenerate image with new model
    router.refresh();
  };

  // Save chat model preference (no refresh needed - takes effect on next message)
  const setChatModel = (newModel: string) => {
    setChatModelState(newModel);
    savePreferences({ translation, imageModel, chatModel: newModel });
    // Set cookie for server-side reading (expires in 1 year)
    document.cookie = `${CHAT_MODEL_COOKIE}=${encodeURIComponent(newModel)}; path=/; max-age=31536000; SameSite=Lax`;
  };

  return (
    <PreferencesContext.Provider
      value={{
        translation: isHydrated ? translation : DEFAULT_TRANSLATION,
        setTranslation,
        translationInfo: TRANSLATIONS[isHydrated ? translation : DEFAULT_TRANSLATION],
        imageModel: isHydrated ? imageModel : DEFAULT_IMAGE_MODEL,
        setImageModel,
        chatModel: isHydrated ? chatModel : DEFAULT_CHAT_MODEL,
        setChatModel,
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
