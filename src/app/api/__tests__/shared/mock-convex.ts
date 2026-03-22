/**
 * Mock Convex client for integration tests.
 * Provides stateful mock that tracks sessions, ledger entries, and call history.
 */

import { vi } from "vitest";
import type { Session } from "./test-fixtures";

export interface LedgerEntry {
  sid: string;
  delta: number;
  reason: string;
  modelId?: string;
  generationId?: string;
  costUsd?: number;
  createdAt: number;
}

export interface AdminAuditEntry {
  sid: string;
  endpoint: string;
  modelId: string;
  estimatedCredits: number;
  estimatedCostUsd: number;
  createdAt: number;
}

export interface ConvexMockState {
  sessions: Map<string, Session>;
  ledger: LedgerEntry[];
  adminAuditLog: AdminAuditEntry[];
  callHistory: Array<{ method: string; action: string; args: unknown }>;
}

export interface ReserveCreditsResult {
  success: boolean;
  newBalance?: number;
  error?: string;
  alreadyReserved?: boolean;
  required?: number;
  available?: number;
  dailyLimit?: number;
  dailySpent?: number;
  remaining?: number;
}

export interface DeductCreditsResult {
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
}

export interface ReleaseReservationResult {
  success: boolean;
  newBalance?: number;
  error?: string;
  alreadyReleased?: boolean;
}

export interface AddCreditsResult {
  newBalance: number;
}

/**
 * Creates a stateful mock Convex client.
 * Use this to simulate Convex behavior in tests.
 */
export function createMockConvexClient(initialSessions: Session[] = []) {
  const state: ConvexMockState = {
    sessions: new Map(initialSessions.map((s) => [s.sid, { ...s }])),
    ledger: [],
    adminAuditLog: [],
    callHistory: [],
  };

  const mockClient = {
    query: vi.fn(async (apiPath: { _path: string }, args: { sid?: string }) => {
      state.callHistory.push({ method: "query", action: apiPath._path, args });

      if (apiPath._path === "sessions:getSession") {
        const session = state.sessions.get(args.sid || "");
        return session || null;
      }

       if (apiPath._path === "modelCostStats:getEstimate") {
        return {
          credits: Math.max(
            1,
            Math.round((args as { fallbackCredits?: number }).fallbackCredits ?? 1)
          ),
          source: "fallback",
          sampleCount: 0,
        };
      }

      if (apiPath._path === "modelCostStats:getAllEstimates") {
        return [];
      }
      return null;
    }),

    mutation: vi.fn(
      async (apiPath: { _path: string }, args: Record<string, unknown>) => {
        state.callHistory.push({ method: "mutation", action: apiPath._path, args });

        if (apiPath._path === "rateLimit:checkRateLimit") {
          return { allowed: true, retryAfter: 0 };
        }

        if (apiPath._path === "modelStats:recordGeneration") {
          return;
        }

        if (apiPath._path === "modelCostStats:recordActualCost") {
          return;
        }

        if (apiPath._path === "modelCostStats:backfillFromGenerationRequests") {
          return { processed: 0, skipped: 0, alreadySeeded: true };
        }

        return null;
      }
    ),

    action: vi.fn(
      async (
        apiPath: { _path: string },
        args: Record<string, unknown>
      ): Promise<
        | ReserveCreditsResult
        | DeductCreditsResult
        | ReleaseReservationResult
        | AddCreditsResult
        | void
      > => {
        state.callHistory.push({ method: "action", action: apiPath._path, args });

        const sid = args.sid as string;
        const session = state.sessions.get(sid);

        // Handle reserveCredits
        if (apiPath._path === "sessions:reserveCredits") {
          if (!session) {
            return { success: false, error: "Session not found" };
          }

          const amount = args.amount as number;
          const costUsd = (args.costUsd as number) || 0;
          const dailyLimit = session.dailySpendLimitUsd ?? 5.0;
          const currentDailySpend = session.dailySpendUsd ?? 0;

          // Check daily limit (admin bypasses)
          if (session.tier !== "admin" && currentDailySpend + costUsd > dailyLimit) {
            return {
              success: false,
              error: "Daily spending limit exceeded",
              dailyLimit,
              dailySpent: currentDailySpend,
              remaining: Math.max(0, dailyLimit - currentDailySpend),
            };
          }

          // Check credits
          if (session.credits < amount) {
            return {
              success: false,
              error: "Insufficient credits",
              required: amount,
              available: session.credits,
            };
          }

          // Reserve credits
          session.credits -= amount;
          session.dailySpendUsd = (session.dailySpendUsd ?? 0) + costUsd;

          state.ledger.push({
            sid,
            delta: -amount,
            reason: "reservation",
            modelId: args.modelId as string,
            generationId: args.generationId as string,
            costUsd,
            createdAt: Date.now(),
          });

          return { success: true, newBalance: session.credits };
        }

        // Handle deductCredits
        if (apiPath._path === "sessions:deductCredits") {
          if (!session) {
            return { success: false, error: "Session not found" };
          }

          const reservedAmount = args.amount as number;
          const actualAmount = (args.actualAmount as number) ?? reservedAmount;
          const generationId = args.generationId as string;

          // Find reservation
          const reservationIdx = state.ledger.findIndex(
            (e) =>
              e.sid === sid &&
              e.generationId === generationId &&
              e.reason === "reservation"
          );

          if (reservationIdx >= 0) {
            const reservation = state.ledger[reservationIdx];
            const reservedCredits = Math.abs(reservation.delta);
            const difference = reservedCredits - actualAmount;

            // Convert reservation to generation
            state.ledger.push({
              sid,
              delta: -actualAmount,
              reason: "generation",
              modelId: args.modelId as string,
              generationId,
              costUsd: args.actualCostUsd as number,
              createdAt: Date.now(),
            });

            // Refund reservation
            state.ledger.push({
              sid,
              delta: reservedCredits,
              reason: "refund",
              generationId,
              createdAt: Date.now(),
            });

            if (difference > 0) {
              // Refund excess
              session.credits += difference;
              return {
                success: true,
                newBalance: session.credits,
                converted: true,
                refunded: difference,
              };
            } else if (difference < 0) {
              // Need additional credits
              const additionalNeeded = Math.abs(difference);
              if (session.credits < additionalNeeded) {
                // Shortfall - charge only reserved amount
                return {
                  success: true,
                  newBalance: session.credits,
                  converted: true,
                  shortfall: additionalNeeded,
                };
              }
              session.credits -= additionalNeeded;
              return {
                success: true,
                newBalance: session.credits,
                converted: true,
                additionalCharged: additionalNeeded,
              };
            }

            return { success: true, newBalance: session.credits, converted: true };
          }

          // Direct debit (no reservation)
          if (session.credits < actualAmount) {
            return {
              success: false,
              error: "Insufficient credits",
              required: actualAmount,
              available: session.credits,
            };
          }

          session.credits -= actualAmount;
          state.ledger.push({
            sid,
            delta: -actualAmount,
            reason: "generation",
            modelId: args.modelId as string,
            generationId: args.generationId as string,
            costUsd: args.actualCostUsd as number,
            createdAt: Date.now(),
          });

          return { success: true, newBalance: session.credits };
        }

        // Handle releaseReservation
        if (apiPath._path === "sessions:releaseReservation") {
          if (!session) {
            return { success: false, error: "Session not found" };
          }

          const generationId = args.generationId as string;

          // Find reservation
          const reservationIdx = state.ledger.findIndex(
            (e) =>
              e.sid === sid &&
              e.generationId === generationId &&
              e.reason === "reservation"
          );

          if (reservationIdx < 0) {
            return { success: true, newBalance: session.credits, alreadyReleased: true };
          }

          const reservation = state.ledger[reservationIdx];
          const amount = Math.abs(reservation.delta);
          const costUsd = reservation.costUsd ?? 0;

          // Restore credits
          session.credits += amount;
          session.dailySpendUsd = Math.max(0, (session.dailySpendUsd ?? 0) - costUsd);

          // Record refund
          state.ledger.push({
            sid,
            delta: amount,
            reason: "refund",
            generationId,
            createdAt: Date.now(),
          });

          return { success: true, newBalance: session.credits };
        }

        // Handle addCredits (for scene planner refund)
        if (apiPath._path === "sessions:addCredits") {
          if (!session) {
            throw new Error("Session not found");
          }

          const amount = args.amount as number;
          session.credits += amount;

          state.ledger.push({
            sid,
            delta: amount,
            reason: args.reason as string,
            createdAt: Date.now(),
          });

          return { newBalance: session.credits };
        }

        // Handle logAdminUsage
        if (apiPath._path === "sessions:logAdminUsage") {
          state.adminAuditLog.push({
            sid,
            endpoint: args.endpoint as string,
            modelId: args.modelId as string,
            estimatedCredits: args.estimatedCredits as number,
            estimatedCostUsd: args.estimatedCostUsd as number,
            createdAt: Date.now(),
          });
          return;
        }

        return;
      }
    ),
  };

  return {
    client: mockClient,
    state,

    // Helper to get session state
    getSession: (sid: string) => state.sessions.get(sid),

    // Helper to get ledger entries for a session
    getLedgerEntries: (sid: string) => state.ledger.filter((e) => e.sid === sid),

    // Helper to get admin audit entries
    getAdminAuditEntries: (sid: string) =>
      state.adminAuditLog.filter((e) => e.sid === sid),

    // Helper to check if reservation exists
    hasReservation: (generationId: string) =>
      state.ledger.some(
        (e) => e.generationId === generationId && e.reason === "reservation"
      ),

    // Helper to check if deduction exists
    hasDeduction: (generationId: string) =>
      state.ledger.some(
        (e) => e.generationId === generationId && e.reason === "generation"
      ),

    // Helper to check if release/refund exists
    hasRelease: (generationId: string) =>
      state.ledger.some(
        (e) => e.generationId === generationId && e.reason === "refund"
      ),

    // Helper to reset state
    reset: (sessions: Session[] = []) => {
      state.sessions.clear();
      sessions.forEach((s) => state.sessions.set(s.sid, { ...s }));
      state.ledger.length = 0;
      state.adminAuditLog.length = 0;
      state.callHistory.length = 0;
    },

    // Helper to get call count for specific action
    getCallCount: (action: string) =>
      state.callHistory.filter((c) => c.action === action).length,
  };
}

// Note: Do not use setupConvexMocks with vi.mock - vi.mock is hoisted
// Instead, define the mock directly in your test file with vi.mock at the top level
// and reference the mockConvex variable there.
