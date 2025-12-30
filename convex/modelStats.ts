import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Default ETA for unknown models (seconds)
const DEFAULT_ETA_MS = 12000;
// EMA smoothing factor (0.2 = 20% new value, 80% old)
const EMA_ALPHA = 0.2;

/**
 * Get stats for a specific model.
 */
export const getModelStats = query({
  args: {
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("modelStats")
      .withIndex("by_modelId", (q) => q.eq("modelId", args.modelId))
      .first();

    if (!stats) {
      return {
        modelId: args.modelId,
        count: 0,
        avgMs: DEFAULT_ETA_MS,
        etaSeconds: Math.round(DEFAULT_ETA_MS / 1000),
      };
    }

    return {
      modelId: stats.modelId,
      count: stats.count,
      avgMs: stats.avgMs,
      etaSeconds: Math.round(stats.avgMs / 1000),
    };
  },
});

/**
 * Get stats for all models that have been used.
 */
export const getAllModelStats = query({
  args: {},
  handler: async (ctx) => {
    const allStats = await ctx.db.query("modelStats").collect();

    return allStats.map((stats) => ({
      modelId: stats.modelId,
      count: stats.count,
      avgMs: stats.avgMs,
      etaSeconds: Math.round(stats.avgMs / 1000),
    }));
  },
});

/**
 * Record a generation and update the model's ETA stats.
 * Uses exponential moving average for smooth updates.
 */
export const recordGeneration = mutation({
  args: {
    modelId: v.string(),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("modelStats")
      .withIndex("by_modelId", (q) => q.eq("modelId", args.modelId))
      .first();

    const now = Date.now();

    if (existing) {
      // Update with EMA: newAvg = (prevAvg * (1 - alpha)) + (newValue * alpha)
      const newAvgMs =
        existing.avgMs * (1 - EMA_ALPHA) + args.durationMs * EMA_ALPHA;

      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        avgMs: newAvgMs,
        updatedAt: now,
      });

      return {
        modelId: args.modelId,
        count: existing.count + 1,
        avgMs: newAvgMs,
        etaSeconds: Math.round(newAvgMs / 1000),
      };
    } else {
      // First generation for this model
      await ctx.db.insert("modelStats", {
        modelId: args.modelId,
        count: 1,
        avgMs: args.durationMs,
        updatedAt: now,
      });

      return {
        modelId: args.modelId,
        count: 1,
        avgMs: args.durationMs,
        etaSeconds: Math.round(args.durationMs / 1000),
      };
    }
  },
});
