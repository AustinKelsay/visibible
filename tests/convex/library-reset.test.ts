import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { CONFIRM_RESET } from "../../convex/libraryReset";
import { modules } from "./modules";
import type { Id } from "../../convex/_generated/dataModel";

const store = (t: ReturnType<typeof convexTest>, body: string) =>
  t.run(ctx => ctx.storage.store(new Blob([body], { type: "image/jpeg" })));

async function library(pictures: number) {
  const t = convexTest(schema, modules);
  const imageIds: Id<"verseImages">[] = [];
  for (let i = 0; i < pictures; i++) {
    const storageId = await store(t, `full-${i}`);
    const thumbnailStorageId = await store(t, `thumb-${i}`);
    imageIds.push(await t.run(ctx => ctx.db.insert("verseImages", {
      verseId: `genesis-1-${i + 1}`, storageId, thumbnailStorageId, model: "m", createdAt: i, artStyleId: "classical",
    })));
  }
  const videoFile = await store(t, "video");
  await t.run(ctx => ctx.db.insert("videoJobs", {
    sid: "reader", requestId: "r", inputFingerprint: "f", generationId: "g", verseId: "genesis-1-1",
    reference: "Genesis 1:1", translation: "WEB", prompt: "p", duration: 5, resolution: "480p", status: "completed",
    active: false, admin: false, estimatedCostUsd: 0.4, estimatedCredits: 50, storageId: videoFile, createdAt: 0,
    updatedAt: 0, nextRunAt: 0, lease: 0, leaseUntil: 0, attempts: 0, sourceImageId: imageIds[0], sourceArtStyle: "classical",
  }));
  const sheetFile = await store(t, "sheet");
  await t.run(ctx => ctx.db.insert("referenceImages", {
    workId: "bible-web", kind: "sheet", recordId: "moses:main", storageId: sheetFile, inputs: [], fingerprint: "x",
    pinned: false, status: "current", createdAt: 0,
  }));
  await t.run(ctx => ctx.db.insert("nostrPublishingState", { key: "default", lastPublishedImageId: imageIds[0], updatedAt: 0 }));
  return { t, sheetFile };
}

async function resetUntilDone(t: ReturnType<typeof convexTest>) {
  const pages = [];
  for (;;) {
    const page = await t.mutation(internal.libraryReset.resetLibraryPage, { confirm: CONFIRM_RESET });
    pages.push(page);
    if (page.done) return pages;
  }
}

describe("library reset", () => {
  it("refuses without the confirmation phrase", async () => {
    const { t } = await library(1);
    await expect(t.mutation(internal.libraryReset.resetLibraryPage, { confirm: "yes" })).rejects.toThrow(CONFIRM_RESET);
    expect(await t.run(ctx => ctx.db.query("verseImages").collect())).toHaveLength(1);
  });

  it("counts without deleting on a dry run", async () => {
    const { t } = await library(70);
    const page = await t.mutation(internal.libraryReset.resetLibraryPage, { confirm: CONFIRM_RESET, dryRun: true });
    expect(page).toMatchObject({ videos: 1, images: 70, files: 141, done: true, dryRun: true });
    expect(await t.run(ctx => ctx.db.query("verseImages").collect())).toHaveLength(70);
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(142);
  });

  it("deletes every picture, thumbnail and video with their files across pages, and keeps reference sheets", async () => {
    const { t, sheetFile } = await library(120);
    const pages = await resetUntilDone(t);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.reduce((n, p) => n + p.images, 0)).toBe(120);
    expect(pages.at(-1)?.schedulerStateCleared).toBe(1);
    await t.run(async ctx => {
      expect(await ctx.db.query("verseImages").collect()).toHaveLength(0);
      expect(await ctx.db.query("videoJobs").collect()).toHaveLength(0);
      expect(await ctx.db.query("nostrPublishingState").collect()).toHaveLength(0);
      expect(await ctx.db.query("referenceImages").collect()).toHaveLength(1);
      expect((await ctx.db.system.query("_storage").collect()).map(f => f._id)).toEqual([sheetFile]);
    });
  });

  it("waits while a video is still being made", async () => {
    const { t } = await library(1);
    await t.run(async ctx => {
      const job = await ctx.db.query("videoJobs").first();
      await ctx.db.patch(job!._id, { active: true, status: "processing" });
    });
    await expect(t.mutation(internal.libraryReset.resetLibraryPage, { confirm: CONFIRM_RESET })).rejects.toThrow("still running");
  });
});
