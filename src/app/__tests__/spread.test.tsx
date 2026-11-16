/* @vitest-environment jsdom */

import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import VersePage from "../[book]/[chapter]/[verse]/page";
import { clearBibleApiCache, type Translation } from "@/lib/bible-api";
import { trackVerseNavigation } from "@/lib/analytics";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
const prefetch = vi.fn();
let translation: Translation = "web";
let artStyle = "classical";

vi.mock("@/lib/get-translation", () => ({ getTranslationFromCookies: async () => translation }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push, prefetch, refresh: vi.fn() }),
  usePathname: () => "/genesis/1/1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: {
    href: string;
    children: ReactNode;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
        push(href);
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: () => vi.fn(async () => ({ success: true })),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
// Whether automatic painting is on: a tiny store, so turning the switch re-renders the reader as the real preference does.
let autoGenerate = false;
const autoGenerateListeners = new Set<() => void>();
const setAutoGenerate = vi.fn((enabled: boolean) => {
  autoGenerate = enabled;
  autoGenerateListeners.forEach((listener) => listener());
});
vi.mock("@/context/preferences-context", () => ({
  usePreferences: () => ({
    artStyle,
    translation,
    imageModel: "test-model",
    imageAspectRatio: "16:9",
    imageResolution: "1K",
    autoGenerate: useSyncExternalStore(
      (listener) => { autoGenerateListeners.add(listener); return () => autoGenerateListeners.delete(listener); },
      () => autoGenerate,
      () => autoGenerate,
    ),
    setAutoGenerate,
  }),
}));
const buyCredits = vi.fn();
let session: { tier: "paid" | "admin"; credits: number } = { tier: "paid", credits: 0 };
vi.mock("@/context/session-context", () => ({ useSession: () => ({ ...session, isLoading: false, buyCredits }) }));
vi.mock("@/lib/analytics");

type SavedPicture = { id: string; imageUrl: string; thumbnailUrl?: string | null; artStyle: string; createdAt: number };
let savedPictures: SavedPicture[] = [];
let requestStatus: { status: string; error?: string } | null = null;

const verseOf = (picture: SavedPicture) => picture.id.split(":")[0];

/** The nearest earlier picture of the chapter in the style, as the Convex read answers it. */
function nearestEarlierPicture(verseId: string, style: string) {
  const [, chapterId, verse] = /^(.+-\d+)-(\d+)$/.exec(verseId)!;
  for (let earlier = Number(verse) - 1; earlier >= 1; earlier--) {
    const newest = savedPictures
      .filter((picture) => verseOf(picture) === `${chapterId}-${earlier}` && picture.artStyle === style)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (newest) return { verse: earlier, id: newest.id, imageUrl: newest.imageUrl, thumbnailUrl: newest.thumbnailUrl ?? null };
  }
  return null;
}

// The image service: the catalog prices an image at 5 credits, a quote at about 2 (at most 4).
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let quoteRequests: Array<Record<string, unknown>> = [];
let paintRequests: Array<Record<string, unknown>> = [];
let paintAnswers: Array<() => Response | Promise<Response>> = [];
const painted = (savedImageId: string) => json({ requestId: "r", imageUrl: "https://img.test/new.png", savedImageId, model: "test-model" });

const params = (book = "genesis", chapter = "1", verse = "1") => ({ params: Promise.resolve({ book, chapter, verse }) });

let container: HTMLDivElement;
let root: Root;

async function openVerse(book: string, chapter: string, verse: string) {
  const page = await VersePage(params(book, chapter, verse));
  await act(async () => { root.render(page); });
}

function within(element: Element | null): Element {
  if (!element) throw new Error("element not found");
  return element;
}

function links(name: string) {
  return [...container.querySelectorAll<HTMLAnchorElement>(`a[aria-label="${name}"]`)];
}

function pressKey(key: string, target: EventTarget = document.body) {
  act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
}

beforeEach(() => {
  clearBibleApiCache();
  vi.clearAllMocks();
  translation = "web";
  artStyle = "classical";
  savedPictures = [];
  requestStatus = null;
  session = { tier: "paid", credits: 0 };
  autoGenerate = false;
  quoteRequests = [];
  paintRequests = [];
  paintAnswers = [];
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/image-models") {
      return json({ models: [{ id: "test-model", creditsCost: 5, reservationCreditsCost: 10, estimatedCreditsByResolution: { "1K": 5 }, etaSeconds: 12 }] });
    }
    if (url === "/api/generate-image/quote") {
      quoteRequests.push(JSON.parse(String(init?.body)));
      return json({ quote: { quoteId: `quote-${quoteRequests.length}`, operation: "image", policyVersion: "accepted-maximum-v1", estimateCredits: 2, maximumCredits: 4, expiresAt: Date.now() + 300_000 } });
    }
    if (url === "/api/generate-image") {
      paintRequests.push(JSON.parse(String(init?.body)));
      return (paintAnswers.shift() ?? (() => painted("new-picture")))();
    }
    // The Bible service is unreachable, so the reader uses the imported World English Bible.
    throw new DOMException("Timed out", "TimeoutError");
  }));
  vi.mocked(useQuery).mockImplementation(((query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(query);
    if (name === "verseImages:getGenerationRequestStatus") return requestStatus;
    if (name === "verseImages:getChapterImageStatus") {
      // The chapter's painted status: the verses with a picture in the style, and how many.
      const { book, chapter, artStyle: style } = args as { book: string; chapter: number; artStyle: string };
      const counts = new Map<number, number>();
      for (const picture of savedPictures) {
        const match = picture.id.match(/^([a-z0-9-]+?)-(\d+)-(\d+):/);
        if (!match || match[1] !== book || Number(match[2]) !== chapter || picture.artStyle !== style) continue;
        counts.set(Number(match[3]), (counts.get(Number(match[3])) ?? 0) + 1);
      }
      return [...counts].sort((a, b) => a[0] - b[0]).map(([verse, imageCount]) => ({ verse, imageCount }));
    }
    const { verseId, artStyle: style, otherStyles } = args as { verseId: string; artStyle: string; otherStyles?: boolean };
    if (name === "verseImages:getNearestEarlierPicture") return nearestEarlierPicture(verseId, style);
    return savedPictures
      .filter((picture) => verseOf(picture) === verseId && (otherStyles ? picture.artStyle !== style : picture.artStyle === style))
      .sort((a, b) => b.createdAt - a.createdAt);
  }) as typeof useQuery);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the spread for a painted verse", () => {
  it("shows the newest picture in the stored art style beside a words page", async () => {
    artStyle = "watercolor";
    savedPictures = [
      { id: "genesis-1-1:old-watercolor", imageUrl: "https://img.test/old-watercolor.png", artStyle: "watercolor", createdAt: 1 },
      { id: "genesis-1-1:new-watercolor", imageUrl: "https://img.test/new-watercolor.png", artStyle: "watercolor", createdAt: 3 },
      { id: "genesis-1-1:classical", imageUrl: "https://img.test/classical.png", artStyle: "classical", createdAt: 5 },
    ];
    await openVerse("genesis", "1", "1");

    const picture = container.querySelector<HTMLImageElement>("img");
    expect(picture?.getAttribute("src")).toBe("https://img.test/new-watercolor.png");
    expect(picture?.alt).toBe("Picture of Genesis 1:1");

    const words = container.querySelector("article");
    expect(words?.textContent).toContain("Genesis · Chapter 1");
    expect(words?.querySelector("h1")?.textContent).toBe("Genesis 1:1");
    expect(words?.textContent).toContain("In the beginning, God created the heavens and the earth.");
    expect(words?.textContent).toContain("World English Bible");
    expect(words?.textContent).toContain("1 / 31");
  });

  it("keeps the verse text in the server-rendered page", async () => {
    const html = renderToStaticMarkup(await VersePage(params("john", "1", "5")));
    expect(html).toContain("The light shines in the darkness");
    expect(html).toContain("5 / 51");
  });

  it("shows the words page over plain dark when the stored style has no picture", async () => {
    savedPictures = [
      { id: "genesis-1-1:watercolor", imageUrl: "https://img.test/watercolor.png", artStyle: "watercolor", createdAt: 1 },
    ];
    await openVerse("genesis", "1", "1");

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("article h1")?.textContent).toBe("Genesis 1:1");
  });
});

describe("an unpainted verse", () => {
  /** Let the catalog, the quote's debounce and its answer arrive. */
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 480)); });
  const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const button = (name: string | RegExp) => [...container.querySelectorAll("button")]
    .find((candidate) => (typeof name === "string" ? candidate.textContent === name : name.test(candidate.textContent ?? "")));
  const autoSwitch = () => container.querySelector<HTMLButtonElement>('[role="switch"]');
  const pictureArea = () => container.querySelector<HTMLElement>('[aria-label="Picture"]');

  it("glows with the nearest earlier picture in the chapter, in the stored style", async () => {
    savedPictures = [
      { id: "john-1-2:classical", imageUrl: "https://img.test/2.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-3:classical", imageUrl: "https://img.test/3.png", thumbnailUrl: "https://img.test/3-small.webp", artStyle: "classical", createdAt: 2 },
      { id: "john-1-4:watercolor", imageUrl: "https://img.test/4.png", artStyle: "watercolor", createdAt: 3 },
      { id: "john-1-9:classical", imageUrl: "https://img.test/9.png", artStyle: "classical", createdAt: 4 },
    ];
    await openVerse("john", "1", "5");

    expect(container.querySelector('img[alt^="Picture of"]')).toBeNull();
    const glow = pictureArea()?.querySelector("img");
    expect(glow?.getAttribute("src")).toBe("https://img.test/3-small.webp");
    expect(glow?.getAttribute("alt")).toBe("");
    expect(pictureArea()?.textContent).toContain("No picture for John 1:5 yet");
  });

  it("is plain dark when no earlier verse of the chapter has a picture", async () => {
    savedPictures = [
      { id: "john-1-9:classical", imageUrl: "https://img.test/9.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-2:watercolor", imageUrl: "https://img.test/2.png", artStyle: "watercolor", createdAt: 2 },
    ];
    await openVerse("john", "1", "5");

    expect(container.querySelector("img")).toBeNull();
    expect(pictureArea()?.textContent).toContain("No picture for John 1:5 yet");
  });

  it("offers to paint at the quoted price and paints when the balance covers it", async () => {
    session = { tier: "paid", credits: 10 };
    await openVerse("john", "1", "6");
    await settle();

    expect(button(/^Paint this verse/)?.textContent).toBe("Paint this verse · about 2 credits");
    await act(async () => { button(/^Paint this verse/)!.click(); });
    expect(paintRequests).toEqual([expect.objectContaining({ reference: "John 1:6", style: "classical", quoteId: "quote-1" })]);
    expect(paintRequests[0]).not.toHaveProperty("automatic");
    expect(buyCredits).not.toHaveBeenCalled();
  });

  it("asks a reader whose balance cannot cover it to get credits, and opens the credits dialog only when pressed", async () => {
    session = { tier: "paid", credits: 0 };
    await openVerse("john", "1", "6");
    await settle();

    expect(button(/^Paint this verse/)).toBeUndefined();
    expect(buyCredits).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    act(() => { button("Get credits to paint")!.click(); });
    expect(buyCredits).toHaveBeenCalledTimes(1);
    expect(paintRequests).toHaveLength(0);
    expect(quoteRequests).toHaveLength(0);
  });

  it("shows the owner the button without a price", async () => {
    session = { tier: "admin", credits: 0 };
    await openVerse("john", "1", "6");
    await settle();

    expect(button("Paint this verse")).toBeDefined();
    expect(pictureArea()?.textContent).not.toMatch(/credit/i);
    expect(quoteRequests).toHaveLength(0);
    await act(async () => { button("Paint this verse")!.click(); });
    expect(paintRequests).toHaveLength(1);
  });

  it("shows progress while painting, keeps the words readable, and shows the picture when it is saved", async () => {
    session = { tier: "paid", credits: 10 };
    let finish!: (response: Response) => void;
    paintAnswers.push(() => new Promise<Response>((resolve) => { finish = resolve; }));
    await openVerse("john", "1", "6");
    await settle();
    await act(async () => { button(/^Paint this verse/)!.click(); });

    const progress = container.querySelector('[role="progressbar"]');
    expect(progress?.getAttribute("aria-label")).toBe("Painting John 1:6");
    expect(button(/^Paint this verse/)).toBeUndefined();
    expect(container.querySelector("article")?.textContent).toContain("There came a man sent from God");

    await act(async () => { finish(painted("john-1-6:new-picture")); });
    await flush();
    // Saved, but not yet in the verse's pictures: still painting, no button flashing back.
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(button(/^Paint this verse/)).toBeUndefined();

    // The live picture list gains it (the Convex subscription re-renders the reader; here, a render does).
    savedPictures = [{ id: "john-1-6:new-picture", imageUrl: "https://img.test/new.png", artStyle: "classical", createdAt: 9 }];
    await openVerse("john", "1", "6");
    expect(container.querySelector<HTMLImageElement>('img[alt="Picture of John 1:6"]')?.getAttribute("src")).toBe("https://img.test/new.png");
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("shows why painting failed and paints again on retry", async () => {
    session = { tier: "paid", credits: 10 };
    paintAnswers.push(() => json({ error: "Preparing scene", retryable: true, message: "This scene is still being prepared." }, 503));
    await openVerse("john", "1", "6");
    await settle();
    await act(async () => { button(/^Paint this verse/)!.click(); });
    await flush();

    expect(pictureArea()?.querySelector('[role="alert"]')?.textContent).toBe("Preparing scene: This scene is still being prepared.");
    await settle();
    await act(async () => { button("Try again")!.click(); });
    expect(paintRequests).toHaveLength(2);
  });

  it("has an automatic-painting switch, off by default, that the reader turns on", async () => {
    session = { tier: "paid", credits: 10 };
    await openVerse("john", "1", "6");
    await settle();

    expect(autoSwitch()?.getAttribute("aria-checked")).toBe("false");
    expect(autoSwitch()?.textContent).toBe("Paint verses automatically as I read");
    expect(paintRequests).toHaveLength(0);
    act(() => { autoSwitch()!.click(); });
    expect(setAutoGenerate).toHaveBeenCalledWith(true, "spread_paint_switch");
    expect(autoSwitch()?.getAttribute("aria-checked")).toBe("true");
    // It paints from the next page on, not the verse on screen.
    await settle();
    expect(paintRequests).toHaveLength(0);
  });

  it("when on, paints an unpainted verse once, as automatic, only when the balance covers the full estimate", async () => {
    autoGenerate = true;
    session = { tier: "paid", credits: 3 }; // short of the catalog's 5
    await openVerse("john", "1", "6");
    await settle();
    expect(paintRequests).toHaveLength(0);

    act(() => root.unmount());
    root = createRoot(container);
    session = { tier: "paid", credits: 10 };
    paintAnswers.push(() => json({ error: "Image provider failed" }, 500));
    await openVerse("john", "1", "7");
    await settle();
    await openVerse("john", "1", "7");
    await settle();
    expect(paintRequests).toEqual([expect.objectContaining({ reference: "John 1:7", automatic: true })]);
    expect(paintRequests[0]).not.toHaveProperty("quoteId");
  });

  it("paints automatically for the owner only when the switch is on", async () => {
    session = { tier: "admin", credits: 0 };
    await openVerse("john", "1", "6");
    await settle();
    expect(paintRequests).toHaveLength(0);

    act(() => root.unmount());
    root = createRoot(container);
    autoGenerate = true;
    await openVerse("john", "1", "7");
    await settle();
    expect(paintRequests).toEqual([expect.objectContaining({ reference: "John 1:7", automatic: true })]);
  });
});

describe("turning the page", () => {
  it("moves one verse from the dock and the arrow keys, across chapter and book boundaries", async () => {
    await openVerse("genesis", "1", "31");
    expect(links("Next verse").map((link) => link.getAttribute("href"))).toContain("/genesis/2/1");
    expect(links("Previous verse").map((link) => link.getAttribute("href"))).toContain("/genesis/1/30");

    act(() => { links("Next verse")[0].click(); });
    expect(push).toHaveBeenLastCalledWith("/genesis/2/1");
    expect(trackVerseNavigation).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "next", source: "dock", targetUrl: "/genesis/2/1" }));

    act(() => root.unmount());
    root = createRoot(container);
    push.mockClear();
    await openVerse("exodus", "1", "1");
    pressKey("ArrowLeft");
    expect(push).toHaveBeenLastCalledWith("/genesis/50/26");
    expect(trackVerseNavigation).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "prev", source: "keyboard" }));
    pressKey("ArrowRight");
    expect(push).toHaveBeenLastCalledWith("/exodus/1/2");
  });

  it("offers no previous verse on the first page of the Bible", async () => {
    await openVerse("genesis", "1", "1");
    expect(links("Previous verse")).toHaveLength(0);
    pressKey("ArrowLeft");
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores the arrow keys while the reader is typing in a field", async () => {
    await openVerse("genesis", "1", "2");
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    pressKey("ArrowRight", field);
    pressKey("ArrowLeft", field);
    expect(push).not.toHaveBeenCalled();
  });

  it("gives the phone its own previous and next beside the position line", async () => {
    await openVerse("genesis", "1", "2");
    const foot = container.querySelector("article footer");
    expect(foot?.querySelector('a[aria-label="Previous verse"]')?.getAttribute("href")).toBe("/genesis/1/1");
    expect(foot?.querySelector('a[aria-label="Next verse"]')?.getAttribute("href")).toBe("/genesis/1/3");
    expect(foot?.querySelector('[aria-label="Verse 2 of 31"]')?.textContent).toBe("2 / 31");
  });
});

describe("the next spread", () => {
  it("is fetched ahead, picture included, so turning the page is immediate", async () => {
    savedPictures = [
      { id: "john-1-9:a", imageUrl: "https://img.test/9.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-10:old", imageUrl: "https://img.test/10-old.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-10:new", imageUrl: "https://img.test/10-new.png", artStyle: "classical", createdAt: 2 },
    ];
    await openVerse("john", "1", "9");

    expect(prefetch).toHaveBeenCalledWith("/john/1/10");
    const preloads = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')].map((link) => link.href);
    expect(preloads).toContain("https://img.test/10-new.png");
    expect(preloads).not.toContain("https://img.test/10-old.png");
  });
});

describe("swiping on a phone", () => {
  function touch(type: string, target: Element, points: Array<[number, number]>) {
    const list = points.map(([clientX, clientY]) => ({ clientX, clientY, identifier: 0, target }));
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      touches: { value: type === "touchend" || type === "touchcancel" ? [] : list },
      targetTouches: { value: type === "touchend" || type === "touchcancel" ? [] : list },
      changedTouches: { value: list },
    });
    act(() => { target.dispatchEvent(event); });
  }

  function drag(target: Element, from: [number, number], to: [number, number]) {
    touch("touchstart", target, [from]);
    const steps = 4;
    for (let step = 1; step <= steps; step += 1) {
      touch("touchmove", target, [[from[0] + ((to[0] - from[0]) * step) / steps, from[1] + ((to[1] - from[1]) * step) / steps]]);
    }
    touch("touchend", target, [to]);
  }

  it("turns the page with a horizontal swipe anywhere on the spread", async () => {
    await openVerse("john", "1", "5");
    const words = within(container.querySelector("article p:nth-of-type(2)"));

    drag(words, [300, 400], [80, 410]);
    expect(push).toHaveBeenLastCalledWith("/john/1/6");
    expect(trackVerseNavigation).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "next", source: "swipe", targetUrl: "/john/1/6" }));

    drag(within(container.querySelector("main")), [80, 200], [320, 190]);
    expect(push).toHaveBeenLastCalledWith("/john/1/4");
    expect(trackVerseNavigation).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "prev", source: "swipe" }));
  });

  it("leaves a vertical drag to scroll a long verse, even when it drifts sideways", async () => {
    await openVerse("john", "1", "5");
    const words = within(container.querySelector("article p:nth-of-type(2)"));

    drag(words, [200, 600], [190, 200]);
    // Starts upward, then sweeps sideways before lifting: still a scroll.
    touch("touchstart", words, [[200, 600]]);
    touch("touchmove", words, [[198, 560]]);
    touch("touchmove", words, [[60, 540]]);
    touch("touchend", words, [[40, 540]]);
    // Too short to be a turn.
    drag(words, [200, 400], [180, 400]);
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores a two-finger gesture", async () => {
    await openVerse("john", "1", "5");
    const main = within(container.querySelector("main"));
    touch("touchstart", main, [[300, 300], [350, 300]]);
    touch("touchmove", main, [[100, 300], [380, 300]]);
    touch("touchend", main, [[100, 300]]);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("controls fading while reading", () => {
  // A control fades when it has joined the fade and the spread is idle; the CSS limits that to computers.
  const faded = (element: Element | null | undefined) =>
    Boolean(element?.closest("[data-fades]") && element.closest('[data-idle="true"]'));
  const dock = () => container.querySelector('nav[aria-label="Turn the page"]');
  const marks = () => container.querySelector('nav[aria-label="Verses of John 1"]');

  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("fades the dock and the marks after a few idle seconds and brings them back on any activity", async () => {
    await openVerse("john", "1", "5");
    expect(faded(dock())).toBe(false);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(faded(dock())).toBe(false);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(faded(dock())).toBe(true);
    expect(faded(marks())).toBe(true);
    // The words page and the phone's own previous and next never fade.
    expect(faded(container.querySelector("article footer a"))).toBe(false);
    expect(faded(container.querySelector("article h1"))).toBe(false);

    act(() => { window.dispatchEvent(new Event("pointermove")); });
    expect(faded(dock())).toBe(false);

    act(() => { vi.advanceTimersByTime(3500); });
    expect(faded(marks())).toBe(true);
    pressKey("Shift");
    expect(faded(marks())).toBe(false);
  });

  it("never fades while one of the controls has keyboard focus", async () => {
    await openVerse("john", "1", "5");
    const next = within(dock()?.querySelector('a[aria-label="Next verse"]') ?? null) as HTMLElement;
    act(() => { next.focus(); });

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(faded(dock())).toBe(false);
    expect(faded(marks())).toBe(false);

    act(() => { next.blur(); });
    act(() => { vi.advanceTimersByTime(3500); });
    expect(faded(dock())).toBe(true);
  });
});

describe("the verse marks", () => {
  it("shows one mark per verse of the chapter, brighter where painted, marking the current verse", async () => {
    savedPictures = [
      { id: "john-1-1:a", imageUrl: "https://img.test/1.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-3:a", imageUrl: "https://img.test/3.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-4:a", imageUrl: "https://img.test/4w.png", artStyle: "watercolor", createdAt: 1 },
    ];
    await openVerse("john", "1", "3");

    const marks = within(container.querySelector('nav[aria-label="Verses of John 1"]'));
    const all = marks.querySelectorAll("a");
    expect(all).toHaveLength(51);
    expect(all[0].getAttribute("aria-label")).toBe("Verse 1, painted");
    expect(all[1].getAttribute("aria-label")).toBe("Verse 2, unpainted");
    expect(all[3].getAttribute("aria-label")).toBe("Verse 4, unpainted");
    expect(all[50].getAttribute("href")).toBe("/john/1/51");

    const current = marks.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("aria-label")).toBe("Verse 3, painted");
  });

  it("opens a verse from its mark and records the turn as a mark", async () => {
    await openVerse("john", "1", "3");
    const mark = container.querySelector<HTMLAnchorElement>('a[aria-label="Verse 10, unpainted"]');
    act(() => { mark?.click(); });
    expect(push).toHaveBeenLastCalledWith("/john/1/10");
    expect(trackVerseNavigation).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "next", source: "mark", targetUrl: "/john/1/10" }));

    act(() => { container.querySelector<HTMLAnchorElement>('a[aria-label="Verse 1, unpainted"]')?.click(); });
    expect(trackVerseNavigation).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "prev", source: "mark", targetUrl: "/john/1/1" }));
  });
});

describe("what the verse page no longer shows", () => {
  it("has no old header, tabs, verse strip, details, footer, phone bar, chat or dialog, and stays dark", async () => {
    window.matchMedia = vi.fn((query: string) => ({ matches: query.includes("light"), media: query })) as never;
    savedPictures = [{ id: "genesis-1-1:a", imageUrl: "https://img.test/a.png", artStyle: "classical", createdAt: 1 }];
    await openVerse("genesis", "1", "1");

    for (const role of ["banner", "contentinfo", "tablist", "tab", "dialog", "complementary"]) {
      expect(container.querySelector(`[role="${role}"]`), role).toBeNull();
    }
    expect(container.querySelector("header, body > footer, aside")).toBeNull();
    expect(container.textContent).not.toMatch(/Gallery|Video|Details|Chat|Generate|Get credits/i);
    expect(container.querySelectorAll("nav")).toHaveLength(2);
    expect(container.querySelector("main")?.style.colorScheme).toBe("dark");
  });
});
