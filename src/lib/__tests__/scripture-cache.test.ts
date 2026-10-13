import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBibleApiCache, getChapter, getVerse } from "../bible-api";
import { BIBLE_BOOKS } from "@/data/bible-structure";

function chapterResponse(bookId = "GEN", chapter = 1, translation = "web") {
  return Response.json({
    translation: { identifier: translation, name: translation },
    verses: [{ book_id: bookId, book: bookId, chapter, verse: 1, text: "Chapter fixture." }],
  });
}

beforeEach(() => clearBibleApiCache());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("chapter request coalescing", () => {
  it("shares one active lookup between chapter and verse readers, then delegates completed caching to Next", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetch);
    const chapter = getChapter("genesis", 1);
    const verse = getVerse("genesis", 1, 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toMatchObject([
      "https://bible-api.com/data/web/GEN/1", { next: { revalidate: 2592000 } },
    ]);
    resolve(chapterResponse());
    expect((await chapter)?.verses[0]).toEqual(await verse);
    const later = getChapter("genesis", 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    resolve(chapterResponse());
    await later;
  });

  it("keeps translations independent during concurrent requests", async () => {
    const fetch = vi.fn(async (url: string) => chapterResponse("GEN", 1, url.split("/")[4]));
    vi.stubGlobal("fetch", fetch);
    const [web, kjv] = await Promise.all([getChapter("genesis", 1, "web"), getChapter("genesis", 1, "kjv")]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(web?.translationId).toBe("web");
    expect(kjv?.translationId).toBe("kjv");
  });

  it.each([404, 503, 200])("releases a shared unsuccessful lookup (%i) for recovery", async (status) => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("Invalid or absent chapter", { status }))
      .mockResolvedValueOnce(chapterResponse());
    vi.stubGlobal("fetch", fetch);
    const results = await Promise.allSettled([getChapter("genesis", 1), getVerse("genesis", 1, 1)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results.every((r) => status === 404 ? r.status === "fulfilled" && r.value === null : r.status === "rejected")).toBe(true);
    expect(await getVerse("genesis", 1, 1)).toMatchObject({ text: "Chapter fixture." });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts a stalled lookup at the shared deadline and permits a later retry", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    const results = Promise.allSettled([getChapter("genesis", 1), getVerse("genesis", 1, 1)]);
    await vi.advanceTimersByTimeAsync(10000);
    expect((await results).every((r) => r.status === "rejected")).toBe(true);
    fetch.mockResolvedValueOnce(chapterResponse());
    expect(await getChapter("genesis", 1)).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it("bounds distinct active requests while still allowing subscribers to an existing lookup", async () => {
    let complete!: () => void;
    const gate = new Promise<void>((resolve) => { complete = resolve; });
    const fetch = vi.fn(async (url: string) => {
      await gate;
      const parts = url.split("/");
      return chapterResponse(parts[5], Number(parts[6]));
    });
    vi.stubGlobal("fetch", fetch);
    const locations = BIBLE_BOOKS.flatMap((book) => book.chapters.map((_, i) => ({ slug: book.slug, chapter: i + 1 })));
    const requests = locations.slice(0, 256).map((p) => getChapter(p.slug, p.chapter));
    const subscriber = getVerse("genesis", 1, 1);
    const next = locations[256];
    await expect(getChapter(next.slug, next.chapter)).rejects.toMatchObject({ retryable: true });
    expect(fetch).toHaveBeenCalledTimes(256);
    complete();
    await Promise.all(requests);
    expect(await subscriber).not.toBeNull();
    expect(await getChapter(next.slug, next.chapter)).not.toBeNull();
  });
});
