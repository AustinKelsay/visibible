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
 * The reader's Advanced settings: their own stored group, apart from the Look record, with defaults. The reader reads
 * them here (painting, Ask, bulk painting, the feedback prompt) and never from the Advanced module itself.
 *
 * A setting counts only while an Advanced item offers it: each item calls `offerAdvancedSettings` when its module
 * loads. A setting nobody offers reads as its default whatever is stored, so cutting the Advanced module, or one item,
 * leaves the reader exactly as if that item were at its default.
 */
export interface AdvancedSettings {
  /** The model new pictures are painted with. Kept for this visit only: generation runs on one model (ADR 0012). */
  imageModel: string;
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  /** The model that answers Ask. */
  answeringModel: string;
  /** Whether the occasional "Have feedback?" prompt shows. */
  feedbackPrompts: boolean;
}

export type AdvancedSettingKey = keyof AdvancedSettings;

export const ADVANCED_DEFAULTS: Readonly<AdvancedSettings> = Object.freeze({
  imageModel: DEFAULT_IMAGE_MODEL,
  aspectRatio: DEFAULT_ASPECT_RATIO,
  resolution: DEFAULT_RESOLUTION,
  answeringModel: DEFAULT_CHAT_MODEL,
  feedbackPrompts: false,
});

export const ADVANCED_STORAGE_KEY = "visibible-advanced";

/** Settings kept only in memory, for this visit. */
const VISIT_ONLY: ReadonlySet<AdvancedSettingKey> = new Set(["imageModel"]);

const offered = new Set<AdvancedSettingKey>();
const listeners = new Set<() => void>();
let visit: Partial<AdvancedSettings> = {};
let snapshot: AdvancedSettings | null = null;

/** Called by an Advanced item's module when it loads: the settings it lets the reader change. */
export function offerAdvancedSettings(...keys: AdvancedSettingKey[]) {
  keys.forEach((key) => offered.add(key));
  snapshot = null;
}

function readStored(): Partial<AdvancedSettings> {
  try {
    const raw = localStorage.getItem(ADVANCED_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const stored = parsed as Record<string, unknown>;
    const valid: Partial<AdvancedSettings> = {};
    if (typeof stored.aspectRatio === "string" && isValidAspectRatio(stored.aspectRatio)) valid.aspectRatio = stored.aspectRatio;
    if (typeof stored.resolution === "string" && isValidResolution(stored.resolution)) valid.resolution = stored.resolution;
    if (typeof stored.answeringModel === "string" && stored.answeringModel.includes("/")) valid.answeringModel = stored.answeringModel;
    if (stored.feedbackPrompts === true) valid.feedbackPrompts = true;
    return valid;
  } catch {
    return {};
  }
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
    if (event.key !== ADVANCED_STORAGE_KEY) return;
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
  if (VISIT_ONLY.has(key)) {
    visit = { ...visit, [key]: value };
  } else {
    try {
      const raw = localStorage.getItem(ADVANCED_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      const existing = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      localStorage.setItem(ADVANCED_STORAGE_KEY, JSON.stringify({ ...existing, [key]: value }));
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
