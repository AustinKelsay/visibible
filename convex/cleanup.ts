import { internalMutation } from "./_generated/server";

/**
 * Delete sessions past their expiresAt timestamp.
 * Called by cron job to clean up abandoned sessions.
 */
export const cleanupExpiredSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Query sessions with expired timestamps (batch limit to avoid timeout)
    const expired = await ctx.db
      .query("sessions")
      .withIndex("by_expiresAt")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(100);

    for (const session of expired) {
      await ctx.db.delete(session._id);
    }

    return { deleted: expired.length };
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

    // No index on windowStart, so we need to scan and filter
    const stale = await ctx.db
      .query("rateLimits")
      .filter((q) => q.lt(q.field("windowStart"), cutoff))
      .take(100);

    for (const record of stale) {
      await ctx.db.delete(record._id);
    }

    return { deleted: stale.length };
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

    // Delete attempts where lastAttempt is older than cutoff
    const stale = await ctx.db
      .query("adminLoginAttempts")
      .filter((q) => q.lt(q.field("lastAttempt"), cutoff))
      .take(100);

    for (const record of stale) {
      await ctx.db.delete(record._id);
    }

    return { deleted: stale.length };
  },
});
