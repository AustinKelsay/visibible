import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VersePage, { generateMetadata } from "../[book]/[chapter]/[verse]/page";
import { clearBibleApiCache, type Translation } from "@/lib/bible-api";
import { VersePageContent } from "@/components/verse-page-content";

let translation: Translation = "web";
vi.mock("@/lib/get-translation", () => ({ getTranslationFromCookies: async () => translation }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/layout-wrapper", () => ({ LayoutWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/context/verse-view-context", () => ({ VerseViewProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/header", () => ({ Header: () => <header /> }));
vi.mock("@/components/footer", () => ({ Footer: () => <footer /> }));
vi.mock("@/components/book-menu", () => ({ BookMenu: () => null }));
vi.mock("@/components/chat-context-setter", () => ({ ChatContextSetter: () => null }));
vi.mock("@/components/mobile-verse-nav", () => ({ MobileVerseNav: () => null }));
vi.mock("@/components/verse-analytics", () => ({ VerseAnalytics: () => null }));
vi.mock("@/components/verse-page-content", () => ({ VersePageContent: vi.fn(() => <p>Passage loaded</p>) }));
vi.mock("@/components/translation-selector", () => ({ TranslationSelector: () => <button>Choose translation</button> }));
const params = (book = "genesis", chapter = "1", verse = "1") => ({ params: Promise.resolve({ book, chapter, verse }) });
beforeEach(() => { clearBibleApiCache(); vi.clearAllMocks(); translation = "web"; });
afterEach(() => vi.unstubAllGlobals());
describe("canonical reader failures", () => {
  it("renders a retryable outage at the requested reference and preserves metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("Timed out", "TimeoutError"); }));
    const html = renderToStaticMarkup(await VersePage(params("exodus", "2", "3")));
    expect(html).toContain("Exodus 2:3");
    expect(html).toContain("Scripture is temporarily unavailable");
    expect(html).toContain("Try again");
    expect(html).toContain("Choose translation");
    expect((await generateMetadata(params("exodus", "2", "3"))).title).toBe("Exodus 2:3 - Visibible");
  });
  it("distinguishes missing translation coverage from an outage", async () => {
    translation = "cherokee";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404 })));
    const html = renderToStaticMarkup(await VersePage(params()));
    expect(html).toContain("Genesis 1:1");
    expect(html).toContain("Cherokee New Testament");
    expect(html).toContain("This passage is unavailable in this translation");
    expect(html).not.toContain("temporarily unavailable");
  });
  it("invalid locations return not-found without redirecting or querying Scripture", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const location of [params("bogus"), params("genesis", "1junk"), params("genesis", "1", "999")]) {
      await expect(VersePage(location)).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps cross-book navigation without fetching unrelated prompt context", async () => {
    const fetch = vi.fn(async () => Response.json({
      translation: { identifier: "web", name: "World English Bible" },
      verses: [{ book_id: "EXO", book: "Exodus", chapter: 1, verse: 1, text: "These are the names." }],
    }));
    vi.stubGlobal("fetch", fetch);
    renderToStaticMarkup(await VersePage(params("exodus")));
    expect(vi.mocked(VersePageContent).mock.calls[0][0]).toMatchObject({
      prevUrl: "/genesis/50/26", nextUrl: "/exodus/1/2", prevVerse: undefined,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
