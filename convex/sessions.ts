import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { validateServerSecret } from "./_helpers/auth";

// Default daily spending limit per session (in USD)
// This prevents API cost abuse by capping how much a single session can spend per day
export const DEFAULT_DAILY_SPEND_LIMIT_USD = 5.0;

// Session TTL: 90 days from last activity
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_STALE_RESERVATION_AGE_MS = 30 * 60 * 1000;
const DEFAULT_STALE_RESERVATION_BATCH_LIMIT = 50;
const MAX_STALE_RESERVATION_BATCH_LIMIT = 200;
const DEFAULT_STALE_RESERVATION_SCAN_PAGE_SIZE = 50;

type ReconcileCursor =
  | {
      mode: "older_than_created_at";
      createdAtExclusive: number;
    }
  | {
      mode: "same_created_at";
      createdAt: number;
      creationTimeExclusive: number;
    };

type ReconcileCandidateContext = {
  sid: string;
  generationId?: string;
  candidateCreatedAt: number;
  phase:
    | "candidate"
    | "load_ledger"
    | "load_session"
    | "patch_session"
    | "insert_refund";
  reservedAmount?: number;
  sessionId?: string;
};

function redactIdentifier(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function sanitizeCandidateContext(
  context: ReconcileCandidateContext | null
): (Omit<ReconcileCandidateContext, "sid" | "generationId" | "sessionId"> & {
  sid?: string;
  generationId?: string;
  sessionId?: string;
}) | null {
  if (!context) {
    return null;
  }

  return {
    ...context,
    sid: redactIdentifier(context.sid),
    generationId: redactIdentifier(context.generationId),
    sessionId: redactIdentifier(context.sessionId),
  };
}

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

export type GenerationSettlementState = "none" | "reserved" | "released" | "charged";

type GenerationLedgerEntry = {
  reason: string;
  delta: number;
  costUsd?: number;
};

export interface GenerationSettlementSummary {
  state: GenerationSettlementState;
  hasReservation: boolean;
  hasGeneration: boolean;
  hasRefund: boolean;
  reservationEntries: GenerationLedgerEntry[];
  reservedAmount: number;
  reservationCostUsd: number;
}

export function summarizeGenerationSettlement(
  entries: GenerationLedgerEntry[]
): GenerationSettlementSummary {
  const reservationEntries = entries.filter((entry) => entry.reason === "reservation");
  const hasReservation = reservationEntries.length > 0;
  const hasGeneration = entries.some((entry) => entry.reason === "generation");
  const hasRefund = entries.some((entry) => entry.reason === "refund");

  const reservedAmount = reservationEntries.reduce(
    (sum, entry) => sum + Math.abs(entry.delta),
    0
  );
  const reservationCostUsd = reservationEntries.reduce(
    (sum, entry) => sum + (entry.costUsd ?? 0),
    0
  );

  const state: GenerationSettlementState = hasGeneration
    ? "charged"
    : hasRefund
      ? "released"
      : hasReservation
        ? "reserved"
        : "none";

  return {
    state,
    hasReservation,
    hasGeneration,
    hasRefund,
    reservationEntries,
    reservedAmount,
    reservationCostUsd,
  };
}

type ReservedChargeComputationArgs = {
  currentCredits: number;
  currentDailySpendUsd: number;
  reservedAmount: number;
  reservationCostUsd: number;
  chargeAmount: number;
  chargeCostUsd?: number;
};

export type ReservedChargeComputationResult =
  | {
      mode: "refund_excess";
      newBalance: number;
      refunded: number;
      newDailySpendUsd: number;
      generationCostUsd?: number;
    }
  | {
      mode: "shortfall";
      newBalance: number;
      shortfall: number;
      generationCostUsd: number;
    }
  | {
      mode: "charge_additional";
      newBalance: number;
      additionalCharged: number;
      newDailySpendUsd: number;
      generationCostUsd?: number;
    }
  | {
      mode: "exact";
      newBalance: number;
      dailySpendChanged: boolean;
      newDailySpendUsd: number;
      generationCostUsd?: number;
    };

export function computeReservedChargeOutcome(
  args: ReservedChargeComputationArgs
): ReservedChargeComputationResult {
  const actualCostUsd = args.chargeCostUsd ?? 0;
  const difference = args.reservedAmount - args.chargeAmount;

  if (difference > 0) {
    const costUsdDifference = args.reservationCostUsd - actualCostUsd;
    return {
      mode: "refund_excess",
      newBalance: args.currentCredits + difference,
      refunded: difference,
      newDailySpendUsd: Math.max(
        0,
        args.currentDailySpendUsd - costUsdDifference
      ),
      generationCostUsd: args.chargeCostUsd,
    };
  }

  if (difference < 0) {
    const additionalNeeded = Math.abs(difference);
    if (args.currentCredits < additionalNeeded) {
      return {
        mode: "shortfall",
        newBalance: args.currentCredits,
        shortfall: additionalNeeded,
        generationCostUsd: args.reservationCostUsd,
      };
    }

    const additionalCostUsd = actualCostUsd - args.reservationCostUsd;
    return {
      mode: "charge_additional",
      newBalance: args.currentCredits - additionalNeeded,
      additionalCharged: additionalNeeded,
      newDailySpendUsd:
        args.currentDailySpendUsd + Math.max(0, additionalCostUsd),
      generationCostUsd: args.chargeCostUsd,
    };
  }

  const costUsdDifference = args.reservationCostUsd - actualCostUsd;
  if (costUsdDifference === 0) {
    return {
      mode: "exact",
      newBalance: args.currentCredits,
      dailySpendChanged: false,
      newDailySpendUsd: args.currentDailySpendUsd,
      generationCostUsd: args.chargeCostUsd,
    };
  }

  return {
    mode: "exact",
    newBalance: args.currentCredits,
    dailySpendChanged: true,
    newDailySpendUsd: Math.max(
      0,
      args.currentDailySpendUsd - costUsdDifference
    ),
    generationCostUsd: args.chargeCostUsd,
  };
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
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
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
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
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
 * Internal mutation to reconcile stale reservation-only generations.
 * Releases stranded credits when requests crash before final settlement.
 */
export const reconcileStaleReservations = internalMutation({
  args: {
    maxAgeMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const maxAgeMs =
      Number.isFinite(args.maxAgeMs) && (args.maxAgeMs ?? 0) > 0
        ? (args.maxAgeMs as number)
        : DEFAULT_STALE_RESERVATION_AGE_MS;
    const requestedLimit =
      Number.isFinite(args.limit) && (args.limit ?? 0) > 0
        ? Math.floor(args.limit as number)
        : DEFAULT_STALE_RESERVATION_BATCH_LIMIT;
    const limit = Math.min(
      Math.max(1, requestedLimit),
      MAX_STALE_RESERVATION_BATCH_LIMIT
    );
    const cutoff = now - maxAgeMs;
    const pageSize = Math.min(
      MAX_STALE_RESERVATION_BATCH_LIMIT,
      Math.max(limit, DEFAULT_STALE_RESERVATION_SCAN_PAGE_SIZE)
    );

    const seen = new Set<string>();
    let scanned = 0;
    let released = 0;
    let skippedSettled = 0;
    let skippedMissingSession = 0;
    let skippedNoGenerationId = 0;
    let duplicateCandidates = 0;
    let totalRefundedCredits = 0;

    let nextCursor: ReconcileCursor | null = null;
    let lastCandidateContext: ReconcileCandidateContext | null = null;

    try {
      while (released < limit) {
        let candidates: Array<{
          _creationTime: number;
          createdAt: number;
          sid: string;
          generationId?: string;
        }>;

        if (nextCursor?.mode === "same_created_at") {
          const { createdAt, creationTimeExclusive } = nextCursor;
          candidates = await ctx.db
            .query("creditLedger")
            .withIndex("by_reason_createdAt", (q) =>
              q
                .eq("reason", "reservation")
                .eq("createdAt", createdAt)
                .lt("_creationTime", creationTimeExclusive)
            )
            .order("desc")
            .take(pageSize);
        } else {
          const createdAtExclusive =
            nextCursor?.mode === "older_than_created_at"
              ? nextCursor.createdAtExclusive
              : cutoff;
          candidates = await ctx.db
            .query("creditLedger")
            .withIndex("by_reason_createdAt", (q) =>
              q
                .eq("reason", "reservation")
                .lt("createdAt", createdAtExclusive)
            )
            .order("desc")
            .take(pageSize);
        }
        scanned += candidates.length;

        for (const candidate of candidates) {
          if (released >= limit) {
            break;
          }

          lastCandidateContext = {
            sid: candidate.sid,
            generationId: candidate.generationId,
            candidateCreatedAt: candidate.createdAt,
            phase: "candidate",
          };

          const generationId = candidate.generationId;
          if (!generationId) {
            skippedNoGenerationId += 1;
            continue;
          }

          const dedupeKey = `${candidate.sid}:${generationId}`;
          if (seen.has(dedupeKey)) {
            duplicateCandidates += 1;
            continue;
          }
          seen.add(dedupeKey);

          lastCandidateContext = {
            ...lastCandidateContext,
            phase: "load_ledger",
          };

          const ledgerEntries = await ctx.db
            .query("creditLedger")
            .withIndex("by_generationId", (q) =>
              q.eq("generationId", generationId).eq("sid", candidate.sid)
            )
            .collect();

          const settlement = summarizeGenerationSettlement(ledgerEntries);
          if (settlement.state !== "reserved") {
            skippedSettled += 1;
            continue;
          }

          lastCandidateContext = {
            ...lastCandidateContext,
            phase: "load_session",
            reservedAmount: settlement.reservedAmount,
          };

          const session = await ctx.db
            .query("sessions")
            .withIndex("by_sid", (q) => q.eq("sid", candidate.sid))
            .first();

          if (!session) {
            skippedMissingSession += 1;
            continue;
          }

          const reservedAmount = settlement.reservedAmount;
          const reservationCostUsd = settlement.reservationCostUsd;
          if (reservedAmount <= 0) {
            skippedSettled += 1;
            continue;
          }

          const newCredits = session.credits + reservedAmount;
          const newDailySpend = Math.max(
            0,
            (session.dailySpendUsd ?? 0) - reservationCostUsd
          );

          lastCandidateContext = {
            ...lastCandidateContext,
            phase: "patch_session",
            reservedAmount,
            sessionId: session._id,
          };

          await ctx.db.patch(session._id, {
            credits: newCredits,
            tier: resolveTier(session.tier),
            dailySpendUsd: newDailySpend,
          });

          lastCandidateContext = {
            ...lastCandidateContext,
            phase: "insert_refund",
          };

          await ctx.db.insert("creditLedger", {
            sid: candidate.sid,
            delta: reservedAmount,
            reason: "refund",
            generationId,
            createdAt: now,
          });

          released += 1;
          totalRefundedCredits += reservedAmount;
        }

        if (candidates.length === 0) {
          if (nextCursor?.mode === "same_created_at") {
            nextCursor = {
              mode: "older_than_created_at",
              createdAtExclusive: nextCursor.createdAt,
            };
            continue;
          }
          break;
        }

        const oldestCandidateInBatch = candidates[candidates.length - 1];
        if (!oldestCandidateInBatch) {
          break;
        }

        if (candidates.length < pageSize) {
          if (nextCursor?.mode === "same_created_at") {
            nextCursor = {
              mode: "older_than_created_at",
              createdAtExclusive: nextCursor.createdAt,
            };
            continue;
          }
          break;
        }

        nextCursor = {
          mode: "same_created_at",
          createdAt: oldestCandidateInBatch.createdAt,
          creationTimeExclusive: oldestCandidateInBatch._creationTime,
        };
      }

      return {
        scanned,
        released,
        skippedSettled,
        skippedMissingSession,
        skippedNoGenerationId,
        duplicateCandidates,
        totalRefundedCredits,
        cutoff,
        maxAgeMs,
        limit,
      };
    } catch (error) {
      console.error("[Sessions] reconcileStaleReservations failed:", {
        cutoff,
        maxAgeMs,
        limit,
        scanned,
        released,
        skippedSettled,
        skippedMissingSession,
        skippedNoGenerationId,
        duplicateCandidates,
        totalRefundedCredits,
        lastCandidateContext: sanitizeCandidateContext(lastCandidateContext),
        error,
      });
      throw error;
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

    const settlement = summarizeGenerationSettlement(ledgerEntries);

    // Generation IDs are one-way settled keys. Once released or charged,
    // they cannot be reserved again.
    if (settlement.state === "released" || settlement.state === "charged") {
      return {
        success: false,
        error: "Generation already settled",
      };
    }

    if (settlement.state === "reserved") {
      return {
        success: true,
        newBalance: session.credits,
        alreadyReserved: true,
      };
    }

    // Calculate available credits (current balance minus any pending reservations)
    const pendingReservations = settlement.reservedAmount;
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

    const settlement = summarizeGenerationSettlement(ledgerEntries);

    // Release is idempotent and one-way: once released or charged, never refund again.
    if (
      settlement.state === "none" ||
      settlement.state === "released" ||
      settlement.state === "charged"
    ) {
      return {
        success: true,
        newBalance: session.credits,
        alreadyReleased: true,
      };
    }

    const reservedAmount = settlement.reservedAmount;
    const reservationCostUsd = settlement.reservationCostUsd;

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
 *
 * Supports charging a different actual amount than was reserved:
 * - If actualAmount < reserved: charges actualAmount, refunds the excess
 * - If actualAmount > reserved: charges actualAmount (may deduct additional credits)
 * - If actualAmount not provided: uses reserved amount (backward compatible)
 */
export const deductCreditsInternal = internalMutation({
  args: {
    sid: v.string(),
    amount: v.number(), // Original reserved amount
    modelId: v.string(),
    generationId: v.string(),
    costUsd: v.optional(v.number()), // Original estimated cost
    actualAmount: v.optional(v.number()), // Actual amount to charge (may differ from reserved)
    actualCostUsd: v.optional(v.number()), // Actual USD cost from OpenRouter
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

    // Use actualAmount if provided, otherwise fall back to reserved amount
    const chargeAmount = args.actualAmount ?? args.amount;
    const chargeCostUsd = args.actualCostUsd ?? args.costUsd;

    const settlement = summarizeGenerationSettlement(ledgerEntries);

    if (settlement.state === "charged") {
      return {
        success: true,
        newBalance: session.credits,
        alreadyCharged: true,
      };
    }

    if (settlement.state === "released") {
      return {
        success: true,
        newBalance: session.credits,
        alreadyCharged: true,
      };
    }

    if (settlement.state === "reserved") {
      const reservedAmount = settlement.reservedAmount;
      const reservationCostUsd = settlement.reservationCostUsd;
      const settlementOutcome = computeReservedChargeOutcome({
        currentCredits: session.credits,
        currentDailySpendUsd: session.dailySpendUsd ?? 0,
        reservedAmount,
        reservationCostUsd,
        chargeAmount,
        chargeCostUsd,
      });

      if (settlementOutcome.mode === "refund_excess") {
        // Actual was less than reserved - refund the excess
        // Record generation entry with actual amount
        await ctx.db.insert("creditLedger", {
          sid: args.sid,
          delta: -chargeAmount,
          reason: "generation",
          modelId: args.modelId,
          costUsd: settlementOutcome.generationCostUsd,
          generationId: args.generationId,
          createdAt: Date.now(),
        });

        // Cancel the reservation
        await ctx.db.insert("creditLedger", {
          sid: args.sid,
          delta: reservedAmount,
          reason: "refund",
          generationId: args.generationId,
          createdAt: Date.now(),
        });

        await ctx.db.patch(session._id, {
          credits: settlementOutcome.newBalance,
          dailySpendUsd: settlementOutcome.newDailySpendUsd,
        });

        return {
          success: true,
          newBalance: settlementOutcome.newBalance,
          converted: true,
          refunded: settlementOutcome.refunded,
        };
      }

      if (settlementOutcome.mode === "shortfall") {
        // Not enough credits - charge only what was reserved.
        // Use reservationCostUsd to match the credits being charged (not the higher actual cost).
        await ctx.db.insert("creditLedger", {
          sid: args.sid,
          delta: -reservedAmount,
          reason: "generation",
          modelId: args.modelId,
          costUsd: settlementOutcome.generationCostUsd,
          generationId: args.generationId,
          createdAt: Date.now(),
        });

        // Cancel the reservation (net effect: reservation converted to generation)
        await ctx.db.insert("creditLedger", {
          sid: args.sid,
          delta: reservedAmount,
          reason: "refund",
          generationId: args.generationId,
          createdAt: Date.now(),
        });

        // Balance unchanged - reserved amount was already deducted
        return {
          success: true,
          newBalance: settlementOutcome.newBalance,
          converted: true,
          shortfall: settlementOutcome.shortfall,
        };
      }

      if (settlementOutcome.mode === "charge_additional") {
        // User has enough - charge the full actual amount
        // Record generation entry with actual amount
        await ctx.db.insert("creditLedger", {
          sid: args.sid,
          delta: -chargeAmount,
          reason: "generation",
          modelId: args.modelId,
          costUsd: settlementOutcome.generationCostUsd,
          generationId: args.generationId,
          createdAt: Date.now(),
        });

        // Deduct additional credits from balance
        await ctx.db.patch(session._id, {
          credits: settlementOutcome.newBalance,
          dailySpendUsd: settlementOutcome.newDailySpendUsd,
        });

        // Refund reservation (convert to generation)
        await ctx.db.insert("creditLedger", {
          sid: args.sid,
          delta: reservedAmount,
          reason: "refund",
          generationId: args.generationId,
          createdAt: Date.now(),
        });

        return {
          success: true,
          newBalance: settlementOutcome.newBalance,
          converted: true,
          additionalCharged: settlementOutcome.additionalCharged,
        };
      }

      // settlementOutcome.mode === "exact"
      await ctx.db.insert("creditLedger", {
        sid: args.sid,
        delta: -chargeAmount,
        reason: "generation",
        modelId: args.modelId,
        costUsd: settlementOutcome.generationCostUsd,
        generationId: args.generationId,
        createdAt: Date.now(),
      });

      // Cancel reservation
      await ctx.db.insert("creditLedger", {
        sid: args.sid,
        delta: reservedAmount,
        reason: "refund",
        generationId: args.generationId,
        createdAt: Date.now(),
      });

      // Adjust daily spend if costUsd differs (credits matched but cost didn't)
      if (settlementOutcome.dailySpendChanged) {
        await ctx.db.patch(session._id, {
          dailySpendUsd: settlementOutcome.newDailySpendUsd,
        });
      }

      return {
        success: true,
        newBalance: settlementOutcome.newBalance,
        converted: true,
      };
    }

    // No reservation exists - perform direct debit (backward compatibility)
    if (session.credits < chargeAmount) {
      return {
        success: false,
        error: "Insufficient credits",
        required: chargeAmount,
        available: session.credits,
      };
    }

    const newCredits = session.credits - chargeAmount;

    const nextTier = resolveTier(session.tier);

    // Update session
    await ctx.db.patch(session._id, {
      credits: newCredits,
      tier: nextTier,
    });

    // Record in ledger
    await ctx.db.insert("creditLedger", {
      sid: args.sid,
      delta: -chargeAmount,
      reason: "generation",
      modelId: args.modelId,
      costUsd: chargeCostUsd,
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
 *
 * Supports charging a different actual amount than was reserved:
 * - Pass actualAmount to charge based on actual OpenRouter usage
 * - If actualAmount < reserved, the excess is refunded
 * - If actualAmount > reserved, additional credits are charged
 */
export const deductCredits = action({
  args: {
    sid: v.string(),
    amount: v.number(),
    modelId: v.string(),
    generationId: v.string(),
    costUsd: v.optional(v.number()),
    actualAmount: v.optional(v.number()), // Actual credits to charge (may differ from reserved)
    actualCostUsd: v.optional(v.number()), // Actual USD cost from OpenRouter
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
    refunded?: number;
    additionalCharged?: number;
    shortfall?: number;
  }> => {
    validateServerSecret(args.serverSecret);
    return ctx.runMutation(internal.sessions.deductCreditsInternal, {
      sid: args.sid,
      amount: args.amount,
      modelId: args.modelId,
      generationId: args.generationId,
      costUsd: args.costUsd,
      actualAmount: args.actualAmount,
      actualCostUsd: args.actualCostUsd,
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

// ============================================
// Admin Usage Audit Logging
// ============================================

/**
 * Internal mutation to log admin API usage.
 * SECURITY: Admin bypasses credit checks, so we log usage separately for audit trail.
 * This enables monitoring of admin activity and detection of credential compromise.
 */
export const logAdminUsageInternal = internalMutation({
  args: {
    sid: v.string(),
    endpoint: v.string(),
    modelId: v.string(),
    estimatedCredits: v.number(),
    estimatedCostUsd: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("adminAuditLog", {
      sid: args.sid,
      endpoint: args.endpoint,
      modelId: args.modelId,
      estimatedCredits: args.estimatedCredits,
      estimatedCostUsd: args.estimatedCostUsd,
      createdAt: Date.now(),
    });
  },
});

/**
 * Public action to log admin usage.
 * Validates server secret before calling internal mutation.
 */
export const logAdminUsage = action({
  args: {
    sid: v.string(),
    endpoint: v.string(),
    modelId: v.string(),
    estimatedCredits: v.number(),
    estimatedCostUsd: v.number(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    await ctx.runMutation(internal.sessions.logAdminUsageInternal, {
      sid: args.sid,
      endpoint: args.endpoint,
      modelId: args.modelId,
      estimatedCredits: args.estimatedCredits,
      estimatedCostUsd: args.estimatedCostUsd,
    });
  },
});

/**
 * Query to get admin daily spend for monitoring.
 * SECURITY: Useful for detecting potential admin credential compromise.
 */
export const getAdminDailySpend = query({
  args: {
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const todayStart = getUtcDayStart();
    const entries = await ctx.db
      .query("adminAuditLog")
      .withIndex("by_createdAt")
      .filter((q) => q.gte(q.field("createdAt"), todayStart))
      .collect();

    const totalUsd = entries.reduce((sum, e) => sum + e.estimatedCostUsd, 0);
    const totalCredits = entries.reduce((sum, e) => sum + e.estimatedCredits, 0);

    return {
      todayStart,
      totalUsd,
      totalCredits,
      requestCount: entries.length,
    };
  },
});
