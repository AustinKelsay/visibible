import { HeaderSettingsPopover, MobileSettingsRows } from "../header-settings-popover";
// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageGenerationSettingsPanel } from "../image-generation-settings-panel";
import { ImageModelSelector } from "../image-model-selector";
import { PreferencesProvider, usePreferences } from "@/context/preferences-context";

const generationState = { modelId: "google/gemini-2.5-flash-image", baseCost: 0, scenePlannerCreditsCost: 0, showCreditsCost: false,
  displayCostByResolution: undefined as Partial<Record<"1K" | "2K" | "4K", number>> | undefined };
const setResolution = vi.fn();
beforeEach(() => { generationState.modelId = "google/gemini-2.5-flash-image"; generationState.displayCostByResolution = undefined; setResolution.mockClear(); });
vi.mock("@/context/generation-context", () => ({ useGeneration: () => ({ state: generationState, isRegistered: true, setAspectRatio: vi.fn(), setResolution }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ tier: "paid", credits: 100 }) }));
vi.mock("@/lib/analytics", () => ({ trackPreferenceChanged: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

it("labels stale pricing, disables unverified choices and repairs unsupported saved resolution on selection", async () => {
  const storage = new Map([["visibible-preferences", JSON.stringify({ imageModel: "removed/model", imageResolution: "4K" })]]);
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ models: [
    { id: "google/gemini-2.5-flash-image", name: "Default image", provider: "Google", availability: "stale", creditsCost: 6, estimatedCreditsByResolution: { "1K": 7 } },
    { id: "unverified/model", name: "Unverified", provider: "Other", availability: "unavailable", creditsCost: null, unavailableReason: "Pricing and settings not verified" },
  ], scenePlannerCreditsCost: 1, error: "Using cached image models" })));
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
    expect(current!.imageModel).toBe("removed/model");
    expect(current!.imageResolution).toBe("1K");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("Saved model unavailable");
    expect(container.textContent).toContain("Cached pricing");
    expect(container.textContent).toContain("About 7 credits");
    const options = container.querySelectorAll<HTMLButtonElement>('button[role="option"]');
    expect(options[1].disabled).toBe(true);
    await act(async () => options[1].click());
    expect(current!.imageModel).toBe("removed/model");
    await act(async () => options[0].click());
    expect(current!.imageModel).toBe("google/gemini-2.5-flash-image");
    expect(JSON.parse(storage.get("visibible-preferences")!).imageResolution).toBe("1K");
  } finally { act(() => root.unmount()); }
});


it("avoids premature model warnings and renders one catalog failure message", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = async (modelsError: string | null) => act(async () => root.render(createElement(PreferencesProvider, null,
    createElement(ImageGenerationSettingsPanel, { models: [], modelsLoading: false, modelsError, scenePlannerCreditsCost: 0 }))));
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
    await act(async () => root.render(createElement("div", null, createElement(HeaderSettingsPopover), createElement(MobileSettingsRows))));
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
