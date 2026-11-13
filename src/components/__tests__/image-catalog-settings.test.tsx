import { HeaderSettingsPopover, MobileSettingsRows } from "../header-settings-popover";
// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageGenerationSettingsPanel } from "../image-generation-settings-panel";
import { ImageModelSelector } from "../image-model-selector";
import { PreferencesProvider, usePreferences } from "@/context/preferences-context";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";

const generationState = { modelId: "google/gemini-2.5-flash-image", baseCost: 0, showCreditsCost: false, quoteLabel: null as string | null,
  displayCostByResolution: undefined as Partial<Record<"1K" | "2K" | "4K", number>> | undefined };
const setResolution = vi.fn();
beforeEach(() => { generationState.modelId = "google/gemini-2.5-flash-image"; generationState.displayCostByResolution = undefined; generationState.quoteLabel = null; setResolution.mockClear(); });
vi.mock("@/context/generation-context", () => ({ useGeneration: () => ({ state: generationState, isRegistered: true, setAspectRatio: vi.fn(), setResolution }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ tier: "paid", credits: 100 }) }));
vi.mock("@/lib/analytics", () => ({ trackPreferenceChanged: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

it("labels stale pricing, disables unpriced choices and repairs unsupported saved resolution on selection", async () => {
  const storage = new Map([["visibible-preferences", JSON.stringify({ imageModel: "removed/model", imageResolution: "4K" })]]);
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: [
    { id: "google/gemini-2.5-flash-image", name: "Default image", provider: "Google", availability: "stale", creditsCost: 6, estimatedCreditsByResolution: { "1K": 7 } },
    { id: "google/gemini-3.1-flash-image", name: "Unpriced", provider: "Google", availability: "unavailable", creditsCost: null, unavailableReason: "Output pricing unavailable" },
  ], error: "Using cached image models" })));
  let current: ReturnType<typeof usePreferences>;
  function Probe() {
    const preferences = usePreferences();
    useLayoutEffect(() => { current = preferences; }, [preferences]);
    return createElement(ImageModelSelector);
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(PreferencesProvider, null, createElement(Probe))));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    // A saved model follows the generation model (ADR 0012), which this cached catalog does not list.
    expect(current!.imageModel).toBe(DEFAULT_IMAGE_MODEL);
    expect(current!.imageResolution).toBe("1K");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("Saved model unavailable");
    expect(container.textContent).toContain("Cached pricing");
    expect(container.textContent).toContain("About 7 credits");
    const options = container.querySelectorAll<HTMLButtonElement>('button[role="option"]');
    expect(options[1].disabled).toBe(true);
    await act(async () => options[1].click());
    expect(current!.imageModel).toBe(DEFAULT_IMAGE_MODEL);
    await act(async () => options[0].click());
    expect(current!.imageModel).toBe("google/gemini-2.5-flash-image");
    expect(JSON.parse(storage.get("visibible-preferences")!).imageResolution).toBe("1K");
  } finally { act(() => root.unmount()); }
});


it("names the only usable model without offering a choice, and keeps the picker when that model is unpriced", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const render = async (model: Record<string, unknown>) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: [model] })));
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(PreferencesProvider, null, createElement(ImageModelSelector))));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const result = { text: container.textContent, buttons: container.querySelectorAll("button").length };
    act(() => root.unmount());
    return result;
  };
  const sole = await render({ id: DEFAULT_IMAGE_MODEL, name: "Google: Nano Banana 2.1", provider: "Google", availability: "available", creditsCost: 6 });
  expect(sole).toEqual({ text: "Nano Banana 2.1", buttons: 0 });
  const unpriced = await render({ id: DEFAULT_IMAGE_MODEL, name: "Google: Nano Banana 2.1", provider: "Google", availability: "unavailable", creditsCost: null });
  expect(unpriced.buttons).toBe(1);
});

it("shows the server's quote for the selected settings in single generation, and the catalog estimate elsewhere", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const models = [{ id: DEFAULT_IMAGE_MODEL, name: "Nano Banana 2.1", provider: "Google", availability: "available" as const, creditsCost: 6 }];
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = async (showQuote: boolean) => act(async () => root.render(createElement(PreferencesProvider, null,
    createElement(ImageGenerationSettingsPanel, { models, modelsLoading: false, modelsError: null, showQuote }))));
  try {
    // No quote read yet: the catalog's estimate.
    await render(true);
    expect(container.textContent).toContain("About 6 credits");
    generationState.quoteLabel = "About 2 credits · at most 4";
    await render(true);
    expect(container.textContent).toContain("About 2 credits · at most 4");
    expect(container.textContent).not.toContain("About 6 credits");
    // The bulk tab prices many verses: one image's quote does not describe it.
    await render(false);
    expect(container.textContent).toContain("About 6 credits");
    expect(container.textContent).not.toContain("at most");
  } finally { act(() => root.unmount()); }
});

it("avoids premature model warnings and renders one catalog failure message", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = async (modelsError: string | null) => act(async () => root.render(createElement(PreferencesProvider, null,
    createElement(ImageGenerationSettingsPanel, { models: [], modelsLoading: false, modelsError }))));
  try {
    await render(null);
    expect(container.textContent).not.toContain("Saved model unavailable");
    await render("Catalog is unavailable");
    expect(container.textContent!.split("Catalog is unavailable")).toHaveLength(2);
  } finally { act(() => root.unmount()); }
});


it("disables unquoted resolutions in desktop and mobile settings", async () => {
  generationState.modelId = "google/gemini-3.1-flash-image";
  generationState.displayCostByResolution = { "1K": 10, "4K": 20 };
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(PreferencesProvider, null, createElement(HeaderSettingsPopover), createElement(MobileSettingsRows))));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Image settings"]')!.click());
    const missing = [...container.querySelectorAll<HTMLButtonElement>("button")].filter(button => button.textContent!.startsWith("2K"));
    expect(missing).toHaveLength(2);
    for (const button of missing) {
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-disabled")).toBe("true");
      await act(async () => button.click());
    }
    expect(setResolution).not.toHaveBeenCalled();
    const allowed = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent!.startsWith("4K"))!;
    await act(async () => allowed.click());
    expect(setResolution).toHaveBeenCalledWith("4K", "header_settings_popover");
  } finally { act(() => root.unmount()); }
});

it("offers the three art styles in order, keeps an unavailable selection without swapping it, and saves a choice", async () => {
  const storage = new Map([["visibible-preferences", JSON.stringify({ imageModel: "google/gemini-2.5-flash-image", artStyle: "watercolor" })]]);
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  const artStyles = [
    { id: "classical", label: "Classical", description: "Oil painting.", available: true, reason: null },
    { id: "watercolor", label: "Ink & Watercolor", description: "Ink and wash.", available: false, reason: "The watercolor art style is temporarily unavailable" },
    { id: "icon", label: "Byzantine Icon", description: "Gold ground.", available: true, reason: null },
  ];
  let current: ReturnType<typeof usePreferences>;
  function Probe() {
    const preferences = usePreferences();
    useLayoutEffect(() => { current = preferences; }, [preferences]);
    return createElement(ImageGenerationSettingsPanel, { models: [], modelsLoading: false, modelsError: null, artStyles });
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(PreferencesProvider, null, createElement(Probe))));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const radios = container.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
    expect(Array.from(radios).map((r) => r.textContent?.startsWith("Classical") || r.textContent?.startsWith("Ink") || r.textContent?.startsWith("Byzantine"))).toEqual([true, true, true]);
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain("Temporarily unavailable");
    expect(container.textContent).toContain("temporarily unavailable");
    expect(current!.artStyle).toBe("watercolor");
    await act(async () => radios[2].click());
    expect(current!.artStyle).toBe("icon");
    expect(JSON.parse(storage.get("visibible-preferences")!).artStyle).toBe("icon");
  } finally {
    await act(async () => root.unmount());
  }
});
