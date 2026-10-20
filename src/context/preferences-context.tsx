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
  normalizeResolutionForModel,
} from "@/lib/image-models";
import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import { DEFAULT_ART_STYLE, isArtStyleId } from "@/lib/art-styles";
import {
  trackPreferenceChanged,
  type PreferenceChangeSource,
} from "@/lib/analytics";
import { useSession } from "@/context/session-context";

interface PreferencesContextType {
  translation: Translation;
  setTranslation: (translation: Translation, source?: PreferenceChangeSource) => void;
  translationInfo: typeof TRANSLATIONS[Translation];
  imageModel: string;
  setImageModel: (model: string, source?: PreferenceChangeSource) => void;
  imageAspectRatio: ImageAspectRatio;
  setImageAspectRatio: (ratio: ImageAspectRatio, source?: PreferenceChangeSource) => void;
  imageResolution: ImageResolution;
  setImageResolution: (resolution: ImageResolution, source?: PreferenceChangeSource) => void;
  /** The art style to generate and browse in (#177); stored like the model, never rewritten by what a work offers. */
  artStyle: string;
  setArtStyle: (styleId: string, source?: PreferenceChangeSource) => void;
  chatModel: string;
  setChatModel: (model: string, source?: PreferenceChangeSource) => void;
}

const PreferencesContext = createContext<PreferencesContextType | null>(null);

const STORAGE_KEY = "visibible-preferences";
const COOKIE_NAME = "visibible-translation";
const IMAGE_MODEL_COOKIE = "visibible-image-model";
const CHAT_MODEL_COOKIE = "visibible-chat-model";
// The default when saved preferences did not yet record which default was current.
const LEGACY_DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";

/**
 * Every save writes the image model, whether or not the visitor chose it. A
 * saved model equal to the default current at save time follows the new default.
 */
function resolveSavedImageModel(prefs: { imageModel?: unknown; defaultImageModel?: unknown }): string {
  if (typeof prefs.imageModel !== "string" || prefs.imageModel.length > 200) return DEFAULT_IMAGE_MODEL;
  const defaultAtSave = typeof prefs.defaultImageModel === "string" ? prefs.defaultImageModel : LEGACY_DEFAULT_IMAGE_MODEL;
  return prefs.imageModel === defaultAtSave ? DEFAULT_IMAGE_MODEL : prefs.imageModel;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [translation, setTranslationState] = useState<Translation>(DEFAULT_TRANSLATION);
  const [imageModel, setImageModelState] = useState<string>(DEFAULT_IMAGE_MODEL);
  const [imageAspectRatio, setImageAspectRatioState] = useState<ImageAspectRatio>(DEFAULT_ASPECT_RATIO);
  const [imageResolution, setImageResolutionState] = useState<ImageResolution>(DEFAULT_RESOLUTION);
  const [chatModel, setChatModelState] = useState<string>(DEFAULT_CHAT_MODEL);
  const [artStyle, setArtStyleState] = useState<string>(DEFAULT_ART_STYLE);
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
          const savedImageModel = resolveSavedImageModel(prefs);
          setImageModelState(savedImageModel);
          // Load image aspect ratio preference
          if (prefs.imageAspectRatio && isValidAspectRatio(prefs.imageAspectRatio)) {
            setImageAspectRatioState(prefs.imageAspectRatio);
          }
          // Load image resolution preference
          if (prefs.imageResolution && isValidResolution(prefs.imageResolution)) {
            setImageResolutionState(normalizeResolutionForModel(savedImageModel, prefs.imageResolution));
          }
          // Load chat model preference
          if (prefs.chatModel) {
            setChatModelState(prefs.chatModel);
          }
          // Load the art style; an unknown saved id is left in storage and the default is used.
          if (isArtStyleId(prefs.artStyle)) {
            setArtStyleState(prefs.artStyle);
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
    artStyle?: string;
  }) => {
    try {
      const existingRaw = localStorage.getItem(STORAGE_KEY);
      let existing: Record<string, unknown> = {};

      if (existingRaw && typeof existingRaw === "string") {
        try {
          const parsed = JSON.parse(existingRaw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            existing = parsed as Record<string, unknown>;
          }
        } catch {
          existing = {};
        }
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...existing,
        ...prefs,
        defaultImageModel: DEFAULT_IMAGE_MODEL,
      }));
    } catch {
      // Ignore errors
    }
  };

  // Save to localStorage and cookie when translation changes, then refresh page
  const setTranslation = (
    newTranslation: Translation,
    source: PreferenceChangeSource = "unknown"
  ) => {
    setTranslationState(newTranslation);
    savePreferences({
      translation: newTranslation,
      imageModel,
      imageAspectRatio,
      imageResolution,
      chatModel,
    });
    // Set cookie for server-side reading (expires in 1 year)
    document.cookie = `${COOKIE_NAME}=${newTranslation}; path=/; max-age=31536000; SameSite=Lax`;
    // Track preference change
    trackPreferenceChanged({
      preference: "translation",
      value: newTranslation,
      source,
      tier,
      hasCredits: credits > 0,
    });
    // Refresh the page to get new translation from server
    router.refresh();
  };

  // Save image model preference
  const setImageModel = (
    newModel: string,
    source: PreferenceChangeSource = "unknown"
  ) => {
    const nextResolution = normalizeResolutionForModel(newModel, imageResolution);
    setImageResolutionState(nextResolution);
    setImageModelState(newModel);
    savePreferences({
      translation,
      imageModel: newModel,
      imageAspectRatio,
      imageResolution: nextResolution,
      chatModel,
    });
    // Set cookie for server-side reading (expires in 1 year)
    document.cookie = `${IMAGE_MODEL_COOKIE}=${encodeURIComponent(newModel)}; path=/; max-age=31536000; SameSite=Lax`;
    // Track preference change
    trackPreferenceChanged({
      preference: "imageModel",
      value: newModel,
      source,
      tier,
      hasCredits: credits > 0,
    });
    // Refresh to regenerate image with new model
    router.refresh();
  };

  // Save image aspect ratio preference (no refresh needed - takes effect on next generation)
  const setImageAspectRatio = (
    newRatio: ImageAspectRatio,
    source: PreferenceChangeSource = "unknown"
  ) => {
    setImageAspectRatioState(newRatio);
    savePreferences({
      translation,
      imageModel,
      imageAspectRatio: newRatio,
      imageResolution,
      chatModel,
    });
    trackPreferenceChanged({
      preference: "imageAspectRatio",
      value: newRatio,
      source,
      tier,
      hasCredits: credits > 0,
    });
  };

  // Save image resolution preference (no refresh needed - takes effect on next generation)
  const setImageResolution = (
    newResolution: ImageResolution,
    source: PreferenceChangeSource = "unknown"
  ) => {
    newResolution = normalizeResolutionForModel(imageModel, newResolution);
    setImageResolutionState(newResolution);
    savePreferences({
      translation,
      imageModel,
      imageAspectRatio,
      imageResolution: newResolution,
      chatModel,
    });
    trackPreferenceChanged({
      preference: "imageResolution",
      value: newResolution,
      source,
      tier,
      hasCredits: credits > 0,
    });
  };

  // Save the art style (no refresh needed: generation and library reads follow it reactively)
  const setArtStyle = (
    styleId: string,
    source: PreferenceChangeSource = "unknown"
  ) => {
    if (!isArtStyleId(styleId)) return;
    setArtStyleState(styleId);
    savePreferences({
      translation,
      imageModel,
      imageAspectRatio,
      imageResolution,
      chatModel,
      artStyle: styleId,
    });
    trackPreferenceChanged({
      preference: "artStyle",
      value: styleId,
      source,
      tier,
      hasCredits: credits > 0,
    });
  };

  // Save chat model preference (no refresh needed - takes effect on next message)
  const setChatModel = (
    newModel: string,
    source: PreferenceChangeSource = "unknown"
  ) => {
    setChatModelState(newModel);
    savePreferences({
      translation,
      imageModel,
      imageAspectRatio,
      imageResolution,
      chatModel: newModel,
    });
    // Set cookie for server-side reading (expires in 1 year)
    document.cookie = `${CHAT_MODEL_COOKIE}=${encodeURIComponent(newModel)}; path=/; max-age=31536000; SameSite=Lax`;
    // Track preference change
    trackPreferenceChanged({
      preference: "chatModel",
      value: newModel,
      source,
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
        artStyle: isHydrated ? artStyle : DEFAULT_ART_STYLE,
        setArtStyle,
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
