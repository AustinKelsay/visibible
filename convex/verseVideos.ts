import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { validateServerSecret } from "./_helpers/auth";
import { authenticatedGuest } from "./guestAuth";
import {
  reserveCreditsInTransaction,
  releaseReservationInTransaction,
  deductCreditsInTransaction,
  summarizeGenerationSettlement,
} from "./sessions";
import {
  VIDEO_MODEL_ID,
  videoCreditsForCost,
  type VideoJobResponse,
} from "../src/lib/video-generation";

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
    ...(job.actualCredits !== undefined
      ? { actualCredits: job.actualCredits }
      : {}),
    ...(job.storageId && job.status === "completed"
      ? { videoUrl: await ctx.storage.getUrl(job.storageId) }
      : {}),
    ...(job.error ? { error: job.error } : {}),
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
    const { serverSecret: _secret, ...inputs } = args;
    void _secret;
    const id = await ctx.db.insert("videoJobs", {
      ...inputs,
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
      .take(limit);
    return Promise.all(jobs.map((job) => response(ctx, job)));
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
