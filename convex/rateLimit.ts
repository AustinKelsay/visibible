import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Rate limit configuration for different endpoints.
 * windowMs: Duration of the rate limit window in milliseconds
 * maxRequests: Maximum number of requests allowed in the window
 */
export const RATE_LIMITS = {
  chat: { windowMs: 60_000, maxRequests: 20 }, // 20 requests per minute
  "generate-image": { windowMs: 60_000, maxRequests: 5 }, // 5 images per minute
  "admin-login": { windowMs: 900_000, maxRequests: 5 }, // 5 attempts per 15 minutes
  session: { windowMs: 60_000, maxRequests: 10 }, // 10 session creates per minute
  invoice: { windowMs: 60_000, maxRequests: 10 }, // 10 invoice creates per minute
  feedback: { windowMs: 60_000, maxRequests: 5 }, // 5 feedback submissions per minute
} as const;

export type RateLimitEndpoint = keyof typeof RATE_LIMITS;

/**
 * Check and increment rate limit for an identifier/endpoint pair.
 * Returns whether the request is allowed and retry-after info if blocked.
 *
 * Uses a sliding window approach: if the window has expired, start fresh.
 * Otherwise, check if under limit and increment.
 */
export const checkRateLimit = mutation({
  args: {
    identifier: v.string(),
    endpoint: v.string(),
  },
  handler: async (ctx, args): Promise<{
    allowed: boolean;
    retryAfter?: number;
    remaining?: number;
  }> => {
    const config = RATE_LIMITS[args.endpoint as RateLimitEndpoint];
    if (!config) {
      // Unknown endpoint - allow but don't track
      return { allowed: true };
    }

    const now = Date.now();
    const { windowMs, maxRequests } = config;

    // Find existing rate limit record
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_identifier_endpoint", (q) =>
        q.eq("identifier", args.identifier).eq("endpoint", args.endpoint)
      )
      .first();

    if (!existing) {
      // First request - create new record
      await ctx.db.insert("rateLimits", {
        identifier: args.identifier,
        endpoint: args.endpoint,
        count: 1,
        windowStart: now,
      });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    // Check if window has expired
    const windowEnd = existing.windowStart + windowMs;
    if (now >= windowEnd) {
      // Window expired - reset
      await ctx.db.patch(existing._id, {
        count: 1,
        windowStart: now,
      });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    // Window still active - check limit
    if (existing.count >= maxRequests) {
      const retryAfter = Math.ceil((windowEnd - now) / 1000);
      return { allowed: false, retryAfter, remaining: 0 };
    }

    // Under limit - increment
    await ctx.db.patch(existing._id, {
      count: existing.count + 1,
    });

    return { allowed: true, remaining: maxRequests - existing.count - 1 };
  },
});

/**
 * Get current rate limit status without incrementing.
 * Useful for checking status before expensive operations.
 */
export const getRateLimitStatus = query({
  args: {
    identifier: v.string(),
    endpoint: v.string(),
  },
  handler: async (ctx, args): Promise<{
    remaining: number;
    resetAt: number;
  }> => {
    const config = RATE_LIMITS[args.endpoint as RateLimitEndpoint];
    if (!config) {
      return { remaining: 999, resetAt: Date.now() };
    }

    const now = Date.now();
    const { windowMs, maxRequests } = config;

    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_identifier_endpoint", (q) =>
        q.eq("identifier", args.identifier).eq("endpoint", args.endpoint)
      )
      .first();

    if (!existing) {
      return { remaining: maxRequests, resetAt: now + windowMs };
    }

    const windowEnd = existing.windowStart + windowMs;
    if (now >= windowEnd) {
      return { remaining: maxRequests, resetAt: now + windowMs };
    }

    return {
      remaining: Math.max(0, maxRequests - existing.count),
      resetAt: windowEnd,
    };
  },
});

// ============================================
// Admin Login Brute Force Protection
// ============================================

const ADMIN_LOGIN_BASE_LOCKOUT_DURATION = 60 * 60 * 1000; // 1 hour base lockout
const ADMIN_LOGIN_MAX_LOCKOUT_DURATION = 24 * 60 * 60 * 1000; // 24 hour max lockout
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_WINDOW = 15 * 60 * 1000; // 15 minute window

/**
 * Calculate lockout duration with exponential backoff.
 * Each lockout doubles the duration, capped at 24 hours.
 * lockoutCount 0 → 1 hour, 1 → 2 hours, 2 → 4 hours, 3 → 8 hours, 4+ → 24 hours
 */
function calculateLockoutDuration(lockoutCount: number): number {
  const multiplier = Math.pow(2, lockoutCount);
  const duration = ADMIN_LOGIN_BASE_LOCKOUT_DURATION * multiplier;
  return Math.min(duration, ADMIN_LOGIN_MAX_LOCKOUT_DURATION);
}

/**
 * Check if an IP is locked out from admin login attempts.
 */
export const checkAdminLoginAllowed = query({
  args: {
    ipHash: v.string(),
  },
  handler: async (ctx, args): Promise<{
    allowed: boolean;
    lockedUntil?: number;
    attemptsRemaining?: number;
    lockoutCount?: number;
  }> => {
    const record = await ctx.db
      .query("adminLoginAttempts")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", args.ipHash))
      .first();

    if (!record) {
      return { allowed: true, attemptsRemaining: ADMIN_LOGIN_MAX_ATTEMPTS };
    }

    const now = Date.now();
    const lockoutCount = record.lockoutCount ?? 0;

    // Check if locked out
    if (record.lockedUntil && record.lockedUntil > now) {
      return { allowed: false, lockedUntil: record.lockedUntil, lockoutCount };
    }

    // Check if attempts are within window
    const windowStart = now - ADMIN_LOGIN_WINDOW;
    if (record.lastAttempt < windowStart) {
      // Old attempts - effectively reset (but lockoutCount persists)
      return { allowed: true, attemptsRemaining: ADMIN_LOGIN_MAX_ATTEMPTS };
    }

    // Check attempt count
    if (record.attemptCount >= ADMIN_LOGIN_MAX_ATTEMPTS) {
      // Should be locked but lockedUntil wasn't set - race condition edge case
      // Use exponential backoff based on current lockout count
      const lockoutDuration = calculateLockoutDuration(lockoutCount);
      return {
        allowed: false,
        lockedUntil: record.lastAttempt + lockoutDuration,
        lockoutCount,
      };
    }

    return {
      allowed: true,
      attemptsRemaining: ADMIN_LOGIN_MAX_ATTEMPTS - record.attemptCount,
    };
  },
});

/**
 * Record a failed admin login attempt.
 * Locks out the IP after MAX_ATTEMPTS failures with exponential backoff.
 * Each subsequent lockout doubles in duration (1h → 2h → 4h → 8h → 24h max).
 */
export const recordFailedAdminLogin = mutation({
  args: {
    ipHash: v.string(),
  },
  handler: async (ctx, args): Promise<{
    locked: boolean;
    lockedUntil?: number;
    attemptsRemaining: number;
    lockoutCount?: number;
  }> => {
    const now = Date.now();

    const record = await ctx.db
      .query("adminLoginAttempts")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", args.ipHash))
      .first();

    if (!record) {
      // First failed attempt
      await ctx.db.insert("adminLoginAttempts", {
        ipHash: args.ipHash,
        attemptCount: 1,
        lastAttempt: now,
        lockoutCount: 0,
      });
      return { locked: false, attemptsRemaining: ADMIN_LOGIN_MAX_ATTEMPTS - 1 };
    }

    const windowStart = now - ADMIN_LOGIN_WINDOW;
    const lockoutExpired = record.lockedUntil !== undefined && record.lockedUntil <= now;

    // Reset attempt counter when the window expires or a lockout has elapsed.
    // Preserve lockoutCount for backoff.
    if (record.lastAttempt < windowStart || lockoutExpired) {
      await ctx.db.patch(record._id, {
        attemptCount: 1,
        lastAttempt: now,
        lockedUntil: undefined,
      });
      return { locked: false, attemptsRemaining: ADMIN_LOGIN_MAX_ATTEMPTS - 1 };
    }

    const newCount = record.attemptCount + 1;
    const currentLockoutCount = record.lockoutCount ?? 0;

    // Check if should lock
    if (newCount >= ADMIN_LOGIN_MAX_ATTEMPTS) {
      const newLockoutCount = currentLockoutCount + 1;
      const lockoutDuration = calculateLockoutDuration(currentLockoutCount);
      const lockedUntil = now + lockoutDuration;

      await ctx.db.patch(record._id, {
        attemptCount: newCount,
        lastAttempt: now,
        lockedUntil,
        lockoutCount: newLockoutCount,
      });

      return {
        locked: true,
        lockedUntil,
        attemptsRemaining: 0,
        lockoutCount: newLockoutCount,
      };
    }

    // Increment counter
    await ctx.db.patch(record._id, {
      attemptCount: newCount,
      lastAttempt: now,
    });

    return { locked: false, attemptsRemaining: ADMIN_LOGIN_MAX_ATTEMPTS - newCount };
  },
});

/**
 * Clear failed login attempts after successful login.
 */
export const clearAdminLoginAttempts = mutation({
  args: {
    ipHash: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const record = await ctx.db
      .query("adminLoginAttempts")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", args.ipHash))
      .first();

    if (record) {
      await ctx.db.delete(record._id);
    }
  },
});
