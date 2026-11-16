/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import VersePage from "../[book]/[chapter]/[verse]/page";
import { clearBibleApiCache } from "@/lib/bible-api";
import { trackContentsOpened, trackVerseNavigation } from "@/lib/analytics";

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
vi.mock("@/context/session-context", () => ({ useSession: () => ({ tier: "paid", credits: 0, isLoading: false, buyCredits: vi.fn() }) }));
vi.mock("@/lib/analytics");

type SavedPicture = { id: string; imageUrl: string; thumbnailUrl: string | null; artStyle: string; createdAt: number };
let savedPictures: SavedPicture[] = [];
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
}

beforeEach(() => {
  clearBibleApiCache();
  vi.clearAllMocks();
  artStyle = "classical";
  savedPictures = [];
  contentsReads.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("Timed out", "TimeoutError"); }));
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

    expect(contentsReads.at(-1)).toEqual({ verseIds: Array.from({ length: 51 }, (_, i) => `john-1-${i + 1}`), styles: ["classical"] });
    expect(tile(1).querySelector("img")?.getAttribute("src")).toBe("https://img.test/thumb/john-1-1-a.webp");
    expect(tile(1).getAttribute("aria-label")).toBe("Verse 1");
    expect(tile(2).querySelector("img")?.getAttribute("src")).toBe("https://img.test/thumb/john-1-2-new.webp");
    expect(tile(2).getAttribute("aria-label")).toBe("Verse 2, 3 pictures");
    expect(tile(2).textContent).toContain("3");
    expect(tile(9).getAttribute("aria-label")).toBe("Verse 9, more than 9 pictures");
    expect(tile(9).textContent).toContain("9+");
    // Watercolor only, in Classical: unpainted until Look's fallback lands (#440).
    expect(tile(3).querySelector("img")).toBeNull();
    expect(tile(3).getAttribute("aria-label")).toBe("Verse 3, not painted yet");
    expect(tile(6).getAttribute("aria-label")).toBe("Verse 6, not painted yet");
    // A picture saved before thumbnails existed falls back to the full picture.
    expect(tile(4).querySelector("img")?.getAttribute("src")).toBe("https://img.test/full/john-1-4-nothumb.png");

    const wallSources = [...dialog()!.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(wallSources.filter((src) => src?.includes("/full/"))).toEqual(["https://img.test/full/john-1-4-nothumb.png"]);
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
