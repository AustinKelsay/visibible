import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const image = { verseId: "genesis-1-1", model: "test-model", generationId: "generation-one", prompt: "Original provenance" };
describe("atomic image identity", () => {
  it("concurrent storage saves return one stable image and remove only losing uploads", async () => {
    const t = convexTest(schema, modules);
    const blobs = await t.run(async (ctx) => Promise.all(Array.from({ length: 4 }, () => ctx.storage.store(new Blob(["image"])))));
    const ids = await Promise.all(blobs.map((storageId) => t.mutation(internal.verseImages.saveImageWithStorage, { ...image, storageId })));
    expect(new Set(ids).size).toBe(1);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("verseImages").collect();
      expect(rows).toHaveLength(1);
      for (const blob of blobs) expect(!!await ctx.storage.get(blob)).toBe(blob === rows[0].storageId);
    });
    const retry = await t.mutation(internal.verseImages.saveImageWithUrl, { ...image, prompt: "Changed retry", imageUrl: "https://example.com/temporary.png" });
    expect(retry).toBe(ids[0]);
    expect((await t.query(internal.verseImages.getImageById, { imageId: retry }))?.prompt).toBe("Original provenance");
  });
  it("preserves a losing upload referenced by a different generation", async () => {
    const t = convexTest(schema, modules);
    const shared = await t.run((ctx) => ctx.storage.store(new Blob(["shared"])));
    const first = await t.mutation(internal.verseImages.saveImageWithUrl, { ...image, imageUrl: "https://example.com/first.png" });
    const other = await t.mutation(internal.verseImages.saveImageWithStorage, { ...image, generationId: "other", storageId: shared });
    const retry = await t.mutation(internal.verseImages.saveImageWithStorage, { ...image, storageId: shared });
    expect(retry).toBe(first);
    expect(other).not.toBe(first);
    expect(await t.run(async (ctx) => !!await ctx.storage.get(shared))).toBe(true);
  });
  it("concurrent URL saves also preserve generation identity", async () => {
    const t = convexTest(schema, modules);
    const ids = await Promise.all(Array.from({ length: 4 }, (_, n) => t.mutation(internal.verseImages.saveImageWithUrl, { ...image, imageUrl: `https://example.com/${n}.png` })));
    expect(new Set(ids).size).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("verseImages").collect())).toHaveLength(1);
  });
});
