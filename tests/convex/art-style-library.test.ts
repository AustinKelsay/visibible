/**
 * Style-aware library reads (#176): historical images read as Classical without being rewritten,
 * selected-style and other-styles views agree with counts, markers and existence checks, the
 * public queries filter and paginate consistently, and Nostr selection spans every style.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const SECRET = "s".repeat(40);
process.env.CONVEX_SERVER_SECRET = SECRET;
process.env.CONVEX_SITE_URL = "https://actions.example.com";

const provenance = (styleId: string) => ({
  workId: "bible-web", momentId: "genesis-1-1", sectionId: "genesis-1-1", eraId: "creation", styleId, styleVersion: "sv", briefVersion: "bv",
  lookVersion: "lv", planVersion: "pv", promptVersion: "2026-10-20-generic-v1", analysisGeneration: 1, canon: [], references: [], requestTranslationId: "kjv",
});

async function seed() {
  const t = convexTest(schema, modules);
  const blob = () => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
  let at = 1_000;
  const save = async (verseId: string, style: "legacy" | "classical" | "watercolor" | "icon") => {
    const storageId = await blob();
    const id = await t.mutation(internal.verseImages.saveImageWithStorage, {
      verseId, storageId, model: style === "legacy" ? "legacy-model" : "google/gemini-3.1-flash-lite-image", reference: verseId, generationId: `${verseId}-${style}-${at}`,
      verseText: style === "legacy" ? `Reader text of ${verseId}` : `WEB text of ${verseId}`, translationId: style === "legacy" ? "kjv" : "web",
      ...(style === "legacy" ? {} : { engine: "generic" as const, artStyleId: style, provenance: provenance(style) }),
    });
    await t.run(async (ctx) => { await ctx.db.patch(id, { createdAt: at }); });
    at += 1;
    return id;
  };
  // Genesis 1: verse 1 has a legacy image, a watercolor and an icon; verse 2 a legacy image only; verse 3 a watercolor only.
  const ids = {
    g11Legacy: await save("genesis-1-1", "legacy"), g11Water: await save("genesis-1-1", "watercolor"), g11Icon: await save("genesis-1-1", "icon"),
    g12Legacy: await save("genesis-1-2", "legacy"), g13Water: await save("genesis-1-3", "watercolor"),
    // Genesis 2 has only an explicit Classical generic image; John 3:16 only an icon.
    g21Classical: await save("genesis-2-1", "classical"), j316Icon: await save("john-3-16", "icon"),
  };
  return { t, ids };
}

describe("style-aware library", () => {
  it("reads historical images as Classical and reports style, engine and request translation truthfully", async () => {
    const { t, ids } = await seed();
    const history = await t.query(api.verseImages.getImageHistory, { verseId: "genesis-1-1" });
    expect(history.map((i) => [i.id, i.artStyle, i.engine, i.translationId, i.requestTranslationId])).toEqual([
      [ids.g11Icon, "icon", "generic", "web", "kjv"],
      [ids.g11Water, "watercolor", "generic", "web", "kjv"],
      [ids.g11Legacy, "classical", undefined, "kjv", undefined],
    ]);
    const stored = await t.run((ctx) => ctx.db.get(ids.g11Legacy));
    expect(stored?.artStyleId).toBeUndefined();
    expect(stored?.engine).toBeUndefined();
  });

  it("serves one style or the other styles for history, latest, counts and markers with the same answer", async () => {
    const { t, ids } = await seed();
    const only = { verseId: "genesis-1-1", artStyle: "classical" };
    expect((await t.query(api.verseImages.getImageHistory, only)).map((i) => i.id)).toEqual([ids.g11Legacy]);
    expect((await t.query(api.verseImages.getImageHistory, { ...only, otherStyles: true })).map((i) => i.id)).toEqual([ids.g11Icon, ids.g11Water]);
    expect((await t.query(api.verseImages.getLatestImage, { verseId: "genesis-1-1" }))?.id).toBe(ids.g11Icon);
    expect((await t.query(api.verseImages.getLatestImage, { verseId: "genesis-1-1", artStyle: "watercolor" }))?.id).toBe(ids.g11Water);
    expect(await t.query(api.verseImages.getLatestImage, { verseId: "genesis-1-2", artStyle: "icon" })).toBeNull();
    expect(await t.query(api.verseImages.getImageHistory, { verseId: "genesis-1-3", artStyle: "classical" })).toEqual([]);
    // Variation counts per verse follow the selected style; the all-styles answer is unchanged.
    expect(await t.query(api.verseImages.getChapterImageStatus, { book: "genesis", chapter: 1 })).toEqual([{ verse: 1, imageCount: 3 }, { verse: 2, imageCount: 1 }, { verse: 3, imageCount: 1 }]);
    expect(await t.query(api.verseImages.getChapterImageStatus, { book: "genesis", chapter: 1, artStyle: "classical" })).toEqual([{ verse: 1, imageCount: 1 }, { verse: 2, imageCount: 1 }]);
    expect(await t.query(api.verseImages.getChapterImageStatus, { book: "genesis", chapter: 1, artStyle: "watercolor" })).toEqual([{ verse: 1, imageCount: 1 }, { verse: 3, imageCount: 1 }]);
    expect(await t.query(api.verseImages.getChapterImageStatus, { book: "genesis", chapter: 1, artStyle: "classical", otherStyles: true })).toEqual([{ verse: 1, imageCount: 2 }, { verse: 3, imageCount: 1 }]);
    const gallery = await t.query(api.verseImages.getChapterGallery, { book: "genesis", chapter: 1, artStyle: "watercolor" });
    expect(gallery.map((e) => [e.verse, e.imageId, e.artStyle, e.imageCount, e.isLatest])).toEqual([[1, ids.g11Water, "watercolor", 1, true], [3, ids.g13Water, "watercolor", 1, true]]);
    // Book and chapter markers.
    expect(await t.query(api.verseImages.getBooksWithImages, {})).toEqual(["genesis", "john"]);
    expect(await t.query(api.verseImages.getBooksWithImages, { artStyle: "classical" })).toEqual(["genesis"]);
    expect(await t.query(api.verseImages.getBooksWithImages, { artStyle: "icon" })).toEqual(["genesis", "john"]);
    expect(await t.query(api.verseImages.getBooksWithImages, { artStyle: "classical", otherStyles: true })).toEqual(["genesis", "john"]);
    expect(await t.query(api.verseImages.getChaptersWithImages, { book: "genesis" })).toEqual([1, 2]);
    expect(await t.query(api.verseImages.getChaptersWithImages, { book: "genesis", artStyle: "watercolor" })).toEqual([1]);
    expect(await t.query(api.verseImages.getChaptersWithImages, { book: "genesis", artStyle: "classical" })).toEqual([1, 2]);
    await expect(t.query(api.verseImages.getImageHistory, { verseId: "genesis-1-1", otherStyles: true })).rejects.toThrow(/needs an artStyle/);
    await expect(t.query(api.verseImages.getImageHistory, { verseId: "genesis-1-1", artStyle: "Water Colour" })).rejects.toThrow(/Invalid art style/);
  });

  it("filters the public queries consistently, including page boundaries and stable ids", async () => {
    const { t, ids } = await seed();
    expect((await t.query(api.verseImages.getPublicVerseLatestImage, { serverSecret: SECRET, verseId: "genesis-1-1" }))).toMatchObject({ id: ids.g11Icon, artStyle: "icon", translationId: "web" });
    expect((await t.query(api.verseImages.getPublicVerseLatestImage, { serverSecret: SECRET, verseId: "genesis-1-1", artStyle: "classical" }))).toMatchObject({ id: ids.g11Legacy, artStyle: "classical", translationId: "kjv" });
    expect(await t.query(api.verseImages.getPublicVerseLatestImage, { serverSecret: SECRET, verseId: "genesis-1-3", artStyle: "icon" })).toBeNull();
    const firstPage = await t.query(api.verseImages.listPublicVerseImagesPaginated, { serverSecret: SECRET, verseId: "genesis-1-1", artStyle: "classical", paginationOpts: { cursor: null, numItems: 1 } });
    expect(firstPage.page.map((i) => i.id)).toEqual([ids.g11Legacy]);
    const all = await t.query(api.verseImages.listPublicVerseImagesPaginated, { serverSecret: SECRET, verseId: "genesis-1-1", paginationOpts: { cursor: null, numItems: 2 } });
    expect(all.page.map((i) => i.id)).toEqual([ids.g11Icon, ids.g11Water]);
    expect(all.isDone).toBe(false);
    const rest = await t.query(api.verseImages.listPublicVerseImagesPaginated, { serverSecret: SECRET, verseId: "genesis-1-1", paginationOpts: { cursor: all.continueCursor, numItems: 2 } });
    expect(rest.page.map((i) => i.id)).toEqual([ids.g11Legacy]);
    expect(rest.isDone).toBe(true);
    const verseIds = ["genesis-1-1", "genesis-1-2", "genesis-1-3"];
    expect((await t.query(api.verseImages.getPublicChapterLatestImages, { serverSecret: SECRET, verseIds })).map((e) => [e.verseId, e.image.id])).toEqual([["genesis-1-1", ids.g11Icon], ["genesis-1-2", ids.g12Legacy], ["genesis-1-3", ids.g13Water]]);
    expect((await t.query(api.verseImages.getPublicChapterLatestImages, { serverSecret: SECRET, verseIds, artStyle: "watercolor" })).map((e) => [e.verseId, e.image.id])).toEqual([["genesis-1-1", ids.g11Water], ["genesis-1-3", ids.g13Water]]);
    expect(await t.query(api.verseImages.getPublicBooksWithImages, { serverSecret: SECRET, artStyle: "icon" })).toEqual(["genesis", "john"]);
    expect(await t.query(api.verseImages.getPublicChaptersWithImages, { serverSecret: SECRET, book: "genesis", chapterCount: 3, artStyle: "classical" })).toEqual([1, 2]);
    expect(await t.query(api.verseImages.getPublicChaptersWithImages, { serverSecret: SECRET, book: "genesis", chapterCount: 3, artStyle: "icon" })).toEqual([1]);
  });

  it("selects a Nostr candidate across styles and carries the image's own saved text", async () => {
    const { t, ids } = await seed();
    const claim = await t.mutation(internal.nostrScheduler.claimScheduledImageForWindow, { windowStart: 1_001, windowEnd: 1_003, now: 5_000, randomValue: 0.9 });
    expect(claim.status).toBe("claimed");
    if (claim.status !== "claimed") return;
    expect([ids.g11Water, ids.g11Icon]).toContain(claim.candidate.imageId);
    expect(claim.candidate.verseText).toBe("WEB text of genesis-1-1");
  });
});
