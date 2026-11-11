import { convexTest } from "convex-test";
import sharp from "sharp";
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
    // Base64 without its trailing padding is unambiguous and still stored.
    const unpadded = await t.action(api.verseImages.saveImage, { ...save, generationId: "g2", imageUrl: `data:image/png;base64,${PNG.replace(/=+$/, "")}` });
    expect((await t.query(internal.verseImages.getImageById, { imageId: unpadded.id }))).toMatchObject({ imageWidth: 1, imageHeight: 1 });
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
      ["data:image/png;base64,AAAAA", /Invalid base64 image data/],
    ] as const) {
      await expect(t.action(api.verseImages.saveImage, { ...save, imageUrl })).rejects.toThrow(error);
    }
    const oversize = "A".repeat(Math.ceil((10 * 1024 * 1024 * 4) / 3) + 8);
    await expect(t.action(api.verseImages.saveImage, { ...save, imageUrl: `data:image/png;base64,${oversize}` })).rejects.toThrow(/exceeds/);
    expect(await t.run((ctx) => ctx.db.query("verseImages").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(0);
  });
});

describe("whole images only", () => {
  const save = { verseId: "genesis-1-1", model: "test-model", serverSecret: SECRET };
  const source = () => sharp({ create: { width: 48, height: 32, channels: 4, background: { r: 120, g: 60, b: 200, alpha: 0.6 } } });
  const encodings: [string, string, () => Promise<Buffer>][] = [
    ["png", "image/png", () => source().png().toBuffer()],
    ["baseline jpeg", "image/jpeg", () => source().jpeg().toBuffer()],
    ["progressive jpeg", "image/jpeg", () => source().jpeg({ progressive: true }).toBuffer()],
    ["gif", "image/gif", () => source().gif().toBuffer()],
    ["lossy webp", "image/webp", () => source().removeAlpha().webp().toBuffer()],
    ["lossless webp", "image/webp", () => source().webp({ lossless: true }).toBuffer()],
    ["webp with alpha (VP8X)", "image/webp", () => source().webp({ alphaQuality: 50 }).toBuffer()],
  ];

  it.each(encodings)("stores a whole %s and refuses it cut short", async (_name, mime, encode) => {
    const t = convexTest(schema, modules);
    const bytes = await encode();
    const saved = await t.action(api.verseImages.saveImage, { ...save, generationId: "whole", imageUrl: `data:${mime};base64,${bytes.toString("base64")}` });
    expect(await t.query(internal.verseImages.getImageById, { imageId: saved.id })).toMatchObject({ imageMimeType: mime, imageWidth: 48, imageHeight: 32 });
    for (const length of new Set([bytes.length - 1, Math.floor(bytes.length / 2), Math.min(40, bytes.length - 2)])) {
      const cut = bytes.subarray(0, length).toString("base64");
      await expect(t.action(api.verseImages.saveImage, { ...save, generationId: `cut-${length}`, imageUrl: `data:${mime};base64,${cut}` })).rejects.toThrow(/not a readable/);
    }
    expect(await t.run((ctx) => ctx.db.query("verseImages").collect())).toHaveLength(1);
  });

  it("refuses structurally complete-looking files with no image data or a false end", async () => {
    const t = convexTest(schema, modules);
    const store = (mime: string, bytes: Uint8Array, generationId: string) =>
      t.action(api.verseImages.saveImage, { ...save, generationId, imageUrl: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` });
    const u32be = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24];
    const chunk = (type: string, data: number[]) => [...u32be(data.length), ...Buffer.from(type), ...data, 0, 0, 0, 0];

    // JPEG: a comment after the last scan holding FF D9. Whole, it is stored; cut after that FF D9, it is not.
    const jpeg = await source().jpeg({ progressive: true }).toBuffer();
    const body = jpeg.subarray(0, jpeg.length - 2);
    const comment = [0xff, 0xfe, 0x00, 0x06, 0x41, 0xff, 0xd9, 0x42];
    await expect(store("image/jpeg", Buffer.concat([body, Buffer.from(comment), Buffer.from([0xff, 0xd9])]), "jpeg-comment")).resolves.toMatchObject({ type: "storage" });
    await expect(store("image/jpeg", Buffer.concat([body, Buffer.from(comment.slice(0, 7))]), "jpeg-false-end")).rejects.toThrow(/not a readable/);

    // PNG: signature, IHDR, one empty IDAT and IEND, with no compressed stream at all.
    const ihdr = [...u32be(1), ...u32be(1), 8, 6, 0, 0, 0];
    const emptyPng = [137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", ihdr), ...chunk("IDAT", []), ...chunk("IEND", [])];
    await expect(store("image/png", Uint8Array.from(emptyPng), "png-empty")).rejects.toThrow(/not a readable/);

    // WebP: a VP8X canvas header and an empty VP8L chunk, with a correct RIFF size.
    const vp8x = [...Buffer.from("VP8X"), ...u32le(10), 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const vp8l = [...Buffer.from("VP8L"), ...u32le(0)];
    const webpBody = [...Buffer.from("WEBP"), ...vp8x, ...vp8l];
    await expect(store("image/webp", Uint8Array.from([...Buffer.from("RIFF"), ...u32le(webpBody.length), ...webpBody]), "webp-empty")).rejects.toThrow(/not a readable/);

    // WebP: an odd-sized final chunk with its padding byte dropped and the RIFF size shrunk to match.
    const lossless = await source().webp({ lossless: true }).toBuffer();
    expect(lossless.readUInt32LE(16) % 2).toBe(1);
    const unpadded = Buffer.from(lossless.subarray(0, lossless.length - 1));
    unpadded.writeUInt32LE(lossless.readUInt32LE(4) - 1, 4);
    await expect(store("image/webp", unpadded, "webp-unpadded")).rejects.toThrow(/not a readable/);

    expect(await t.run((ctx) => ctx.db.query("verseImages").collect())).toHaveLength(1);
  });

  it("refuses header-only fragments that carry dimensions but no image", async () => {
    const t = convexTest(schema, modules);
    for (const imageUrl of [
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
      "data:image/gif;base64,R0lGeHh4AQABAA==",
      "data:image/jpeg;base64,/9j/wAARCAABAAE=",
    ]) {
      await expect(t.action(api.verseImages.saveImage, { ...save, generationId: imageUrl, imageUrl })).rejects.toThrow(/not a readable/);
    }
    expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(0);
  });
});
