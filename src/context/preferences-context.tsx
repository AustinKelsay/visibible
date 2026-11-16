"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
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

/** The words page's text size (Look): three steps, applied to the words page only. */
export type TextSize = "small" | "medium" | "large";
export const TEXT_SIZES: readonly TextSize[] = ["small", "medium", "large"];
export const DEFAULT_TEXT_SIZE: TextSize = "medium";

interface PreferencesContextType {
  /** The translation the server renders, read from its cookie. */
  translation: Translation;
  setTranslation: (translation: Translation, source?: PreferenceChangeSource) => void;
  translationInfo: typeof TRANSLATIONS[Translation];
  imageModel: string;
  setImageModel: (model: string, source?: PreferenceChangeSource) => void;
  imageAspectRatio: ImageAspectRatio;
  setImageAspectRatio: (ratio: ImageAspectRatio, source?: PreferenceChangeSource) => void;
  imageResolution: ImageResolution;
  setImageResolution: (resolution: ImageResolution, source?: PreferenceChangeSource) => void;
  /** The art style to paint and show in (Look); stored as chosen, never rewritten by what a work offers. */
  artStyle: string;
  setArtStyle: (styleId: string, source?: PreferenceChangeSource) => void;
  /** The words page's text size (Look). */
  textSize: TextSize;
  setTextSize: (size: TextSize, source?: PreferenceChangeSource) => void;
  chatModel: string;
  setChatModel: (model: string, source?: PreferenceChangeSource) => void;
  /** Whether a verse with no picture is painted as it is opened, at the guest's cost. Off until the guest turns it on. */
  autoGenerate: boolean;
  setAutoGenerate: (enabled: boolean, source?: PreferenceChangeSource) => void;
}

const PreferencesContext = createContext<PreferencesContextType | null>(null);

/**
 * The reader's settings on this device (spec #434, "Stored settings"). Look's choices, automatic painting, and the
 * Advanced group, each with defaults, so the reader behaves the same when Advanced is absent. Translation is not
 * here: the server reads it from its cookie to render the verse.
 */
const SETTINGS_KEY = "visibible-reader-settings";
/** The old reader's record: ignored and removed, never migrated. */
const OLD_SETTINGS_KEY = "visibible-preferences";
const TRANSLATION_COOKIE = "visibible-translation";
const IMAGE_MODEL_COOKIE = "visibible-image-model";
const CHAT_MODEL_COOKIE = "visibible-chat-model";
const YEAR_SECONDS = 31536000;

interface ReaderSettings {
  look: { artStyle: string; textSize: TextSize };
  autoGenerate: boolean;
  advanced: { imageAspectRatio: ImageAspectRatio; imageResolution: ImageResolution; chatModel: string };
}

const DEFAULT_SETTINGS: ReaderSettings = {
  look: { artStyle: DEFAULT_ART_STYLE, textSize: DEFAULT_TEXT_SIZE },
  autoGenerate: false,
  advanced: { imageAspectRatio: DEFAULT_ASPECT_RATIO, imageResolution: DEFAULT_RESOLUTION, chatModel: DEFAULT_CHAT_MODEL },
};

function objectAt(value: unknown, key: string): Record<string, unknown> {
  const found = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  return found && typeof found === "object" && !Array.isArray(found) ? (found as Record<string, unknown>) : {};
}

/** Each stored value is checked on its own; anything unknown reads as its default and stays in storage untouched. */
function readSettings(raw: string | null): ReaderSettings {
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const look = objectAt(parsed, "look");
  const advanced = objectAt(parsed, "advanced");
  const textSize = TEXT_SIZES.find((size) => size === look.textSize);
  return {
    look: {
      artStyle: isArtStyleId(look.artStyle) ? look.artStyle : DEFAULT_SETTINGS.look.artStyle,
      textSize: textSize ?? DEFAULT_SETTINGS.look.textSize,
    },
    // Only an explicit saved choice turns automatic painting on.
    autoGenerate: Boolean(parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).autoGenerate === true),
    advanced: {
      imageAspectRatio: typeof advanced.imageAspectRatio === "string" && isValidAspectRatio(advanced.imageAspectRatio)
        ? advanced.imageAspectRatio : DEFAULT_SETTINGS.advanced.imageAspectRatio,
      imageResolution: typeof advanced.imageResolution === "string" && isValidResolution(advanced.imageResolution)
        ? normalizeResolutionForModel(DEFAULT_IMAGE_MODEL, advanced.imageResolution) : DEFAULT_SETTINGS.advanced.imageResolution,
      chatModel: typeof advanced.chatModel === "string" && advanced.chatModel ? advanced.chatModel : DEFAULT_SETTINGS.advanced.chatModel,
    },
  };
}

/** Write one group's change over what is stored, keeping values this version did not understand. */
function writeSettings(change: { look?: Partial<ReaderSettings["look"]>; autoGenerate?: boolean; advanced?: Partial<ReaderSettings["advanced"]> }) {
  try {
    let existing: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) existing = parsed;
    } catch {
      existing = {};
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      ...existing,
      version: 1,
      look: { ...objectAt(existing, "look"), ...change.look },
      advanced: { ...objectAt(existing, "advanced"), ...change.advanced },
      ...(change.autoGenerate === undefined ? {} : { autoGenerate: change.autoGenerate }),
    }));
  } catch {
    // Storage may be unavailable (private window); the choice still applies for this visit.
  }
}

function readTranslationCookie(): Translation {
  const prefix = `${TRANSLATION_COOKIE}=`;
  const value = document.cookie.split("; ").find((row) => row.startsWith(prefix))?.slice(prefix.length);
  return value && Object.prototype.hasOwnProperty.call(TRANSLATIONS, value) ? (value as Translation) : DEFAULT_TRANSLATION;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [translation, setTranslationState] = useState<Translation>(DEFAULT_TRANSLATION);
  // Generation runs on one model, whatever a visitor chose last visit (ADR 0012), so the model is never stored.
  const [imageModel, setImageModelState] = useState<string>(DEFAULT_IMAGE_MODEL);
  const [isHydrated, setIsHydrated] = useState(false);
  const settingsRef = useRef(settings);
  const router = useRouter();
  const { tier, credits } = useSession();

  useEffect(() => {
    let loaded = DEFAULT_SETTINGS;
    try {
      loaded = readSettings(localStorage.getItem(SETTINGS_KEY));
    } catch {
      // Storage unavailable: defaults.
    }
    try {
      localStorage.removeItem(OLD_SETTINGS_KEY);
    } catch {
      // Nothing to remove, or storage unavailable.
    }
    const cookieTranslation = readTranslationCookie();
    // Deferred so hydration renders the server's defaults first.
    const timer = setTimeout(() => {
      settingsRef.current = loaded;
      setSettings(loaded);
      setTranslationState(cookieTranslation);
      setIsHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const update = (change: Parameters<typeof writeSettings>[0]) => {
    const current = settingsRef.current;
    const next: ReaderSettings = {
      look: { ...current.look, ...change.look },
      autoGenerate: change.autoGenerate ?? current.autoGenerate,
      advanced: { ...current.advanced, ...change.advanced },
    };
    settingsRef.current = next;
    setSettings(next);
    writeSettings(change);
  };

  const track = (preference: Parameters<typeof trackPreferenceChanged>[0]["preference"], value: string, source: PreferenceChangeSource) => {
    trackPreferenceChanged({ preference, value, source, tier, hasCredits: credits > 0 });
  };

  // The cookie is what the server renders from; refresh so the words page shows the new translation.
  const setTranslation = (next: Translation, source: PreferenceChangeSource = "unknown") => {
    setTranslationState(next);
    document.cookie = `${TRANSLATION_COOKIE}=${next}; path=/; max-age=${YEAR_SECONDS}; SameSite=Lax`;
    track("translation", next, source);
    router.refresh();
  };

  const setImageModel = (next: string, source: PreferenceChangeSource = "unknown") => {
    setImageModelState(next);
    update({ advanced: { imageResolution: normalizeResolutionForModel(next, settingsRef.current.advanced.imageResolution) } });
    document.cookie = `${IMAGE_MODEL_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${YEAR_SECONDS}; SameSite=Lax`;
    track("imageModel", next, source);
    router.refresh();
  };

  // Takes effect on the next painting; no refresh needed.
  const setImageAspectRatio = (next: ImageAspectRatio, source: PreferenceChangeSource = "unknown") => {
    update({ advanced: { imageAspectRatio: next } });
    track("imageAspectRatio", next, source);
  };

  const setImageResolution = (next: ImageResolution, source: PreferenceChangeSource = "unknown") => {
    const resolution = normalizeResolutionForModel(imageModel, next);
    update({ advanced: { imageResolution: resolution } });
    track("imageResolution", resolution, source);
  };

  // Painting and the picture rule follow it reactively.
  const setArtStyle = (styleId: string, source: PreferenceChangeSource = "unknown") => {
    if (!isArtStyleId(styleId)) return;
    update({ look: { artStyle: styleId } });
    track("artStyle", styleId, source);
  };

  const setTextSize = (size: TextSize, source: PreferenceChangeSource = "unknown") => {
    if (!TEXT_SIZES.includes(size)) return;
    update({ look: { textSize: size } });
    track("textSize", size, source);
  };

  const setAutoGenerate = (enabled: boolean, source: PreferenceChangeSource = "unknown") => {
    update({ autoGenerate: enabled });
    track("autoGenerate", enabled ? "on" : "off", source);
  };

  // Takes effect on the next message.
  const setChatModel = (next: string, source: PreferenceChangeSource = "unknown") => {
    update({ advanced: { chatModel: next } });
    document.cookie = `${CHAT_MODEL_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${YEAR_SECONDS}; SameSite=Lax`;
    track("chatModel", next, source);
  };

  const shown = isHydrated ? settings : DEFAULT_SETTINGS;
  const shownTranslation = isHydrated ? translation : DEFAULT_TRANSLATION;
  return (
    <PreferencesContext.Provider
      value={{
        translation: shownTranslation,
        setTranslation,
        translationInfo: TRANSLATIONS[shownTranslation],
        imageModel: isHydrated ? imageModel : DEFAULT_IMAGE_MODEL,
        setImageModel,
        imageAspectRatio: shown.advanced.imageAspectRatio,
        setImageAspectRatio,
        imageResolution: shown.advanced.imageResolution,
        setImageResolution,
        chatModel: shown.advanced.chatModel,
        setChatModel,
        artStyle: shown.look.artStyle,
        setArtStyle,
        textSize: shown.look.textSize,
        setTextSize,
        autoGenerate: shown.autoGenerate,
        setAutoGenerate,
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
