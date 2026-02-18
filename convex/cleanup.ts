import { internalMutation } from "./_generated/server";

const CLEANUP_PAGE_SIZE = 250;
const CLEANUP_MAX_PAGES_PER_RUN = 20;

/**
 * Delete sessions past their expiresAt timestamp.
 * Called by cron job to clean up abandoned sessions.
 */
export const cleanupExpiredSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let deleted = 0;
    let pagesScanned = 0;
    let cursor: string | null = null;
    let hasMore = false;

    while (pagesScanned < CLEANUP_MAX_PAGES_PER_RUN) {
      const page = await ctx.db
        .query("sessions")
        .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
        .paginate({ cursor, numItems: CLEANUP_PAGE_SIZE });

      for (const session of page.page) {
        await ctx.db.delete(session._id);
        deleted += 1;
      }

      pagesScanned += 1;
      hasMore = !page.isDone;

      if (page.isDone) {
        break;
      }

      cursor = page.continueCursor;
    }

    return { deleted, pagesScanned, hasMore };
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
    let cursor: string | null = null;
    let hasMore = false;

    while (pagesScanned < CLEANUP_MAX_PAGES_PER_RUN) {
      const page = await ctx.db
        .query("rateLimits")
        .withIndex("by_windowStart", (q) => q.lt("windowStart", cutoff))
        .paginate({ cursor, numItems: CLEANUP_PAGE_SIZE });

      for (const record of page.page) {
        await ctx.db.delete(record._id);
        deleted += 1;
      }

      pagesScanned += 1;
      hasMore = !page.isDone;

      if (page.isDone || page.page.length === 0) {
        break;
      }

      cursor = page.continueCursor;
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
    let cursor: string | null = null;
    let hasMore = false;

    while (pagesScanned < CLEANUP_MAX_PAGES_PER_RUN) {
      const page = await ctx.db
        .query("adminLoginAttempts")
        .withIndex("by_lastAttempt", (q) => q.lt("lastAttempt", cutoff))
        .paginate({ cursor, numItems: CLEANUP_PAGE_SIZE });

      for (const record of page.page) {
        await ctx.db.delete(record._id);
        deleted += 1;
      }

      pagesScanned += 1;
      hasMore = !page.isDone;

      if (page.isDone || page.page.length === 0) {
        break;
      }

      cursor = page.continueCursor;
    }

    return { deleted, pagesScanned, hasMore };
  },
});
