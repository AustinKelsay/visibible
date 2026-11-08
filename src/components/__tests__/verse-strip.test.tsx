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
    expect(links[0].querySelector('[aria-label="4 images"]')).not.toBeNull();
    expect(links[2].querySelector('[aria-label="1 image"]')).not.toBeNull();
    expect(links[1].querySelector("[aria-label]")).toBeNull();
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
  });
});
