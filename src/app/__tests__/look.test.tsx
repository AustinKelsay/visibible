/* @vitest-environment jsdom */

/**
 * Look (#440) and the picture rule, at the whole-page seam: the verse page rendered with the real stored settings
 * (PreferencesProvider over this device's storage and the translation cookie), the real layers, and a fake of the
 * Convex picture reads that answers as the database does.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import VersePage from "../[book]/[chapter]/[verse]/page";
import { PreferencesProvider } from "@/context/preferences-context";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import { clearBibleApiCache, type Translation } from "@/lib/bible-api";
import { trackLookOpened, trackPreferenceChanged } from "@/lib/analytics";
import { answerPictureRead, type SavedPicture } from "./fake-picture-reads";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();
/** The translation the server reads from the cookie when it renders the page. */
let serverTranslation: Translation = "web";

vi.mock("@/lib/get-translation", () => ({ getTranslationFromCookies: async () => serverTranslation }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh }),
  usePathname: () => "/genesis/1/1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props} onClick={(event) => event.preventDefault()}>{children}</a>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: () => vi.fn(async () => ({ success: true })),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
type TestSession = { tier: "paid" | "admin"; credits: number; pendingCredits: number; isLoading: boolean; accessStatus: "ready"; buyCredits: () => void };
let session: TestSession;
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/lib/analytics");

/** This device's storage. */
const storage = new Map<string, string>();
let savedPictures: SavedPicture[] = [];
let pictureReads: Array<{ name: string; styles?: string[] }> = [];
let paintRequests: Array<Record<string, unknown>> = [];

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const KJV_GENESIS_1 = {
  translation: { identifier: "kjv", name: "King James Version" },
  verses: [{ book_id: "GEN", book: "Genesis", chapter: 1, verse: 1, text: "In the beginning God created the heaven and the earth." }],
};

let container: HTMLDivElement;
let root: Root;

async function openVerse(book = "genesis", chapter = "1", verse = "1") {
  const page = await VersePage({ params: Promise.resolve({ book, chapter, verse }) });
  await act(async () => { root.render(<PreferencesProvider>{page}</PreferencesProvider>); });
  // The stored settings load just after the first render.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Let the catalog, the quote's debounce and its answer arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 480)); });

const look = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Look"]');
const dockAa = () => document.querySelector<HTMLButtonElement>('nav[aria-label="Turn the page"] button[aria-label="Look"]')!;
const phoneAa = () => document.querySelector<HTMLButtonElement>('nav[aria-label="Reader"] button[aria-label="Look"]')!;
const picture = () => container.querySelector<HTMLImageElement>('img[alt^="Picture of"]');
const radio = (name: string) => [...(look()?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])]
  .find((input) => (input.getAttribute("aria-label") ?? input.closest("label")?.textContent?.trim()) === name);
const styleNames = () => [...(look()?.querySelector("fieldset")?.querySelectorAll("input") ?? [])].map((input) => input.getAttribute("aria-label"));
const button = (name: RegExp) => [...container.querySelectorAll("button")].find((candidate) => name.test(candidate.textContent ?? ""));
const stored = () => JSON.parse(storage.get("visibible-reader-settings") ?? "{}");

function click(element: HTMLElement) {
  act(() => { element.click(); });
}

function pressEscape() {
  act(() => { (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
}

beforeEach(() => {
  clearBibleApiCache();
  vi.clearAllMocks();
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  document.cookie = "visibible-translation=; path=/; max-age=0";
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  serverTranslation = "web";
  savedPictures = [];
  pictureReads = [];
  paintRequests = [];
  session = { tier: "paid", credits: 0, pendingCredits: 0, isLoading: false, accessStatus: "ready", buyCredits: vi.fn() };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/image-models") {
      return json({ models: [{ id: DEFAULT_IMAGE_MODEL, creditsCost: 5, reservationCreditsCost: 10, estimatedCreditsByResolution: { "1K": 5 }, etaSeconds: 12 }] });
    }
    if (url === "/api/generate-image/quote") {
      return json({ quote: { quoteId: "quote-1", operation: "image", policyVersion: "accepted-maximum-v1", estimateCredits: 2, maximumCredits: 4, expiresAt: Date.now() + 300_000 } });
    }
    if (url === "/api/generate-image") {
      paintRequests.push(JSON.parse(String(init?.body)));
      return new Promise<Response>(() => {});
    }
    if (url === "https://bible-api.com/data/kjv/GEN/1") return json(KJV_GENESIS_1);
    // Otherwise the Bible service is unreachable, so the reader uses the imported World English Bible.
    throw new DOMException("Timed out", "TimeoutError");
  }));
  vi.mocked(useQuery).mockImplementation(((query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(query);
    pictureReads.push({ name, styles: (args as { styles?: string[] }).styles });
    if (name === "verseImages:getGenerationRequestStatus") return null;
    return answerPictureRead(savedPictures, query, args, null);
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

describe("Look", () => {
  it("opens from \"Aa\" with art style, translation and text size, and Escape returns focus to \"Aa\"", async () => {
    await openVerse();
    expect(look()).toBeNull();

    dockAa().focus();
    click(dockAa());
    expect(look()).not.toBeNull();
    expect(dockAa().getAttribute("aria-expanded")).toBe("true");
    expect(styleNames()).toEqual(["Classical", "Ink & Watercolor", "Fresco", "Storybook"]);
    expect(look()!.querySelector("select")).not.toBeNull();
    expect(radio("Small")).toBeDefined();
    expect(radio("Medium")?.checked).toBe(true);
    expect(radio("Large")).toBeDefined();
    // Focus starts on the chosen style.
    expect(document.activeElement).toBe(radio("Classical"));
    expect(trackLookOpened).toHaveBeenCalledWith(expect.objectContaining({ source: "dock" }));

    pressEscape();
    await act(async () => { await Promise.resolve(); });
    expect(look()).toBeNull();
    expect(document.activeElement).toBe(dockAa());
  });

  it("opens from the phone dock's \"Aa\" and from the translation name on the words page", async () => {
    await openVerse();
    click(phoneAa());
    expect(look()).not.toBeNull();
    pressEscape();
    await act(async () => { await Promise.resolve(); });

    const translationName = container.querySelector<HTMLButtonElement>('button[aria-label="World English Bible, Look"]')!;
    expect(translationName.textContent).toBe("World English Bible");
    translationName.focus();
    click(translationName);
    expect(look()).not.toBeNull();
    expect(trackLookOpened).toHaveBeenLastCalledWith(expect.objectContaining({ source: "translation_name" }));
    pressEscape();
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).toBe(translationName);
  });

  it("changes the picture on the spread to the chosen style's picture, and remembers the choice", async () => {
    savedPictures = [
      { id: "genesis-1-1:classical", imageUrl: "https://img.test/classical.png", artStyle: "classical", createdAt: 2 },
      { id: "genesis-1-1:watercolor", imageUrl: "https://img.test/watercolor.png", thumbnailUrl: "https://img.test/watercolor-small.webp", artStyle: "watercolor", createdAt: 1 },
    ];
    await openVerse();
    expect(picture()?.getAttribute("src")).toBe("https://img.test/classical.png");

    click(dockAa());
    // Each style is shown by a small picture of it.
    const watercolor = radio("Ink & Watercolor")!;
    expect(watercolor.closest("label")?.querySelector("img")?.getAttribute("src")).toBe("https://img.test/watercolor-small.webp");
    click(watercolor);
    expect(picture()?.getAttribute("src")).toBe("https://img.test/watercolor.png");
    expect(container.querySelector('[aria-label="Other art style"]')).toBeNull();
    expect(stored().look.artStyle).toBe("watercolor");
    expect(trackPreferenceChanged).toHaveBeenCalledWith(expect.objectContaining({ preference: "artStyle", value: "watercolor", source: "look" }));
  });

  it("changes the verse text and the name on the words page with the translation, and shows its notice", async () => {
    await openVerse();
    click(dockAa());
    const select = look()!.querySelector("select")!;
    expect(select.value).toBe("web");
    expect(look()!.textContent).toContain("Scripture quotations are from the World English Bible (WEB)");

    act(() => {
      select.value = "kjv";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // The server renders the verse from the cookie, so the choice goes there and the page is fetched again.
    expect(document.cookie).toContain("visibible-translation=kjv");
    expect(refresh).toHaveBeenCalled();
    expect(look()!.textContent).toContain("Scripture quotations are from the King James Version (KJV)");
    expect(storage.get("visibible-reader-settings") ?? "").not.toContain("kjv");

    serverTranslation = "kjv";
    await openVerse();
    const words = container.querySelector("article")!;
    expect(words.textContent).toContain("In the beginning God created the heaven and the earth.");
    expect(words.querySelector('button[aria-label="King James Version, Look"]')).not.toBeNull();
  });

  it("sets the words page's text size in three steps, and remembers it", async () => {
    await openVerse();
    const words = () => container.querySelector("article")!;
    expect(words().getAttribute("data-text-size")).toBe("medium");
    click(dockAa());
    click(radio("Large")!);
    expect(words().getAttribute("data-text-size")).toBe("large");
    click(radio("Small")!);
    expect(words().getAttribute("data-text-size")).toBe("small");
    expect(stored().look.textSize).toBe("small");

    await act(async () => root.unmount());
    root = createRoot(container);
    await openVerse();
    expect(words().getAttribute("data-text-size")).toBe("small");
  });
});

describe("the picture rule", () => {
  it("shows a verse painted only in another style, names that style, and offers to paint it in the chosen style at the paint button's price", async () => {
    session = { ...session, credits: 10 };
    savedPictures = [
      { id: "genesis-1-1:storybook", imageUrl: "https://img.test/storybook.png", artStyle: "storybook", createdAt: 3 },
      { id: "genesis-1-1:fresco", imageUrl: "https://img.test/fresco.png", artStyle: "fresco", createdAt: 1 },
    ];
    await openVerse();
    await settle();

    // Fresco comes before Storybook in the style set, so it wins although it is older.
    expect(picture()?.getAttribute("src")).toBe("https://img.test/fresco.png");
    const note = container.querySelector<HTMLElement>('[aria-label="Other art style"]')!;
    expect(note.textContent).toContain("Shown in Fresco.");
    expect(note.textContent).toContain("No Classical picture of this verse yet.");
    const offer = button(/^Paint in Classical/)!;
    expect(offer.textContent).toBe("Paint in Classical · about 2 credits");

    await act(async () => { offer.click(); });
    expect(paintRequests).toEqual([expect.objectContaining({ reference: "Genesis 1:1", style: "classical", quoteId: "quote-1" })]);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it("asks a reader who cannot cover the price to get credits instead", async () => {
    savedPictures = [{ id: "genesis-1-1:fresco", imageUrl: "https://img.test/fresco.png", artStyle: "fresco", createdAt: 1 }];
    await openVerse();
    await settle();
    expect(button(/^Paint in Classical/)).toBeUndefined();
    click(button(/^Get credits to paint$/)!);
    expect(session.buyCredits).toHaveBeenCalledTimes(1);
  });

  it("never shows or asks for an owner-only style for a public reader, and does for an admin", async () => {
    savedPictures = [{ id: "genesis-1-1:icon", imageUrl: "https://img.test/icon.png", artStyle: "icon", createdAt: 1 }];
    await openVerse();
    click(dockAa());
    expect(picture()).toBeNull();
    expect(container.querySelector('[aria-label="Picture"]')?.textContent).toContain("No picture for Genesis 1:1 yet");
    expect(styleNames()).not.toContain("Byzantine Icon");
    expect(pictureReads.filter((read) => read.styles?.includes("icon"))).toEqual([]);

    await act(async () => root.unmount());
    root = createRoot(container);
    session = { ...session, tier: "admin" };
    await openVerse();
    expect(picture()?.getAttribute("src")).toBe("https://img.test/icon.png");
    expect(container.querySelector('[aria-label="Other art style"]')?.textContent).toContain("Shown in Byzantine Icon.");
    click(dockAa());
    expect(styleNames()).toEqual(["Byzantine Icon", "Classical", "Ink & Watercolor", "Fresco", "Storybook"]);
  });

  it("chooses the spread picture, the verse marks and the next spread's prefetch by the same style order", async () => {
    await openVerse("john", "1", "5");
    const order = ["classical", "watercolor", "fresco", "storybook"];
    const reads = (name: string) => pictureReads.filter((read) => read.name === name).map((read) => read.styles);
    expect(reads("verseImages:getSpreadPicture").length).toBeGreaterThanOrEqual(2);
    expect(new Set(reads("verseImages:getSpreadPicture").map((styles) => JSON.stringify(styles)))).toEqual(new Set([JSON.stringify(order)]));
    expect(new Set(reads("verseImages:getChapterContents").map((styles) => JSON.stringify(styles)))).toEqual(new Set([JSON.stringify(order)]));
  });
});
