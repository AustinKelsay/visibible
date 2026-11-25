/* @vitest-environment jsdom */

import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import VersePage from "../[book]/[chapter]/[verse]/page";
import { TRANSLATIONS, clearBibleApiCache, type Translation } from "@/lib/bible-api";
import { trackVerseNavigation, trackWholePictureOpened } from "@/lib/analytics";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import { resetMapMode } from "@/components/spread/place-map";
import { answerPictureRead, type SavedPicture } from "./fake-picture-reads";

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
  TEXT_SIZES: ["small", "medium", "large"],
  usePreferences: () => ({
    artStyle,
    translation,
    translationInfo: TRANSLATIONS[translation],
    textSize: "medium",
    setArtStyle: vi.fn(),
    setTextSize: vi.fn(),
    setTranslation: vi.fn(),
    autoGenerate: useSyncExternalStore(
      (listener) => { autoGenerateListeners.add(listener); return () => autoGenerateListeners.delete(listener); },
      () => autoGenerate,
      () => autoGenerate,
    ),
    setAutoGenerate,
  }),
}));
type TestSession = { tier: "paid" | "admin"; credits: number; pendingCredits: number; isLoading: boolean; accessStatus: "loading" | "ready" | "unavailable"; buyCredits: () => void };
const buyCredits = vi.fn();
let session: TestSession;
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/lib/analytics");

let savedPictures: SavedPicture[] = [];
let requestStatus: { status: string; error?: string } | null = null;

// The image service: the catalog prices an image at 5 credits, a quote at about 2 (at most 4).
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let quoteRequests: Array<Record<string, unknown>> = [];
let paintRequests: Array<Record<string, unknown>> = [];
let paintAnswers: Array<() => Response | Promise<Response>> = [];
let quoteAnswers: Array<() => Response> = [];
const quoteOf = (quoteId: string, estimateCredits: number, maximumCredits: number) =>
  ({ quoteId, operation: "image", policyVersion: "accepted-maximum-v1", estimateCredits, maximumCredits, expiresAt: Date.now() + 300_000 });
const staleQuote = (reason: string, quote: ReturnType<typeof quoteOf>) => json({ error: "Quote stale", reason, quote }, 409);
const painted = (savedImageId: string) => json({ requestId: "r", imageUrl: "https://img.test/new.png", savedImageId, model: DEFAULT_IMAGE_MODEL });

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
  session = { tier: "paid", credits: 0, pendingCredits: 0, isLoading: false, accessStatus: "ready", buyCredits };
  requestStatus = null;
  autoGenerate = false;
  quoteRequests = [];
  paintRequests = [];
  paintAnswers = [];
  quoteAnswers = [];
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/image-models") {
      // The reader paints with the default model unless Advanced changes it.
      return json({ models: [{ id: DEFAULT_IMAGE_MODEL, creditsCost: 5, reservationCreditsCost: 10, estimatedCreditsByResolution: { "1K": 5 }, etaSeconds: 12 }] });
    }
    if (url === "/api/generate-image/quote") {
      quoteRequests.push(JSON.parse(String(init?.body)));
      return (quoteAnswers.shift() ?? (() => json({ quote: quoteOf(`quote-${quoteRequests.length}`, 2, 4) })))();
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
    return answerPictureRead(savedPictures, query, args);
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

    const picture = container.querySelector<HTMLImageElement>('img[alt^="Picture of"]');
    expect(picture?.getAttribute("src")).toBe("https://img.test/new-watercolor.png");
    expect(picture?.alt).toBe("Picture of Genesis 1:1");

    const words = container.querySelector("article");
    expect(words?.textContent).toContain("Genesis · Chapter 1");
    expect(words?.querySelector("h1")?.textContent).toBe("Genesis 1:1");
    expect(words?.textContent).toContain("In the beginning, God created the heavens and the earth.");
    expect(words?.textContent).toContain("World English Bible");
    expect(words?.textContent).toContain("1 / 31");
  });

  it("shows the picture's thumbnail first and replaces it with the full picture once that has loaded", async () => {
    savedPictures = [
      { id: "genesis-1-1:a", imageUrl: "https://img.test/full.png", thumbnailUrl: "https://img.test/thumb.webp", artStyle: "classical", createdAt: 1 },
    ];
    await openVerse("genesis", "1", "1");
    const sources = () => [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(sources()).toEqual(["https://img.test/thumb.webp", "https://img.test/full.png"]);
    const full = container.querySelector<HTMLImageElement>('img[alt="Picture of Genesis 1:1"]')!;
    expect(full.getAttribute("src")).toBe("https://img.test/full.png");
    // Until it loads, the full picture is invisible over its thumbnail.
    expect(full.style.opacity).toBe("0");

    act(() => { full.dispatchEvent(new Event("load")); });
    expect(sources()).toEqual(["https://img.test/full.png"]);
    expect(full.style.opacity).toBe("");
  });

  it("keeps the verse text in the server-rendered page", async () => {
    const html = renderToStaticMarkup(await VersePage(params("john", "1", "5")));
    expect(html).toContain("The light shines in the darkness");
    expect(html).toContain("5 / 51");
  });

  it("shows the words page over the unpainted verse when no style the reader may see has a picture", async () => {
    // Byzantine Icon is owner-only: a public reader is never shown it.
    savedPictures = [
      { id: "genesis-1-1:icon", imageUrl: "https://img.test/icon.png", artStyle: "icon", createdAt: 1 },
    ];
    await openVerse("genesis", "1", "1");

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("article h1")?.textContent).toBe("Genesis 1:1");
  });
});

describe("the whole-picture view", () => {
  const pictureButton = () => container.querySelector<HTMLButtonElement>("button:has(img)");
  const caption = () => container.querySelector("figcaption");

  beforeEach(() => {
    savedPictures = [
      { id: "john-1-5:a", imageUrl: "https://img.test/5.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-6:a", imageUrl: "https://img.test/6.png", artStyle: "classical", createdAt: 1 },
    ];
  });

  it("shows the picture uncropped with the verse as a caption when the picture is activated", async () => {
    await openVerse("john", "1", "5");
    const button = within(pictureButton()) as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Show the whole picture of John 1:5");
    expect(container.querySelector("img")?.style.objectFit).toBe("cover");
    expect(caption()).toBeNull();

    act(() => { button.click(); });

    expect(container.querySelector("img")?.style.objectFit).toBe("contain");
    expect(caption()?.textContent).toContain("John 1:5");
    expect(caption()?.textContent).toContain("The light shines in the darkness");
    // The words page is put aside: out of reach of the keyboard and screen readers.
    expect(container.querySelector("article")?.hasAttribute("inert")).toBe(true);
    expect(pictureButton()?.getAttribute("aria-label")).toBe("Back to the words");
    expect(trackWholePictureOpened).toHaveBeenCalledWith(expect.objectContaining({ book: "John", chapter: 1, verse: 5 }));
  });

  it("returns to the spread when the picture is activated again, with focus on the picture", async () => {
    await openVerse("john", "1", "5");
    const button = within(pictureButton()) as HTMLButtonElement;
    act(() => { button.focus(); button.click(); });
    act(() => { pictureButton()?.click(); });

    expect(caption()).toBeNull();
    expect(container.querySelector("img")?.style.objectFit).toBe("cover");
    expect(container.querySelector("article")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(pictureButton());
  });

  it("closes on Escape and returns focus to the picture", async () => {
    await openVerse("john", "1", "5");
    act(() => { pictureButton()?.focus(); pictureButton()?.click(); });
    // The reader moves on to the dock before leaving the view.
    act(() => { links("Next verse").at(-1)?.focus(); });

    pressKey("Escape");
    await act(async () => {});

    expect(caption()).toBeNull();
    expect(document.activeElement).toBe(pictureButton());
  });

  it("can be opened from the keyboard", async () => {
    await openVerse("john", "1", "5");
    const button = within(pictureButton()) as HTMLButtonElement;
    expect(button.tagName).toBe("BUTTON");
    expect(button.tabIndex).toBe(0);
    act(() => { button.focus(); });
    expect(document.activeElement).toBe(button);
  });

  it("stays open while the reader turns pages", async () => {
    await openVerse("john", "1", "5");
    act(() => { pictureButton()?.click(); });

    pressKey("ArrowRight");
    expect(push).toHaveBeenLastCalledWith("/john/1/6");
    // The next verse's page opens in the view.
    act(() => root.unmount());
    root = createRoot(container);
    await openVerse("john", "1", "6");
    expect(caption()?.textContent).toContain("John 1:6");
    expect(container.querySelector("img")?.style.objectFit).toBe("contain");

    // Its own previous and next are on hand, phone included.
    const previous = within(caption()?.parentElement?.querySelector('a[aria-label="Previous verse"]') ?? null) as HTMLAnchorElement;
    act(() => { previous.click(); });
    expect(push).toHaveBeenLastCalledWith("/john/1/5");
    act(() => root.unmount());
    root = createRoot(container);
    await openVerse("john", "1", "5");
    expect(caption()?.textContent).toContain("John 1:5");

    // Escape still leaves it, and focus lands on the picture.
    pressKey("Escape");
    await act(async () => {});
    expect(caption()).toBeNull();
    expect(document.activeElement).toBe(pictureButton());
  });

  it("gives the words back when the reader turns to a verse with no picture", async () => {
    await openVerse("john", "1", "6");
    act(() => { pictureButton()?.click(); });
    pressKey("ArrowRight");
    act(() => root.unmount());
    root = createRoot(container);
    await openVerse("john", "1", "7");

    expect(caption()).toBeNull();
    expect(container.querySelector("article")?.hasAttribute("inert")).toBe(false);
  });

  it("opens fresh, with the words, when the reader arrives any other way", async () => {
    await openVerse("john", "1", "5");
    act(() => { pictureButton()?.click(); });
    act(() => root.unmount());
    root = createRoot(container);
    await openVerse("john", "1", "6");
    expect(caption()).toBeNull();
  });

  it("is not offered for an unpainted verse, and the old fullscreen view is gone", async () => {
    await openVerse("john", "1", "7");
    expect(pictureButton()).toBeNull();
    expect(container.textContent).not.toMatch(/fullscreen/i);
    expect(container.querySelector('[aria-label*="ullscreen" i]')).toBeNull();
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

  it("glows with the nearest earlier picture in the chapter, chosen by the spread's rule", async () => {
    savedPictures = [
      { id: "john-1-2:classical", imageUrl: "https://img.test/2.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-3:watercolor", imageUrl: "https://img.test/3w.png", artStyle: "watercolor", createdAt: 1 },
      { id: "john-1-3:classical", imageUrl: "https://img.test/3.png", thumbnailUrl: "https://img.test/3-small.webp", artStyle: "classical", createdAt: 2 },
      { id: "john-1-4:icon", imageUrl: "https://img.test/4.png", artStyle: "icon", createdAt: 3 },
      { id: "john-1-9:classical", imageUrl: "https://img.test/9.png", artStyle: "classical", createdAt: 4 },
    ];
    await openVerse("john", "1", "5");

    expect(container.querySelector('img[alt^="Picture of"]')).toBeNull();
    // Blurred once into a canvas, never by a live CSS blur, which Firefox redraws in visible patches (#531).
    const glow = pictureArea()?.querySelector("canvas");
    expect(glow?.getAttribute("data-glow")).toBe("https://img.test/3-small.webp");
    expect(glow?.getAttribute("aria-hidden")).toBe("true");
    expect(glow?.className).not.toMatch(/blur/);
    expect(pictureArea()?.textContent).toContain("No picture for John 1:5 yet");
  });

  it("is plain dark when no earlier verse of the chapter has a picture", async () => {
    savedPictures = [
      { id: "john-1-9:classical", imageUrl: "https://img.test/9.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-2:icon", imageUrl: "https://img.test/2.png", artStyle: "icon", createdAt: 2 },
    ];
    await openVerse("john", "1", "5");

    expect(container.querySelector("img")).toBeNull();
    expect(pictureArea()?.querySelector("canvas")).toBeNull();
    expect(pictureArea()?.textContent).toContain("No picture for John 1:5 yet");
  });

  it("offers to paint at the quoted price and paints when the balance covers it", async () => {
    session = { ...session, tier: "paid", credits: 10 };
    await openVerse("john", "1", "6");
    await settle();

    expect(button(/^Paint this verse/)?.textContent).toBe("Paint this verse · about 2 credits · at most 4");
    await act(async () => { button(/^Paint this verse/)!.click(); });
    expect(paintRequests).toEqual([expect.objectContaining({ reference: "John 1:6", style: "classical", quoteId: "quote-1" })]);
    expect(paintRequests[0]).not.toHaveProperty("automatic");
    expect(buyCredits).not.toHaveBeenCalled();
  });

  it("asks a reader whose balance cannot cover it to get credits, and opens the credits dialog only when pressed", async () => {
    session = { ...session, tier: "paid", credits: 0 };
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
    session = { ...session, tier: "admin", credits: 0 };
    await openVerse("john", "1", "6");
    await settle();

    expect(button("Paint this verse")).toBeDefined();
    expect(pictureArea()?.textContent).not.toMatch(/credit/i);
    expect(quoteRequests).toHaveLength(0);
    await act(async () => { button("Paint this verse")!.click(); });
    expect(paintRequests).toHaveLength(1);
  });

  it("shows progress while painting, keeps the words readable, and shows the picture when it is saved", async () => {
    session = { ...session, tier: "paid", credits: 10 };
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
    session = { ...session, tier: "paid", credits: 10 };
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

  it("says images are unavailable when the provider cannot paint, and tries again under a new request", async () => {
    session = { ...session, tier: "paid", credits: 10 };
    paintAnswers.push(() => json({ error: "Images are temporarily unavailable", message: "No credits were used. Please try again later.", retryable: false, requestId: "r" }, 503));
    await openVerse("john", "1", "6");
    await settle();
    await act(async () => { button(/^Paint this verse/)!.click(); });
    await flush();

    expect(pictureArea()?.querySelector('[role="alert"]')?.textContent).toBe("Images are temporarily unavailable: No credits were used. Please try again later.");
    await settle();
    await act(async () => { button("Try again")!.click(); });
    expect(paintRequests).toHaveLength(2);
    expect(paintRequests[1].requestId).not.toBe(paintRequests[0].requestId);
  });

  it("waits for the reader to accept a fresh quote at a changed price, then paints with that quote", async () => {
    session = { ...session, tier: "paid", credits: 10 };
    paintAnswers.push(() => staleQuote("changed", quoteOf("fresh-quote", 3, 6)));
    await openVerse("john", "1", "6");
    await settle();
    await act(async () => { button(/^Paint this verse/)!.click(); });
    await flush();

    expect(paintRequests).toHaveLength(1);
    expect(pictureArea()?.querySelector('[role="status"]')?.textContent).toBe("The price changed. About 3 credits · at most 6.");
    expect(pictureArea()?.textContent).not.toContain("Quote stale");
    await act(async () => { button("Paint at this price")!.click(); });
    await flush();
    expect(paintRequests).toHaveLength(2);
    expect(paintRequests[1]).toMatchObject({ quoteId: "fresh-quote" });
  });

  it("accepts a fresh quote for the reader when only the old one expired at the price they accepted", async () => {
    session = { ...session, tier: "paid", credits: 10 };
    paintAnswers.push(() => staleQuote("expired", quoteOf("renewed-quote", 2, 4)));
    await openVerse("john", "1", "6");
    await settle();
    await act(async () => { button(/^Paint this verse/)!.click(); });
    await flush();

    expect(paintRequests.map((request) => request.quoteId)).toEqual(["quote-1", "renewed-quote"]);
    expect(paintRequests[1].requestId).toBe(paintRequests[0].requestId);
    expect(pictureArea()?.querySelector('[role="status"]')).toBeNull();
  });

  it("asks the reader to confirm when no price was on screen at the click", async () => {
    session = { ...session, tier: "paid", credits: 10 };
    quoteAnswers.push(() => json({ error: "Preparing scene", retryable: true }, 503));
    paintAnswers.push(() => staleQuote("missing", quoteOf("first-quote", 2, 4)));
    await openVerse("john", "1", "6");
    await settle();
    await act(async () => { button(/^Paint this verse/)!.click(); });
    await flush();

    expect(paintRequests[0]).not.toHaveProperty("quoteId");
    expect(pictureArea()?.querySelector('[role="status"]')?.textContent).toBe("Please confirm the price. About 2 credits · at most 4.");
    await act(async () => { button("Paint at this price")!.click(); });
    expect(paintRequests[1]).toMatchObject({ quoteId: "first-quote" });
  });

  it("has an automatic-painting switch, off by default, that the reader turns on", async () => {
    session = { ...session, tier: "paid", credits: 10 };
    await openVerse("john", "1", "6");
    await settle();

    expect(autoSwitch()?.getAttribute("aria-checked")).toBe("false");
    expect(autoSwitch()?.textContent).toBe("Paint verses automatically as I read");
    // On a phone narrower than 390px the label is set smaller and closer to the switch, so it stays on one line at 320px.
    expect(autoSwitch()?.className.split(" ")).toEqual(expect.arrayContaining(["max-[389px]:text-[13px]", "max-[389px]:gap-2", "max-[389px]:px-1"]));
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
    session = { ...session, tier: "paid", credits: 3 }; // short of the catalog's 5
    await openVerse("john", "1", "6");
    await settle();
    expect(paintRequests).toHaveLength(0);

    act(() => root.unmount());
    root = createRoot(container);
    session = { ...session, tier: "paid", credits: 10 };
    paintAnswers.push(() => json({ error: "Image provider failed" }, 500));
    await openVerse("john", "1", "7");
    await settle();
    await openVerse("john", "1", "7");
    await settle();
    expect(paintRequests).toEqual([expect.objectContaining({ reference: "John 1:7", automatic: true })]);
    expect(paintRequests[0]).not.toHaveProperty("quoteId");
  });

  it("keeps the switch while a verse it painted automatically is painting, and after it fails, so the reader can turn it off", async () => {
    autoGenerate = true;
    session = { ...session, tier: "paid", credits: 10 };
    let fail!: (response: Response) => void;
    paintAnswers.push(() => new Promise<Response>((resolve) => { fail = resolve; }));
    await openVerse("john", "1", "7");
    await settle();

    expect(paintRequests).toEqual([expect.objectContaining({ reference: "John 1:7", automatic: true })]);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(autoSwitch()?.getAttribute("aria-checked")).toBe("true");

    await act(async () => { fail(json({ error: "Image provider failed" }, 500)); });
    await flush();
    expect(pictureArea()?.querySelector('[role="alert"]')).not.toBeNull();
    act(() => { autoSwitch()!.click(); });
    expect(setAutoGenerate).toHaveBeenCalledWith(false, "spread_paint_switch");
    expect(autoSwitch()?.getAttribute("aria-checked")).toBe("false");
  });

  it("paints automatically for the owner only when the switch is on", async () => {
    session = { ...session, tier: "admin", credits: 0 };
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

  it("waits while the map covers the picture, and paints the verse in view once the map closes", async () => {
    resetMapMode();
    // The map measures itself as it opens.
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    autoGenerate = true;
    session = { ...session, tier: "paid", credits: 10 };
    // Genesis 28:19 (Bethel) is painted; Genesis 31:13, Bethel again, is not.
    savedPictures = [{ id: "genesis-28-19:a", imageUrl: "https://img.test/bethel.png", artStyle: "classical", createdAt: 1 }];
    const mapLink = (name: string) => [...container.querySelectorAll("button")].find((button) => button.textContent === name);
    try {
      await openVerse("genesis", "28", "19");
      await settle();
      await act(async () => mapLink("See where this happened")!.click());
      await openVerse("genesis", "31", "13");
      await settle();
      expect(mapLink("Back to the picture")).toBeDefined();
      expect(paintRequests).toHaveLength(0);

      await act(async () => mapLink("Back to the picture")!.click());
      await settle();
      expect(paintRequests).toEqual([expect.objectContaining({ reference: "Genesis 31:13", automatic: true })]);
    } finally {
      resetMapMode();
    }
  });

  it("does not paint a verse shown in another style while the map covers it", async () => {
    resetMapMode();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    autoGenerate = true;
    session = { ...session, tier: "paid", credits: 10 };
    savedPictures = [
      { id: "genesis-28-19:a", imageUrl: "https://img.test/bethel.png", artStyle: "classical", createdAt: 1 },
      { id: "genesis-31-13:w", imageUrl: "https://img.test/bethel-watercolor.png", artStyle: "watercolor", createdAt: 1 },
    ];
    const mapLink = (name: string) => [...container.querySelectorAll("button")].find((button) => button.textContent === name);
    try {
      await openVerse("genesis", "28", "19");
      await settle();
      await act(async () => mapLink("See where this happened")!.click());
      await openVerse("genesis", "31", "13");
      await settle();
      expect(paintRequests).toHaveLength(0);

      await act(async () => mapLink("Back to the picture")!.click());
      await settle();
      expect(paintRequests).toEqual([expect.objectContaining({ reference: "Genesis 31:13", style: "classical", automatic: true })]);
    } finally {
      resetMapMode();
    }
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

  it("fades them in the whole-picture view too, leaving the caption", async () => {
    savedPictures = [{ id: "john-1-5:a", imageUrl: "https://img.test/5.png", artStyle: "classical", createdAt: 1 }];
    await openVerse("john", "1", "5");
    act(() => { container.querySelector<HTMLButtonElement>("button:has(img)")?.click(); });

    act(() => { vi.advanceTimersByTime(3500); });
    expect(faded(dock())).toBe(true);
    expect(faded(marks())).toBe(true);
    expect(faded(container.querySelector("figcaption"))).toBe(false);
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

  it("fades the corner name and its account chip, each on its own, but not while the name has focus", async () => {
    await openVerse("john", "1", "5");
    const name = container.querySelector<HTMLButtonElement>('button[aria-label="Visibible menu"]')!;
    // The fading parts are inside the button (glass in a fading parent loses its blur), and both fade.
    const parts = [...name.querySelectorAll("[data-fades]")];
    expect(parts).toHaveLength(2);
    expect(parts[0].textContent).toBe("Visibible");
    expect(parts[1].classList.contains("liquid-glass")).toBe(true);
    act(() => { vi.advanceTimersByTime(3500); });
    expect(parts.every(faded)).toBe(true);

    act(() => { name.focus(); });
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(faded(dock())).toBe(false);
    expect(parts.some(faded)).toBe(false);
  });
});

describe("the verse marks", () => {
  it("shows one mark per verse of the chapter, brighter where painted (by the spread's rule), marking the current verse", async () => {
    savedPictures = [
      { id: "john-1-1:a", imageUrl: "https://img.test/1.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-3:a", imageUrl: "https://img.test/3.png", artStyle: "classical", createdAt: 1 },
      { id: "john-1-4:a", imageUrl: "https://img.test/4i.png", artStyle: "icon", createdAt: 1 },
      { id: "john-1-5:a", imageUrl: "https://img.test/5w.png", artStyle: "watercolor", createdAt: 1 },
    ];
    await openVerse("john", "1", "3");

    const marks = within(container.querySelector('nav[aria-label="Verses of John 1"]'));
    const all = marks.querySelectorAll("a");
    expect(all).toHaveLength(51);
    expect(all[0].getAttribute("aria-label")).toBe("Verse 1, painted");
    expect(all[1].getAttribute("aria-label")).toBe("Verse 2, unpainted");
    // Owner-only for a public reader: unpainted. Another public style: painted, as the spread shows it.
    expect(all[3].getAttribute("aria-label")).toBe("Verse 4, unpainted");
    expect(all[4].getAttribute("aria-label")).toBe("Verse 5, painted");
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
    expect([...container.querySelectorAll("nav")].map((nav) => nav.getAttribute("aria-label")).sort()).toEqual(["Reader", "Turn the page", "Verses of Genesis 1"]);
    // Drawn in the reader's appearance, which is dark until the reader chooses light in Advanced.
    expect(container.querySelector("main")?.classList.contains("reader-appearance")).toBe(true);
    expect(document.documentElement.hasAttribute("data-reader-appearance")).toBe(false);
  });
});

describe("the corner menu", () => {
  function cornerName() {
    return container.querySelector<HTMLButtonElement>('button[aria-label="Visibible menu"]')!;
  }

  function openMenu() {
    act(() => { cornerName().focus(); cornerName().click(); });
    return container.querySelector<HTMLElement>('[role="dialog"][aria-label="Visibible menu"]');
  }

  /** The words the account chip gives the name (its description), and the number it shows. */
  function chip() {
    const element = document.getElementById(cornerName().getAttribute("aria-describedby") ?? "");
    // The description is read, not shown: the chip shows only the number.
    if (element) expect(element.hidden).toBe(true);
    const description = element?.textContent ?? null;
    return { description, shown: cornerName().textContent!.replace("Visibible", "").replace(description ?? "", "") };
  }

  it("opens from the Visibible name with the guest account, the balance, credits, feedback and site links", async () => {
    session.credits = 42;
    await openVerse("john", "1", "5");
    expect(cornerName().textContent).toMatch(/^Visibible/);
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    const menu = openMenu();
    expect(menu).not.toBeNull();
    expect(cornerName().getAttribute("aria-expanded")).toBe("true");
    expect(menu!.textContent).toMatch(/^Guest\s*Kept in this browser/);
    expect(menu!.textContent).toContain("42 credits");
    const names = [...menu!.querySelectorAll("a, button")].map((item) => item.getAttribute("aria-label") ?? item.textContent?.trim());
    expect(names).toEqual(expect.arrayContaining([
      "Get credits", "Recover credits", "Send feedback", "About", "API documentation",
      "View source on GitHub", "Follow on X", "Follow on Nostr", "Email",
    ]));
    // The account's actions come first, together: Get credits, then Recover credits, then the rest.
    const actions = names.filter((name) => name !== "Close menu");
    expect(actions.slice(0, 3)).toEqual(["Get credits", "Recover credits", "Send feedback"]);
    const href = (name: string) => [...menu!.querySelectorAll("a")].find((link) => link.textContent?.trim() === name)?.getAttribute("href");
    expect(href("Recover credits")).toBe("/recover");
    expect(href("About")).toBe("/about");
    expect(href("API documentation")).toBe("/api-docs");
  });

  it("shows the available balance beside the name on the spread, without opening anything", async () => {
    session = { ...session, credits: 1240, pendingCredits: 12 };
    await openVerse("john", "1", "5");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(chip()).toEqual({ shown: "1,240", description: "1,240 credits, 12 held" });

    session = { ...session, credits: 0, pendingCredits: 0 };
    await act(async () => { root.render(await VersePage(params("john", "1", "5"))); });
    expect(chip()).toEqual({ shown: "0", description: "0 credits" });
  });

  it("shows no number while the balance loads or cannot be read, and a shield for an admin", async () => {
    session = { ...session, credits: 0, accessStatus: "loading" };
    await openVerse("john", "1", "5");
    expect(chip()).toEqual({ shown: "", description: "Loading balance" });
    // Until the session is read the menu names no guest or admin; the menu stays open through each update.
    const menu = openMenu()!;
    expect(menu.textContent).toMatch(/^Account\s*Loading balance…/);

    session = { ...session, accessStatus: "unavailable" };
    await act(async () => { root.render(await VersePage(params("john", "1", "5"))); });
    expect(chip()).toEqual({ shown: "", description: "Balance unavailable" });
    expect(menu.textContent).toMatch(/^Account\s*Reconnect to see your balance/);

    session = { ...session, accessStatus: "ready", tier: "admin" };
    await act(async () => { root.render(await VersePage(params("john", "1", "5"))); });
    expect(chip()).toEqual({ shown: "", description: "Admin, not charged" });
    expect(menu.textContent).toMatch(/^Admin\s*Admin · not charged/);
    expect(cornerName().querySelector("svg.lucide-shield")).not.toBeNull();
  });

  it("puts the account chip aside in the whole-picture view and keeps the name", async () => {
    session.credits = 42;
    savedPictures = [{ id: "john-1-5:a", imageUrl: "https://img.test/5.png", artStyle: "classical", createdAt: 1 }];
    await openVerse("john", "1", "5");
    expect(chip()).toEqual({ shown: "42", description: "42 credits" });
    act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Show the whole picture of John 1:5"]')!.click(); });
    expect(cornerName().textContent).toBe("Visibible");
    expect(cornerName().hasAttribute("aria-describedby")).toBe(false);
  });

  it("shows the new balance after a purchase without a reload", async () => {
    session.credits = 0;
    await openVerse("john", "1", "5");
    const menu = openMenu();
    expect(menu!.textContent).toContain("0 credits");

    session = { ...session, credits: 300 };
    await act(async () => { root.render(await VersePage(params("john", "1", "5"))); });
    expect(container.querySelector('[role="dialog"]')!.textContent).toContain("300 credits");
  });

  it("opens the credits dialog only when the reader asks for credits", async () => {
    await openVerse("john", "1", "5");
    expect(buyCredits).not.toHaveBeenCalled();
    const menu = openMenu();
    const getCredits = [...menu!.querySelectorAll("button")].find((button) => button.textContent === "Get credits")!;
    act(() => { getCredits.click(); });
    expect(buyCredits).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("shows an admin their admin state, and a visitor no admin entry without the address parameter", async () => {
    await openVerse("john", "1", "5");
    expect(openMenu()!.textContent).not.toMatch(/admin/i);

    act(() => root.unmount());
    root = createRoot(container);
    window.history.replaceState(null, "", "/john/1/5?admin");
    await openVerse("john", "1", "5");
    const items = [...openMenu()!.querySelectorAll("a, button")].map((item) => item.textContent?.trim()).filter(Boolean);
    // After the account's own rows, not between Get credits and Recover credits.
    expect(items.slice(0, 4)).toEqual(["Get credits", "Recover credits", "Admin sign-in", "Send feedback"]);
    const signIn = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent === "Admin sign-in");
    expect(signIn).toBeDefined();
    act(() => { signIn!.click(); });
    expect(buyCredits).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="dialog"][aria-label="Visibible menu"]')).toBeNull();
    window.history.replaceState(null, "", "/");

    act(() => root.unmount());
    root = createRoot(container);
    session.tier = "admin";
    await openVerse("john", "1", "5");
    const menu = openMenu()!;
    expect(menu.textContent).toContain("Admin · not charged");
    expect(menu.textContent).not.toContain("Get credits");
  });

  it("closes on Escape and returns focus to the name", async () => {
    await openVerse("john", "1", "5");
    openMenu();
    expect(container.querySelector('[role="dialog"]')!.contains(document.activeElement)).toBe(true);

    pressKey("Escape", document.activeElement!);
    await act(async () => {});
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(cornerName());
    expect(cornerName().getAttribute("aria-expanded")).toBe("false");
  });

  it("attaches a picture shown from another art style, as the spread shows it", async () => {
    savedPictures = [{ id: "john-1-5:watercolor", imageUrl: "https://img.test/watercolor.png", artStyle: "watercolor", createdAt: 2 }];
    const fetch = vi.fn(async (url: string) => {
      if (url === "/api/feedback") return new Response(JSON.stringify({ success: true }), { status: 200 });
      throw new DOMException("Timed out", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetch);
    await openVerse("john", "1", "5");
    expect(container.querySelector('img[alt="Picture of John 1:5"]')?.getAttribute("src")).toBe("https://img.test/watercolor.png");
    const menu = openMenu()!;
    act(() => { [...menu.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Send feedback")!.click(); });
    const form = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Send feedback"]')!;
    const message = form.querySelector<HTMLTextAreaElement>('textarea[aria-label="Feedback message"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(message, "Wrong well");
      message.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { form.querySelector<HTMLButtonElement>('button[aria-label="Submit feedback"]')!.click(); });
    const [, request] = fetch.mock.calls.find(([url]) => url === "/api/feedback") as unknown as [string, RequestInit];
    expect(JSON.parse(request.body as string)).toMatchObject({ imageContext: { imageId: "john-1-5:watercolor", artStyle: "watercolor" } });
  });

  it("sends feedback with the verse and the picture on screen attached, then returns focus to the name", async () => {
    savedPictures = [{ id: "john-1-5:painting", imageUrl: "https://img.test/painting.png", artStyle: "classical", createdAt: 2 }];
    const fetch = vi.fn(async (url: string) => {
      if (url === "/api/feedback") return new Response(JSON.stringify({ success: true }), { status: 200 });
      throw new DOMException("Timed out", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetch);
    await openVerse("john", "1", "5");
    const menu = openMenu()!;
    act(() => { [...menu.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Send feedback")!.click(); });

    const form = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Send feedback"]')!;
    expect(form).not.toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Visibible menu"]')).toBeNull();
    expect(form.textContent).toContain("John 1:5");
    const message = form.querySelector<HTMLTextAreaElement>('textarea[aria-label="Feedback message"]')!;
    expect(document.activeElement).toBe(message);

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(message, "The sky is the wrong colour");
      message.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { form.querySelector<HTMLButtonElement>('button[aria-label="Submit feedback"]')!.click(); });

    const [, request] = fetch.mock.calls.find(([url]) => url === "/api/feedback") as unknown as [string, RequestInit];
    expect(JSON.parse(request.body as string)).toMatchObject({
      kind: "general",
      message: "The sky is the wrong colour",
      verseContext: { book: "John", chapter: 1, verseRange: "5" },
      imageContext: { imageId: "john-1-5:painting", artStyle: "classical" },
    });
    expect(form.textContent).toContain("Your feedback has been submitted");

    pressKey("Escape", document.activeElement!);
    await act(async () => {});
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(cornerName());
  });
});

describe("accessibility", () => {
  /** The name a screen reader announces for a control, by the parts of the accessible-name rules the reader uses. */
  function accessibleName(element: Element): string {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) return labelledBy.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    const label = element.getAttribute("aria-label") ?? element.getAttribute("title");
    if (label?.trim()) return label.trim();
    if (element.id) {
      const forLabel = document.querySelector(`label[for="${element.id}"]`);
      if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
    }
    const wrapping = element.closest("label");
    if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
    const text = element.textContent?.trim();
    if (text) return text;
    return [...element.querySelectorAll("img[alt]")].map((img) => img.getAttribute("alt")).join(" ").trim();
  }

  function unnamedControls() {
    const controls = container.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="switch"], [role="radio"]');
    return [...controls].filter((control) => !control.closest('[aria-hidden="true"]') && !accessibleName(control)).map((control) => control.outerHTML.slice(0, 120));
  }

  function clickNamed(name: string) {
    const control = within(container.querySelector<HTMLElement>(`button[aria-label^="${name}"]`)) as HTMLElement;
    act(() => { control.focus(); control.click(); });
    return control;
  }

  beforeEach(() => {
    savedPictures = [
      { id: "john-1-5:b", imageUrl: "https://img.test/b.png", thumbnailUrl: "https://img.test/b-small.webp", artStyle: "classical", createdAt: 2 },
      { id: "john-1-5:a", imageUrl: "https://img.test/a.png", thumbnailUrl: null, artStyle: "classical", createdAt: 1 },
    ];
  });

  it("names every control on the spread and in each of its layers", async () => {
    await openVerse("john", "1", "5");
    expect(unnamedControls()).toEqual([]);

    for (const opener of ["Picture menu", "Visibible menu", "Look", "Show the whole picture"]) {
      const control = clickNamed(opener);
      await act(async () => {});
      expect(unnamedControls(), opener).toEqual([]);
      pressKey("Escape", document.activeElement!);
      await act(async () => {});
      expect(document.activeElement, opener).toBe(control);
    }
  });

  it("names every control of an unpainted verse", async () => {
    await openVerse("john", "1", "6");
    await act(async () => {});
    expect(unnamedControls()).toEqual([]);
  });

  it("gives the picture menu and the corner menu a visible close button that returns focus to their opener", async () => {
    await openVerse("john", "1", "5");
    for (const [opener, close] of [["Picture menu", "Close picture menu"], ["Visibible menu", "Close menu"]]) {
      const control = clickNamed(opener);
      const dialog = within(container.querySelector('[role="dialog"]'));
      const closeButton = [...dialog.querySelectorAll("button")].find((button) => accessibleName(button) === close);
      expect(closeButton, close).toBeDefined();
      act(() => closeButton!.click());
      await act(async () => {});
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(control);
    }
  });
});
