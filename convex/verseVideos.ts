import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { validateServerSecret } from "./_helpers/auth";
import { authenticatedGuest } from "./guestAuth";
import {
  reserveCreditsInTransaction,
  releaseReservationInTransaction,
  deductCreditsInTransaction,
  summarizeGenerationSettlement,
} from "./sessions";
import { artStyleOf, getPublicImageUrl } from "./verseImages";
import {
  VIDEO_MODEL_ID,
  isVideoFrame,
  videoCreditsForCost,
  type VideoJobResponse,
} from "../src/lib/video-generation";
import { PUBLIC_GENERIC_STYLE_IDS } from "../src/lib/engine/admission";

const LEASE_MS = 3 * 60_000;
const MAX_AGE_MS = 45 * 60_000;
const idArgs = { id: v.id("videoJobs"), lease: v.number() };

async function response(
  ctx: QueryCtx,
  job: Doc<"videoJobs">,
): Promise<VideoJobResponse> {
  return {
    id: job._id,
    requestId: job.requestId,
    verseId: job.verseId,
    reference: job.reference,
    status: job.status,
    duration: job.duration,
    resolution: job.resolution,
    createdAt: job.createdAt,
    estimatedCredits: job.estimatedCredits,
    ...(job.sourceImageId
      ? { sourceImageId: job.sourceImageId, artStyle: job.sourceArtStyle ?? artStyleOf({}) }
      : {}),
    ...(job.actualCredits !== undefined
      ? { actualCredits: job.actualCredits }
      : {}),
    ...(job.storageId && job.status === "completed"
      ? { videoUrl: await ctx.storage.getUrl(job.storageId) }
      : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

/**
 * The picture a video may start from (#479): a saved picture of the verse, in a style the session may see (owner-only
 * styles for admins only), and 16:9, the video's frame. Throws a coded error otherwise. A picture the reader may not
 * see reads as missing, so a refusal says nothing about it.
 */
async function videoSourceFor(
  ctx: QueryCtx,
  args: { imageId: string; verseId: string; admin: boolean },
): Promise<Doc<"verseImages">> {
  const id = ctx.db.normalizeId("verseImages", args.imageId);
  const image = id ? await ctx.db.get(id) : null;
  if (
    !image ||
    image.verseId !== args.verseId ||
    !(args.admin || PUBLIC_GENERIC_STYLE_IDS.includes(artStyleOf(image)))
  )
    throw new ConvexError({
      code: "PICTURE_UNAVAILABLE",
      message: "Choose a picture of this verse to start the video from.",
    });
  if (!isVideoFrame(image))
    throw new ConvexError({
      code: "PICTURE_SHAPE",
      message: "Only a widescreen (16:9) picture can start a video.",
    });
  return image;
}

async function isAdminSid(ctx: QueryCtx, sid: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_sid", (q) => q.eq("sid", sid))
    .unique();
  return session?.tier === "admin" && session.revokedAt === undefined;
}

/** The route's check of the requested picture, before any price is quoted or credits held (#479). Server-only. */
export const checkVideoSource = query({
  args: {
    serverSecret: v.string(),
    sid: v.string(),
    verseId: v.string(),
    imageId: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const image = await videoSourceFor(ctx, {
      ...args,
      admin: await isAdminSid(ctx, args.sid),
    });
    return { imageId: image._id, artStyle: artStyleOf(image) };
  },
});

/** Whether the caller may see videos of a style: public styles for everyone, owner-only styles for an admin. */
async function styleVisibility(ctx: QueryCtx) {
  let isAdmin: boolean | undefined;
  return async (style: string | undefined) => {
    if (style === undefined) return false;
    if (PUBLIC_GENERIC_STYLE_IDS.includes(style)) return true;
    isAdmin ??= (await authenticatedGuest(ctx))?.tier === "admin";
    return isAdmin;
  };
}

export const findRequest = query({
  args: {
    serverSecret: v.string(),
    sid: v.string(),
    requestId: v.string(),
    inputFingerprint: v.string(),
  },
  handler: async (ctx, args): Promise<VideoJobResponse | null> => {
    validateServerSecret(args.serverSecret);
    const job = await ctx.db
      .query("videoJobs")
      .withIndex("by_request", (q) =>
        q.eq("sid", args.sid).eq("requestId", args.requestId),
      )
      .unique();
    if (job && job.inputFingerprint !== args.inputFingerprint)
      throw new ConvexError({
        code: "REQUEST_CONFLICT",
        message: "This request ID was used for different video settings.",
      });
    return job ? response(ctx, job) : null;
  },
});

export const enqueue = mutation({
  args: {
    serverSecret: v.string(),
    sid: v.string(),
    requestId: v.string(),
    verseId: v.string(),
    reference: v.string(),
    translation: v.string(),
    prompt: v.string(),
    sourceImageId: v.string(),
    duration: v.union(v.literal(5), v.literal(10)),
    resolution: v.union(v.literal("480p"), v.literal("768p")),
    estimatedCostUsd: v.number(),
    estimatedCredits: v.number(),
    inputFingerprint: v.string(),
  },
  handler: async (ctx, args): Promise<VideoJobResponse> => {
    validateServerSecret(args.serverSecret);
    const existing = await ctx.db
      .query("videoJobs")
      .withIndex("by_request", (q) =>
        q.eq("sid", args.sid).eq("requestId", args.requestId),
      )
      .unique();
    if (existing) {
      if (existing.inputFingerprint !== args.inputFingerprint)
        throw new ConvexError({
          code: "REQUEST_CONFLICT",
          message: "This request ID was used for different video settings.",
        });
      return response(ctx, existing);
    }
    if (
      !args.requestId ||
      !args.inputFingerprint ||
      !args.prompt.trim() ||
      args.prompt.length > 20000 ||
      !Number.isFinite(args.estimatedCostUsd) ||
      args.estimatedCostUsd <= 0 ||
      !Number.isSafeInteger(args.estimatedCredits) ||
      args.estimatedCredits !== videoCreditsForCost(args.estimatedCostUsd)
    ) {
      throw new ConvexError({
        code: "INVALID_REQUEST",
        message: "Invalid video request.",
      });
    }
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .unique();
    if (
      !session ||
      session.revokedAt !== undefined ||
      (session.expiresAt !== undefined && session.expiresAt <= Date.now())
    )
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Session expired.",
      });
    // The picture is checked again here, in the same transaction that holds credits, and its style copied.
    const source = await videoSourceFor(ctx, {
      imageId: args.sourceImageId,
      verseId: args.verseId,
      admin: session.tier === "admin",
    });
    const active = await ctx.db
      .query("videoJobs")
      .withIndex("by_sid_active", (q) =>
        q.eq("sid", args.sid).eq("active", true),
      )
      .first();
    if (active)
      throw new ConvexError({
        code: "VIDEO_ACTIVE",
        message: "A video is already generating. Wait for it to finish.",
      });
    const now = Date.now();
    const generationId = `video:${args.sid}:${args.requestId}`;
    const admin = session.tier === "admin";
    if (admin) {
      await ctx.db.insert("adminAuditLog", {
        sid: args.sid,
        endpoint: "generate-video",
        modelId: VIDEO_MODEL_ID,
        estimatedCredits: args.estimatedCredits,
        estimatedCostUsd: args.estimatedCostUsd,
        createdAt: now,
      });
    } else {
      const hold = await reserveCreditsInTransaction(ctx, {
        sid: args.sid,
        amount: args.estimatedCredits,
        costUsd: args.estimatedCostUsd,
        modelId: VIDEO_MODEL_ID,
        generationId,
      });
      if (!hold.success)
        throw new ConvexError({
          code:
            hold.error === "Insufficient credits"
              ? "INSUFFICIENT_CREDITS"
              : "SPEND_LIMIT",
          message: hold.error ?? "Unable to reserve credits.",
        });
    }
    const { serverSecret: _secret, sourceImageId: _source, ...inputs } = args;
    void _secret;
    void _source;
    const id = await ctx.db.insert("videoJobs", {
      ...inputs,
      sourceImageId: source._id,
      sourceArtStyle: artStyleOf(source),
      generationId,
      admin,
      active: true,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      nextRunAt: now,
      lease: 0,
      leaseUntil: 0,
      attempts: 0,
    });
    await ctx.scheduler.runAfter(0, internal.videoWorker.process, { id });
    return response(ctx, (await ctx.db.get(id))!);
  },
});

export const getMyJobs = query({
  args: { verseId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<VideoJobResponse[]> => {
    const session = await authenticatedGuest(ctx);
    if (!session) return [];
    const jobs =
      args.verseId !== undefined
        ? await ctx.db
            .query("videoJobs")
            .withIndex("by_sid_verse", (q) =>
              q.eq("sid", session.sid).eq("verseId", args.verseId!),
            )
            .order("desc")
            .take(30)
        : await ctx.db
            .query("videoJobs")
            .withIndex("by_sid_createdAt", (q) => q.eq("sid", session.sid))
            .order("desc")
            .take(30);
    if (args.verseId === undefined) {
      const active = await ctx.db
        .query("videoJobs")
        .withIndex("by_sid_active", (q) =>
          q.eq("sid", session.sid).eq("active", true),
        )
        .first();
      if (active && !jobs.some((job) => job._id === active._id))
        jobs.unshift(active);
    }
    return Promise.all(jobs.map((job) => response(ctx, job)));
  },
});
/**
 * A verse's finished videos, newest first, each with the picture it belongs to (#479): the picture menu badges those
 * pictures. Videos without a source picture, and videos of a style the caller may not see, are never returned.
 */
export const getHistory = query({
  args: { verseId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<VideoJobResponse[]> => {
    const limit = Math.min(50, Math.max(1, Math.floor(args.limit ?? 20)));
    const jobs = await ctx.db
      .query("videoJobs")
      .withIndex("by_verse_status", (q) =>
        q.eq("verseId", args.verseId).eq("status", "completed"),
      )
      .order("desc")
      .filter((q) => q.neq(q.field("sourceImageId"), undefined))
      .take(limit);
    const visible = await styleVisibility(ctx);
    const shown = await Promise.all(jobs.map((job) => visible(job.sourceArtStyle)));
    return Promise.all(
      jobs.filter((_, index) => shown[index]).map((job) => response(ctx, job)),
    );
  },
});

/** The newest finished video of one saved picture (#479), or null; the spread's Play shows for it. */
export async function newestPictureVideo(ctx: QueryCtx, imageId: Id<"verseImages">) {
  return ctx.db
    .query("videoJobs")
    .withIndex("by_source_status", (q) =>
      q.eq("sourceImageId", imageId).eq("status", "completed"),
    )
    .order("desc")
    .first();
}

export const getPictureVideo = query({
  args: { imageId: v.string() },
  handler: async (ctx, args): Promise<VideoJobResponse | null> => {
    const id = ctx.db.normalizeId("verseImages", args.imageId);
    const job = id ? await newestPictureVideo(ctx, id) : null;
    if (!job || !(await (await styleVisibility(ctx))(job.sourceArtStyle)))
      return null;
    return response(ctx, job);
  },
});

/** The first frame the provider is sent: the source picture's public address, or null when the picture is gone. */
export const firstFrameUrl = internalQuery({
  args: { id: v.id("videoJobs") },
  handler: async (ctx, args): Promise<string | null> => {
    const job = await ctx.db.get(args.id);
    const image = job?.sourceImageId ? await ctx.db.get(job.sourceImageId) : null;
    if (!image) return null;
    try {
      return getPublicImageUrl(image);
    } catch {
      return null;
    }
  },
});

// A committed submitting intent is never submitted twice, even after worker death.
export const claim = internalMutation({
  args: { id: v.id("videoJobs") },
  handler: async (ctx, args): Promise<Doc<"videoJobs"> | null> => {
    const job = await ctx.db.get(args.id);
    const now = Date.now();
    if (!job?.active || job.leaseUntil > now || job.nextRunAt > now)
      return null;
    if (job.status === "submitting" || now - job.createdAt > MAX_AGE_MS) {
      if (!job.admin) await releaseReservationInTransaction(ctx, job);
      await ctx.db.patch(job._id, {
        active: false,
        status: "failed",
        error:
          job.status === "submitting"
            ? "Video submission could not be confirmed. Credits were returned; contact support before retrying."
            : "Video generation timed out. Credits were returned.",
        failureKind:
          job.status === "submitting" ? "ambiguous_submission" : "timeout",
        updatedAt: now,
        leaseUntil: 0,
      });
      return null;
    }
    const patch = {
      lease: job.lease + 1,
      leaseUntil: now + LEASE_MS,
      nextRunAt: now + LEASE_MS,
      updatedAt: now,
      status: job.status === "queued" ? ("submitting" as const) : job.status,
    };
    await ctx.db.patch(job._id, patch);
    return { ...job, ...patch };
  },
});

export const advance = internalMutation({
  args: {
    ...idArgs,
    providerId: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    ready: v.boolean(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job?.active || job.lease !== args.lease) return false;
    const now = Date.now();
    const nextRunAt = now + (args.ready ? 0 : 10_000);
    await ctx.db.patch(job._id, {
      status: args.ready ? "storing" : "processing",
      ...(args.providerId ? { providerId: args.providerId } : {}),
      ...(args.costUsd !== undefined &&
      Number.isFinite(args.costUsd) &&
      args.costUsd >= 0
        ? { actualCostUsd: args.costUsd }
        : {}),
      updatedAt: now,
      nextRunAt,
      leaseUntil: 0,
      attempts: 0,
    });
    await ctx.scheduler.runAfter(
      nextRunAt - now,
      internal.videoWorker.process,
      { id: job._id },
    );
    return true;
  },
});

export const finish = internalMutation({
  args: { ...idArgs, storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job?.active || job.lease !== args.lease || job.status !== "storing") {
      // An expired worker may have downloaded after a newer worker completed.
      if (job?.storageId !== args.storageId)
        await ctx.storage.delete(args.storageId);
      return false;
    }
    const actualCostUsd = job.actualCostUsd ?? job.estimatedCostUsd;
    const actualCredits = Math.min(
      job.estimatedCredits,
      videoCreditsForCost(actualCostUsd),
    );
    if (!job.admin) {
      const entries = await ctx.db
        .query("creditLedger")
        .withIndex("by_generationId", (q) =>
          q.eq("generationId", job.generationId).eq("sid", job.sid),
        )
        .collect();
      if (summarizeGenerationSettlement(entries).state !== "reserved")
        throw new Error("Video reservation is no longer available");
      const settled = await deductCreditsInTransaction(ctx, {
        sid: job.sid,
        generationId: job.generationId,
        modelId: VIDEO_MODEL_ID,
        amount: job.estimatedCredits,
        costUsd: job.estimatedCostUsd,
        actualAmount: actualCredits,
        actualCostUsd,
      });
      if (!settled.success) throw new Error("Video settlement failed");
    }
    await ctx.db.patch(job._id, {
      status: "completed",
      active: false,
      storageId: args.storageId,
      actualCostUsd,
      actualCredits: job.admin ? 0 : actualCredits,
      absorbedCostUsd: Math.max(0, actualCostUsd - job.estimatedCostUsd),
      updatedAt: Date.now(),
      leaseUntil: 0,
    });
    return true;
  },
});

export const retryOrFail = internalMutation({
  args: {
    ...idArgs,
    terminal: v.boolean(),
    failureKind: v.string(),
    stage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (
      !job?.active ||
      job.lease !== args.lease ||
      (args.stage !== undefined && job.status !== args.stage)
    )
      return;
    const now = Date.now();
    if (
      args.terminal ||
      job.attempts >= 8 ||
      now - job.createdAt > MAX_AGE_MS ||
      job.status === "submitting"
    ) {
      if (!job.admin) await releaseReservationInTransaction(ctx, job);
      await ctx.db.patch(job._id, {
        status: "failed",
        active: false,
        failureKind: args.failureKind,
        error:
          args.failureKind === "ambiguous_submission"
            ? "Video submission could not be confirmed. Credits were returned; contact support before retrying."
            : "Video generation failed. Credits were returned.",
        updatedAt: now,
        leaseUntil: 0,
      });
      return;
    }
    const delay = Math.min(120_000, 5000 * 2 ** job.attempts);
    await ctx.db.patch(job._id, {
      attempts: job.attempts + 1,
      leaseUntil: 0,
      nextRunAt: now + delay,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(delay, internal.videoWorker.process, {
      id: job._id,
    });
  },
});

export const recover = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const jobs = await ctx.db
      .query("videoJobs")
      .withIndex("by_active_nextRun", (q) =>
        q.eq("active", true).lte("nextRunAt", now),
      )
      .take(50);
    for (const job of jobs) {
      if (job.leaseUntil <= now) {
        // Move to the tail so a failed recovery cannot starve later jobs.
        await ctx.db.patch(job._id, { nextRunAt: now });
        await ctx.scheduler.runAfter(0, internal.videoWorker.process, {
          id: job._id,
        });
      }
    }
    return jobs.length;
  },
});
