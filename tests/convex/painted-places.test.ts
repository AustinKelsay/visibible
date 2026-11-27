/**
 * Contents' dots: which Bible books, and which chapters of a book, have a picture in the reader's styles, so a reader
 * can find the few painted places while most of the Bible has none.
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";

process.env.CONVEX_SITE_URL = "https://actions.example.com";

const provenance = (styleId: string, workId = "bible-web") => ({
  workId, momentId: "m", sectionId: "s", eraId: "e", styleId, styleVersion: "sv", briefVersion: "bv",
  lookVersion: "lv", planVersion: "pv", promptVersion: "p", analysisGeneration: 1, canon: [], references: [], requestTranslationId: "web",
});

function setup() {
  const t = convexTest(schema, modules);
  let n = 0;
  /** Save a picture; "legacy" has no stored style and reads as Classical. */
  const save = async (verseId: string, style: string, workId?: string) => {
    n += 1;
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([n % 256, 2, 3])], { type: "image/png" })));
    await t.mutation(internal.verseImages.saveImageWithStorage, {
      verseId, storageId, model: "m", generationId: `g${n}`,
      ...(style === "legacy" ? {} : { engine: "generic" as const, artStyleId: style, provenance: provenance(style, workId) }),
    });
  };
  return { t, save };
}

describe("the painted chapters read", () => {
  it("lists the chapters with a picture in any of the reader's styles, including pictures saved before styles", async () => {
    const { t, save } = setup();
    await save("john-1-5", "classical");
    await save("john-3-16", "legacy");
    await save("john-10-1", "watercolor");
    await save("john-11-35", "fresco");
    // Another book, and a book whose slug ends in this one's, are not this book.
    await save("acts-2-1", "classical");
    await save("1-john-1-1", "classical");

    const read = (styles: string[]) => t.query(api.verseImages.getPaintedChapters, { book: "john", chapterCount: 21, styles });
    expect(await read(["classical", "watercolor"])).toEqual([1, 3, 10]);
    expect(await read(["fresco"])).toEqual([11]);
  });

  it("does not show chapters painted only in an owner-only style to a reader", async () => {
    const { t, save } = setup();
    await save("john-2-1", "icon");
    expect(await t.query(api.verseImages.getPaintedChapters, { book: "john", chapterCount: 21, styles: ["classical", "icon"] })).toEqual([]);
  });

  it("hides an unopened work's pictures from readers, but still finds a visible picture behind one", async () => {
    vi.stubEnv("GUEST_AUTH_ISSUER", "https://guest.example");
    try {
      const { t, save } = setup();
      await save("john-4-1", "classical", "holmes-adventures");
      await save("john-5-1", "classical", "holmes-adventures");
      await save("john-5-2", "classical");
      expect(await t.query(api.verseImages.getPaintedChapters, { book: "john", chapterCount: 21, styles: ["classical"] })).toEqual([5]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses an unknown book or an impossible chapter count", async () => {
    const { t } = setup();
    await expect(t.query(api.verseImages.getPaintedChapters, { book: "a-scandal-in-bohemia", chapterCount: 1, styles: ["classical"] })).rejects.toThrow(/Unknown book/);
    await expect(t.query(api.verseImages.getPaintedChapters, { book: "psalms", chapterCount: 151, styles: ["classical"] })).rejects.toThrow(/chapterCount/);
    await expect(t.query(api.verseImages.getPaintedChapters, { book: "john", chapterCount: 21, styles: [] })).rejects.toThrow(/style/);
  });
});

describe("the painted books read", () => {
  it("lists the books with a picture in the reader's styles, in Bible order", async () => {
    const { t, save } = setup();
    await save("revelation-21-1", "classical");
    await save("genesis-1-1", "legacy");
    await save("mark-4-39", "storybook");

    expect(await t.query(api.verseImages.getPaintedBooks, { styles: ["classical"] })).toEqual(["genesis", "revelation"]);
    expect(await t.query(api.verseImages.getPaintedBooks, { styles: ["classical", "storybook"] })).toEqual(["genesis", "mark", "revelation"]);
  });
});
