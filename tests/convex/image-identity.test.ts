import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const SECRET = "s".repeat(40);
process.env.CONVEX_SERVER_SECRET = SECRET;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

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
    const late = await t.run((ctx) => ctx.storage.store(new Blob(["late retry"])));
    const retry = await t.mutation(internal.verseImages.saveImageWithStorage, { ...image, prompt: "Changed retry", storageId: late });
    expect(retry).toBe(ids[0]);
    expect((await t.query(internal.verseImages.getImageById, { imageId: retry }))?.prompt).toBe("Original provenance");
  });
  it("preserves a losing upload referenced by a different generation", async () => {
    const t = convexTest(schema, modules);
    const own = await t.run((ctx) => ctx.storage.store(new Blob(["own"])));
    const shared = await t.run((ctx) => ctx.storage.store(new Blob(["shared"])));
    const first = await t.mutation(internal.verseImages.saveImageWithStorage, { ...image, storageId: own });
    const other = await t.mutation(internal.verseImages.saveImageWithStorage, { ...image, generationId: "other", storageId: shared });
    const retry = await t.mutation(internal.verseImages.saveImageWithStorage, { ...image, storageId: shared });
    expect(retry).toBe(first);
    expect(other).not.toBe(first);
    expect(await t.run(async (ctx) => !!await ctx.storage.get(shared))).toBe(true);
  });
});

describe("what saveImage stores", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const save = { verseId: "genesis-1-1", model: "test-model", generationId: "g1", serverSecret: SECRET };

  it("stores image bytes returned with the response, with their type and size", async () => {
    const t = convexTest(schema, modules);
    const saved = await t.action(api.verseImages.saveImage, { ...save, imageUrl: `data:image/png;base64,${PNG}` });
    expect(saved.type).toBe("storage");
    const row = await t.query(internal.verseImages.getImageById, { imageId: saved.id });
    expect(row).toMatchObject({ imageMimeType: "image/png", imageWidth: 1, imageHeight: 1 });
    expect(row?.storageId).toBeDefined();
    expect(row?.imageUrl).toBeUndefined();
    expect(row?.sourceImageUrl).toBeUndefined();
  });

  it("refuses a remote image URL without fetching it or saving a record, whatever its host", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const t = convexTest(schema, modules);
    for (const imageUrl of [
      "https://openrouter.ai/images/a.png",
      "https://redirect.example/to-metadata",
      "https://169.254.169.254/latest/meta-data",
      "http://localhost/a.png",
    ]) {
      await expect(t.action(api.verseImages.saveImage, { ...save, imageUrl })).rejects.toThrow(/remote image URLs are refused/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("verseImages").collect())).toHaveLength(0);
  });

  it("refuses malformed, non-image, mislabelled and oversize data without saving a record or a blob", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.verseImages.saveImage, { ...save, imageUrl: "data:image/png,not-base64" })).rejects.toThrow(/Invalid data URL format/);
    await expect(t.action(api.verseImages.saveImage, { ...save, imageUrl: `data:text/html;base64,${PNG}` })).rejects.toThrow(/Unsupported image MIME type/);
    await expect(t.action(api.verseImages.saveImage, { ...save, imageUrl: `data:image/svg+xml;base64,${PNG}` })).rejects.toThrow(/Unsupported image MIME type/);
    const b64 = (bytes: Uint8Array | string) => Buffer.from(bytes).toString("base64");
    const pngBytes = Buffer.from(PNG, "base64");
    for (const [imageUrl, error] of [
      // Disguised and mislabelled bytes: the declared type's parser must read them.
      [`data:image/png;base64,${b64("<html><script>alert(1)</script></html>")}`, /not a readable image\/png/],
      [`data:image/jpeg;base64,${PNG}`, /not a readable image\/jpeg/],
      [`data:image/png;base64,${b64(pngBytes.subarray(0, 12))}`, /not a readable image\/png/],
      // Base64 that would otherwise decode to invented bytes.
      ["data:image/png;base64,AA=A", /Invalid base64 image data/],
      ["data:image/png;base64,\u0100\u0100\u0100\u0100", /Invalid base64 image data/],
      [`data:image/png;base64,${PNG.replace(/=+$/, "")}`, /Invalid base64 image data/],
    ] as const) {
      await expect(t.action(api.verseImages.saveImage, { ...save, imageUrl })).rejects.toThrow(error);
    }
    const oversize = "A".repeat(Math.ceil((10 * 1024 * 1024 * 4) / 3) + 8);
    await expect(t.action(api.verseImages.saveImage, { ...save, imageUrl: `data:image/png;base64,${oversize}` })).rejects.toThrow(/exceeds/);
    expect(await t.run((ctx) => ctx.db.query("verseImages").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(0);
  });
});
