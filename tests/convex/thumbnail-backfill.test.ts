/** The one-time thumbnail backfill (#444): a dry run that changes nothing, resumable runs, and a repeat that changes nothing. */
import { convexTest } from "convex-test";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { runThumbnailBackfill } from "../../src/lib/thumbnails";
import { modules } from "./modules";

const SECRET = "s".repeat(40);
process.env.CONVEX_SERVER_SECRET = SECRET;

const png = (width: number, height: number, background = "#884422") => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
const dataUrl = (bytes: Buffer, mime: string) => `data:${mime};base64,${bytes.toString("base64")}`;

/** Three verses' pictures without thumbnails and one saved with its thumbnail; the fake fetch serves each picture's bytes. */
async function seed() {
  const t = convexTest(schema, modules);
  // Distinct pictures: the test backend's storage address is a hash of the bytes.
  const pictures = await Promise.all(["#884422", "#228844", "#442288", "#888822"].map((color) => png(800, 450, color)));
  for (const verse of [1, 2, 3]) {
    await t.action(api.verseImages.saveImage, { verseId: `genesis-1-${verse}`, model: "m", generationId: `g${verse}`, imageUrl: dataUrl(pictures[verse - 1], "image/png"), serverSecret: SECRET });
  }
  const thumb = await sharp(pictures[3]).resize(64).webp().toBuffer();
  await t.action(api.verseImages.saveImage, { verseId: "genesis-1-4", model: "m", generationId: "g4", imageUrl: dataUrl(pictures[3], "image/png"), thumbnailUrl: dataUrl(thumb, "image/webp"), serverSecret: SECRET });
  const fetched: string[] = [];
  const failing = new Set<string>();
  const fetchPicture = async (url: string) => {
    fetched.push(url);
    if (failing.has(url)) throw new Error("HTTP 404");
    return new Uint8Array(pictures[0]);
  };
  const deps = { client: t, serverSecret: SECRET, fetchPicture, log: () => {} };
  const thumbnails = async () => {
    const tiles = await t.query(api.verseImages.getChapterGallery, { book: "genesis", chapter: 1 });
    return tiles.map((tile) => tile.thumbnailUrl);
  };
  const blobCount = () => t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length);
  const urlOf = async (verse: number) => (await t.query(api.verseImages.getImageHistory, { verseId: `genesis-1-${verse}` }))[0].imageUrl!;
  return { t, deps, fetched, failing, thumbnails, blobCount, urlOf };
}

describe("thumbnail backfill", () => {
  it("dry run reports the pictures it would give thumbnails and changes nothing", async () => {
    const { deps, fetched, thumbnails, blobCount } = await seed();
    const before = await blobCount();
    const report = await runThumbnailBackfill({ dryRun: true }, deps);
    expect(report).toMatchObject({ dryRun: true, found: 3, attached: 0, failed: [], stop: "complete" });
    expect(fetched).toEqual([]);
    expect(await blobCount()).toBe(before);
    expect((await thumbnails()).filter(Boolean)).toHaveLength(1);
  });

  it("can be stopped and resumed, and a second full run changes nothing", async () => {
    const { deps, thumbnails, blobCount } = await seed();
    const first = await runThumbnailBackfill({ dryRun: false, limit: 2 }, deps);
    expect(first).toMatchObject({ attached: 2, stop: "limit" });
    expect((await thumbnails()).filter(Boolean)).toHaveLength(3);

    const resumed = await runThumbnailBackfill({ dryRun: false }, deps);
    expect(resumed).toMatchObject({ found: 1, attached: 1, failed: [], stop: "complete" });
    const all = await thumbnails();
    expect(all.every((url) => typeof url === "string")).toBe(true);

    const blobs = await blobCount();
    const again = await runThumbnailBackfill({ dryRun: false }, deps);
    expect(again).toMatchObject({ found: 0, attached: 0, failed: [], stop: "complete" });
    expect(await blobCount()).toBe(blobs);
    expect(await thumbnails()).toEqual(all);
  });

  it("stops between pictures when asked, keeping what it made", async () => {
    const { deps, thumbnails } = await seed();
    let made = 0;
    const report = await runThumbnailBackfill({ dryRun: false, stopRequested: () => made >= 1 }, { ...deps, log: (line) => { if (line.startsWith("attached")) made += 1; } });
    expect(report).toMatchObject({ attached: 1, stop: "interrupted" });
    expect((await thumbnails()).filter(Boolean)).toHaveLength(2);
  });

  it("reports a picture it cannot read and carries on with the rest; a later run retries it", async () => {
    const { deps, failing, urlOf, thumbnails } = await seed();
    failing.add(await urlOf(2));
    const report = await runThumbnailBackfill({ dryRun: false }, deps);
    expect(report.attached).toBe(2);
    expect(report.failed).toEqual([{ id: expect.any(String), verseId: "genesis-1-2", reason: "HTTP 404" }]);
    expect(report.stop).toBe("complete");
    failing.clear();
    expect(await runThumbnailBackfill({ dryRun: false }, deps)).toMatchObject({ found: 1, attached: 1, failed: [] });
    expect((await thumbnails()).every(Boolean)).toBe(true);
  });

  it("keeps the first thumbnail when two runs attach one to the same picture", async () => {
    const { t, blobCount } = await seed();
    const [entry] = await t.query(api.verseImages.getImageHistory, { verseId: "genesis-1-1" });
    const thumb = dataUrl(await sharp(await png(80, 45)).webp().toBuffer(), "image/webp");
    const results = await Promise.all([1, 2].map(() => t.action(api.verseImages.attachThumbnail, { imageId: entry.id, thumbnailUrl: thumb, serverSecret: SECRET })));
    expect(results.map((r) => r.status).sort()).toEqual(["already", "attached"]);
    const blobs = await blobCount();
    expect(await t.action(api.verseImages.attachThumbnail, { imageId: entry.id, thumbnailUrl: thumb, serverSecret: SECRET })).toEqual({ status: "already" });
    expect(await blobCount()).toBe(blobs);
    await expect(t.action(api.verseImages.attachThumbnail, { imageId: entry.id, thumbnailUrl: thumb, serverSecret: "wrong" })).rejects.toThrow();
  });
});
