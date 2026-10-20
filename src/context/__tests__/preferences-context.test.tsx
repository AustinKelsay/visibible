// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PreferencesProvider, usePreferences } from "@/context/preferences-context";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ tier: "paid", credits: 100 }) }));
vi.mock("@/lib/analytics", () => ({ trackPreferenceChanged: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

const OLD_DEFAULT = "google/gemini-2.5-flash-image";

async function hydrate(storage: Map<string, string>) {
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  let current: ReturnType<typeof usePreferences> | undefined;
  function Probe() {
    const preferences = usePreferences();
    useLayoutEffect(() => { current = preferences; }, [preferences]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(PreferencesProvider, null, createElement(Probe))));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return { preferences: () => current!, unmount: () => act(() => root.unmount()) };
}

it("moves a visitor saved on the old default to the current one, then keeps a deliberate choice of it", async () => {
  const storage = new Map([["visibible-preferences", JSON.stringify({ imageModel: OLD_DEFAULT, imageResolution: "1K" })]]);
  const first = await hydrate(storage);
  expect(first.preferences().imageModel).toBe(DEFAULT_IMAGE_MODEL);
  await act(async () => first.preferences().setImageModel(OLD_DEFAULT));
  first.unmount();

  const second = await hydrate(storage);
  expect(second.preferences().imageModel).toBe(OLD_DEFAULT);
  second.unmount();
});

it("keeps a saved model the visitor chose over the old default", async () => {
  const storage = new Map([["visibible-preferences", JSON.stringify({ imageModel: "google/gemini-3.1-flash-image", imageResolution: "4K" })]]);
  const view = await hydrate(storage);
  expect(view.preferences()).toMatchObject({ imageModel: "google/gemini-3.1-flash-image", imageResolution: "4K" });
  view.unmount();
});

it("persists a chosen art style and uses the default for an unknown saved one without rewriting it", async () => {
  const storage = new Map([["visibible-preferences", JSON.stringify({ imageModel: DEFAULT_IMAGE_MODEL, artStyle: "oil-pastel" })]]);
  const first = await hydrate(storage);
  expect(first.preferences().artStyle).toBe("classical");
  expect(JSON.parse(storage.get("visibible-preferences")!).artStyle).toBe("oil-pastel");
  await act(async () => first.preferences().setArtStyle("watercolor"));
  expect(first.preferences().artStyle).toBe("watercolor");
  await act(async () => first.preferences().setArtStyle("not-a-style"));
  expect(first.preferences().artStyle).toBe("watercolor");
  first.unmount();

  const second = await hydrate(storage);
  expect(second.preferences().artStyle).toBe("watercolor");
  second.unmount();
});
