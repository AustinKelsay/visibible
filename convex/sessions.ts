import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function resolveTier(currentTier: string, credits: number): "free" | "paid" | "admin" {
  if (currentTier === "admin") return "admin";
  return credits > 0 ? "paid" : "free";
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

    return {
      sid: session.sid,
      tier: session.tier,
      credits: session.credits,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
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
      tier: "free",
      credits: 0,
      createdAt: now,
      lastSeenAt: now,
      lastIpHash: args.ipHash,
    });

    return {
      sid: args.sid,
      tier: "free",
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
      await ctx.db.patch(session._id, { lastSeenAt: Date.now() });
    }
  },
});

/**
 * Add credits to a session (e.g., after payment).
 * Records the transaction in the credit ledger.
 */
export const addCredits = mutation({
  args: {
    sid: v.string(),
    amount: v.number(),
    reason: v.string(),
    invoiceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sid", (q) => q.eq("sid", args.sid))
      .first();

    if (!session) {
      throw new Error("Session not found");
    }

    const newCredits = session.credits + args.amount;

    const nextTier = resolveTier(session.tier, newCredits);

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
 * Reserve credits atomically before image generation.
 * This prevents race conditions where concurrent requests could over-spend credits.
 * Returns success with new balance, or error if insufficient credits.
 */
export const reserveCredits = mutation({
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

    const nextTier = resolveTier(session.tier, newCredits);

    // Update session
    await ctx.db.patch(session._id, {
      credits: newCredits,
      tier: nextTier,
    });

    // Record reservation in ledger
    await ctx.db.insert("creditLedger", {
      sid: args.sid,
      delta: -args.amount,
      reason: "reservation",
      modelId: args.modelId,
      costUsd: args.costUsd,
      generationId: args.generationId,
      createdAt: Date.now(),
    });

    return { success: true, newBalance: newCredits };
  },
});

/**
 * Release a credit reservation (e.g., if generation fails).
 * This restores the reserved credits to the user's balance.
 */
export const releaseReservation = mutation({
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

    // Restore credits
    const newCredits = session.credits + reservedAmount;

    const nextTier = resolveTier(session.tier, newCredits);

    // Update session
    await ctx.db.patch(session._id, {
      credits: newCredits,
      tier: nextTier,
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
 * Deduct credits for an image generation.
 * If a reservation exists for the generationId, converts it to a debit.
 * Otherwise, performs a direct debit (for backward compatibility).
 * Returns success with new balance, or error if insufficient credits.
 */
export const deductCredits = mutation({
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
        // Find the reservation entry to get its metadata
        const reservationEntry = ledgerEntries.find(
          (e) => e.reason === "reservation"
        );

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

    const nextTier = resolveTier(session.tier, newCredits);

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
 * Upgrade a session to admin tier.
 * Called after successful admin password validation.
 */
export const upgradeToAdmin = mutation({
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
