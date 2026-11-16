"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_RESOLUTION,
  isValidAspectRatio,
  isValidResolution,
  normalizeResolutionForModel,
  type ImageAspectRatio,
  type ImageResolution,
} from "@/lib/image-models";

/**
 * The reader's Advanced settings: their own group (`advanced`) in the reader's stored settings record, with defaults.
 * The reader reads them here (painting, Ask, bulk painting, the feedback prompt) and never from the Advanced module.
 *
 * A setting counts only while an Advanced item offers it: each item calls `offerAdvancedSettings` when its module
 * loads. A setting nobody offers reads as its default whatever is stored, so cutting the Advanced module, or one item,
 * leaves the reader exactly as if that item were at its default.
 */
/** How the reader's surfaces are drawn: dark, light, or as the system is set. */
export type ReaderAppearance = "dark" | "light" | "system";
export const READER_APPEARANCES: readonly ReaderAppearance[] = ["dark", "light", "system"];

export interface AdvancedSettings {
  /** The model new pictures are painted with. Kept for this visit only: generation runs on one model (ADR 0012). */
  imageModel: string;
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  /** The model that answers Ask. */
  answeringModel: string;
  /** Whether the occasional "Have feedback?" prompt shows. */
  feedbackPrompts: boolean;
  /** The reader's appearance. The whole-picture view is dark in every appearance. */
  appearance: ReaderAppearance;
}

export type AdvancedSettingKey = keyof AdvancedSettings;

export const ADVANCED_DEFAULTS: Readonly<AdvancedSettings> = Object.freeze({
  imageModel: DEFAULT_IMAGE_MODEL,
  aspectRatio: DEFAULT_ASPECT_RATIO,
  resolution: DEFAULT_RESOLUTION,
  answeringModel: DEFAULT_CHAT_MODEL,
  feedbackPrompts: false,
  appearance: "dark",
});

/** The reader's settings record; PreferencesProvider keeps Look and automatic painting in the same record. */
export const READER_SETTINGS_KEY = "visibible-reader-settings";

/** Each stored setting's name inside the record's `advanced` group (shared with the old header's controls). */
const STORED_NAME: Record<Exclude<AdvancedSettingKey, "imageModel">, string> = {
  aspectRatio: "imageAspectRatio",
  resolution: "imageResolution",
  answeringModel: "chatModel",
  feedbackPrompts: "feedbackPrompts",
  appearance: "appearance",
};

const offered = new Set<AdvancedSettingKey>();
const listeners = new Set<() => void>();
let visit: Partial<AdvancedSettings> = {};
let snapshot: AdvancedSettings | null = null;

/** Called by an Advanced item's module when it loads: the settings it lets the reader change. */
export function offerAdvancedSettings(...keys: AdvancedSettingKey[]) {
  keys.forEach((key) => offered.add(key));
  snapshot = null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readRecord(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    return asObject(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

/** The stored group's valid values. Anything unknown is left out, so it reads as its default. */
function readStored(): Partial<AdvancedSettings> {
  const stored = asObject(readRecord().advanced);
  const valid: Partial<AdvancedSettings> = {};
  const aspectRatio = stored[STORED_NAME.aspectRatio];
  const resolution = stored[STORED_NAME.resolution];
  const answeringModel = stored[STORED_NAME.answeringModel];
  if (typeof aspectRatio === "string" && isValidAspectRatio(aspectRatio)) valid.aspectRatio = aspectRatio;
  if (typeof resolution === "string" && isValidResolution(resolution)) valid.resolution = resolution;
  if (typeof answeringModel === "string" && answeringModel.includes("/")) valid.answeringModel = answeringModel;
  if (stored[STORED_NAME.feedbackPrompts] === true) valid.feedbackPrompts = true;
  const appearance = stored[STORED_NAME.appearance];
  if (READER_APPEARANCES.includes(appearance as ReaderAppearance)) valid.appearance = appearance as ReaderAppearance;
  return valid;
}

function compute(): AdvancedSettings {
  const chosen = { ...readStored(), ...visit };
  const settings = { ...ADVANCED_DEFAULTS };
  for (const key of offered) {
    if (chosen[key] !== undefined) (settings as Record<AdvancedSettingKey, unknown>)[key] = chosen[key];
  }
  // A resolution the model cannot make falls back, as it always has.
  settings.resolution = normalizeResolutionForModel(settings.imageModel, settings.resolution);
  return settings;
}

/** Whether a loaded Advanced item offers this setting (otherwise it reads as its default). */
export function isAdvancedSettingOffered(key: AdvancedSettingKey): boolean {
  return offered.has(key);
}

/** The settings in force right now, outside React (what `useAdvancedSettings` answers after hydration). */
export function readAdvancedSettings(): AdvancedSettings {
  return getSnapshot();
}

function getSnapshot(): AdvancedSettings {
  snapshot ??= compute();
  return snapshot;
}

function getServerSnapshot(): AdvancedSettings {
  return ADVANCED_DEFAULTS;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== READER_SETTINGS_KEY) return;
    snapshot = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The Advanced settings in force: what the reader chose for each offered setting, defaults for the rest. */
export function useAdvancedSettings(): AdvancedSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Change one Advanced setting. It is stored on this device, except the image model, which lasts for this visit. */
export function setAdvancedSetting<K extends AdvancedSettingKey>(key: K, value: AdvancedSettings[K]) {
  if (key === "imageModel") {
    visit = { ...visit, [key]: value };
  } else {
    try {
      // Write over what is stored, keeping the rest of the record and of the group.
      const record = readRecord();
      const name = STORED_NAME[key as Exclude<K, "imageModel">];
      localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify({ ...record, version: 1, advanced: { ...asObject(record.advanced), [name]: value } }));
      // A value kept in memory after an earlier failed write must not shadow this one.
      if (key in visit) {
        const rest = { ...visit };
        delete rest[key];
        visit = rest;
      }
    } catch {
      // Storage can be unavailable; the change then lasts for this visit.
      visit = { ...visit, [key]: value };
    }
  }
  snapshot = null;
  listeners.forEach((listener) => listener());
}

/** Forget what this visit chose. For tests. */
export function resetAdvancedSettingsForTests() {
  visit = {};
  snapshot = null;
}
