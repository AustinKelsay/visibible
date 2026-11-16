// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ADVANCED_DEFAULTS,
  READER_SETTINGS_KEY,
  offerAdvancedSettings,
  readAdvancedSettings,
  resetAdvancedSettingsForTests,
  setAdvancedSetting,
} from "@/lib/advanced-settings";

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  resetAdvancedSettingsForTests();
});
afterEach(() => vi.unstubAllGlobals());

// Generation runs on one model (ADR 0012); a saved choice of another would be priced at its rate and charged at this one's.
it("keeps a chosen image model for this visit only, and stores the aspect ratio", () => {
  offerAdvancedSettings("imageModel", "aspectRatio");
  setAdvancedSetting("imageModel", "google/gemini-3.1-flash-lite-image");
  setAdvancedSetting("aspectRatio", "3:2");
  expect(readAdvancedSettings()).toMatchObject({ imageModel: "google/gemini-3.1-flash-lite-image", aspectRatio: "3:2" });
  expect(JSON.parse(storage.get(READER_SETTINGS_KEY)!)).toEqual({ version: 1, advanced: { imageAspectRatio: "3:2" } });

  // The next visit starts from what is stored.
  resetAdvancedSettingsForTests();
  expect(readAdvancedSettings()).toMatchObject({ imageModel: ADVANCED_DEFAULTS.imageModel, aspectRatio: "3:2" });
});
