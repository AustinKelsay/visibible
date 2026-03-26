import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a new bulk generation job with all its verse entries.
 */
export const create = mutation({
  args: {
    sid: v.string(),
    scopeType: v.string(),
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

    // Insert all verse entries
    for (const verse of args.verses) {
      await ctx.db.insert("bulkGenerationVerses", {
        bulkGenerationId: bulkId,
        verseId: verse.verseId,
        reference: verse.reference,
        order: verse.order,
        status: "queued",
        updatedAt: now,
      });
    }

    return bulkId;
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
  args: { bulkGenerationId: v.id("bulkGenerations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bulkGenerationVerses")
      .withIndex("by_bulk_order", (q) =>
        q.eq("bulkGenerationId", args.bulkGenerationId)
      )
      .collect();
  },
});

/**
 * Update a single verse entry's status.
 */
export const updateVerseStatus = mutation({
  args: {
    bulkGenerationId: v.id("bulkGenerations"),
    verseId: v.string(),
    status: v.string(),
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
    if (!verse) return;

    await ctx.db.patch(verse._id, {
      status: args.status,
      creditsCost: args.creditsCost,
      error: args.error,
      updatedAt: Date.now(),
    });
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

    const isComplete =
      args.completedCount + args.failedCount + args.skippedCount >=
      bulk.totalVerses;

    await ctx.db.patch(args.id, {
      completedCount: args.completedCount,
      failedCount: args.failedCount,
      skippedCount: args.skippedCount,
      totalCreditsUsed: args.totalCreditsUsed,
      updatedAt: Date.now(),
      ...(isComplete
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
    if (!bulk || bulk.status !== "active") return;

    await ctx.db.patch(args.id, {
      status: "paused",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Resume a paused bulk generation.
 */
export const resume = mutation({
  args: { id: v.id("bulkGenerations") },
  handler: async (ctx, args) => {
    const bulk = await ctx.db.get(args.id);
    if (!bulk || bulk.status !== "paused") return;

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Cancel a bulk generation (active or paused).
 */
export const cancel = mutation({
  args: { id: v.id("bulkGenerations") },
  handler: async (ctx, args) => {
    const bulk = await ctx.db.get(args.id);
    if (!bulk || (bulk.status !== "active" && bulk.status !== "paused")) return;

    await ctx.db.patch(args.id, {
      status: "cancelled",
      updatedAt: Date.now(),
      completedAt: Date.now(),
    });
  },
});
