/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackMapExplored, trackMapLinkShown, trackMapOpened } from "@/lib/analytics";
import { verseSetting, type VerseSetting } from "@/lib/verse-setting";
import { LayerProvider } from "../layers";
import { MapLink, PlaceMapStage, resetMapMode } from "../place-map";
import { MAP_BOUNDS, project } from "@/lib/bible-map-projection";
import PlaceMapView, { cardPosition, fitView, frameSetting, placeNames, rank, resetPlaceMap, settingNote, zoomFrames } from "../place-map-view";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const session = vi.hoisted(() => ({ tier: "paid" as const, credits: 0, isLoading: false }));
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
const convex = vi.hoisted(() => ({ enabled: false, picture: null as { imageUrl: string; thumbnailUrl: string } | null }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => convex.enabled }));
vi.mock("convex/react", () => ({ useQuery: () => convex.picture }));
vi.mock("@/context/work-scope-context", () => ({ usePictureStyles: () => ({ chosen: "classical", visible: ["classical"], order: ["classical"] }) }));
vi.mock("@/lib/analytics", () => ({ trackMapLinkShown: vi.fn(), trackMapOpened: vi.fn(), trackMapExplored: vi.fn() }));
// A plain link, without the router (and its prefetching) behind it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- left off the plain link
vi.mock("next/link", () => ({ default: ({ prefetch: _prefetch, ...props }: { prefetch?: boolean } & Record<string, unknown>) => <a {...props} /> }));

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
  vi.mocked(trackMapExplored).mockClear();
  resetMapMode();
  resetPlaceMap();
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
async function renderReader(verseSettingValue: VerseSetting | null, hidden = false, here = { book: "Exodus", slug: "exodus", chapter: 14, verse: 2 }) {
  const reference = `${here.book} ${here.chapter}:${here.verse}`;
  await act(async () =>
    root.render(
      <>
        <PlaceMapStage setting={verseSettingValue} verseId={`${here.slug}-${here.chapter}-${here.verse}`} reference={reference} here={here} hidden={hidden} />
        {verseSettingValue ? <MapLink setting={verseSettingValue} bookName={here.book} chapter={here.chapter} verseNumber={here.verse} /> : null}
      </>,
    ),
  );
}

const map = () => container.querySelector('svg[role="group"]');
const card = () => container.querySelector<HTMLElement>("[data-marker-card]");
/** What a marker's card says about the marker, leaving out its chapters and close button. */
const cardInfo = () => {
  const shown = card();
  if (!shown) return undefined;
  const copy = shown.cloneNode(true) as HTMLElement;
  copy.querySelector("[data-chapters]")?.remove();
  copy.querySelector('[aria-label="Close the card"]')?.remove();
  return copy.textContent;
};

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

  it("is not counted as shown until the link comes into view", async () => {
    let report: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { report = callback; }
      observe() {}
      disconnect() {}
    });
    try {
      await renderReader(setting("EXO", 14, 2));
      expect(trackMapLinkShown).not.toHaveBeenCalled();
      await act(async () => report!([{ isIntersecting: true }]));
      expect(trackMapLinkShown).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("takes focus into the map when opened from the keyboard", async () => {
    await renderReader(setting("EXO", 14, 2));
    // A click with no pointer behind it, as Enter or Space gives.
    await act(async () => button("See where this happened")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    expect(document.activeElement).toBe(map());
    await act(async () => button("Back to the picture")!.click());
    await act(async () => button("See where this happened")!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(document.activeElement).not.toBe(map());
  });

  it("leaves Escape to a field the reader is typing in", async () => {
    await renderReader(setting("EXO", 14, 2));
    await act(async () => button("See where this happened")!.click());
    const field = document.createElement("input");
    document.body.appendChild(field);
    await act(async () => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(map()).not.toBeNull();
    field.remove();
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
  const view = (value: VerseSetting) => act(async () => root.render(<PlaceMapView setting={value} reference="Exodus 14:2" here={{ slug: "exodus", chapter: 14, verse: 2 }} onClose={() => {}} />));

  it("pins a settled place and rings each proposed site of a debated one", async () => {
    await view(setting("JHN", 1, 19));
    expect(container.querySelector('[data-pin="Jerusalem"]')).not.toBeNull();

    // Exodus 15:4 names only the Red Sea.
    await view(setting("EXO", 15, 4));
    const rings = container.querySelectorAll('[data-rings="Red Sea"] circle');
    expect(rings.length).toBeGreaterThan(1);
    // A lone debated place names each of its sites on the map.
    const labels = Array.from(container.querySelectorAll("svg text[data-marker]"), (text) => text.textContent);
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

  it("never frames more than the outline, even for a setting across the Bible world", () => {
    // 1 Kings 22:48: ships of Tarshish to go to Ophir for gold.
    const frame = frameSetting(setting("1KI", 22, 48));
    const [west, north] = project(MAP_BOUNDS.west, MAP_BOUNDS.north);
    const [east, south] = project(MAP_BOUNDS.east, MAP_BOUNDS.south);
    expect(frame.x).toBeGreaterThanOrEqual(west - 1e-6);
    expect(frame.y).toBeGreaterThanOrEqual(north - 1e-6);
    expect(frame.x + frame.width).toBeLessThanOrEqual(east + 1e-6);
    expect(frame.y + frame.height).toBeLessThanOrEqual(south + 1e-6);
  });

  it("tells about a proposed site when a ring is hovered, focused or tapped", async () => {
    await view(setting("EXO", 15, 4));
    const [first, second] = Array.from(container.querySelectorAll<SVGGElement>('[data-rings="Red Sea"]'));
    expect(first.getAttribute("aria-label")).toBe("Red Sea: proposed at Gulf of Suez, the most favoured of 5 proposed sites");
    expect(card()).toBeNull();

    await act(async () => first.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    expect(cardInfo()).toBe("Red SeaProposed at Gulf of SuezThe most favoured of 5 proposed sites");
    await act(async () => first.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
    expect(card()).toBeNull();

    await act(async () => second.focus());
    expect(card()?.textContent).toContain("Proposed at Bitter Lakes");
    // A pointer passing over another ring leaves the focused one's card, the keyboard's place, on leaving.
    await act(async () => first.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    expect(card()?.textContent).toContain("Proposed at Gulf of Suez");
    await act(async () => first.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
    expect(card()?.textContent).toContain("Proposed at Bitter Lakes");
    await act(async () => second.blur());
    await act(async () => second.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(card()?.textContent).toContain("Proposed at Bitter Lakes");
    // A tap on the open map puts it away.
    await act(async () => container.querySelector("svg path")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(card()).toBeNull();
  });

  it("gives places that share a spot one marker, one name and one card", async () => {
    // Isaiah 2:3: Zion and Jerusalem are the same place on the map.
    await view(setting("ISA", 2, 3));
    const pin = container.querySelector<SVGGElement>('[data-pin="Jerusalem · Zion"]')!;
    expect(pin.getAttribute("aria-label")).toBe("Jerusalem; Zion, at Jerusalem");
    expect(Array.from(container.querySelectorAll("svg text[data-marker]"), (text) => text.textContent)).toEqual(["Jerusalem · Zion"]);

    // Exodus 14:2: Baal-zephon and Pi-hahiroth are both proposed at Al Mahamdiyah.
    await view(setting("EXO", 14, 2));
    const shared = Array.from(container.querySelectorAll<SVGGElement>('[data-rings="Baal-zephon · Pi-hahiroth"]')).find((ring) => ring.getAttribute("aria-label")!.includes("Al Mahamdiyah"))!;
    await act(async () => shared.focus());
    // The shared site is named once.
    expect(cardInfo()).toBe("At Al MahamdiyahBaal-zephon less favoured (3 of 3)Pi-hahiroth less favoured (5 of 5)");
  });

  it("opens a marker's card from its name too", async () => {
    await view(setting("JHN", 1, 19));
    const name = Array.from(container.querySelectorAll("svg text[data-marker]")).find((text) => text.textContent === "Jerusalem")!;
    await act(async () => name.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(cardInfo()).toBe("JerusalemIts site is settled");
  });

  it("opens a marker's card with Enter", async () => {
    await view(setting("JHN", 1, 19));
    const pin = container.querySelector<SVGGElement>('[data-pin="Jerusalem"]')!;
    await act(async () => pin.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(container.querySelector("[data-marker-card]")).not.toBeNull();
  });

  it("says when proposed sites are equally favoured", () => {
    // Ezekiel 27:23: both sites proposed for Chilmad score the same.
    const chilmad = setting("EZK", 27, 23).places.find((place) => place.name === "Chilmad")!;
    expect(rank(chilmad, 0)).toBe("tied as the most favoured of 2 proposed sites");
    expect(rank(chilmad, 1)).toBe("tied as the most favoured of 2 proposed sites");
  });

  it("says a pinned place's site is settled", async () => {
    await view(setting("JHN", 1, 19));
    const pin = container.querySelector<SVGGElement>('[data-pin="Jerusalem"]')!;
    expect(pin.getAttribute("aria-label")).toBe("Jerusalem");
    await act(async () => pin.focus());
    expect(cardInfo()).toBe("JerusalemIts site is settled");
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

describe("the map's zoom", () => {
  const bethel = { book: "Genesis", slug: "genesis", chapter: 28, verse: 19 };
  const steps = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="Zoom"] [aria-pressed]'));
  const pressed = () => steps().find((step) => step.getAttribute("aria-pressed") === "true")?.textContent;
  const height = () => Number(map()!.getAttribute("viewBox")!.split(" ")[3]);

  it("closes in on the setting at Here, opens on the land and pulls back to the Bible world", () => {
    const box = { width: 800, height: 600, top: 0, bottom: 0 };
    const { frames, usable } = zoomFrames(setting("GEN", 28, 19), box);
    expect(frames.here.height).toBeLessThan(frames.land.height);
    expect(frames.land.height).toBeLessThan(frames.world.height);
    expect(usable).toEqual({ here: true, land: true, world: true });
    // A setting of only regions has nothing closer to show.
    expect(zoomFrames(setting("EXO", 14, 20), box).usable.here).toBe(false);
  });

  it("counts a step as the land's when the box would show it the same", () => {
    // Numbers 33:21's Here frame is narrower than the land's but as tall: a wide box is limited by that height either
    // way, so Here would change nothing; only a tall, narrow box shows it closer.
    const numbers = setting("NUM", 33, 21);
    expect(zoomFrames(numbers, { width: 800, height: 600, top: 0, bottom: 0 }).usable.here).toBe(false);
    expect(zoomFrames(numbers, { width: 390, height: 390, top: 90, bottom: 80 }).usable.here).toBe(false);
    expect(zoomFrames(numbers, { width: 390, height: 900, top: 0, bottom: 0 }).usable.here).toBe(true);
  });

  it("moves between named steps with the steps and with − and +, and keeps the step while turning pages", async () => {
    await renderReader(setting("GEN", 28, 19), false, bethel);
    await act(async () => button("See where this happened")!.click());
    expect(pressed()).toContain("The land");
    const land = height();

    await act(async () => steps()[2].click());
    expect(pressed()).toContain("The Bible world");
    expect(height()).toBeGreaterThan(land);
    expect(button("Zoom out")!.disabled).toBe(true);
    expect(trackMapExplored).toHaveBeenCalledWith(expect.objectContaining({ action: "zoom", step: "world", reference: "Genesis 28:19" }));

    await act(async () => button("Zoom in")!.click());
    await act(async () => button("Zoom in")!.click());
    expect(pressed()).toContain("Here");
    expect(height()).toBeLessThan(land);
    expect(button("Zoom in")!.disabled).toBe(true);

    // The step lasts across the page turn, even when the map is drawn afresh.
    await renderReader(null, false, bethel);
    await renderReader(setting("GEN", 28, 20), false, { ...bethel, verse: 20 });
    expect(pressed()).toContain("Here");
  });

  it("cannot choose a step that would show nothing new", async () => {
    await renderReader(setting("EXO", 14, 20), false, { book: "Exodus", slug: "exodus", chapter: 14, verse: 20 });
    await act(async () => button("See where this happened")!.click());
    expect(steps()[0].disabled).toBe(true);
    expect(button("Zoom in")!.disabled).toBe(true);
  });

  it("names well-known places around the setting faintly, never the setting's own", async () => {
    await renderReader(setting("GEN", 28, 19), false, bethel);
    await act(async () => button("See where this happened")!.click());
    const faint = Array.from(container.querySelectorAll("[data-nearby] text"), (text) => text.textContent);
    expect(faint).toContain("Jerusalem");
    expect(faint).not.toContain("Bethel");
  });
});

describe("the place card", () => {
  const bethel = { book: "Genesis", slug: "genesis", chapter: 28, verse: 19 };
  const openMap = async (here = bethel) => {
    await renderReader(setting("GEN", here.chapter, here.verse), false, here);
    await act(async () => button("See where this happened")!.click());
  };
  // Genesis 28:19 names Bethel and Luz, its old name, proposed at the same two sites; Beitin is the most favoured.
  const pin = () => container.querySelector<SVGGElement>('[data-rings="Bethel · Luz"]')!;
  const link = (label: string) => container.querySelector<HTMLAnchorElement>(`[data-marker-card] a[aria-label="${label}"]`);

  it("previews the place's chapters around this verse, and opens to walk them", async () => {
    await openMap();
    await act(async () => pin().dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    // A preview is a glance: hidden from screen readers and not usable.
    expect(card()!.getAttribute("aria-hidden")).toBe("true");
    expect(card()!.hasAttribute("inert")).toBe(true);
    expect(card()!.textContent).toContain("Bethel · 69 verses in 35 chapters");

    await act(async () => pin().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(card()!.hasAttribute("data-opened")).toBe(true);
    expect(card()!.getAttribute("aria-hidden")).toBeNull();
    expect(link("Before: Genesis 13:3")?.getAttribute("href")).toBe("/genesis/13/3");
    expect(link("After: Genesis 31:13")?.getAttribute("href")).toBe("/genesis/31/13");
    expect(card()!.querySelector('[aria-current="true"]')?.textContent).toBe("●Genesis 28:19 · this verse");
    expect(card()!.querySelector("[data-nearby-places]")?.textContent).toBe("Nearby · Ai 2 km · Mizpah 5 km · Michmash 6 km");

    await act(async () => link("After: Genesis 31:13")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(trackMapExplored).toHaveBeenCalledWith(expect.objectContaining({ action: "chapter", direction: "after" }));
  });

  it("lists every chapter that names the place, by part of the Bible", async () => {
    await openMap();
    await act(async () => pin().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => button("All 35 chapters naming Bethel")!.click());
    const list = container.querySelector("[data-all-chapters]")!;
    expect(Array.from(list.querySelectorAll("div > p:first-child"), (heading) => heading.textContent)).toEqual(["Law", "History", "Prophets"]);
    expect(list.querySelector('[aria-current="true"]')?.getAttribute("aria-label")).toBe("Genesis 28:19");
    expect(list.querySelectorAll("a")).toHaveLength(35);
    expect(trackMapExplored).toHaveBeenCalledWith(expect.objectContaining({ action: "all_chapters" }));
    await act(async () => button("Fewer chapters")!.click());
    expect(container.querySelector("[data-all-chapters]")).toBeNull();
  });

  it("stays open for the same place as the page turns to its next named", async () => {
    await openMap();
    await act(async () => pin().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await renderReader(setting("GEN", 31, 13), false, { ...bethel, chapter: 31, verse: 13 });
    expect(card()?.hasAttribute("data-opened")).toBe(true);
    expect(card()!.querySelector('[aria-current="true"]')?.textContent).toBe("●Genesis 31:13 · this verse");
    expect(link("Before: Genesis 28:19")).not.toBeNull();
  });

  it("opens with Enter into the card, and Escape there goes back to the marker without closing the map", async () => {
    await openMap();
    await act(async () => pin().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(document.activeElement).toBe(link("Before: Genesis 13:3"));
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(map()).not.toBeNull();
    expect(card()?.hasAttribute("data-opened") ?? false).toBe(false);
    expect(document.activeElement).toBe(pin());
  });

  it("takes focus into an already open card when Enter is pressed on its marker again", async () => {
    await openMap();
    await act(async () => pin().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await act(async () => pin().focus());
    expect(card()?.hasAttribute("data-opened")).toBe(true);
    await act(async () => pin().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(document.activeElement).toBe(link("Before: Genesis 13:3"));
  });

  it("holds an opened card while the pointer crosses another marker", async () => {
    await openMap();
    await act(async () => pin().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const other = container.querySelectorAll<SVGGElement>('[data-rings="Bethel · Luz"]')[1];
    await act(async () => other.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    expect(card()?.hasAttribute("data-opened")).toBe(true);
    expect(cardInfo()).toContain("Beitin");
  });

  it("closes with its close button", async () => {
    await openMap();
    await act(async () => pin().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => button("Close the card")!.click());
    expect(card()).toBeNull();
    expect(map()).not.toBeNull();
  });

  it("switches between the places that share a marker", async () => {
    await renderReader(setting("ISA", 2, 3), false, { book: "Isaiah", slug: "isaiah", chapter: 2, verse: 3 });
    await act(async () => button("See where this happened")!.click());
    await act(async () => container.querySelector('[data-pin="Jerusalem · Zion"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(card()!.textContent).toContain("Jerusalem · 955 verses");
    await act(async () => button("Zion")!.click());
    expect(card()!.textContent).toContain("Zion · 148 verses");
  });

  it("keeps to the chosen place when a chapter link leads on from a shared marker", async () => {
    const eyebrow = () => card()!.querySelector("[data-chapters] p")?.textContent;
    const sodomMarker = () => Array.from(container.querySelectorAll<SVGGElement>("[data-marker-key]")).find((marker) => marker.getAttribute("aria-label")?.includes("Sodom: proposed at south"))!;
    await renderReader(setting("GEN", 10, 19), false, { book: "Genesis", slug: "genesis", chapter: 10, verse: 19 });
    await act(async () => button("See where this happened")!.click());
    await act(async () => sodomMarker().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => button("Sodom")!.click());
    expect(eyebrow()).toMatch(/^Sodom · /);
    // Following the link turns the page: the same view, and after a fresh mount.
    await renderReader(setting("GEN", 13, 10), false, { book: "Genesis", slug: "genesis", chapter: 13, verse: 10 });
    expect(eyebrow()).toMatch(/^Sodom · /);
    act(() => root.unmount());
    root = createRoot(container);
    await renderReader(setting("GEN", 13, 10), false, { book: "Genesis", slug: "genesis", chapter: 13, verse: 10 });
    expect(eyebrow()).toMatch(/^Sodom · /);
  });

  it("offers the full list for a place named in only two chapters", async () => {
    await renderReader(setting("GEN", 10, 10), false, { book: "Genesis", slug: "genesis", chapter: 10, verse: 10 });
    await act(async () => button("See where this happened")!.click());
    const erech = Array.from(container.querySelectorAll<SVGGElement>("[data-marker-key]")).find((marker) => marker.getAttribute("aria-label")?.startsWith("Erech"))!;
    await act(async () => erech.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(button("All 2 chapters naming Erech")).toBeDefined();
  });
});

describe("the map's layout", () => {
  it("fits the setting between the controls and the note", () => {
    const frame = frameSetting(setting("EXO", 14, 2));
    const box = { width: 390, height: 390, top: 92, bottom: 90 };
    const view = fitView(frame, box);
    const top = (frame.y - view.y) / view.unit;
    const bottom = (frame.y + frame.height - view.y) / view.unit;
    expect(top).toBeGreaterThanOrEqual(box.top - 1e-6);
    expect(bottom).toBeLessThanOrEqual(box.height - box.bottom + 1e-6);
  });

  it("never prints a name over another, and leaves out one with no room", () => {
    const band = { left: 0, top: 0, right: 400, bottom: 400 };
    const crowd = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ key: String(i), left: 200 + (i % 3) * 4, top: 200 + Math.floor(i / 3) * 4, radius: 0, names: [`Place ${i}`] }));
    const placed = placeNames(crowd, [], band, 15);
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThan(crowd.length);
    const boxes = placed.map((name) => {
      const width = name.text.length * 7.5;
      const left = name.anchor === "start" ? name.x : name.anchor === "end" ? name.x - width : name.x - width / 2;
      return { left, right: left + width, top: name.y - 11.25, bottom: name.y + 3.75 };
    });
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) expect(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).toBe(false);
    }
  });

  it("puts a card above or below its marker on a phone, never over it", () => {
    const at = { left: 195, top: 150 };
    const { left, top } = cardPosition(at, 20, { width: 390, height: 390 }, 74);
    const coversMarker = at.left >= left && at.left <= left + 264 && at.top >= top && at.top <= top + 74;
    expect(coversMarker).toBe(false);
    // Low in the box, a tall card goes above.
    const low = { left: 195, top: 250 };
    const above = cardPosition(low, 20, { width: 390, height: 390 }, 130);
    expect(above.top + 130).toBeLessThanOrEqual(low.top);
    // It never rises over the controls at the top of the box: a card too tall for the room above goes below.
    expect(cardPosition({ left: 195, top: 120 }, 20, { width: 390, height: 390, top: 60 }, 330).top).toBe(140);
    expect(cardPosition({ left: 195, top: 300 }, 20, { width: 390, height: 390, top: 60 }, 330).top).toBe(60);
    // A computer's box has room beside it.
    expect(cardPosition(at, 20, { width: 900, height: 700 }, 74).left).toBe(215);
    // A card taller than either side (the full list) scrolls within the side it takes, clear of the marker.
    const middle = { left: 195, top: 202 };
    const tall = cardPosition(middle, 20, { width: 390, height: 390, top: 60 }, 286);
    const shown = Math.min(286, tall.maxHeight);
    expect(middle.top >= tall.top && middle.top <= tall.top + shown).toBe(false);
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
