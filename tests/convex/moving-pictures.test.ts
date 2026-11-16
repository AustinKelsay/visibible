/**
 * Moving pictures (#478, #479): a video is made from one saved picture, which becomes its first frame, and belongs to
 * that picture, sharing its art style. These tests cover what the database accepts and what its reads return.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { modules } from "./modules";

const provider = vi.hoisted(() => ({ submitVideo: vi.fn(), pollVideo: vi.fn(), downloadVideo: vi.fn() }));
vi.mock("../../src/lib/video-provider", () => provider);

const ISSUER = "https://guest.example";
const provenance = (styleId: string) => ({
  workId: "bible-web", momentId: "m", sectionId: "s", eraId: "e", styleId, styleVersion: "sv", briefVersion: "bv",
  lookVersion: "lv", planVersion: "pv", promptVersion: "p", analysisGeneration: 1, canon: [], references: [], requestTranslationId: "web",
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.stubEnv("CONVEX_SERVER_SECRET", "server-only");
  vi.stubEnv("GUEST_AUTH_ISSUER", ISSUER);
  vi.stubEnv("CONVEX_SITE_URL", "https://actions.example.com");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

function setup({ admin = false } = {}) {
  const t = convexTest(schema, modules);
  let n = 0;
  let at = 1_000;
  const session = () => t.run((ctx) => ctx.db.insert("sessions", { sid: "viewer", tier: admin ? "admin" : "paid", credits: admin ? 0 : 500, createdAt: Date.now(), lastSeenAt: Date.now() }));
  /** Save a picture of a verse in a style; widescreen unless told otherwise. */
  const picture = async (verseId: string, style: string, shape: { aspectRatio?: string; imageWidth?: number; imageHeight?: number } = { aspectRatio: "16:9", imageWidth: 1376, imageHeight: 768 }) => {
    n += 1;
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([n, 1, 2])], { type: "image/jpeg" })));
    const id = await t.mutation(internal.verseImages.saveImageWithStorage, {
      verseId, storageId, model: "m", generationId: `g${n}`, ...shape,
      engine: "generic" as const, artStyleId: style, provenance: provenance(style),
    });
    await t.run(async (ctx) => { await ctx.db.patch(id, { createdAt: at++ }); });
    return id;
  };
  /** A video job in a given state, made from `source` (or from the verse text alone, as videos were before #479). */
  const video = async (verseId: string, source: Id<"verseImages"> | null, status: "completed" | "processing" | "failed" = "completed") => {
    n += 1;
    const image = source ? await t.run((ctx) => ctx.db.get(source)) : null;
    const storageId = status === "completed" ? await t.run((ctx) => ctx.storage.store(new Blob(["mp4"], { type: "video/mp4" }))) : undefined;
    return t.run((ctx) => ctx.db.insert("videoJobs", {
      sid: "maker", requestId: `v${n}`, inputFingerprint: `f${n}`, generationId: `video:maker:v${n}`, verseId,
      reference: verseId, translation: "web", prompt: "p", duration: 5, resolution: "768p", status,
      active: status === "processing", admin: false, estimatedCostUsd: 0.4, estimatedCredits: 50,
      ...(image ? { sourceImageId: image._id, sourceArtStyle: image.artStyleId ?? "classical" } : {}),
      ...(storageId ? { storageId } : {}), createdAt: at++, updatedAt: at, nextRunAt: at, lease: 0, leaseUntil: 0, attempts: 0,
    }));
  };
  const asGuest = () => t.withIdentity({ subject: "viewer", issuer: ISSUER, guestExpiresAt: Date.now() / 1000 + 300 });
  return { t, session, picture, video, asGuest };
}

const request = (sourceImageId: string, overrides: Record<string, unknown> = {}) => ({
  serverSecret: "server-only", sid: "viewer", requestId: "request-1", verseId: "john-1-5",
  reference: "John 1:5", translation: "web", prompt: "Animate this painting", sourceImageId,
  duration: 5 as const, resolution: "768p" as const, estimatedCostUsd: 0.4, estimatedCredits: 50, inputFingerprint: "intent-1",
  ...overrides,
});

describe("accepting a moving picture", () => {
  it("records the source picture and copies its art style onto the job", async () => {
    const { t, session, picture } = setup();
    await session();
    const source = await picture("john-1-5", "storybook");
    const accepted = await t.mutation(api.verseVideos.enqueue, request(source));
    const stored = await t.run((ctx) => ctx.db.get(accepted.id as Id<"videoJobs">));
    expect(stored).toMatchObject({ sourceImageId: source, sourceArtStyle: "storybook" });
  });

  it("checks a picture before anything is quoted: it must exist, be of the verse, be visible and be widescreen", async () => {
    const { t, session, picture } = setup();
    await session();
    const check = (imageId: string, verseId = "john-1-5") =>
      t.query(api.verseVideos.checkVideoSource, { serverSecret: "server-only", sid: "viewer", verseId, imageId });

    const classical = await picture("john-1-5", "classical");
    expect(await check(classical)).toEqual({ imageId: classical, artStyle: "classical" });
    await expect(check(classical, "john-1-6")).rejects.toThrow(/picture of this verse/);
    await expect(check("not-an-id")).rejects.toThrow(/picture of this verse/);
    await expect(check(await picture("john-1-5", "icon"))).rejects.toThrow(/picture of this verse/);
    await expect(check(await picture("john-1-5", "classical", { aspectRatio: "3:2", imageWidth: 1248, imageHeight: 832 }))).rejects.toThrow(/widescreen/);
    // A picture with no recorded ratio counts by its size.
    const measured = await picture("john-1-5", "classical", { imageWidth: 1376, imageHeight: 768 });
    expect(await check(measured)).toEqual({ imageId: measured, artStyle: "classical" });
    await expect(check(await picture("john-1-5", "classical", {}))).rejects.toThrow(/widescreen/);
    await expect(t.query(api.verseVideos.checkVideoSource, { serverSecret: "wrong", sid: "viewer", verseId: "john-1-5", imageId: classical })).rejects.toThrow();
  });

  it("lets an admin animate a picture in an owner-only style", async () => {
    const { t, session, picture } = setup({ admin: true });
    await session();
    const icon = await picture("john-1-5", "icon");
    expect(await t.query(api.verseVideos.checkVideoSource, { serverSecret: "server-only", sid: "viewer", verseId: "john-1-5", imageId: icon })).toEqual({ imageId: icon, artStyle: "icon" });
  });

  it("refuses a picture it may not animate without holding credits", async () => {
    const { t, session, picture } = setup();
    const sessionId = await session();
    const other = await picture("john-1-6", "classical");
    await expect(t.mutation(api.verseVideos.enqueue, request(other))).rejects.toThrow(/picture of this verse/);
    await expect(t.mutation(api.verseVideos.enqueue, request(await picture("john-1-5", "icon")))).rejects.toThrow(/picture of this verse/);
    expect(await t.run((ctx) => ctx.db.query("videoJobs").collect())).toHaveLength(0);
    expect((await t.run((ctx) => ctx.db.get(sessionId)))?.credits).toBe(500);
  });

  it("sends the picture's public address to the provider as the first frame", async () => {
    const { t, session, picture } = setup();
    await session();
    const source = await picture("john-1-5", "watercolor");
    const accepted = await t.mutation(api.verseVideos.enqueue, request(source));
    provider.submitVideo.mockResolvedValue({ id: "provider-video", status: "processing" });
    await t.action(internal.videoWorker.process, { id: accepted.id as Id<"videoJobs"> });
    const image = await t.run((ctx) => ctx.db.get(source));
    expect(provider.submitVideo).toHaveBeenCalledWith({
      prompt: "Animate this painting", duration: 5, resolution: "768p",
      firstFrameUrl: `https://actions.example.com/image/${encodeURIComponent(image!.storageId!)}`,
    });
  });

  it("fails and refunds a job whose picture is gone before it is sent, without calling the provider", async () => {
    const { t, session, picture } = setup();
    const sessionId = await session();
    const source = await picture("john-1-5", "classical");
    const accepted = await t.mutation(api.verseVideos.enqueue, request(source));
    await t.run((ctx) => ctx.db.delete(source));
    await t.action(internal.videoWorker.process, { id: accepted.id as Id<"videoJobs"> });
    expect(provider.submitVideo).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.get(accepted.id as Id<"videoJobs">))).toMatchObject({ status: "failed", failureKind: "source_missing" });
    expect((await t.run((ctx) => ctx.db.get(sessionId)))?.credits).toBe(500);
  });
});

describe("reading a picture's video", () => {
  it("returns the picture's newest finished video, not one being made, failed, or of another picture", async () => {
    const { t, picture, video } = setup();
    const shown = await picture("john-1-5", "classical");
    const older = await picture("john-1-5", "classical");
    await video("john-1-5", shown);
    const newest = await video("john-1-5", shown);
    await video("john-1-5", shown, "processing");
    await video("john-1-5", shown, "failed");
    await video("john-1-5", older);

    const found = await t.query(api.verseVideos.getPictureVideo, { imageId: shown });
    expect(found).toMatchObject({ id: newest, status: "completed", sourceImageId: shown, artStyle: "classical" });
    expect(found?.videoUrl).toEqual(expect.any(String));
    expect(await t.query(api.verseVideos.getPictureVideo, { imageId: await picture("john-1-5", "classical") })).toBeNull();
    expect(await t.query(api.verseVideos.getPictureVideo, { imageId: "not-an-id" })).toBeNull();
  });

  it("never returns a video made without a source picture", async () => {
    const { t, picture, video } = setup();
    await picture("john-1-5", "classical");
    await video("john-1-5", null);
    expect(await t.query(api.verseVideos.getHistory, { verseId: "john-1-5" })).toEqual([]);
  });

  it("lists a verse's finished videos with the picture each belongs to", async () => {
    const { t, picture, video } = setup();
    const classical = await picture("john-1-5", "classical");
    const watercolor = await picture("john-1-5", "watercolor");
    await video("john-1-5", classical);
    await video("john-1-5", watercolor);
    await video("john-1-5", watercolor, "processing");
    const history = await t.query(api.verseVideos.getHistory, { verseId: "john-1-5" });
    expect(history.map((item) => [item.sourceImageId, item.artStyle])).toEqual([[watercolor, "watercolor"], [classical, "classical"]]);
  });

  it("hides a video of an owner-only style from visitors and shows it to an admin", async () => {
    const visitor = setup();
    await visitor.session();
    const icon = await visitor.picture("john-1-5", "icon");
    await visitor.video("john-1-5", icon);
    expect(await visitor.t.query(api.verseVideos.getPictureVideo, { imageId: icon })).toBeNull();
    expect(await visitor.asGuest().query(api.verseVideos.getPictureVideo, { imageId: icon })).toBeNull();
    expect(await visitor.t.query(api.verseVideos.getHistory, { verseId: "john-1-5" })).toEqual([]);

    const owner = setup({ admin: true });
    await owner.session();
    const ownerIcon = await owner.picture("john-1-5", "icon");
    await owner.video("john-1-5", ownerIcon);
    expect(await owner.asGuest().query(api.verseVideos.getPictureVideo, { imageId: ownerIcon })).toMatchObject({ artStyle: "icon" });
    expect(await owner.asGuest().query(api.verseVideos.getHistory, { verseId: "john-1-5" })).toHaveLength(1);
  });
});
