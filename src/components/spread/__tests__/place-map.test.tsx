/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackMapLinkShown, trackMapOpened } from "@/lib/analytics";
import { verseSetting, type VerseSetting } from "@/lib/verse-setting";
import { LayerProvider } from "../layers";
import { MapLink, PlaceMapStage, resetMapMode } from "../place-map";
import { project } from "@/lib/bible-map-projection";
import PlaceMapView, { frameSetting, settingNote } from "../place-map-view";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const session = vi.hoisted(() => ({ tier: "paid" as const, credits: 0, isLoading: false }));
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
const convex = vi.hoisted(() => ({ enabled: false, picture: null as { imageUrl: string; thumbnailUrl: string } | null }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => convex.enabled }));
vi.mock("convex/react", () => ({ useQuery: () => convex.picture }));
vi.mock("@/context/work-scope-context", () => ({ usePictureStyles: () => ({ chosen: "classical", visible: ["classical"], order: ["classical"] }) }));
vi.mock("@/lib/analytics", () => ({ trackMapLinkShown: vi.fn(), trackMapOpened: vi.fn() }));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const setting = (book: string, chapter: number, verse: number) => verseSetting(book, chapter, verse) as VerseSetting;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.mocked(trackMapLinkShown).mockClear();
  vi.mocked(trackMapOpened).mockClear();
  resetMapMode();
  convex.enabled = false;
  convex.picture = null;
  session.isLoading = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (name: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => (b.getAttribute("aria-label") ?? b.textContent) === name);

/** The link and the map as the spread puts them together. */
async function renderReader(verseSettingValue: VerseSetting | null, hidden = false) {
  await act(async () =>
    root.render(
      <>
        <PlaceMapStage setting={verseSettingValue} verseId="exodus-14-2" reference="Exodus 14:2" hidden={hidden} />
        {verseSettingValue ? <MapLink setting={verseSettingValue} bookName="Exodus" chapter={14} verseNumber={2} /> : null}
      </>,
    ),
  );
}

const map = () => container.querySelector('svg[role="img"]');

describe("the map link", () => {
  it("offers the map under a verse with a setting and reports being shown once", async () => {
    await renderReader(setting("EXO", 14, 2));
    expect(button("See where this happened")).toBeDefined();
    expect(map()).toBeNull();
    expect(trackMapLinkShown).toHaveBeenCalledTimes(1);
    expect(trackMapLinkShown).toHaveBeenCalledWith(expect.objectContaining({ book: "Exodus", chapter: 14, verse: 2, inherited: false, debated: true }));
  });

  it("reports being shown once the session is known, even if the map was opened first", async () => {
    session.isLoading = true;
    await renderReader(setting("EXO", 14, 2));
    expect(trackMapLinkShown).not.toHaveBeenCalled();
    await act(async () => button("See where this happened")!.click());
    session.isLoading = false;
    await renderReader(setting("EXO", 14, 2));
    expect(trackMapLinkShown).toHaveBeenCalledTimes(1);
  });

  it("is not counted as shown while the whole-picture view puts the words page aside", async () => {
    await act(async () =>
      root.render(
        <LayerProvider initialLayer="whole-picture">
          <MapLink setting={setting("EXO", 14, 2)} bookName="Exodus" chapter={14} verseNumber={2} />
        </LayerProvider>,
      ),
    );
    expect(trackMapLinkShown).not.toHaveBeenCalled();
  });

  it("puts the map in the picture's place and turns into the way back", async () => {
    await renderReader(setting("EXO", 14, 2));
    await act(async () => button("See where this happened")!.click());
    expect(trackMapOpened).toHaveBeenCalledTimes(1);
    expect(map()?.getAttribute("aria-label")).toBe("Map of Baal-zephon, Migdol and Pi-hahiroth, where Exodus 14:2 happened");
    await act(async () => button("Back to the picture")!.click());
    expect(map()).toBeNull();
    expect(button("See where this happened")).toBeDefined();
    // Coming back to the offer on the same spread is not a second showing.
    expect(trackMapLinkShown).toHaveBeenCalledTimes(1);
  });

  it("closes with the map's close button and with Escape", async () => {
    await renderReader(setting("EXO", 14, 2));
    await act(async () => button("See where this happened")!.click());
    await act(async () => button("Close the map")!.click());
    expect(map()).toBeNull();

    await act(async () => button("See where this happened")!.click());
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(map()).toBeNull();
  });

  it("stays on for the next verse with a setting, and shows the picture for a verse with none", async () => {
    await renderReader(setting("EXO", 14, 2));
    await act(async () => button("See where this happened")!.click());
    await renderReader(setting("EXO", 15, 23));
    expect(map()?.getAttribute("aria-label")).toContain("Marah");
    expect(button("Back to the picture")).toBeDefined();
    await renderReader(null);
    expect(map()).toBeNull();
    expect(button("Back to the picture")).toBeUndefined();
  });

  it("hands focus back to the link when the map's own close button goes", async () => {
    await renderReader(setting("EXO", 14, 2));
    await act(async () => button("See where this happened")!.click());
    button("Close the map")!.focus();
    await act(async () => button("Close the map")!.click());
    expect(document.activeElement).toBe(button("See where this happened"));
  });

  it("shrinks the verse's picture to a window that brings it back", async () => {
    convex.enabled = true;
    convex.picture = { imageUrl: "https://example.test/full.jpg", thumbnailUrl: "https://example.test/thumb.jpg" };
    await renderReader(setting("EXO", 14, 2));
    await act(async () => button("See where this happened")!.click());
    const painting = button("Back to the picture of Exodus 14:2");
    expect(painting?.querySelector("img")?.getAttribute("src")).toBe("https://example.test/thumb.jpg");
    await act(async () => painting!.click());
    expect(map()).toBeNull();
  });

  it("has no picture window for an unpainted verse", async () => {
    convex.enabled = true;
    await renderReader(setting("EXO", 14, 2));
    await act(async () => button("See where this happened")!.click());
    expect(map()).not.toBeNull();
    expect(button("Back to the picture of Exodus 14:2")).toBeUndefined();
  });

  it("gives way to the whole-picture view", async () => {
    await renderReader(setting("EXO", 14, 2));
    await act(async () => button("See where this happened")!.click());
    await renderReader(setting("EXO", 14, 2), true);
    expect(map()).toBeNull();
  });
});

describe("the map", () => {
  const view = (value: VerseSetting) => act(async () => root.render(<PlaceMapView setting={value} reference="Exodus 14:2" onClose={() => {}} />));

  it("pins a settled place and rings each proposed site of a debated one", async () => {
    await view(setting("JHN", 1, 19));
    expect(container.querySelector('[data-pin="Jerusalem"]')).not.toBeNull();

    // Exodus 15:4 names only the Red Sea.
    await view(setting("EXO", 15, 4));
    const rings = container.querySelectorAll('[data-rings="Red Sea"] circle');
    expect(rings.length).toBeGreaterThan(1);
    // A lone debated place names each of its sites on the map.
    const labels = Array.from(container.querySelectorAll("svg text"), (text) => text.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Gulf of Suez", "Bitter Lakes"]));
  });

  it("frames every site, even at the far edge of the Bible world", () => {
    // Esther 1:1: "from India to Ethiopia".
    const far = setting("EST", 1, 1);
    const frame = frameSetting(far);
    for (const site of far.places.flatMap((place) => place.sites)) {
      const [x, y] = project(site.lon, site.lat);
      expect(x).toBeGreaterThanOrEqual(frame.x);
      expect(x).toBeLessThanOrEqual(frame.x + frame.width);
      expect(y).toBeGreaterThanOrEqual(frame.y);
      expect(y).toBeLessThanOrEqual(frame.y + frame.height);
    }
  });

  it("labels a region instead of pinning it", async () => {
    await view(setting("EXO", 14, 20));
    expect(container.querySelector('[data-region="Egypt"]')).not.toBeNull();
    expect(container.querySelector("[data-pin]")).toBeNull();
  });

  it("credits its places data and is marked experimental", async () => {
    await view(setting("JHN", 1, 19));
    expect(container.textContent).toContain("Experimental");
    expect(container.querySelector('a[href="https://www.openbible.info/geo/"]')?.textContent).toBe("Places: OpenBible.info, CC BY 4.0");
  });
});

describe("the map's note", () => {
  it("names a settled place", () => {
    expect(settingNote(setting("JHN", 1, 19))).toBe("Jerusalem.");
  });

  it("says where a carried setting came from", () => {
    expect(settingNote(setting("EXO", 14, 21))).toBe("Set in Egypt, named in verse 20.");
    expect(settingNote(setting("EXO", 15, 24))).toBe(
      "Set at Marah, named in verse 23. Its site is debated; rings show the proposed sites, larger where more sources favour them.",
    );
  });

  it("says when a site is debated", () => {
    expect(settingNote(setting("EXO", 15, 4))).toBe(
      "The Red Sea. Its site is debated; rings show the proposed sites, larger where more sources favour them.",
    );
    // Exodus 13:18 names Egypt (settled) and the Red Sea (debated).
    expect(settingNote(setting("EXO", 13, 18))).toBe(
      "Egypt and the Red Sea. The site of the Red Sea is debated; rings show the proposed sites, larger where more sources favour them.",
    );
  });
});
