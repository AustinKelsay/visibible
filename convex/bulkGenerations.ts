import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

type BulkGenerationVerse = Doc<"bulkGenerationVerses">;

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
    verses: v.array(
      v.object({
        verseId: v.string(),
        reference: v.string(),
        order: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
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
  args: { id: v.id("bulkGenerations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get all verse entries for a bulk generation, ordered by position.
 */
export const getVerses = query({
  args: {
    bulkGenerationId: v.id("bulkGenerations"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const verseQuery = ctx.db
      .query("bulkGenerationVerses")
      .withIndex("by_bulk_order", (q) =>
        q.eq("bulkGenerationId", args.bulkGenerationId)
      );
    const safeLimit =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.max(1, Math.floor(args.limit))
        : undefined;
    const safeOffset =
      typeof args.offset === "number" && Number.isFinite(args.offset)
        ? Math.max(0, Math.floor(args.offset))
        : 0;

    if (safeOffset === 0 && safeLimit !== undefined) {
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
            numItems: Math.min(remainingOffset, safeLimit ?? 100),
          });

        remainingOffset -= page.page.length;
        cursor = page.continueCursor;

        if (page.isDone) {
          return [];
        }
      }

      if (safeLimit !== undefined) {
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

      const verses: BulkGenerationVerse[] = [];
      let pageCursor = cursor;
      let done = false;

      while (!done) {
        const page = await ctx.db
          .query("bulkGenerationVerses")
          .withIndex("by_bulk_order", (q) =>
            q.eq("bulkGenerationId", args.bulkGenerationId)
          )
          .paginate({
            cursor: pageCursor,
            numItems: 100,
          });

        verses.push(...page.page);
        pageCursor = page.continueCursor;
        done = page.isDone;
      }

      return verses;
    }
    return await verseQuery.collect();
  },
});

/**
 * Update a single verse entry's status.
 */
export const updateVerseStatus = mutation({
  args: {
    bulkGenerationId: v.id("bulkGenerations"),
    verseId: v.string(),
    status: bulkGenerationVerseStatusValidator,
    expectedCurrentStatus: v.optional(bulkGenerationVerseStatusValidator),
    creditsCost: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
    const bulkGeneration = await ctx.db.get(args.bulkGenerationId);
    if (!bulkGeneration) return { updated: false };
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
    id: v.id("bulkGenerations"),
    completedCount: v.number(),
    failedCount: v.number(),
    skippedCount: v.number(),
    totalCreditsUsed: v.number(),
  },
  handler: async (ctx, args) => {
    const bulk = await ctx.db.get(args.id);
    if (!bulk) return;

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
  args: { id: v.id("bulkGenerations") },
  handler: async (ctx, args) => {
    const bulk = await ctx.db.get(args.id);
    if (!bulk || bulk.status !== "active") return { updated: false };

    await ctx.db.patch(args.id, {
      status: "paused",
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

/**
 * Resume a paused bulk generation.
 */
export const resume = mutation({
  args: { id: v.id("bulkGenerations") },
  handler: async (ctx, args) => {
    const bulk = await ctx.db.get(args.id);
    if (!bulk || bulk.status !== "paused") return { updated: false };

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });
    return { updated: true };
  },
});

/**
 * Cancel a bulk generation (active or paused).
 */
export const cancel = mutation({
  args: { id: v.id("bulkGenerations") },
  handler: async (ctx, args) => {
    const bulk = await ctx.db.get(args.id);
    if (!bulk || (bulk.status !== "active" && bulk.status !== "paused")) {
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
