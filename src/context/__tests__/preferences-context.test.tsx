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

// Generation runs on one model (ADR 0012); a saved choice of another would be priced at its rate and charged at this one's.
it.each([
  ["the old default", { imageModel: OLD_DEFAULT, imageResolution: "1K" }],
  ["a model the visitor chose", { imageModel: "google/gemini-3.1-flash-image", imageResolution: "4K", defaultImageModel: OLD_DEFAULT }],
  ["Nano Banana 2 Lite, the default before the switch", { imageModel: "google/gemini-3.1-flash-lite-image", defaultImageModel: "google/gemini-3.1-flash-lite-image" }],
])("restores the generation model over %s", async (_label, saved) => {
  const view = await hydrate(new Map([["visibible-preferences", JSON.stringify(saved)]]));
  expect(view.preferences()).toMatchObject({ imageModel: DEFAULT_IMAGE_MODEL, imageResolution: "1K" });
  view.unmount();
});

it("does not keep a model selected in one visit for the next", async () => {
  const storage = new Map<string, string>();
  const first = await hydrate(storage);
  await act(async () => first.preferences().setImageModel("google/gemini-3.1-flash-lite-image"));
  expect(first.preferences().imageModel).toBe("google/gemini-3.1-flash-lite-image");
  first.unmount();
  const second = await hydrate(storage);
  expect(second.preferences().imageModel).toBe(DEFAULT_IMAGE_MODEL);
  second.unmount();
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

// A guest is charged for an automatic image without seeing its price, so only their own saved choice turns it on.
it("keeps automatic generation off until the guest turns it on, and remembers the choice", async () => {
  const storage = new Map<string, string>([["visibible-preferences", JSON.stringify({ artStyle: "watercolor", autoGenerate: "yes" })]]);
  const first = await hydrate(storage);
  expect(first.preferences().autoGenerate).toBe(false);
  await act(async () => first.preferences().setAutoGenerate(true));
  expect(first.preferences().autoGenerate).toBe(true);
  first.unmount();
  const second = await hydrate(storage);
  expect(second.preferences()).toMatchObject({ autoGenerate: true, artStyle: "watercolor" });
  await act(async () => second.preferences().setAutoGenerate(false));
  second.unmount();
  expect((await hydrate(storage)).preferences().autoGenerate).toBe(false);
});
