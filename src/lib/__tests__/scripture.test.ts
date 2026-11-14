import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import { BIBLE_BOOKS, BOOK_BY_SLUG } from "@/data/bible-structure";
import { clearBibleApiCache } from "../bible-api";
import { resolveGenerationPassage } from "../generation-passage";
import { SLOW_AFTER_MS, clearImportedScripture, getChapter, getImportedChapter, getVerse } from "../scripture";

/** The service's answer for a chapter: every verse the app counts, unless `verses` says otherwise. */
function serviceChapter(slug: string, chapter: number, options: { translation?: string; verses?: [number, string][] } = {}) {
  const book = BOOK_BY_SLUG[slug];
  const verses = options.verses
    ?? Array.from({ length: book.chapters[chapter - 1] }, (_, index): [number, string] => [index + 1, `Service verse ${index + 1}.`]);
  return Response.json({
    translation: { identifier: options.translation ?? "web", name: "From the service" },
    verses: verses.map(([verse, text]) => ({ book_id: book.id, book: book.name, chapter, verse, text })),
  });
}

beforeEach(() => {
  clearBibleApiCache();
  clearImportedScripture();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("imported World English Bible", () => {
  it("holds every verse the app's navigation counts, with text", async () => {
    let verses = 0;
    for (const book of BIBLE_BOOKS) {
      for (let chapter = 1; chapter <= book.chapters.length; chapter++) {
        const imported = await getImportedChapter(book.slug, chapter);
        expect(imported?.verses.map((verse) => verse.verse), `${book.name} ${chapter}`)
          .toEqual(Array.from({ length: book.chapters[chapter - 1] }, (_, index) => index + 1));
        verses += imported!.verses.length;
      }
    }
    expect(verses).toBe(31_102);
    expect(await getImportedChapter("genesis", 51)).toBeNull();
    expect(await getImportedChapter("not-a-book", 1)).toBeNull();
  });
});

describe("default translation", () => {
  it("uses the service's chapter when it arrives in time and matches the app's verse list", async () => {
    const fetch = vi.fn(async () => serviceChapter("3-john", 1));
    vi.stubGlobal("fetch", fetch);
    const chapter = await getChapter("3-john", 1);
    expect(chapter).toMatchObject({ translationName: "From the service", verses: expect.arrayContaining([expect.objectContaining({ verse: 14, text: "Service verse 14." })]) });
    expect(await getVerse("3-john", 1, 2)).toMatchObject({ text: "Service verse 2." });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("serves the imported chapter when the service leaves a verse blank", async () => {
    // What the service returns for Acts 24 today: verse 7 is empty, which the client rejects for the whole chapter.
    const verses = Array.from({ length: 27 }, (_, index): [number, string] => [index + 1, index === 6 ? "" : "Service text."]);
    vi.stubGlobal("fetch", vi.fn(async () => serviceChapter("acts", 24, { verses })));
    const chapter = await getChapter("acts", 24);
    expect(chapter?.verses).toHaveLength(27);
    expect(chapter?.verses[6].text).toMatch(/Lysias/);
    expect(chapter).toMatchObject({ translationId: "web", translationName: "World English Bible", bookName: "Acts" });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("failed for ACT 24"));
  });

  it("serves the imported chapter when the service numbers the verses differently", async () => {
    // The service prints the closing doxology at Romans 14:24-26; the app counts 23 verses there.
    const verses = Array.from({ length: 26 }, (_, index): [number, string] => [index + 1, "Service text."]);
    vi.stubGlobal("fetch", vi.fn(async () => serviceChapter("romans", 14, { verses })));
    expect((await getChapter("romans", 14))?.verses).toHaveLength(23);
    expect(await getVerse("romans", 16, 27)).toMatchObject({ text: expect.stringMatching(/Amen/) });
  });

  it.each([404, 503])("serves the imported chapter when the service answers %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("No", { status })));
    expect((await getChapter("john", 3))?.verses[15].text).toMatch(/^For God so loved the world/);
  });

  it("serves the imported chapter when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await getVerse("genesis", 1, 1)).toMatchObject({ text: "In the beginning, God created the heavens and the earth." });
  });

  it("stops waiting for a slow service without cancelling its lookup", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    }));
    let settled = false;
    const pending = getChapter("psalms", 23).then((chapter) => { settled = true; return chapter; });
    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending)?.verses[0].text).toMatch(/Yahweh is my shepherd/);
    expect(signal?.aborted).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("slow for PSA 23"));
  });

  it("rejects an invalid location before any lookup", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await getChapter("genesis", 51)).toBeNull();
    expect(await getChapter("not-a-book", 1)).toBeNull();
    expect(await getVerse("genesis", 1, 32)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("image requests", () => {
  it("resolve a verse the service leaves blank, with its neighbours, from the imported chapter", async () => {
    const verses = Array.from({ length: 27 }, (_, index): [number, string] => [index + 1, index === 6 ? "" : "Service text."]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/data/")
      ? serviceChapter("acts", 24, { verses })
      : Response.json({ verses: [{ book_id: "ACT", book_name: "Acts", chapter: 24, verse: 7, text: "" }] })));
    expect(await resolveGenerationPassage("Acts 24:7", "web")).toMatchObject({
      reference: "Acts 24:7",
      verseText: expect.stringMatching(/Lysias/),
      prevVerse: { number: 6, text: expect.stringMatching(/temple/) },
      nextVerse: { number: 8 },
    });
  });
});

describe("when the imported text cannot be read", () => {
  beforeEach(() => { vi.spyOn(process, "cwd").mockReturnValue(os.tmpdir()); });

  it("lets the service's failure stand", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("No", { status: 503 })));
    await expect(getChapter("john", 3)).rejects.toMatchObject({ name: "BibleApiLookupError", retryable: true });
  });

  it("keeps a service chapter that differs from the verse list rather than showing nothing", async () => {
    const verses = Array.from({ length: 26 }, (_, index): [number, string] => [index + 1, "Service text."]);
    vi.stubGlobal("fetch", vi.fn(async () => serviceChapter("romans", 14, { verses })));
    expect((await getChapter("romans", 14))?.verses).toHaveLength(26);
  });

  it("tries the file again on the next request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("No", { status: 503 })));
    await expect(getChapter("john", 3)).rejects.toThrow();
    vi.mocked(process.cwd).mockRestore();
    expect((await getChapter("john", 3))?.verses).toHaveLength(36);
  });
});

describe("other translations", () => {
  it("never use the imported text", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("No", { status: 503 }))
      .mockResolvedValueOnce(new Response("Missing", { status: 404 }))
      .mockResolvedValueOnce(serviceChapter("romans", 14, {
        translation: "kjv", verses: Array.from({ length: 26 }, (_, index): [number, string] => [index + 1, "King James text."]),
      }));
    vi.stubGlobal("fetch", fetch);
    await expect(getChapter("john", 3, "kjv")).rejects.toMatchObject({ kind: "upstream" });
    expect(await getChapter("john", 3, "kjv")).toBeNull();
    expect((await getChapter("romans", 14, "kjv"))?.verses).toHaveLength(26);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
