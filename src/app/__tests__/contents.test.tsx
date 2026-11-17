/* @vitest-environment jsdom */

import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import VersePage from "../[book]/[chapter]/[verse]/page";
import { clearBibleApiCache } from "@/lib/bible-api";
import { trackContentsOpened, trackCreditsInsufficient, trackVerseNavigation } from "@/lib/analytics";
import type { BulkGenerationState } from "@/context/bulk-generation-context";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
let artStyle = "classical";

vi.mock("@/lib/get-translation", () => ({ getTranslationFromCookies: async () => "web" }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/john/1/5",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, prefetch, ...props }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={href}
      data-prefetch={String(prefetch)}
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
vi.mock("@/context/preferences-context", () => ({
  usePreferences: () => ({ artStyle, translation: "web", autoGenerate: false, setAutoGenerate: vi.fn() }),
}));
const buyCredits = vi.fn();
let session = { sid: "guest", tier: "paid", credits: 0, isLoading: false, buyCredits };
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/lib/analytics");

// The reader's bulk job is faked: nothing is ever painted or charged. Changing it re-renders its readers, as the real
// provider does when the job's Convex rows change.
const idleJob: BulkGenerationState = { status: "idle", bulkId: null, totalVerses: 0, completedCount: 0, failedCount: 0, skippedCount: 0, totalCreditsUsed: 0, currentVerseReference: null, errorMessage: null };
const bulk = {
  state: idleJob,
  listeners: new Set<() => void>(),
  set(next: Partial<BulkGenerationState>) {
    bulk.state = { ...bulk.state, ...next };
    bulk.listeners.forEach((listener) => listener());
  },
  startBulkGeneration: vi.fn(async () => {}),
  pauseBulkGeneration: vi.fn(async () => {}),
  resumeBulkGeneration: vi.fn(async () => {}),
  cancelBulkGeneration: vi.fn(async () => {}),
  dismissBulkGeneration: vi.fn(),
};
/** Each verse's status in the faked job, as the wall's job read returns it. */
let jobVerses: Array<{ verseId: string; status: string }> = [];
vi.mock("@/context/bulk-generation-context", () => ({
  useBulkGeneration: () => {
    const state = useSyncExternalStore(
      (listener) => { bulk.listeners.add(listener); return () => bulk.listeners.delete(listener); },
      () => bulk.state,
    );
    return { ...bulk, state };
  },
}));

type SavedPicture = { id: string; imageUrl: string; thumbnailUrl: string | null; artStyle: string; createdAt: number };
let savedPictures: SavedPicture[] = [];
/** Verses whose tile picture has a finished video (the server's `hasVideo`). */
let videoVerses = new Set<string>();
const contentsReads: Array<{ verseIds: string[]; styles: string[] }> = [];

const picture = (verseId: string, name: string, createdAt: number, style = "classical", thumbnail = true): SavedPicture => ({
  id: `${verseId}:${name}`,
  imageUrl: `https://img.test/full/${verseId}-${name}.png`,
  thumbnailUrl: thumbnail ? `https://img.test/thumb/${verseId}-${name}.webp` : null,
  artStyle: style,
  createdAt,
});

/** A fake of the reads the reader makes: a verse's history and a chapter's Contents tiles (an unpainted verse's glow finds nothing). */
function fakeQuery(query: FunctionReference<"query">, args: unknown) {
  if (args === "skip") return undefined;
  if (getFunctionName(query) === "verseImages:getNearestEarlierPicture") return null;
  if (getFunctionName(query) === "bulkGenerations:getVerseStatuses") {
    const read = args as { verseIds: string[]; bulkGenerationId: string };
    return read.bulkGenerationId === bulk.state.bulkId ? jobVerses.filter((v) => read.verseIds.includes(v.verseId)) : [];
  }
  if (typeof args === "object" && args && "verseIds" in args) {
    const read = args as { verseIds: string[]; styles: string[] };
    contentsReads.push(read);
    return read.verseIds.map((verseId) => {
      const mine = savedPictures.filter((p) => p.id.startsWith(`${verseId}:`)).sort((a, b) => b.createdAt - a.createdAt);
      const style = read.styles.find((s) => mine.some((p) => p.artStyle === s));
      const shown = mine.find((p) => p.artStyle === style);
      return {
        verseId,
        picture: shown ? { id: shown.id, imageUrl: shown.imageUrl, thumbnailUrl: shown.thumbnailUrl, artStyle: shown.artStyle } : null,
        pictureCount: Math.min(mine.length, 9),
        morePictures: mine.length > 9,
        hasVideo: videoVerses.has(verseId),
      };
    });
  }
  const { verseId, artStyle: style } = args as { verseId: string; artStyle: string };
  return savedPictures
    .filter((p) => p.id.startsWith(`${verseId}:`) && p.artStyle === style)
    .sort((a, b) => b.createdAt - a.createdAt);
}

let container: HTMLDivElement;
let root: Root;

async function openVerse(book: string, chapter: string, verse: string, searchParams?: Record<string, string>) {
  const page = await VersePage({ params: Promise.resolve({ book, chapter, verse }), ...(searchParams ? { searchParams: Promise.resolve(searchParams) } : {}) } as never);
  await act(async () => { root.render(page); });
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Contents"]');
const passageName = () => document.querySelector<HTMLButtonElement>('nav[aria-label="Turn the page"] button[aria-haspopup="dialog"]')!;
const tiles = () => [...(dialog()?.querySelectorAll<HTMLAnchorElement>('a[href^="/"]') ?? [])];
const tile = (verse: number) => tiles().find((link) => link.getAttribute("aria-label")?.startsWith(`Verse ${verse}`))!;
const button = (name: string) => [...(dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name)!;

function click(element: HTMLElement) {
  act(() => { element.click(); });
}

function type(field: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function openContents() {
  await act(async () => { passageName().click(); });
  await act(async () => { await Promise.resolve(); });
  // The image catalog's price arrives.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

beforeEach(() => {
  clearBibleApiCache();
  vi.clearAllMocks();
  artStyle = "classical";
  savedPictures = [];
  videoVerses = new Set();
  contentsReads.length = 0;
  session = { sid: "guest", tier: "paid", credits: 0, isLoading: false, buyCredits };
  bulk.state = idleJob;
  jobVerses = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    // The image catalog prices a picture at about 5 credits; the Bible service is unreachable.
    if (url === "/api/image-models") {
      return new Response(JSON.stringify({ models: [{ id: DEFAULT_IMAGE_MODEL, creditsCost: 5, reservationCreditsCost: 10, estimatedCreditsByResolution: { "1K": 5 }, etaSeconds: 12 }] }), { headers: { "Content-Type": "application/json" } });
    }
    throw new DOMException("Timed out", "TimeoutError");
  }));
  vi.mocked(useQuery).mockImplementation(fakeQuery as typeof useQuery);
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

describe("Contents", () => {
  it("opens from the passage name as the current chapter's wall, one numbered tile per verse, the current one marked", async () => {
    await openVerse("john", "1", "5");
    expect(dialog()).toBeNull();
    expect(passageName().textContent).toContain("John 1:5");

    await openContents();
    expect(dialog()).not.toBeNull();
    expect(passageName().getAttribute("aria-expanded")).toBe("true");
    expect(tiles()).toHaveLength(51);
    expect(tiles().map((link) => link.getAttribute("href")).slice(0, 3)).toEqual(["/john/1/1", "/john/1/2", "/john/1/3"]);
    expect(tile(51).textContent).toContain("51");
    expect(tiles().filter((link) => link.getAttribute("aria-current") === "page")).toEqual([tile(5)]);
    expect(trackContentsOpened).toHaveBeenCalledWith(expect.objectContaining({ book: "John", chapter: 1, verse: 5 }));
  });

  it("shows painted verses from thumbnails, a count for several pictures, and unpainted tiles, without any full-size picture", async () => {
    savedPictures = [
      picture("john-1-1", "a", 1),
      picture("john-1-2", "old", 1), picture("john-1-2", "mid", 2), picture("john-1-2", "new", 3),
      picture("john-1-3", "water", 1, "watercolor"),
      picture("john-1-4", "nothumb", 1, "classical", false),
      ...Array.from({ length: 12 }, (_, i) => picture("john-1-9", `n${i}`, i)),
    ];
    await openVerse("john", "1", "5");
    await openContents();

    // Tiles follow the spread's picture rule: the chosen style, then the other public styles in the style set's order.
    expect(contentsReads.at(-1)).toEqual({ verseIds: Array.from({ length: 51 }, (_, i) => `john-1-${i + 1}`), styles: ["classical", "watercolor", "fresco", "storybook"] });
    expect(tile(1).querySelector("img")?.getAttribute("src")).toBe("https://img.test/thumb/john-1-1-a.webp");
    expect(tile(1).getAttribute("aria-label")).toBe("Verse 1");
    expect(tile(2).querySelector("img")?.getAttribute("src")).toBe("https://img.test/thumb/john-1-2-new.webp");
    expect(tile(2).getAttribute("aria-label")).toBe("Verse 2, 3 pictures");
    expect(tile(2).textContent).toContain("3");
    expect(tile(9).getAttribute("aria-label")).toBe("Verse 9, more than 9 pictures");
    expect(tile(9).textContent).toContain("9+");
    // Watercolor only, in Classical: the tile shows the Watercolor picture, as the spread does.
    expect(tile(3).querySelector("img")?.getAttribute("src")).toBe("https://img.test/thumb/john-1-3-water.webp");
    expect(tile(3).getAttribute("aria-label")).toBe("Verse 3, Ink & Watercolor picture");
    expect(tile(6).getAttribute("aria-label")).toBe("Verse 6, not painted yet");
    // A picture saved before thumbnails existed falls back to the full picture.
    expect(tile(4).querySelector("img")?.getAttribute("src")).toBe("https://img.test/full/john-1-4-nothumb.png");

    const wallSources = [...dialog()!.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(wallSources.filter((src) => src?.includes("/full/"))).toEqual(["https://img.test/full/john-1-4-nothumb.png"]);
  });

  it("puts a play mark on a tile whose picture has a video, and none on the others or on an unpainted tile", async () => {
    savedPictures = [picture("john-1-1", "a", 1), picture("john-1-2", "old", 1), picture("john-1-2", "new", 2), picture("john-1-3", "b", 1)];
    videoVerses = new Set(["john-1-1", "john-1-2", "john-1-6"]);
    await openVerse("john", "1", "5");
    await openContents();

    expect(tile(1).getAttribute("aria-label")).toBe("Verse 1, has a video");
    expect(tile(2).getAttribute("aria-label")).toBe("Verse 2, 2 pictures, has a video");
    expect(tile(6).getAttribute("aria-label")).toBe("Verse 6, not painted yet");
    expect(tile(3).getAttribute("aria-label")).toBe("Verse 3");
    const playMarks = tiles().filter((link) => link.querySelector('[data-play-mark]'));
    expect(playMarks).toEqual([tile(1), tile(2)]);
  });

  it("opens the chosen verse and closes", async () => {
    await openVerse("john", "1", "5");
    await openContents();
    click(tile(7));
    expect(push).toHaveBeenLastCalledWith("/john/1/7");
    expect(dialog()).toBeNull();
    expect(trackVerseNavigation).toHaveBeenLastCalledWith(expect.objectContaining({ source: "contents", direction: "jump", targetUrl: "/john/1/7", book: "John", chapter: 1, verse: 5 }));
  });

  it("filters the book list as the reader types, then shows the chosen book and chapter without leaving Contents", async () => {
    await openVerse("john", "1", "5");
    await openContents();

    const bookButton = button("John, choose a book");
    expect(bookButton.getAttribute("aria-expanded")).toBe("false");
    click(bookButton);
    const field = dialog()!.querySelector<HTMLInputElement>('input[aria-label="Find a book"]')!;
    expect(document.activeElement).toBe(field);
    const books = () => [...dialog()!.querySelectorAll<HTMLButtonElement>('[aria-label="Books"] button')].map((b) => b.textContent?.trim());
    expect(books()).toHaveLength(66);
    type(field, "co");
    expect(books()).toEqual(["1 Corinthians", "2 Corinthians", "Colossians"]);
    type(field, "GEN");
    expect(books()).toEqual(["Genesis"]);

    click(dialog()!.querySelector<HTMLButtonElement>('[aria-label="Books"] button')!);
    expect(dialog()!.querySelector('input[aria-label="Find a book"]')).toBeNull();
    expect(button("Genesis, choose a book")).toBeTruthy();
    const chapters = dialog()!.querySelectorAll<HTMLButtonElement>('[aria-label="Chapter"] button');
    expect(chapters).toHaveLength(50);
    // A chosen book opens at its first chapter.
    expect(tiles()).toHaveLength(31);
    expect(tile(1).getAttribute("href")).toBe("/genesis/1/1");
    expect(tiles().some((link) => link.hasAttribute("aria-current"))).toBe(false);

    click(button("Chapter 3"));
    expect(button("Chapter 3").getAttribute("aria-pressed")).toBe("true");
    expect(tiles()).toHaveLength(24);
    expect(tile(24).getAttribute("href")).toBe("/genesis/3/24");
    expect(contentsReads.at(-1)?.verseIds[0]).toBe("genesis-3-1");
    expect(dialog()).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("closes on Escape and from its close button, returning focus to the passage name", async () => {
    await openVerse("john", "1", "5");
    await openContents();
    expect(dialog()!.contains(document.activeElement)).toBe(true);

    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(passageName());
    expect(passageName().getAttribute("aria-expanded")).toBe("false");

    await openContents();
    await act(async () => { button("Close contents").click(); await Promise.resolve(); });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(passageName());
  });

  it("keeps the arrow keys from turning the page while it is open", async () => {
    await openVerse("john", "1", "5");
    await openContents();
    act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); });
    expect(push).not.toHaveBeenCalled();
  });

  it("opens from the phone dock's Contents button too", async () => {
    await openVerse("john", "1", "5");
    const phoneButton = document.querySelector<HTMLButtonElement>('nav[aria-label="Reader"] button[aria-label="Contents"]')!;
    await act(async () => { phoneButton.click(); });
    expect(dialog()).not.toBeNull();
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(phoneButton);
  });

  it("ignores the retired ?view=gallery and opens the plain verse", async () => {
    await openVerse("john", "1", "5", { view: "gallery" });
    expect(dialog()).toBeNull();
    expect(document.querySelector("article h1")?.textContent).toBe("John 1:5");
    expect(document.body.textContent).not.toMatch(/Gallery/);
  });
});

/** John 1 painted in Classical except the given verses. */
function paintJohnOneExcept(...unpainted: number[]) {
  savedPictures = Array.from({ length: 51 }, (_, i) => i + 1)
    .filter((verse) => !unpainted.includes(verse))
    .map((verse) => picture(`john-1-${verse}`, "a", verse));
}

const paintButton = () => [...(dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) => /^Paint (the )?\d+ /.test(b.textContent?.trim() ?? ""));
const painting = () => dialog()!.querySelector<HTMLElement>('[role="group"][aria-label="Painting the chapter"]');

describe("Painting the chapter from Contents", () => {
  it("offers to paint the verses with no picture in the chosen style, priced by the bulk estimate", async () => {
    session = { ...session, credits: 500 };
    paintJohnOneExcept(3, 7, 51);
    // A Watercolor picture does not paint verse 7 in Classical.
    savedPictures.push(picture("john-1-7", "water", 99, "watercolor"));
    await openVerse("john", "1", "5");
    await openContents();

    // Verse 7 has a picture, in another style, so the button names the style rather than calling it unpainted.
    expect(paintButton()?.textContent).toBe("Paint 3 verses in Classical · about 15 credits");
    expect(paintButton()?.disabled).toBe(false);
  });

  it("names the chosen style when every verse shows another style's picture", async () => {
    session = { ...session, credits: 500 };
    savedPictures = Array.from({ length: 51 }, (_, i) => picture(`john-1-${i + 1}`, "w", i + 1, "watercolor"));
    await openVerse("john", "1", "5");
    await openContents();
    expect(paintButton()?.textContent).toBe("Paint 51 verses in Classical · about 255 credits");
    expect(tiles()[0].getAttribute("aria-label")).toBe("Verse 1, Ink & Watercolor picture");
    await act(async () => { paintButton()!.click(); });
    expect(bulk.startBulkGeneration).toHaveBeenCalledWith(expect.objectContaining({ scopeLabel: "John 1 in Classical", artStyleId: "classical" }));
  });

  it("calls verses unpainted when no style has a picture of them", async () => {
    session = { ...session, credits: 500 };
    paintJohnOneExcept(3, 51);
    await openVerse("john", "1", "5");
    await openContents();
    expect(paintButton()?.textContent).toBe("Paint the 2 unpainted verses · about 10 credits");
  });

  it("names a single verse in the singular", async () => {
    session = { ...session, credits: 500 };
    paintJohnOneExcept(51);
    await openVerse("john", "1", "5");
    await openContents();
    expect(paintButton()?.textContent).toBe("Paint the 1 unpainted verse · about 5 credits");
  });

  it("offers nothing for a fully painted chapter", async () => {
    session = { ...session, credits: 500 };
    paintJohnOneExcept();
    await openVerse("john", "1", "5");
    await openContents();
    expect(tiles()).toHaveLength(51);
    expect(paintButton()).toBeUndefined();
    expect(painting()).toBeNull();
  });

  it("counts the chapter on show, after the reader picks another", async () => {
    session = { ...session, credits: 500 };
    paintJohnOneExcept();
    await openVerse("john", "1", "5");
    await openContents();
    click(button("Chapter 2"));
    // Nothing in John 2 is painted: 25 verses at about 5 credits.
    expect(paintButton()?.textContent).toBe("Paint the 25 unpainted verses · about 125 credits");
  });

  it("starts the existing bulk job for exactly those verses, in the chosen style and settings", async () => {
    session = { ...session, credits: 500 };
    paintJohnOneExcept(3, 7, 51);
    await openVerse("john", "1", "5");
    await openContents();
    await act(async () => { paintButton()!.click(); });

    expect(bulk.startBulkGeneration).toHaveBeenCalledTimes(1);
    expect(bulk.startBulkGeneration).toHaveBeenCalledWith(expect.objectContaining({
      queue: [
        expect.objectContaining({ verseId: "john-1-3", reference: "John 1:3", order: 0 }),
        expect.objectContaining({ verseId: "john-1-7", reference: "John 1:7", order: 1 }),
        expect.objectContaining({ verseId: "john-1-51", reference: "John 1:51", order: 2 }),
      ],
      estimatedTotalCredits: 15,
      translation: "web",
      artStyleId: "classical",
    }));
    // The model, ratio and resolution are left to the bulk provider, which uses the reader's Advanced image settings.
    expect(bulk.startBulkGeneration.mock.calls[0]).toEqual([expect.not.objectContaining({ modelId: expect.anything() })]);
    expect(buyCredits).not.toHaveBeenCalled();
  });

  it("opens the credits dialog and starts nothing when the balance cannot cover it", async () => {
    session = { ...session, credits: 4 };
    paintJohnOneExcept(3, 7, 51);
    await openVerse("john", "1", "5");
    await openContents();

    expect(paintButton()?.textContent).toBe("Paint the 3 unpainted verses · about 15 credits");
    await act(async () => { paintButton()!.click(); });
    expect(buyCredits).toHaveBeenCalledTimes(1);
    expect(bulk.startBulkGeneration).not.toHaveBeenCalled();
    expect(trackCreditsInsufficient).toHaveBeenCalledWith(expect.objectContaining({ feature: "image", source: "contents_paint", requiredCredits: 15 }));
  });

  it("shows the owner no price, and starts the job", async () => {
    session = { ...session, tier: "admin", credits: 0 };
    paintJohnOneExcept(3, 7, 51);
    await openVerse("john", "1", "5");
    await openContents();
    expect(paintButton()?.textContent).toBe("Paint the 3 unpainted verses");
    await act(async () => { paintButton()!.click(); });
    expect(bulk.startBulkGeneration).toHaveBeenCalledTimes(1);
    expect(buyCredits).not.toHaveBeenCalled();
  });

  it("shows each verse's progress on its tile, and a finished picture without a reload", async () => {
    session = { ...session, credits: 500 };
    paintJohnOneExcept(3, 7, 9, 51);
    bulk.state = { ...idleJob, status: "active", bulkId: "job-1" as never, totalVerses: 4, completedCount: 1, failedCount: 1, currentVerseReference: "John 1:7" };
    jobVerses = [
      { verseId: "john-1-3", status: "failed" },
      { verseId: "john-1-7", status: "generating" },
      { verseId: "john-1-9", status: "completed" },
      { verseId: "john-1-51", status: "queued" },
    ];
    // Verse 9's picture is already saved.
    savedPictures.push(picture("john-1-9", "bulk", 100));
    await openVerse("john", "1", "5");
    await openContents();

    expect(tile(3).getAttribute("aria-label")).toBe("Verse 3, painting failed");
    expect(tile(7).getAttribute("aria-label")).toBe("Verse 7, painting");
    expect(tile(9).getAttribute("aria-label")).toBe("Verse 9, just painted");
    expect(tile(9).querySelector("img")?.getAttribute("src")).toBe("https://img.test/thumb/john-1-9-bulk.webp");
    expect(tile(51).getAttribute("aria-label")).toBe("Verse 51, queued");
    expect(tile(1).getAttribute("aria-label")).toBe("Verse 1");
    // While a job runs, the wall shows it instead of offering another.
    expect(paintButton()).toBeUndefined();
    expect(painting()?.textContent).toContain("2 of 4");

    // Verse 7 finishes: its picture is saved and the job moves on.
    savedPictures.push(picture("john-1-7", "bulk", 101));
    jobVerses = jobVerses.map((v) => (v.verseId === "john-1-7" ? { ...v, status: "completed" } : v.verseId === "john-1-51" ? { ...v, status: "generating" } : v));
    act(() => bulk.set({ completedCount: 2, currentVerseReference: "John 1:51" }));

    expect(tile(7).getAttribute("aria-label")).toBe("Verse 7, just painted");
    expect(tile(7).querySelector("img")?.getAttribute("src")).toBe("https://img.test/thumb/john-1-7-bulk.webp");
    expect(tile(51).getAttribute("aria-label")).toBe("Verse 51, painting");
    expect(painting()?.textContent).toContain("3 of 4");
  });

  it("keeps the job's controls on the wall: pause, resume and stop", async () => {
    session = { ...session, credits: 500 };
    paintJohnOneExcept(3, 7);
    bulk.state = { ...idleJob, status: "active", bulkId: "job-1" as never, totalVerses: 2, currentVerseReference: "John 1:3" };
    await openVerse("john", "1", "5");
    await openContents();

    await act(async () => { button("Pause").click(); });
    expect(bulk.pauseBulkGeneration).toHaveBeenCalledTimes(1);
    await act(async () => { button("Stop").click(); });
    expect(bulk.cancelBulkGeneration).toHaveBeenCalledTimes(1);

    act(() => bulk.set({ status: "paused" }));
    expect(button("Pause")).toBeUndefined();
    await act(async () => { button("Resume").click(); });
    expect(bulk.resumeBulkGeneration).toHaveBeenCalledTimes(1);
    expect(button("Stop")).toBeTruthy();
  });

  it("reports a finished job until the reader dismisses it, then offers what is still unpainted", async () => {
    session = { ...session, credits: 500 };
    paintJohnOneExcept(3);
    bulk.state = { ...idleJob, status: "completed", bulkId: "job-1" as never, totalVerses: 2, completedCount: 1, failedCount: 1, totalCreditsUsed: 5 };
    await openVerse("john", "1", "5");
    await openContents();

    expect(painting()?.textContent).toContain("1 of 2 painted");
    expect(painting()?.textContent).toContain("1 failed");
    expect(paintButton()).toBeUndefined();
    await act(async () => { button("Done").click(); });
    expect(bulk.dismissBulkGeneration).toHaveBeenCalledTimes(1);
    act(() => bulk.set(idleJob));
    expect(paintButton()?.textContent).toBe("Paint the 1 unpainted verse · about 5 credits");
  });

  it("stops calling verses queued once the job is stopped", async () => {
    session = { ...session, credits: 500 };
    paintJohnOneExcept(3, 7);
    bulk.state = { ...idleJob, status: "cancelled", bulkId: "job-1" as never, totalVerses: 2, failedCount: 1 };
    jobVerses = [{ verseId: "john-1-3", status: "failed" }, { verseId: "john-1-7", status: "queued" }];
    await openVerse("john", "1", "5");
    await openContents();

    expect(painting()?.textContent).toContain("Stopped · 0 of 2 painted");
    expect(tile(3).getAttribute("aria-label")).toBe("Verse 3, painting failed");
    expect(tile(7).getAttribute("aria-label")).toBe("Verse 7, not painted yet");
  });
});
