"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Translation, DEFAULT_TRANSLATION, TRANSLATIONS } from "@/lib/bible-api";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_RESOLUTION,
  ImageAspectRatio,
  ImageResolution,
  isValidAspectRatio,
  isValidResolution,
} from "@/lib/image-models";
import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import { trackPreferenceChanged } from "@/lib/analytics";
import { useSession } from "@/context/session-context";

interface PreferencesContextType {
  translation: Translation;
  setTranslation: (translation: Translation) => void;
  translationInfo: typeof TRANSLATIONS[Translation];
  imageModel: string;
  setImageModel: (model: string) => void;
  imageAspectRatio: ImageAspectRatio;
  setImageAspectRatio: (ratio: ImageAspectRatio) => void;
  imageResolution: ImageResolution;
  setImageResolution: (resolution: ImageResolution) => void;
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
  const [imageAspectRatio, setImageAspectRatioState] = useState<ImageAspectRatio>(DEFAULT_ASPECT_RATIO);
  const [imageResolution, setImageResolutionState] = useState<ImageResolution>(DEFAULT_RESOLUTION);
  const [chatModel, setChatModelState] = useState<string>(DEFAULT_CHAT_MODEL);
  const [isHydrated, setIsHydrated] = useState(false);
  const router = useRouter();
  const { tier, credits } = useSession();

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const prefs = JSON.parse(stored);
        // Use setTimeout to avoid synchronous setState in effect
        setTimeout(() => {
          // Validate that the stored translation is a valid key in TRANSLATIONS
          if (prefs.translation && Object.prototype.hasOwnProperty.call(TRANSLATIONS, prefs.translation)) {
            setTranslationState(prefs.translation as Translation);
          }
          // Load image model preference
          if (prefs.imageModel) {
            setImageModelState(prefs.imageModel);
          }
          // Load image aspect ratio preference
          if (prefs.imageAspectRatio && isValidAspectRatio(prefs.imageAspectRatio)) {
            setImageAspectRatioState(prefs.imageAspectRatio);
          }
          // Load image resolution preference
          if (prefs.imageResolution && isValidResolution(prefs.imageResolution)) {
            setImageResolutionState(prefs.imageResolution);
          }
          // Load chat model preference
          if (prefs.chatModel) {
            setChatModelState(prefs.chatModel);
          }
          setIsHydrated(true);
        }, 0);
      } else {
        setTimeout(() => {
          setIsHydrated(true);
        }, 0);
      }
    } catch {
      // Ignore localStorage errors
      setTimeout(() => {
        setIsHydrated(true);
      }, 0);
    }
  }, []);

  // Helper to save all preferences
  const savePreferences = (prefs: {
    translation: Translation;
    imageModel: string;
    imageAspectRatio: ImageAspectRatio;
    imageResolution: ImageResolution;
    chatModel: string;
  }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore errors
    }
  };

  // Save to localStorage and cookie when translation changes, then refresh page
  const setTranslation = (newTranslation: Translation) => {
    setTranslationState(newTranslation);
    savePreferences({ translation: newTranslation, imageModel, imageAspectRatio, imageResolution, chatModel });
    // Set cookie for server-side reading (expires in 1 year)
    document.cookie = `${COOKIE_NAME}=${newTranslation}; path=/; max-age=31536000; SameSite=Lax`;
    // Track preference change
    trackPreferenceChanged({
      preference: "translation",
      value: newTranslation,
      tier,
      hasCredits: credits > 0,
    });
    // Refresh the page to get new translation from server
    router.refresh();
  };

  // Save image model preference
  const setImageModel = (newModel: string) => {
    setImageModelState(newModel);
    savePreferences({ translation, imageModel: newModel, imageAspectRatio, imageResolution, chatModel });
    // Set cookie for server-side reading (expires in 1 year)
    document.cookie = `${IMAGE_MODEL_COOKIE}=${encodeURIComponent(newModel)}; path=/; max-age=31536000; SameSite=Lax`;
    // Track preference change
    trackPreferenceChanged({
      preference: "imageModel",
      value: newModel,
      tier,
      hasCredits: credits > 0,
    });
    // Refresh to regenerate image with new model
    router.refresh();
  };

  // Save image aspect ratio preference (no refresh needed - takes effect on next generation)
  const setImageAspectRatio = (newRatio: ImageAspectRatio) => {
    setImageAspectRatioState(newRatio);
    savePreferences({ translation, imageModel, imageAspectRatio: newRatio, imageResolution, chatModel });
  };

  // Save image resolution preference (no refresh needed - takes effect on next generation)
  const setImageResolution = (newResolution: ImageResolution) => {
    setImageResolutionState(newResolution);
    savePreferences({ translation, imageModel, imageAspectRatio, imageResolution: newResolution, chatModel });
  };

  // Save chat model preference (no refresh needed - takes effect on next message)
  const setChatModel = (newModel: string) => {
    setChatModelState(newModel);
    savePreferences({ translation, imageModel, imageAspectRatio, imageResolution, chatModel: newModel });
    // Set cookie for server-side reading (expires in 1 year)
    document.cookie = `${CHAT_MODEL_COOKIE}=${encodeURIComponent(newModel)}; path=/; max-age=31536000; SameSite=Lax`;
    // Track preference change
    trackPreferenceChanged({
      preference: "chatModel",
      value: newModel,
      tier,
      hasCredits: credits > 0,
    });
  };

  return (
    <PreferencesContext.Provider
      value={{
        translation: isHydrated ? translation : DEFAULT_TRANSLATION,
        setTranslation,
        translationInfo: TRANSLATIONS[isHydrated ? translation : DEFAULT_TRANSLATION],
        imageModel: isHydrated ? imageModel : DEFAULT_IMAGE_MODEL,
        setImageModel,
        imageAspectRatio: isHydrated ? imageAspectRatio : DEFAULT_ASPECT_RATIO,
        setImageAspectRatio,
        imageResolution: isHydrated ? imageResolution : DEFAULT_RESOLUTION,
        setImageResolution,
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
