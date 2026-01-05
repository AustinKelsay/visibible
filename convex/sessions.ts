import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Default daily spending limit per session (in USD)
// This prevents API cost abuse by capping how much a single session can spend per day
export const DEFAULT_DAILY_SPEND_LIMIT_USD = 5.0;

// Session TTL: 90 days from last activity
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Validates the server secret for secure Convex action calls.
 * This ensures only our API routes can call sensitive mutations.
 */
const validateServerSecret = (serverSecret: string) => {
  const expectedSecret = process.env.CONVEX_SERVER_SECRET;
  if (!expectedSecret || serverSecret !== expectedSecret) {
    throw new Error("Unauthorized: Invalid server secret");
  }
};

function resolveTier(currentTier: string): "paid" | "admin" {
  if (currentTier === "admin") return "admin";
  return "paid"; // All non-admin users are "paid" tier
}

/**
 * Get the start of the current UTC day (midnight) as a timestamp.
 */
function getUtcDayStart(timestamp: number = Date.now()): number {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Check if the daily spend limit has been exceeded and update tracking.
 * Returns { allowed: true } if spend is within limit, or { allowed: false, ... } with details.
 */
function checkDailySpendLimit(
  session: {
    tier: string;
    dailySpendUsd?: number;
    dailySpendLimitUsd?: number;
    lastDayReset?: number;
  },
  costUsd: number
): {
  allowed: boolean;
  currentSpend: number;
  limit: number;
  resetNeeded: boolean;
  remaining?: number;
} {
  // Admin bypasses daily spend limit
  if (session.tier === "admin") {
    return {
      allowed: true,
      currentSpend: 0,
      limit: Infinity,
      resetNeeded: false,
    };
  }

  const todayStart = getUtcDayStart();
  const lastReset = session.lastDayReset ?? 0;
  const resetNeeded = lastReset < todayStart;

  // Get current spend (reset if new day)
  const currentSpend = resetNeeded ? 0 : (session.dailySpendUsd ?? 0);
  const limit = session.dailySpendLimitUsd ?? DEFAULT_DAILY_SPEND_LIMIT_USD;

  const newSpend = currentSpend + costUsd;

  if (newSpend > limit) {
    return {
      allowed: false,
      currentSpend,
      limit,
      resetNeeded,
      remaining: Math.max(0, limit - currentSpend),
    };
  }

  return {
    allowed: true,
    currentSpend,
    limit,
    resetNeeded,
  };
}

/**
 * Validates that a credit amount is positive and finite.
 * 
 * @param amount - The amount to validate
 * @throws Error if amount is not positive or not finite
 */
export function validatePositiveAmount(amount: number): void {
  if (amount <= 0 || !Number.isFinite(amount)) {
    throw new Error(
      `Amount must be a positive number, received: ${amount}`
    );
  }
}

/**
 * Get a session by its session ID.
 */
export const getSession = query({
  args: {
    sid: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (!session) return null;

    // Check if daily spend needs reset (new day)
    const todayStart = getUtcDayStart();
    const lastReset = session.lastDayReset ?? 0;
    const dailySpendUsd =
      lastReset < todayStart ? 0 : (session.dailySpendUsd ?? 0);

    return {
      sid: session.sid,
      tier: session.tier,
      credits: session.credits,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      dailySpendUsd,
      dailySpendLimitUsd:
        session.dailySpendLimitUsd ?? DEFAULT_DAILY_SPEND_LIMIT_USD,
    };
  },
});

/**
 * Create a new anonymous session.
 */
export const createSession = mutation({
  args: {
    sid: v.string(),
    ipHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if session already exists
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (existing) {
      return {
        sid: existing.sid,
        tier: existing.tier,
        credits: existing.credits,
      };
    }

    await ctx.db.insert("sessions", {
      sid: args.sid,
      tier: "paid",
      credits: 0,
      createdAt: now,
      lastSeenAt: now,
      lastIpHash: args.ipHash,
      expiresAt: now + SESSION_TTL_MS,
    });

    return {
      sid: args.sid,
      tier: "paid",
      credits: 0,
    };
  },
});

/**
 * Update lastSeenAt timestamp for a session.
 */
export const updateLastSeen = mutation({
  args: {
    sid: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (session) {
      const now = Date.now();
      await ctx.db.patch(session._id, {
        lastSeenAt: now,
        expiresAt: now + SESSION_TTL_MS,
      });
    }
  },
});

/**
 * Internal mutation to add credits to a session.
 * Only callable from Convex actions after server secret validation.
 */
export const addCreditsInternal = internalMutation({
  args: {
    sid: v.string(),
    amount: v.number(),
    reason: v.string(),
    invoiceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate that amount is positive
    validatePositiveAmount(args.amount);

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (!session) {
      throw new Error("Session not found");
    }

    const newCredits = session.credits + args.amount;

    const nextTier = resolveTier(session.tier);

    // Update session
    await ctx.db.patch(session._id, {
      credits: newCredits,
      tier: nextTier,
    });

    // Record in ledger
    await ctx.db.insert("creditLedger", {
      sid: args.sid,
      delta: args.amount,
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { newBalance: newCredits };
  },
});

/**
 * Internal mutation to reserve credits atomically before generation.
 * Only callable from Convex actions after server secret validation.
 *
 * SECURITY: Also checks daily spending limit to prevent API cost abuse.
 */
export const reserveCreditsInternal = internalMutation({
  args: {
    sid: v.string(),
    amount: v.number(),
    modelId: v.string(),
    generationId: v.string(),
    costUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    // SECURITY: Check daily spending limit before allowing reservation
    const costUsd = args.costUsd ?? 0;
    const spendCheck = checkDailySpendLimit(session, costUsd);

    if (!spendCheck.allowed) {
      return {
        success: false,
        error: "Daily spending limit exceeded",
        dailyLimit: spendCheck.limit,
        dailySpent: spendCheck.currentSpend,
        remaining: spendCheck.remaining,
      };
    }

    // Check for existing reservation or debit for this generationId (idempotency)
    const ledgerEntries = await ctx.db
      .query("creditLedger")
      .withIndex("by_generationId", (q) =>
        q.eq("generationId", args.generationId).eq("sid", args.sid)
      )
      .collect();

    const netDelta = ledgerEntries.reduce((sum, entry) => {
      if (entry.reason === "generation" || entry.reason === "refund") {
        return sum + entry.delta;
      }
      if (entry.reason === "reservation") {
        return sum + entry.delta; // Reservations also reduce available credits
      }
      return sum;
    }, 0);

    // If already reserved or charged, return success
    if (netDelta < 0) {
      return {
        success: true,
        newBalance: session.credits,
        alreadyReserved: true,
      };
    }

    // Calculate available credits (current balance minus any pending reservations)
    const pendingReservations = ledgerEntries
      .filter((e) => e.reason === "reservation")
      .reduce((sum, e) => sum + Math.abs(e.delta), 0);
    const availableCredits = session.credits - pendingReservations;

    if (availableCredits < args.amount) {
      return {
        success: false,
        error: "Insufficient credits",
        required: args.amount,
        available: availableCredits,
      };
    }

    // Atomically reserve credits by deducting from balance
    const newCredits = session.credits - args.amount;
    const now = Date.now();

    const nextTier = resolveTier(session.tier);

    // Update session with new balance and daily spend tracking
    const todayStart = getUtcDayStart(now);
    const newDailySpend = spendCheck.resetNeeded
      ? costUsd
      : (session.dailySpendUsd ?? 0) + costUsd;

    await ctx.db.patch(session._id, {
      credits: newCredits,
      tier: nextTier,
      dailySpendUsd: newDailySpend,
      lastDayReset: spendCheck.resetNeeded ? todayStart : session.lastDayReset,
    });

    // Record reservation in ledger
    await ctx.db.insert("creditLedger", {
      sid: args.sid,
      delta: -args.amount,
      reason: "reservation",
      modelId: args.modelId,
      costUsd: args.costUsd,
      generationId: args.generationId,
      createdAt: now,
    });

    return { success: true, newBalance: newCredits };
  },
});

/**
 * Internal mutation to release a credit reservation.
 * Only callable from Convex actions after server secret validation.
 */
export const releaseReservationInternal = internalMutation({
  args: {
    sid: v.string(),
    generationId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    // Find reservation entries for this generationId
    const ledgerEntries = await ctx.db
      .query("creditLedger")
      .withIndex("by_generationId", (q) =>
        q.eq("generationId", args.generationId).eq("sid", args.sid)
      )
      .collect();

    const reservationEntries = ledgerEntries.filter(
      (e) => e.reason === "reservation"
    );

    if (reservationEntries.length === 0) {
      return {
        success: true,
        newBalance: session.credits,
        alreadyReleased: true,
      };
    }

    // Calculate total reserved amount
    const reservedAmount = reservationEntries.reduce(
      (sum, e) => sum + Math.abs(e.delta),
      0
    );

    // Calculate total costUsd from reservations to reverse daily spend
    const reservationCostUsd = reservationEntries.reduce(
      (sum, e) => sum + (e.costUsd ?? 0),
      0
    );

    // Restore credits
    const newCredits = session.credits + reservedAmount;

    const nextTier = resolveTier(session.tier);

    // Decrement daily spend (clamp to 0)
    const currentDailySpend = session.dailySpendUsd ?? 0;
    const newDailySpend = Math.max(0, currentDailySpend - reservationCostUsd);

    // Update session
    await ctx.db.patch(session._id, {
      credits: newCredits,
      tier: nextTier,
      dailySpendUsd: newDailySpend,
    });

    // Record refund in ledger
    await ctx.db.insert("creditLedger", {
      sid: args.sid,
      delta: reservedAmount,
      reason: "refund",
      generationId: args.generationId,
      createdAt: Date.now(),
    });

    return { success: true, newBalance: newCredits };
  },
});

/**
 * Internal mutation to deduct credits for generation.
 * Only callable from Convex actions after server secret validation.
 */
export const deductCreditsInternal = internalMutation({
  args: {
    sid: v.string(),
    amount: v.number(),
    modelId: v.string(),
    generationId: v.string(),
    costUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    // Check for existing ledger entries for this generationId
    const ledgerEntries = await ctx.db
      .query("creditLedger")
      .withIndex("by_generationId", (q) =>
        q.eq("generationId", args.generationId).eq("sid", args.sid)
      )
      .collect();

    const netDelta = ledgerEntries.reduce((sum, entry) => {
      if (entry.reason === "generation" || entry.reason === "refund") {
        return sum + entry.delta;
      }
      if (entry.reason === "reservation") {
        return sum + entry.delta; // Reservations count as already deducted
      }
      return sum;
    }, 0);

    // If already charged (netDelta < 0), return success
    if (netDelta < 0) {
      // Check if there's a reservation that needs to be converted
      const hasReservation = ledgerEntries.some(
        (e) => e.reason === "reservation"
      );
      const hasGeneration = ledgerEntries.some(
        (e) => e.reason === "generation"
      );

      // If reservation exists but not yet converted to generation, convert it
      if (hasReservation && !hasGeneration) {
        // Record generation entry (credits already deducted, so delta is 0 net change)
        await ctx.db.insert("creditLedger", {
          sid: args.sid,
          delta: -args.amount,
          reason: "generation",
          modelId: args.modelId,
          costUsd: args.costUsd,
          generationId: args.generationId,
          createdAt: Date.now(),
        });

        // Record refund to cancel out the reservation (net effect: reservation -> generation)
        await ctx.db.insert("creditLedger", {
          sid: args.sid,
          delta: args.amount,
          reason: "refund",
          generationId: args.generationId,
          createdAt: Date.now(),
        });

        return {
          success: true,
          newBalance: session.credits,
          converted: true,
        };
      }

      return {
        success: true,
        newBalance: session.credits,
        alreadyCharged: true,
      };
    }

    // No reservation exists - perform direct debit (backward compatibility)
    if (session.credits < args.amount) {
      return {
        success: false,
        error: "Insufficient credits",
        required: args.amount,
        available: session.credits,
      };
    }

    const newCredits = session.credits - args.amount;

    const nextTier = resolveTier(session.tier);

    // Update session
    await ctx.db.patch(session._id, {
      credits: newCredits,
      tier: nextTier,
    });

    // Record in ledger
    await ctx.db.insert("creditLedger", {
      sid: args.sid,
      delta: -args.amount,
      reason: "generation",
      modelId: args.modelId,
      costUsd: args.costUsd,
      generationId: args.generationId,
      createdAt: Date.now(),
    });

    return { success: true, newBalance: newCredits };
  },
});

/**
 * Public action to add credits to a session.
 * Validates server secret before calling internal mutation.
 */
export const addCredits = action({
  args: {
    sid: v.string(),
    amount: v.number(),
    reason: v.string(),
    invoiceId: v.optional(v.string()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args): Promise<{ newBalance: number }> => {
    validateServerSecret(args.serverSecret);
    return ctx.runMutation(internal.sessions.addCreditsInternal, {
      sid: args.sid,
      amount: args.amount,
      reason: args.reason,
      invoiceId: args.invoiceId,
    });
  },
});

/**
 * Public action to reserve credits atomically.
 * Validates server secret before calling internal mutation.
 */
export const reserveCredits = action({
  args: {
    sid: v.string(),
    amount: v.number(),
    modelId: v.string(),
    generationId: v.string(),
    costUsd: v.optional(v.number()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    newBalance?: number;
    error?: string;
    alreadyReserved?: boolean;
    required?: number;
    available?: number;
    // Daily spending limit fields
    dailyLimit?: number;
    dailySpent?: number;
    remaining?: number;
  }> => {
    validateServerSecret(args.serverSecret);
    return ctx.runMutation(internal.sessions.reserveCreditsInternal, {
      sid: args.sid,
      amount: args.amount,
      modelId: args.modelId,
      generationId: args.generationId,
      costUsd: args.costUsd,
    });
  },
});

/**
 * Public action to release a credit reservation.
 * Validates server secret before calling internal mutation.
 */
export const releaseReservation = action({
  args: {
    sid: v.string(),
    generationId: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    newBalance?: number;
    error?: string;
    alreadyReleased?: boolean;
  }> => {
    validateServerSecret(args.serverSecret);
    return ctx.runMutation(internal.sessions.releaseReservationInternal, {
      sid: args.sid,
      generationId: args.generationId,
    });
  },
});

/**
 * Public action to deduct credits for generation.
 * Validates server secret before calling internal mutation.
 */
export const deductCredits = action({
  args: {
    sid: v.string(),
    amount: v.number(),
    modelId: v.string(),
    generationId: v.string(),
    costUsd: v.optional(v.number()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    newBalance?: number;
    error?: string;
    converted?: boolean;
    alreadyCharged?: boolean;
    required?: number;
    available?: number;
  }> => {
    validateServerSecret(args.serverSecret);
    return ctx.runMutation(internal.sessions.deductCreditsInternal, {
      sid: args.sid,
      amount: args.amount,
      modelId: args.modelId,
      generationId: args.generationId,
      costUsd: args.costUsd,
    });
  },
});

/**
 * Get credit ledger history for a session.
 */
export const getCreditHistory = query({
  args: {
    sid: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("creditLedger")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .order("desc");

    const entries = args.limit
      ? await query.take(args.limit)
      : await query.collect();

    return entries.map((e) => ({
      delta: e.delta,
      reason: e.reason,
      modelId: e.modelId,
      generationId: e.generationId,
      createdAt: e.createdAt,
    }));
  },
});

/**
 * Internal mutation to upgrade a session to admin tier.
 * Only callable from Convex actions after authorization.
 *
 * @param sid - Session ID to upgrade
 * @throws Error if session is not found
 */
export const upgradeToAdminInternal = internalMutation({
  args: {
    sid: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (!session) {
      throw new Error("Session not found");
    }

    await ctx.db.patch(session._id, { tier: "admin" });

    return { success: true };
  },
});

/**
 * Public action to upgrade a session to admin tier.
 * Validates a server-side secret before calling the internal mutation.
 * This allows API routes to call admin upgrade while keeping it secure.
 *
 * @param sid - Session ID to upgrade
 * @param serverSecret - Secret that must match ADMIN_PASSWORD_SECRET env var
 * @throws Error if secret is invalid or session is not found
 */
export const upgradeToAdmin = action({
  args: {
    sid: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.ADMIN_PASSWORD_SECRET;

    if (!expectedSecret || args.serverSecret !== expectedSecret) {
      throw new Error("Unauthorized");
    }

    await ctx.runMutation(internal.sessions.upgradeToAdminInternal, {
      sid: args.sid,
    });

    return { success: true };
  },
});
