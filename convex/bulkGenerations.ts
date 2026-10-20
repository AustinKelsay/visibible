import { authenticatedGuest, requireGuestOwner } from "./guestAuth";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { validateServerSecret } from "./_helpers/auth";

const engineValidator = v.union(v.literal("legacy"), v.literal("generic"));
export const DEFAULT_BULK_ART_STYLE = "classical";
/** The request id every item is submitted under; stable across resume so the route replays instead of repeating. */
export function bulkItemRequestId(bulkId: Id<"bulkGenerations">, order: number) {
  return `bulk-${bulkId}-${order}`;
}

const bulkGenerationVerseStatusValidator = v.union(
  v.literal("queued"),
  v.literal("generating"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("skipped")
);

const bulkGenerationScopeTypeValidator = v.union(
  v.literal("verses"),
  v.literal("chapters"),
  v.literal("book")
);

const BULK_VERSE_STATUS_ORDER = {
  queued: 0,
  generating: 1,
  completed: 2,
  failed: 2,
  skipped: 2,
} as const;

const BULK_VERSE_INSERT_CHUNK_SIZE = 300;
const DEFAULT_BULK_VERSE_QUERY_LIMIT = 100;
const BULK_GENERATION_AUTH_ERROR = "Unauthorized bulk generation access.";

type BulkGenerationCtx = QueryCtx | MutationCtx;

async function requireValidBulkSession(ctx: BulkGenerationCtx, sid: string) {
  return requireGuestOwner(ctx, sid);
}

async function requireOwnedBulkGeneration(
  ctx: BulkGenerationCtx,
  sid: string,
  bulkGenerationId: Id<"bulkGenerations">
) {
  await requireValidBulkSession(ctx, sid);

  const bulkGeneration = await ctx.db.get(bulkGenerationId);
  if (!bulkGeneration || bulkGeneration.sid !== sid) {
    throw new Error(BULK_GENERATION_AUTH_ERROR);
  }

  return bulkGeneration;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a new bulk generation job with all its verse entries.
 */
export const create = mutation({
  args: {
    sid: v.string(),
    scopeType: bulkGenerationScopeTypeValidator,
    scopeLabel: v.string(),
    startVerseId: v.string(),
    estimatedTotalCredits: v.number(),
    modelId: v.string(),
    aspectRatio: v.string(),
    resolution: v.string(),
    translation: v.string(),
    /** The art style every item is generated in; Classical when the reader has not chosen one. */
    artStyleId: v.optional(v.string()),
    verses: v.array(
      v.object({
        verseId: v.string(),
        reference: v.string(),
        order: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireValidBulkSession(ctx, args.sid);
    const artStyleId = args.artStyleId ?? DEFAULT_BULK_ART_STYLE;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(artStyleId)) throw new Error("Invalid art style id");

    const now = Date.now();
    const active = await ctx.db
      .query("bulkGenerations")
      .withIndex("by_sid_status", (q) =>
        q.eq("sid", args.sid).eq("status", "active")
      )
      .first();
    if (active) {
      return {
        bulkId: active._id,
        created: false,
        status: active.status,
        totalVerses: active.totalVerses,
        completedCount: active.completedCount,
        failedCount: active.failedCount,
        skippedCount: active.skippedCount,
        totalCreditsUsed: active.totalCreditsUsed,
      };
    }

    const paused = await ctx.db
      .query("bulkGenerations")
      .withIndex("by_sid_status", (q) =>
        q.eq("sid", args.sid).eq("status", "paused")
      )
      .first();
    if (paused) {
      return {
        bulkId: paused._id,
        created: false,
        status: paused.status,
        totalVerses: paused.totalVerses,
        completedCount: paused.completedCount,
        failedCount: paused.failedCount,
        skippedCount: paused.skippedCount,
        totalCreditsUsed: paused.totalCreditsUsed,
      };
    }

    const bulkId = await ctx.db.insert("bulkGenerations", {
      sid: args.sid,
      status: "active",
      scopeType: args.scopeType,
      scopeLabel: args.scopeLabel,
      startVerseId: args.startVerseId,
      totalVerses: args.verses.length,
      completedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalCreditsUsed: 0,
      estimatedTotalCredits: args.estimatedTotalCredits,
      modelId: args.modelId,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      translation: args.translation,
      artStyleId,
      createdAt: now,
      updatedAt: now,
    });

    for (let start = 0; start < args.verses.length; start += BULK_VERSE_INSERT_CHUNK_SIZE) {
      const chunk = args.verses.slice(start, start + BULK_VERSE_INSERT_CHUNK_SIZE);
      await Promise.all(
        chunk.map((verse) =>
          ctx.db.insert("bulkGenerationVerses", {
            bulkGenerationId: bulkId,
            verseId: verse.verseId,
            reference: verse.reference,
            order: verse.order,
            status: "queued",
            updatedAt: now,
          })
        )
      );
    }

    return {
      bulkId,
      created: true,
      status: "active" as const,
      totalVerses: args.verses.length,
      completedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalCreditsUsed: 0,
    };
  },
});

/**
 * Get the active (or paused) bulk generation for a session.
 */
export const getActive = query({
  args: { sid: v.string() },
  handler: async (ctx, args) => {
    if ((await authenticatedGuest(ctx))?.sid !== args.sid) return null;

    // Check for active first
    const active = await ctx.db
      .query("bulkGenerations")
      .withIndex("by_sid_status", (q) =>
        q.eq("sid", args.sid).eq("status", "active")
      )
      .first();
    if (active) return active;

    // Check for paused
    const paused = await ctx.db
      .query("bulkGenerations")
      .withIndex("by_sid_status", (q) =>
        q.eq("sid", args.sid).eq("status", "paused")
      )
      .first();
    return paused ?? null;
  },
});

/**
 * Get a bulk generation by ID.
 */
export const get = query({
  args: {
    id: v.id("bulkGenerations"),
    sid: v.string(),
  },
  handler: async (ctx, args) => {
    if ((await authenticatedGuest(ctx))?.sid !== args.sid) return null;
    const job = await ctx.db.get(args.id);
    return job?.sid === args.sid ? job : null;
  },
});

/**
 * Get all verse entries for a bulk generation, ordered by position.
 */
export const getVerses = query({
  args: {
    sid: v.string(),
    bulkGenerationId: v.id("bulkGenerations"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if ((await authenticatedGuest(ctx))?.sid !== args.sid) return [];
    if ((await ctx.db.get(args.bulkGenerationId))?.sid !== args.sid) return [];

    const verseQuery = ctx.db
      .query("bulkGenerationVerses")
      .withIndex("by_bulk_order", (q) =>
        q.eq("bulkGenerationId", args.bulkGenerationId)
      );
    const safeLimit =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.min(DEFAULT_BULK_VERSE_QUERY_LIMIT, Math.max(1, Math.floor(args.limit)))
        : DEFAULT_BULK_VERSE_QUERY_LIMIT;
    const safeOffset =
      typeof args.offset === "number" && Number.isFinite(args.offset)
        ? Math.max(0, Math.floor(args.offset))
        : 0;

    if (safeOffset === 0) {
      return await verseQuery.take(safeLimit);
    }
    if (safeOffset > 0) {
      let cursor: string | null = null;
      let remainingOffset = safeOffset;

      while (remainingOffset > 0) {
        const page = await ctx.db
          .query("bulkGenerationVerses")
          .withIndex("by_bulk_order", (q) =>
            q.eq("bulkGenerationId", args.bulkGenerationId)
          )
          .paginate({
            cursor,
            numItems: Math.min(remainingOffset, DEFAULT_BULK_VERSE_QUERY_LIMIT),
          });

        remainingOffset -= page.page.length;
        cursor = page.continueCursor;

        if (page.isDone) {
          return [];
        }
      }

      return (
        await ctx.db
          .query("bulkGenerationVerses")
          .withIndex("by_bulk_order", (q) =>
            q.eq("bulkGenerationId", args.bulkGenerationId)
          )
          .paginate({
            cursor,
            numItems: safeLimit,
          })
      ).page;
    }
    return await verseQuery.take(safeLimit);
  },
});

/**
 * Update a single verse entry's status.
 */
export const updateVerseStatus = mutation({
  args: {
    sid: v.string(),
    bulkGenerationId: v.id("bulkGenerations"),
    verseId: v.string(),
    status: bulkGenerationVerseStatusValidator,
    expectedCurrentStatus: v.optional(bulkGenerationVerseStatusValidator),
    creditsCost: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bulkGeneration = await requireOwnedBulkGeneration(
      ctx,
      args.sid,
      args.bulkGenerationId
    );
    const verse = await ctx.db
      .query("bulkGenerationVerses")
      .withIndex("by_bulk_verse", (q) =>
        q.eq("bulkGenerationId", args.bulkGenerationId).eq("verseId", args.verseId)
      )
      .unique();
    if (!verse) return { updated: false };
    if (
      args.expectedCurrentStatus !== undefined &&
      verse.status !== args.expectedCurrentStatus
    ) {
      return { updated: false };
    }
    if (
      verse.status === "queued" &&
      args.status === "generating" &&
      (bulkGeneration.status === "paused" || bulkGeneration.status === "cancelled")
    ) {
      return { updated: false };
    }

    const isSameStatus = verse.status === args.status;
    const isRequeueTransition =
      verse.status === "generating" && args.status === "queued";
    const isForwardTransition =
      BULK_VERSE_STATUS_ORDER[args.status] >= BULK_VERSE_STATUS_ORDER[verse.status];
    const isTerminalStatus =
      verse.status === "completed" ||
      verse.status === "failed" ||
      verse.status === "skipped";
    const canTransition =
      isSameStatus ||
      isRequeueTransition ||
      (!isTerminalStatus && isForwardTransition);
    if (!canTransition) {
      return { updated: false };
    }

    const patch: {
      status?: typeof args.status;
      creditsCost?: number;
      error?: string;
      updatedAt?: number;
    } = {};

    patch.status = args.status;
    patch.updatedAt = Date.now();
    if (args.creditsCost !== undefined) {
      patch.creditsCost = args.creditsCost;
    }
    if (args.error !== undefined) {
      patch.error = args.error;
    }

    if (Object.keys(patch).length === 0) return { updated: false };
    await ctx.db.patch(verse._id, patch);
    return { updated: true };
  },
});

/**
 * Update the progress counters on the parent bulk generation.
 */
export const updateProgress = mutation({
  args: {
    sid: v.string(),
    id: v.id("bulkGenerations"),
    completedCount: v.number(),
    failedCount: v.number(),
    skippedCount: v.number(),
    totalCreditsUsed: v.number(),
  },
  handler: async (ctx, args) => {
    const bulk = await requireOwnedBulkGeneration(ctx, args.sid, args.id);

    const completedCount = Math.max(bulk.completedCount, args.completedCount);
    const failedCount = Math.max(bulk.failedCount, args.failedCount);
    const skippedCount = Math.max(bulk.skippedCount, args.skippedCount);
    const totalCreditsUsed = Math.max(bulk.totalCreditsUsed, args.totalCreditsUsed);

    const isComplete =
      completedCount + failedCount + skippedCount >= bulk.totalVerses;

    const shouldComplete =
      isComplete &&
      bulk.status !== "cancelled" &&
      bulk.status !== "completed";

    await ctx.db.patch(args.id, {
      completedCount,
      failedCount,
      skippedCount,
      totalCreditsUsed,
      updatedAt: Date.now(),
      ...(shouldComplete
        ? { status: "completed", completedAt: Date.now() }
        : {}),
    });
  },
});

/**
 * Pause a running bulk generation.
 */
export const pause = mutation({
  args: {
    id: v.id("bulkGenerations"),
    sid: v.string(),
    /** Why the coordinator paused it, shown to the reader: e.g. engine_unavailable, style_unavailable, credits, rate_limited. */
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bulk = await requireOwnedBulkGeneration(ctx, args.sid, args.id);
    if (bulk.status !== "active") return { updated: false };

    await ctx.db.patch(args.id, {
      status: "paused",
      pausedReason: args.reason,
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

/**
 * Resume a paused bulk generation.
 */
export const resume = mutation({
  args: {
    id: v.id("bulkGenerations"),
    sid: v.string(),
  },
  handler: async (ctx, args) => {
    const bulk = await requireOwnedBulkGeneration(ctx, args.sid, args.id);
    if (bulk.status !== "paused") return { updated: false };

    await ctx.db.patch(args.id, {
      status: "active",
      pausedReason: undefined,
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

/**
 * Cancel a bulk generation (active or paused).
 */
export const cancel = mutation({
  args: {
    id: v.id("bulkGenerations"),
    sid: v.string(),
  },
  handler: async (ctx, args) => {
    const bulk = await requireOwnedBulkGeneration(ctx, args.sid, args.id);
    if (bulk.status !== "active" && bulk.status !== "paused") {
      return { updated: false };
    }

    await ctx.db.patch(args.id, {
      status: "cancelled",
      updatedAt: Date.now(),
      completedAt: Date.now(),
    });
    return { updated: true };
  },
});

// ---------------------------------------------------------------------------
// Engine binding and recovery (#178)
// ---------------------------------------------------------------------------

/**
 * Bind the job to the engine its first admitted item was accepted with. Later items are submitted
 * with that engine as their expected binding, so a switched rollout can never reinterpret the job.
 */
export const bindEngine = mutation({
  args: { sid: v.string(), id: v.id("bulkGenerations"), engine: engineValidator },
  handler: async (ctx, args) => {
    const bulk = await requireOwnedBulkGeneration(ctx, args.sid, args.id);
    if (bulk.engine === args.engine) return { bound: true, changed: false };
    if (bulk.engine) throw new Error(`Bulk job is bound to the ${bulk.engine} engine; an item accepted on ${args.engine} cannot belong to it`);
    await ctx.db.patch(args.id, { engine: args.engine, updatedAt: Date.now() });
    return { bound: true, changed: true };
  },
});

type RequestState = "unstarted" | "accepted" | "succeeded" | "failed";

/** What the authoritative request record says about one item; absent means nothing was ever admitted. */
async function requestStateFor(ctx: BulkGenerationCtx, bulk: Doc<"bulkGenerations">, order: number) {
  const request = await ctx.db.query("imageGenerationRequests").withIndex("by_requestId", (q) => q.eq("requestId", bulkItemRequestId(bulk._id, order))).first();
  if (!request || request.sid !== bulk.sid) return { state: "unstarted" as RequestState, request: null };
  if (request.status === "succeeded") return { state: "succeeded" as RequestState, request };
  if (request.status === "failed") return { state: "failed" as RequestState, request };
  return { state: "accepted" as RequestState, request };
}

/**
 * After a browser interruption: settle items left "generating" from their request records. A
 * succeeded request completes the item with its charged credits, a failed one fails it, an
 * accepted-but-unfinished or never-admitted one goes back to the queue, where the stable request
 * id makes the next submission a replay rather than a second paid attempt.
 */
export const reconcileInterrupted = mutation({
  args: { sid: v.string(), id: v.id("bulkGenerations") },
  handler: async (ctx, args) => {
    const bulk = await requireOwnedBulkGeneration(ctx, args.sid, args.id);
    const generating = await ctx.db.query("bulkGenerationVerses").withIndex("by_bulk_status", (q) => q.eq("bulkGenerationId", args.id).eq("status", "generating")).collect();
    const counts = { completed: 0, failed: 0, requeued: 0 };
    let completedDelta = 0, failedDelta = 0, creditsDelta = 0;
    let boundEngine = bulk.engine;
    const now = Date.now();
    for (const item of generating) {
      const { state, request } = await requestStateFor(ctx, bulk, item.order);
      if (state === "succeeded") {
        // The browser may have gone before it could bind the job: the accepted request's engine binds it now.
        if (!boundEngine) {
          boundEngine = request?.engine ?? "legacy";
          await ctx.db.patch(args.id, { engine: boundEngine, updatedAt: now });
        }
        const creditsCost = request?.actualCreditsCost ?? 0;
        await ctx.db.patch(item._id, { status: "completed", creditsCost, updatedAt: now });
        counts.completed++; completedDelta++; creditsDelta += creditsCost;
      } else if (state === "failed") {
        await ctx.db.patch(item._id, { status: "failed", error: request?.error ?? "Failed before the browser returned", updatedAt: now });
        counts.failed++; failedDelta++;
      } else {
        await ctx.db.patch(item._id, { status: "queued", updatedAt: now });
        counts.requeued++;
      }
    }
    if (completedDelta || failedDelta) {
      const completedCount = bulk.completedCount + completedDelta;
      const failedCount = bulk.failedCount + failedDelta;
      const isComplete = completedCount + failedCount + bulk.skippedCount >= bulk.totalVerses && bulk.status !== "cancelled";
      await ctx.db.patch(args.id, { completedCount, failedCount, totalCreditsUsed: bulk.totalCreditsUsed + creditsDelta, updatedAt: now, ...(isComplete ? { status: "completed", completedAt: now } : {}) });
    }
    return counts;
  },
});

/**
 * Before public activation: bind every job without an engine to legacy and Classical. Idempotent;
 * accepted items keep their own request records and are never reinterpreted.
 */
export const bindLegacyJobs = mutation({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const jobs = await ctx.db.query("bulkGenerations").collect();
    let bound = 0;
    for (const job of jobs) {
      if (job.engine && job.artStyleId) continue;
      await ctx.db.patch(job._id, { engine: job.engine ?? "legacy", artStyleId: job.artStyleId ?? DEFAULT_BULK_ART_STYLE, updatedAt: Date.now() });
      bound++;
    }
    return { jobs: jobs.length, bound };
  },
});

/**
 * Release and retirement counts over every active or paused job: items never admitted (unstarted),
 * items with an accepted request that has not ended (accepted, never counted as unstarted), and
 * settled items, per engine. Generic jobs that are paused because the engine is unavailable are
 * reported so rollback can confirm nothing of theirs is still starting.
 */
export const countItems = query({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const empty = () => ({ jobs: 0, unstarted: 0, accepted: 0, succeeded: 0, failed: 0 });
    const byEngine: Record<string, ReturnType<typeof empty>> = { legacy: empty(), generic: empty(), unbound: empty() };
    let pausedForEngine = 0;
    for (const status of ["active", "paused"] as const) {
      const jobs = await ctx.db.query("bulkGenerations").withIndex("by_status", (q) => q.eq("status", status)).collect();
      for (const job of jobs) {
        const bucket = byEngine[job.engine ?? "unbound"];
        bucket.jobs++;
        if (job.pausedReason === "engine_unavailable") pausedForEngine++;
        for (const itemStatus of ["queued", "generating"] as const) {
          const items = await ctx.db.query("bulkGenerationVerses").withIndex("by_bulk_status", (q) => q.eq("bulkGenerationId", job._id).eq("status", itemStatus)).collect();
          for (const item of items) {
            const { state } = await requestStateFor(ctx, job, item.order);
            bucket[state]++;
          }
        }
      }
    }
    return { byEngine, pausedForEngine };
  },
});
