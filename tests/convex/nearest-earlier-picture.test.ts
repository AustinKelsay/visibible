/**
 * The glow behind an unpainted verse (#439): the newest picture, in the reader's art style, of the nearest earlier
 * verse of the same chapter that has one. Later verses, other chapters and other styles never count.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";

process.env.CONVEX_SERVER_SECRET = "s".repeat(40);
process.env.CONVEX_SITE_URL = "https://actions.example.com";

async function seed(pictures: Array<[verseId: string, style: "legacy" | "classical" | "watercolor"]>) {
  const t = convexTest(schema, modules);
  let at = 1_000;
  const ids: string[] = [];
  for (const [verseId, style] of pictures) {
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    const id = await t.mutation(internal.verseImages.saveImageWithStorage, {
      verseId, storageId, model: "test-model", reference: verseId, generationId: `${verseId}-${style}-${at}`,
      verseText: `Text of ${verseId}`, translationId: "web",
      ...(style === "legacy" ? {} : { artStyleId: style }),
    });
    await t.run(async (ctx) => { await ctx.db.patch(id, { createdAt: at }); });
    at += 1;
    ids.push(id);
  }
  return { t, ids };
}

describe("the nearest earlier picture in the chapter", () => {
  it("is the newest picture in the style of the closest earlier verse that has one", async () => {
    const { t, ids } = await seed([
      ["john-1-2", "classical"],
      ["john-1-3", "legacy"],
      ["john-1-3", "classical"],
      ["john-1-4", "watercolor"],
    ]);
    const glow = await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "john-1-5", artStyle: "classical" });
    expect(glow).toMatchObject({ verse: 3, id: ids[2], imageUrl: expect.any(String), thumbnailUrl: null });

    // A picture without a stored style is Classical; in Watercolor the nearest is verse 4.
    expect(await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "john-1-4", artStyle: "classical" }))
      .toMatchObject({ verse: 3, id: ids[2] });
    expect(await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "john-1-21", artStyle: "watercolor" }))
      .toMatchObject({ verse: 4, id: ids[3] });
  });

  it("is nothing when only later verses, other chapters or other styles are painted", async () => {
    const { t } = await seed([
      ["john-1-10", "classical"],
      ["john-11-1", "classical"],
      ["john-2-1", "classical"],
      ["john-1-1", "watercolor"],
      ["johnny-1-1", "classical"],
    ]);
    expect(await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "john-1-2", artStyle: "classical" })).toBeNull();
    expect(await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "john-1-1", artStyle: "classical" })).toBeNull();
    expect(await t.query(api.verseImages.getNearestEarlierPicture, { verseId: "not a verse", artStyle: "classical" })).toBeNull();
  });
});
