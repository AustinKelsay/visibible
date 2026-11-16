// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PreferencesProvider, usePreferences } from "@/context/preferences-context";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ tier: "paid", credits: 100 }) }));
vi.mock("@/lib/analytics", () => ({ trackPreferenceChanged: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RECORD = "visibible-reader-settings";
const OLD_RECORD = "visibible-preferences";

function clearCookies() {
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

beforeEach(() => { clearCookies(); refresh.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); clearCookies(); });

async function hydrate(storage: Map<string, string>) {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
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

const stored = (storage: Map<string, string>) => JSON.parse(storage.get(RECORD)!);

it("starts a fresh device from the defaults", async () => {
  const view = await hydrate(new Map());
  expect(view.preferences()).toMatchObject({
    artStyle: "classical",
    textSize: "medium",
    translation: "web",
    autoGenerate: false,
  });
  view.unmount();
});

// Spec #434, "Stored settings": the old record is ignored and removed, and nothing is migrated.
it("ignores the old settings record, removes it and starts from the defaults", async () => {
  const storage = new Map([[OLD_RECORD, JSON.stringify({
    translation: "kjv", artStyle: "watercolor", autoGenerate: true, imageAspectRatio: "1:1", chatModel: "some/model",
  })]]);
  const view = await hydrate(storage);
  expect(view.preferences()).toMatchObject({ artStyle: "classical", translation: "web", autoGenerate: false });
  expect(storage.has(OLD_RECORD)).toBe(false);
  view.unmount();
});

it("remembers the art style, text size and automatic painting in the new record", async () => {
  const storage = new Map<string, string>();
  const first = await hydrate(storage);
  await act(async () => first.preferences().setArtStyle("watercolor"));
  await act(async () => first.preferences().setTextSize("large"));
  await act(async () => first.preferences().setAutoGenerate(true));
  expect(first.preferences()).toMatchObject({ artStyle: "watercolor", textSize: "large", autoGenerate: true });
  expect(stored(storage)).toMatchObject({ look: { artStyle: "watercolor", textSize: "large" }, autoGenerate: true });
  expect(storage.has(OLD_RECORD)).toBe(false);
  first.unmount();

  const second = await hydrate(storage);
  expect(second.preferences()).toMatchObject({ artStyle: "watercolor", textSize: "large", autoGenerate: true });
  second.unmount();
});

it("uses the default for anything unknown in the record without rewriting it", async () => {
  const storage = new Map([[RECORD, JSON.stringify({ version: 1, look: { artStyle: "oil-pastel", textSize: "huge" }, autoGenerate: "yes" })]]);
  const view = await hydrate(storage);
  expect(view.preferences()).toMatchObject({ artStyle: "classical", textSize: "medium", autoGenerate: false });
  expect(stored(storage).look.artStyle).toBe("oil-pastel");
  await act(async () => view.preferences().setArtStyle("not-a-style"));
  expect(view.preferences().artStyle).toBe("classical");
  view.unmount();
});

// The server renders the verse in the cookie's translation, so the cookie stays its only home.
it("keeps the translation in its cookie, not in the record", async () => {
  document.cookie = "visibible-translation=kjv; path=/";
  const storage = new Map<string, string>();
  const view = await hydrate(storage);
  expect(view.preferences().translation).toBe("kjv");
  expect(view.preferences().translationInfo.name).toBe("King James Version");

  await act(async () => view.preferences().setTranslation("asv"));
  expect(document.cookie).toContain("visibible-translation=asv");
  expect(view.preferences().translation).toBe("asv");
  expect(refresh).toHaveBeenCalled();
  expect(storage.get(RECORD) ?? "").not.toContain("asv");
  view.unmount();
});

// Advanced's group lives in the same record but belongs to src/lib/advanced-settings.ts; Look's writes keep it intact.
it("keeps the Advanced group untouched when Look's choices are written", async () => {
  const advanced = { imageAspectRatio: "3:2", chatModel: "some/model", appearance: "light" };
  const storage = new Map([[RECORD, JSON.stringify({ version: 1, advanced })]]);
  const view = await hydrate(storage);
  await act(async () => view.preferences().setArtStyle("watercolor"));
  await act(async () => view.preferences().setAutoGenerate(true));
  expect(stored(storage)).toEqual({ version: 1, look: { artStyle: "watercolor" }, autoGenerate: true, advanced });
  view.unmount();
});
