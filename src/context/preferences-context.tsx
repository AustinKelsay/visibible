"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Translation, DEFAULT_TRANSLATION, TRANSLATIONS } from "@/lib/bible-api";
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
  /** The art style to paint and show in (Look); stored as chosen, never rewritten by what a work offers. */
  artStyle: string;
  setArtStyle: (styleId: string, source?: PreferenceChangeSource) => void;
  /** The words page's text size (Look). */
  textSize: TextSize;
  setTextSize: (size: TextSize, source?: PreferenceChangeSource) => void;
  /** Whether a verse with no picture is painted as it is opened, at the guest's cost. Off until the guest turns it on. */
  autoGenerate: boolean;
  setAutoGenerate: (enabled: boolean, source?: PreferenceChangeSource) => void;
}

const PreferencesContext = createContext<PreferencesContextType | null>(null);

/**
 * The reader's settings on this device (spec #434, "Stored settings"): Look's choices and automatic painting, each
 * with defaults. The same record holds the Advanced group, which only `src/lib/advanced-settings.ts` reads and writes.
 * Translation is not here: the server reads it from its cookie to render the verse.
 */
const SETTINGS_KEY = "visibible-reader-settings";
/** The old reader's record: ignored and removed, never migrated. */
const OLD_SETTINGS_KEY = "visibible-preferences";
const TRANSLATION_COOKIE = "visibible-translation";
const YEAR_SECONDS = 31536000;

interface ReaderSettings {
  look: { artStyle: string; textSize: TextSize };
  autoGenerate: boolean;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  look: { artStyle: DEFAULT_ART_STYLE, textSize: DEFAULT_TEXT_SIZE },
  autoGenerate: false,
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
  const textSize = TEXT_SIZES.find((size) => size === look.textSize);
  return {
    look: {
      artStyle: isArtStyleId(look.artStyle) ? look.artStyle : DEFAULT_SETTINGS.look.artStyle,
      textSize: textSize ?? DEFAULT_SETTINGS.look.textSize,
    },
    // Only an explicit saved choice turns automatic painting on.
    autoGenerate: Boolean(parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).autoGenerate === true),
  };
}

/** Write one change over what is stored, keeping the Advanced group and values this version did not understand. */
function writeSettings(change: { look?: Partial<ReaderSettings["look"]>; autoGenerate?: boolean }) {
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

  const shown = isHydrated ? settings : DEFAULT_SETTINGS;
  const shownTranslation = isHydrated ? translation : DEFAULT_TRANSLATION;
  return (
    <PreferencesContext.Provider
      value={{
        translation: shownTranslation,
        setTranslation,
        translationInfo: TRANSLATIONS[shownTranslation],
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
