/* @vitest-environment jsdom */

/**
 * The reader with the Advanced module cut (#449): its mount renders nothing and its items never load. Reading,
 * painting, Ask and Contents all work, at the defaults, even for a visitor who changed every Advanced setting before
 * it was cut. Only the network is faked.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { useQuery } from "convex/react";
import VersePage from "../[book]/[chapter]/[verse]/page";
import { clearBibleApiCache, TRANSLATIONS } from "@/lib/bible-api";
import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import { ADVANCED_STORAGE_KEY, resetAdvancedSettingsForTests } from "@/lib/advanced-settings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
const session = {
  tier: "paid" as "paid" | "admin",
  credits: 100,
  pendingCredits: 0,
  isLoading: false,
  accessStatus: "ready" as const,
  buyCredits: vi.fn(),
  showWelcome: vi.fn(),
};

vi.mock("@/lib/get-translation", () => ({ getTranslationFromCookies: async () => "web" }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/john/1/5",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: { href: string; children: ReactNode; onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void }) => (
    <a href={href} {...props} onClick={(event) => { onClick?.(event); event.preventDefault(); push(href); }}>{children}</a>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: () => vi.fn(async () => ({ success: true })),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
// The old saved settings are not what the reader paints or asks with.
vi.mock("@/context/preferences-context", () => ({
  usePreferences: () => ({
    artStyle: "classical",
    translation: "web",
    translationInfo: TRANSLATIONS.web,
    chatModel: "saved/old-pick",
    imageModel: "saved/old-image-pick",
    imageAspectRatio: "3:2",
    imageResolution: "4K",
    autoGenerate: false,
    setAutoGenerate: vi.fn(),
  }),
}));
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/lib/analytics");
// The module is cut: its one mount renders nothing, and none of its items is loaded.
vi.mock("@/components/spread/advanced", () => ({ Advanced: () => null }));

type SavedPicture = { id: string; imageUrl: string; artStyle: string; createdAt: number; model?: string; imageWidth?: number; imageHeight?: number; aspectRatio?: string; creditsCost?: number };
let savedPictures: SavedPicture[];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let imageQuotes: Array<Record<string, unknown>>;
let paintRequests: Array<Record<string, unknown>>;
let chatQuotes: Array<Record<string, unknown>>;
const CATALOG = [
  { id: DEFAULT_IMAGE_MODEL, name: "Google: Nano Banana 2.1", provider: "Google", availability: "available", creditsCost: 5, estimatedCreditsByResolution: { "1K": 5 }, etaSeconds: 12 },
  { id: "google/gemini-3.1-flash-image", name: "Google: Nano Banana 2", provider: "Google", availability: "available", creditsCost: 9, estimatedCreditsByResolution: { "1K": 9, "2K": 14, "4K": 21 }, etaSeconds: 14 },
  { id: "google/gemini-2.5-flash-image", name: "Google: Nano Banana", provider: "Google", availability: "unavailable", unavailableReason: "Pricing unavailable", creditsCost: null },
];

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

let container: HTMLDivElement;
let root: Root;

const params = (book: string, chapter: string, verse: string) => ({ params: Promise.resolve({ book, chapter, verse }) });
const flush = (ms = 0) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
async function openVerse(book = "john", chapter = "1", verse = "6") {
  const page = await VersePage(params(book, chapter, verse));
  await act(async () => { root.render(page); });
  await flush();
}
/** Let the catalog, the quote's debounce and its answer arrive. */
const settle = () => flush(480);

function button(name: string | RegExp, within: ParentNode = container) {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find((item) => {
    const label = item.getAttribute("aria-label") ?? item.textContent?.trim() ?? "";
    return typeof name === "string" ? label === name : name.test(label);
  });
  if (!found) throw new Error(`No button ${name}`);
  return found;
}
async function click(target: HTMLElement) {
  await act(async () => { target.click(); });
  await flush();
}
const cornerMenu = () => container.querySelector<HTMLElement>('[role="dialog"][aria-label="Visibible menu"]');

beforeEach(() => {
  clearBibleApiCache();
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", memoryStorage());
  // Chosen while Advanced was still there.
  localStorage.setItem(ADVANCED_STORAGE_KEY, JSON.stringify({ aspectRatio: "21:9", resolution: "2K", answeringModel: "openai/gpt-oss-120b", feedbackPrompts: true }));
  resetAdvancedSettingsForTests();
  Object.assign(session, { tier: "paid", credits: 100 });
  savedPictures = [];
  imageQuotes = [];
  paintRequests = [];
  chatQuotes = [];
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "/api/image-models") return json({ models: CATALOG });
    if (url === "/api/generate-image/quote") {
      imageQuotes.push(JSON.parse(String(init?.body)));
      return json({ quote: { quoteId: `image-quote-${imageQuotes.length}`, operation: "image", policyVersion: "accepted-maximum-v1", estimateCredits: 2, maximumCredits: 4, expiresAt: Date.now() + 300_000 } });
    }
    if (url === "/api/generate-image") {
      paintRequests.push(JSON.parse(String(init?.body)));
      return new Promise<Response>(() => {});
    }
    if (url.endsWith("/api/chat/quote")) {
      const body = JSON.parse(String(init?.body));
      chatQuotes.push(body);
      const estimate = body.model === DEFAULT_CHAT_MODEL ? 3 : 7;
      return json({ quote: { quoteId: `chat-quote-${chatQuotes.length}`, estimateCredits: estimate, maximumCredits: estimate * 4, expiresAt: Date.now() + 300_000 } });
    }
    // The Bible service is unreachable, so the reader uses the imported World English Bible.
    throw new DOMException("Timed out", "TimeoutError");
  }));
  vi.mocked(useQuery).mockImplementation(((query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(query);
    if (name === "verseImages:getGenerationRequestStatus") return null;
    if (name === "verseImages:getChapterImageStatus") return [];
    if (name === "verseImages:getNearestEarlierPicture") return null;
    if (name === "verseImages:getChapterContents") {
      const { verseIds } = args as { verseIds: string[] };
      return verseIds.map((verseId) => {
        const picture = savedPictures.find((saved) => saved.id.startsWith(`${verseId}:`));
        return { verseId, picture: picture ? { id: picture.id, imageUrl: picture.imageUrl, thumbnailUrl: null, artStyle: picture.artStyle } : null, pictureCount: picture ? 1 : 0, morePictures: false };
      });
    }
    const { verseId, artStyle } = args as { verseId?: string; artStyle?: string };
    if (!verseId) return [];
    return savedPictures
      .filter((picture) => picture.id.startsWith(`${verseId}:`) && (!artStyle || picture.artStyle === artStyle))
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

describe("the reader without Advanced", () => {
  it("reads: the verse beside its picture, and a corner menu with no Advanced row", async () => {
    savedPictures = [{ id: "john-1-5:painting", imageUrl: "https://img.test/5.png", artStyle: "classical", createdAt: 1 }];
    await openVerse("john", "1", "5");
    expect(container.querySelector('img[alt="Picture of John 1:5"]')?.getAttribute("src")).toBe("https://img.test/5.png");
    expect(container.querySelector("article")?.textContent).toContain("The light shines in the darkness");

    await click(button("Visibible menu"));
    const menu = cornerMenu()!;
    expect(menu.textContent).toContain("Send feedback");
    expect(menu.textContent).not.toContain("Advanced");
  });

  it("paints at the defaults: 16:9, 1K, the default model", async () => {
    await openVerse();
    await settle();
    expect(imageQuotes.at(-1)).toMatchObject({ model: DEFAULT_IMAGE_MODEL, aspectRatio: "16:9", resolution: "1K" });
    await click(button(/^Paint this verse/));
    expect(paintRequests).toEqual([expect.objectContaining({ reference: "John 1:6", model: DEFAULT_IMAGE_MODEL, aspectRatio: "16:9", resolution: "1K" })]);
  });

  it("asks with the default answering model", async () => {
    await openVerse("john", "1", "5");
    await flush();
    expect(chatQuotes.length).toBeGreaterThan(0);
    expect(chatQuotes.every((quote) => quote.model === DEFAULT_CHAT_MODEL)).toBe(true);
    expect(button(/^Send question/, container.querySelector("article")!).getAttribute("aria-label")).toBe("Send question · About 3 credits · at most 12");
  });

  it("opens Contents and moves to a verse from it", async () => {
    await openVerse("john", "1", "5");
    await click(button("John 1:5, Contents"));
    const contents = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Contents"]')!;
    expect(contents).not.toBeNull();
    const tile = contents.querySelector<HTMLAnchorElement>('a[aria-label="Verse 9, not painted yet"]')!;
    await click(tile);
    expect(push).toHaveBeenCalledWith("/john/1/9");
  });

  it("never shows the feedback prompt", async () => {
    for (let verse = 1; verse <= 17; verse++) await openVerse("john", "1", String(verse));
    await flush(2100);
    expect(container.textContent).not.toContain("Have feedback?");
  });
});
