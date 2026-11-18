/** Thumbnails (#444): a small copy saved with each new picture, returned by reader reads, and added to old pictures by a backfill. */
import { convexTest } from "convex-test";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const assertSave = <T>(p: Promise<T | null>) => p.then((value) => value!);

const SECRET = "s".repeat(40);
process.env.CONVEX_SERVER_SECRET = SECRET;

const dataUrl = (bytes: Buffer, mime: string) => `data:${mime};base64,${bytes.toString("base64")}`;
const picture = async () => dataUrl(await sharp({ create: { width: 64, height: 36, channels: 3, background: "#336699" } }).png().toBuffer(), "image/png");
const small = async () => dataUrl(await sharp({ create: { width: 32, height: 18, channels: 3, background: "#336699" } }).webp({ quality: 70 }).toBuffer(), "image/webp");
const save = { verseId: "genesis-1-1", model: "test-model", generationId: "g1", serverSecret: SECRET };

describe("thumbnails saved with new pictures", () => {
  it("saves the small copy beside the picture, and history, Contents and replay reads return its address", async () => {
    const t = convexTest(schema, modules);
    const saved = await t.action(api.verseImages.saveImage, { ...save, imageUrl: await picture(), thumbnailUrl: await small() });

    const [entry] = await t.query(api.verseImages.getImageHistory, { verseId: "genesis-1-1" });
    expect(entry.id).toBe(saved.id);
    expect(entry.thumbnailUrl).toEqual(expect.any(String));
    expect(entry.thumbnailUrl).not.toBe(entry.imageUrl);
    const [tile] = await t.query(api.verseImages.getChapterContents, { verseIds: ["genesis-1-1"], styles: ["classical"] });
    expect(tile.picture?.thumbnailUrl).toBe(entry.thumbnailUrl);

    // The small copy is a real stored WebP.
    const row = await t.query(internal.verseImages.getImageById, { imageId: saved.id });
    const type = await t.run(async (ctx) => (await ctx.storage.get(row!.thumbnailStorageId!))?.type);
    expect(type).toBe("image/webp");
  });

  it("replays a finished request with the thumbnail's address", async () => {
    const t = convexTest(schema, modules);
    const request = { requestId: "r1", sid: "sid", verseId: "genesis-1-1", inputFingerprint: "fp", generationId: "g1", executorVersion: "next-image-v1" as const, billingPolicyVersion: "legacy-image-v1" as const, serverSecret: SECRET };
    await t.mutation(api.verseImages.createGenerationRequest, request);
    await t.action(api.verseImages.saveImage, { ...save, imageUrl: await picture(), thumbnailUrl: await small() });
    const replay = await t.mutation(api.verseImages.createGenerationRequest, request);
    expect(replay.savedImage?.thumbnailUrl).toEqual(expect.any(String));
  });

  it("still saves and shows the picture when the small copy is missing or unusable, with no thumbnail address", async () => {
    const t = convexTest(schema, modules);
    const truncated = (await small()).slice(0, -12);
    const unusable = ["data:image/webp;base64,AAAA", truncated, "data:text/html;base64,PGh0bWw+", "https://example.com/thumb.webp"];
    for (const [index, thumbnailUrl] of unusable.entries()) {
      const saved = await t.action(api.verseImages.saveImage, { ...save, generationId: `bad-${index}`, imageUrl: await picture(), thumbnailUrl });
      expect(saved.type).toBe("storage");
    }
    await t.action(api.verseImages.saveImage, { ...save, generationId: "none", imageUrl: await picture() });

    const history = await t.query(api.verseImages.getImageHistory, { verseId: "genesis-1-1" });
    expect(history).toHaveLength(unusable.length + 1);
    for (const entry of history) {
      expect(entry.imageUrl).toEqual(expect.any(String));
      expect(entry.thumbnailUrl).toBeNull();
    }
    const [tile] = await t.query(api.verseImages.getChapterContents, { verseIds: ["genesis-1-1"], styles: ["classical"] });
    expect(tile.picture?.thumbnailUrl).toBeNull();
    // No stray blobs: one stored picture per record, nothing else.
    const blobs = await t.run((ctx) => ctx.db.system.query("_storage").collect());
    expect(blobs).toHaveLength(history.length);
  });

  it("keeps one thumbnail when the same generation is saved twice", async () => {
    const t = convexTest(schema, modules);
    const first = await t.action(api.verseImages.saveImage, { ...save, imageUrl: await picture(), thumbnailUrl: await small() });
    const again = await t.action(api.verseImages.saveImage, { ...save, imageUrl: await picture(), thumbnailUrl: await small() });
    expect(again.id).toBe(first.id);
    const blobs = await t.run((ctx) => ctx.db.system.query("_storage").collect());
    expect(blobs).toHaveLength(2);
  });

  it("removes the losing upload's thumbnail when saves of one generation race", async () => {
    const t = convexTest(schema, modules);
    const store = () => t.run((ctx) => ctx.storage.store(new Blob(["bytes"])));
    const uploads = await Promise.all(Array.from({ length: 3 }, async () => ({ storageId: await store(), thumbnailStorageId: await store() })));
    const ids = await Promise.all(uploads.map((upload) => assertSave(t.mutation(internal.verseImages.saveImageWithStorage, { verseId: "genesis-1-1", model: "m", generationId: "g1", ...upload }))));
    expect(new Set(ids).size).toBe(1);
    const row = await t.query(internal.verseImages.getImageById, { imageId: ids[0]! });
    const remaining = await t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).map((blob) => blob._id));
    expect(remaining.sort()).toEqual([row!.storageId, row!.thumbnailStorageId].sort());
  });
});
