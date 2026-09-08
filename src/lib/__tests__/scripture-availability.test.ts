import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChapter, getVerse, clearBibleApiCache, TRANSLATIONS, type Translation } from "../bible-api";
import { getNextVerse, getPreviousVerse, parseVerseUrl } from "../navigation";
import { BIBLE_BOOKS } from "@/data/bible-structure";

beforeEach(() => clearBibleApiCache());
afterEach(() => vi.unstubAllGlobals());
describe.each(Object.keys(TRANSLATIONS) as Translation[])("Scripture availability: %s", (translation) => {
  it("keeps missing coverage distinct from retryable failures and recovers", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("Missing", { status: 404 }))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ translation: { identifier: translation, name: TRANSLATIONS[translation].name },
        verses: [{ book_id: "REV", book: "Revelation", chapter: 22, verse: 21, text: "Last verse." }],
      }));
    vi.stubGlobal("fetch", fetch);
    expect(await getVerse("revelation", 22, 21, translation)).toBeNull();
    await expect(getChapter("revelation", 22, translation)).rejects.toMatchObject({ kind: "upstream", retryable: true });
    expect(await getVerse("revelation", 22, 21, translation)).toMatchObject({ text: "Last verse." });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
describe("canonical book edges", () => {
  it("uses one book sequence for every boundary and preserves Bible endpoints", () => {
    for (let i = 0; i < BIBLE_BOOKS.length; i++) {
      const book = BIBLE_BOOKS[i];
      const first = parseVerseUrl(book.slug, "1", "1")!;
      const lastChapter = book.chapters.length;
      const last = parseVerseUrl(book.slug, String(lastChapter), String(book.chapters[lastChapter - 1]))!;
      expect(getPreviousVerse(first)?.book.id ?? null).toBe(BIBLE_BOOKS[i - 1]?.id ?? null);
      expect(getNextVerse(last)?.book.id ?? null).toBe(BIBLE_BOOKS[i + 1]?.id ?? null);
    }
  });
});

describe("chapter provider contract", () => {
  it("reads nested translation metadata and normalizes the canonical book name", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      translation: { identifier: "web", name: "World English Bible", language: "English", license: "Public Domain" },
      verses: [{ book_id: "JHN", book: "John", chapter: 3, verse: 16, text: "  Scripture text.\n" }],
    })));
    expect(await getChapter("john", 3)).toMatchObject({
      translationId: "web", translationName: "World English Bible", bookName: "John",
      verses: [{ bookName: "John", text: "Scripture text." }],
    });
  });

  it.each([
    { translation: { identifier: "kjv", name: "KJV" }, verses: [{ book_id: "GEN", chapter: 1, verse: 1, text: "Wrong translation" }] },
    { translation: { identifier: "web", name: "WEB" }, verses: [{ book_id: "EXO", chapter: 1, verse: 1, text: "Wrong book" }] },
    { translation_id: "web", verses: [{ book_id: "GEN", chapter: 1, verse: 1, text: "Wrong endpoint shape" }] },
  ])("rejects mismatched chapter payloads without caching them", async (payload) => {
    const fetch = vi.fn(async () => Response.json(payload));
    vi.stubGlobal("fetch", fetch);
    await expect(getChapter("genesis", 1)).rejects.toMatchObject({ kind: "upstream" });
    await expect(getChapter("genesis", 1)).rejects.toMatchObject({ kind: "upstream" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
