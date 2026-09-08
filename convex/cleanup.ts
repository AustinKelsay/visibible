import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const CLEANUP_PAGE_SIZE = 250;
const CLEANUP_MAX_PAGES_PER_RUN = 20;

/**
 * Access expiry never deletes financial ownership. Only empty, unlinked sessions
 * are eligible. A cursor advances past retained rows instead of rescanning them.
 */
export const cleanupExpiredSessions = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    dryRun: v.optional(v.boolean()),
    cutoff: v.optional(v.number()),
    epoch: v.optional(v.number()),
    pageCount: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    deleted: number; eligible: number; retained: number; scanned: number;
    hasMore: boolean; cursor: string | null; cutoff: number;
  }> => {
    const checkpoint = args.dryRun ? null : await ctx.db.query("maintenanceState")
      .withIndex("by_key", (q) => q.eq("key", "expired-sessions")).unique();
    // A new cron run supersedes any delayed work from an older run.
    if (args.epoch !== undefined &&
        (!checkpoint || checkpoint.epoch !== args.epoch || checkpoint.cursor !== (args.cursor ?? null))) {
      return { deleted: 0, eligible: 0, retained: 0, scanned: 0, hasMore: false, cursor: null, cutoff: args.cutoff ?? 0 };
    }
    const epoch = args.epoch ?? (checkpoint?.epoch ?? 0) + 1;
    const cutoff = args.cutoff ?? (checkpoint?.cutoff || Date.now());
    const startCursor = args.cursor ??
      (args.cutoff !== undefined && args.cutoff !== checkpoint?.cutoff ? null : checkpoint?.cursor) ?? null;
    let deleted = 0;
    let eligible = 0;
    let retained = 0;
    const batch = await ctx.db.query("sessions")
      .withIndex("by_expiresAt", (q) => q.gt("expiresAt", 0).lt("expiresAt", cutoff))
      .paginate({ cursor: startCursor, numItems: 50 });
    for (const session of batch.page) {
      // Preserve any financial history, including zero-balance or expired funds.
      const linked = session.credits !== 0 || await ctx.db.query("creditLedger")
        .withIndex("by_sid", (q) => q.eq("sid", session.sid)).first() ||
        await ctx.db.query("invoices").withIndex("by_sid", (q) => q.eq("sid", session.sid)).first() ||
        await ctx.db.query("bulkGenerations").withIndex("by_sid_createdAt", (q) => q.eq("sid", session.sid)).first() ||
        await ctx.db.query("imageGenerationRequests").withIndex("by_sid_createdAt", (q) => q.eq("sid", session.sid)).first();
      if (linked) {
        retained += 1;
        continue;
      }
      eligible += 1;
      if (!args.dryRun) {
        await ctx.db.delete(session._id);
        deleted += 1;
      }
    }
    const cursor = batch.isDone ? null : batch.continueCursor;
    if (!args.dryRun) {
      const state = { key: "expired-sessions", cursor, cutoff: cursor ? cutoff : 0, epoch };
      if (checkpoint) await ctx.db.patch(checkpoint._id, state);
      else await ctx.db.insert("maintenanceState", state);
      const pageCount = (args.pageCount ?? 0) + 1;
      if (cursor && pageCount < CLEANUP_MAX_PAGES_PER_RUN) {
        await ctx.scheduler.runAfter(0, internal.cleanup.cleanupExpiredSessions, { cursor, cutoff, epoch, pageCount });
      }
      // At the run limit the next cron resumes this cursor, rather than restarting
      // at retained rows. Each run and each individual transaction stay bounded.
    }
    return { deleted, eligible, retained, scanned: batch.page.length, hasMore: !batch.isDone, cursor, cutoff };
  },
});

/**
 * Delete rate limit records with expired windows (older than 1 hour).
 * Called by cron job to prevent unbounded table growth.
 */
export const cleanupStaleRateLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour ago
    let deleted = 0;
    let pagesScanned = 0;
    let hasMore = false;

    while (pagesScanned < CLEANUP_MAX_PAGES_PER_RUN) {
      const batch = await ctx.db
        .query("rateLimits")
        .withIndex("by_windowStart", (q) => q.lt("windowStart", cutoff))
        .take(CLEANUP_PAGE_SIZE);

      for (const record of batch) {
        await ctx.db.delete(record._id);
        deleted += 1;
      }

      pagesScanned += 1;
      hasMore = batch.length === CLEANUP_PAGE_SIZE;

      if (batch.length < CLEANUP_PAGE_SIZE) {
        break;
      }
    }

    return { deleted, pagesScanned, hasMore };
  },
});

/**
 * Delete admin login attempt records older than 24 hours.
 * Called by cron job to allow locked-out IPs to retry and
 * prevent unbounded table growth.
 */
export const cleanupAdminLoginAttempts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    let deleted = 0;
    let pagesScanned = 0;
    let hasMore = false;

    while (pagesScanned < CLEANUP_MAX_PAGES_PER_RUN) {
      const batch = await ctx.db
        .query("adminLoginAttempts")
        .withIndex("by_lastAttempt", (q) => q.lt("lastAttempt", cutoff))
        .take(CLEANUP_PAGE_SIZE);

      for (const record of batch) {
        await ctx.db.delete(record._id);
        deleted += 1;
      }

      pagesScanned += 1;
      hasMore = batch.length === CLEANUP_PAGE_SIZE;

      if (batch.length < CLEANUP_PAGE_SIZE) {
        break;
      }
    }

    return { deleted, pagesScanned, hasMore };
  },
});
