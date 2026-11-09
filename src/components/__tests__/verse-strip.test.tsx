/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerseStrip } from "@/components/verse-strip";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const imageStatus = [
  { verse: 1, imageCount: 4 },
  { verse: 3, imageCount: 1 },
];

vi.mock("convex/react", () => ({ useQuery: () => imageStatus }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
vi.mock("@/context/preferences-context", () => ({ usePreferences: () => ({ artStyle: "classical" }) }));
vi.mock("../../../convex/_generated/api", () => ({ api: { verseImages: { getChapterImageStatus: "status" } } }));

describe("VerseStrip", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // jsdom does not implement element scrolling.
    Element.prototype.scrollTo = vi.fn() as unknown as Element["scrollTo"];
    Element.prototype.scrollBy = vi.fn() as unknown as Element["scrollBy"];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("shows image counts inside each verse tile, not as overlapping badges", async () => {
    await act(async () => root.render(<VerseStrip book="genesis" chapter={1} currentVerse={1} totalVerses={5} />));
    const links = Array.from(container.querySelectorAll("a"));
    expect(links).toHaveLength(5);
    expect(links[0].getAttribute("aria-current")).toBe("page");
    // One mark for any count (icon + number), and the tile's name says what it means
    expect(links[0].getAttribute("aria-label")).toBe("Verse 1, 4 saved images");
    expect(links[0].textContent).toBe("14");
    expect(links[2].getAttribute("aria-label")).toBe("Verse 3, 1 saved image");
    expect(links[2].textContent).toBe("31");
    expect(links[1].getAttribute("aria-label")).toBe("Verse 2, no image yet");
    expect(links[1].querySelector("svg")).toBeNull();
    expect(container.querySelector('[class*="-top-1.5"]')).toBeNull();
  });

  it("enables the scroll arrows only when there is more to see", async () => {
    // jsdom has no layout: give the scroller a fixed viewport over wider content.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1000);
    await act(async () => root.render(<VerseStrip book="genesis" chapter={1} currentVerse={1} totalVerses={31} />));
    const earlier = container.querySelector<HTMLButtonElement>('button[aria-label="Earlier verses"]')!;
    const later = container.querySelector<HTMLButtonElement>('button[aria-label="Later verses"]')!;
    expect(earlier.disabled).toBe(true);
    expect(later.disabled).toBe(false);
    // The strip fades before the forward arrow instead of cutting a tile
    const scroller = later.previousElementSibling as HTMLElement;
    expect(scroller.style.maskImage || scroller.getAttribute("style")).toContain("linear-gradient");
  });
});
