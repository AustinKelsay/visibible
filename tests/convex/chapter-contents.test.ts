/**
 * Contents (#445): one bounded read per chapter that returns, per verse, the tile picture (the newest picture in the
 * first of the given styles that has one), its thumbnail, how many pictures the verse has, and whether it has a video
 * (#447).
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { CONTENTS_COUNT_CAP, readChapterContents } from "../../convex/verseImages";
import type { QueryCtx } from "../../convex/_generated/server";
import { modules } from "./modules";

process.env.CONVEX_SITE_URL = "https://actions.example.com";

const provenance = (styleId: string, workId = "bible-web") => ({
  workId, momentId: "m", sectionId: "s", eraId: "e", styleId, styleVersion: "sv", briefVersion: "bv",
  lookVersion: "lv", planVersion: "pv", promptVersion: "p", analysisGeneration: 1, canon: [], references: [], requestTranslationId: "web",
});

function setup() {
  const t = convexTest(schema, modules);
  let at = 1_000;
  let n = 0;
  let blobs = 0;
  const blob = (type = "image/png") => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([blobs++ % 256, 2, 3])], { type })));
  /** Save a picture; "legacy" has no stored style and reads as Classical. `createdAt` defaults to "newer than the last". */
  const save = async (verseId: string, style: string, options: { thumbnail?: boolean; createdAt?: number; workId?: string } = {}) => {
    n += 1;
    const id = await t.mutation(internal.verseImages.saveImageWithStorage, {
      verseId, storageId: await blob(), model: "m", generationId: `g${n}`,
      ...(options.thumbnail ? { thumbnailStorageId: await blob("image/webp") } : {}),
      ...(style === "legacy" ? {} : { engine: "generic" as const, artStyleId: style, provenance: provenance(style, options.workId) }),
    });
    const createdAt = options.createdAt ?? at++;
    await t.run(async (ctx) => { await ctx.db.patch(id, { createdAt }); });
    return id;
  };
  /** Store a video job for a verse in the given state; only a completed one is a video readers can watch. */
  const video = async (verseId: string, status: "completed" | "processing" | "failed" = "completed") => {
    n += 1;
    const storageId = status === "completed" ? await blob("video/mp4") : undefined;
    await t.run((ctx) => ctx.db.insert("videoJobs", {
      sid: "maker", requestId: `v${n}`, inputFingerprint: `f${n}`, generationId: `video:maker:v${n}`, verseId,
      reference: verseId, translation: "web", prompt: "p", duration: 5, resolution: "768p", status,
      active: status === "processing", admin: false, estimatedCostUsd: 0.4, estimatedCredits: 50,
      ...(storageId ? { storageId } : {}), createdAt: at++, updatedAt: at, nextRunAt: at, lease: 0, leaseUntil: 0, attempts: 0,
    }));
  };
  return { t, save, video };
}

const chapter = (count: number, book = "genesis", number = 1) => Array.from({ length: count }, (_, i) => `${book}-${number}-${i + 1}`);

describe("the chapter contents read", () => {
  it("returns one entry per verse in order: the newest picture in the chosen style, its thumbnail, and the picture count", async () => {
    const { t, save } = setup();
    await save("genesis-1-1", "legacy");
    const newest = await save("genesis-1-1", "classical", { thumbnail: true });
    await save("genesis-1-1", "watercolor");
    await save("genesis-1-3", "classical");

    const tiles = await t.query(api.verseImages.getChapterContents, { verseIds: chapter(3), styles: ["classical"] });
    expect(tiles.map((tile) => tile.verseId)).toEqual(["genesis-1-1", "genesis-1-2", "genesis-1-3"]);

    const [first, second, third] = tiles;
    expect(first.picture?.id).toBe(newest);
    expect(first.picture?.artStyle).toBe("classical");
    expect(first.picture?.thumbnailUrl).toEqual(expect.any(String));
    expect(first.picture?.thumbnailUrl).not.toBe(first.picture?.imageUrl);
    expect(first).toMatchObject({ pictureCount: 3, morePictures: false });

    expect(second).toEqual({ verseId: "genesis-1-2", picture: null, pictureCount: 0, morePictures: false, hasVideo: false });

    expect(third.picture?.thumbnailUrl).toBeNull();
    expect(third.picture?.imageUrl).toEqual(expect.any(String));
    expect(third.pictureCount).toBe(1);
  });

  it("says which verses have a video readers can watch: a finished one, not one being made or failed", async () => {
    const { t, save, video } = setup();
    await save("genesis-1-1", "classical");
    await video("genesis-1-1");
    await video("genesis-1-1");
    await video("genesis-1-2", "processing");
    await video("genesis-1-3", "failed");
    // A video needs no picture.
    await video("genesis-1-4");

    const tiles = await t.query(api.verseImages.getChapterContents, { verseIds: chapter(5), styles: ["classical"] });
    expect(tiles.map((tile) => tile.hasVideo)).toEqual([true, false, false, true, false]);
  });

  it("reads a picture saved before styles existed as Classical, and takes the newer of the two forms", async () => {
    const { t, save } = setup();
    await save("genesis-1-1", "classical", { createdAt: 10 });
    const legacy = await save("genesis-1-1", "legacy", { createdAt: 20 });
    const [tile] = await t.query(api.verseImages.getChapterContents, { verseIds: chapter(1), styles: ["classical"] });
    expect(tile.picture?.id).toBe(legacy);
    expect(tile.picture?.artStyle).toBe("classical");
  });

  it("falls back through the given styles in order, and leaves a verse with none of them unpainted", async () => {
    const { t, save } = setup();
    await save("genesis-1-1", "icon");
    const watercolor = await save("genesis-1-1", "watercolor");
    await save("genesis-1-2", "icon");

    const tiles = await t.query(api.verseImages.getChapterContents, { verseIds: chapter(2), styles: ["classical", "watercolor", "fresco"] });
    expect(tiles[0].picture).toMatchObject({ id: watercolor, artStyle: "watercolor" });
    expect(tiles[1].picture).toBeNull();
    // The count still covers every picture of the verse, whatever its style.
    expect(tiles[1].pictureCount).toBe(1);
  });

  it("finds the chosen style's newest picture behind many newer pictures in other styles", async () => {
    const { t, save } = setup();
    const classical = await save("genesis-1-1", "classical");
    for (let i = 0; i < CONTENTS_COUNT_CAP + 5; i += 1) await save("genesis-1-1", "watercolor");
    const [tile] = await t.query(api.verseImages.getChapterContents, { verseIds: chapter(1), styles: ["classical"] });
    expect(tile.picture?.id).toBe(classical);
    expect(tile).toMatchObject({ pictureCount: CONTENTS_COUNT_CAP, morePictures: true });
  });

  it("is bounded: the documents it reads do not grow with the number of saved pictures per verse", async () => {
    const readsFor = async (perVerse: number) => {
      const { t, save, video } = setup();
      for (const verseId of chapter(4)) {
        for (let i = 0; i < perVerse; i += 1) {
          await save(verseId, i % 2 ? "watercolor" : "classical");
          await video(verseId);
        }
      }
      return t.run(async (ctx) => {
        const counter = { documents: 0 };
        const tiles = await readChapterContents({ ...ctx, db: countingReader(ctx.db, counter) } as QueryCtx, { verseIds: chapter(4), styles: ["classical", "watercolor"] });
        expect(tiles.every((tile) => tile.picture !== null && tile.hasVideo)).toBe(true);
        return counter.documents;
      });
    };
    const few = await readsFor(CONTENTS_COUNT_CAP + 1);
    const many = await readsFor(CONTENTS_COUNT_CAP * 4);
    expect(many).toBe(few);
    // Per verse: the counted window, at most one picture per style form (Classical has two) and one video.
    expect(many).toBeLessThanOrEqual(4 * (CONTENTS_COUNT_CAP + 1 + 3 + 1));
  });

  it("hides an unopened work's pictures from readers, as the other library reads do", async () => {
    vi.stubEnv("GUEST_AUTH_ISSUER", "https://guest.example");
    try {
      const { t, save } = setup();
      await save("a-scandal-in-bohemia-1-1", "watercolor", { workId: "holmes-adventures" });
      const [tile] = await t.query(api.verseImages.getChapterContents, { verseIds: chapter(1, "a-scandal-in-bohemia"), styles: ["watercolor"] });
      expect(tile).toEqual({ verseId: "a-scandal-in-bohemia-1-1", picture: null, pictureCount: 0, morePictures: false, hasVideo: false });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses a request it cannot answer in one bounded read", async () => {
    const { t } = setup();
    await expect(t.query(api.verseImages.getChapterContents, { verseIds: chapter(201), styles: ["classical"] })).rejects.toThrow(/verseIds/);
    await expect(t.query(api.verseImages.getChapterContents, { verseIds: chapter(1), styles: [] })).rejects.toThrow(/style/);
    await expect(t.query(api.verseImages.getChapterContents, { verseIds: chapter(1), styles: ["Water Colour"] })).rejects.toThrow(/Invalid art style/);
  });
});

/** A database reader that counts every document its queries and gets hand back. */
function countingReader<T extends object>(target: T, counter: { documents: number }): T {
  return new Proxy(target, {
    get(object, key) {
      const value = Reflect.get(object, key, object);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = value.apply(object, args);
        if (result instanceof Promise) {
          return result.then((found) => {
            counter.documents += Array.isArray(found) ? found.length : found ? 1 : 0;
            return found;
          });
        }
        return result && typeof result === "object" ? countingReader(result, counter) : result;
      };
    },
  });
}
