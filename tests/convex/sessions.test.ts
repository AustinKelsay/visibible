/**
 * Unit tests for Convex session credit settlement logic and invariants.
 */

import { describe, it, expect, vi } from "vitest";
import {
  computeReservedChargeOutcome,
  deductCreditsInternal,
  reconcileStaleReservations,
  releaseReservationInternal,
  reserveCreditsInternal,
  summarizeGenerationSettlement,
  validatePositiveAmount,
} from "../../convex/sessions";

type SessionDoc = {
  _id: string;
  sid: string;
  tier: string;
  credits: number;
  dailySpendUsd?: number;
  dailySpendLimitUsd?: number;
  lastDayReset?: number;
};

type LedgerDoc = {
  _id: string;
  _creationTime: number;
  sid: string;
  delta: number;
  reason: string;
  modelId?: string;
  costUsd?: number;
  generationId?: string;
  createdAt: number;
};

type TableName = "sessions" | "creditLedger";

type QueryCondition = {
  op: "eq" | "lt";
  field: string;
  value: unknown;
};

class IndexFilterBuilder {
  constructor(private readonly conditions: QueryCondition[]) {}

  eq(field: string, value: unknown): IndexFilterBuilder {
    this.conditions.push({ op: "eq", field, value });
    return this;
  }

  lt(field: string, value: unknown): IndexFilterBuilder {
    this.conditions.push({ op: "lt", field, value });
    return this;
  }
}

class MockQuery {
  private indexName: string | null = null;
  private readonly conditions: QueryCondition[] = [];
  private orderDirection: "asc" | "desc" | null = null;

  constructor(
    private readonly db: MockDb,
    private readonly table: TableName
  ) {}

  withIndex(
    indexName: string,
    builder: (q: IndexFilterBuilder) => IndexFilterBuilder
  ): MockQuery {
    this.indexName = indexName;
    builder(new IndexFilterBuilder(this.conditions));
    return this;
  }

  order(direction: "asc" | "desc"): MockQuery {
    this.orderDirection = direction;
    return this;
  }

  async first(): Promise<SessionDoc | LedgerDoc | null> {
    const rows = this.rows();
    return rows.length > 0 ? rows[0] : null;
  }

  async collect(): Promise<Array<SessionDoc | LedgerDoc>> {
    return this.rows();
  }

  async take(limit: number): Promise<Array<SessionDoc | LedgerDoc>> {
    return this.rows().slice(0, limit);
  }

  async paginate(args: {
    cursor: string | null;
    numItems: number;
  }): Promise<{
    page: Array<SessionDoc | LedgerDoc>;
    continueCursor: string;
    isDone: boolean;
  }> {
    const rows = this.rows();
    const start = args.cursor ? Number.parseInt(args.cursor, 10) : 0;
    const end = start + args.numItems;
    const page = rows.slice(start, end);
    return {
      page,
      continueCursor: String(end),
      isDone: end >= rows.length,
    };
  }

  private rows(): Array<SessionDoc | LedgerDoc> {
    let rows: Array<SessionDoc | LedgerDoc> =
      this.table === "sessions"
        ? [...this.db.sessions]
        : [...this.db.creditLedger];

    for (const condition of this.conditions) {
      rows = rows.filter((row) => {
        const rowValue = (row as Record<string, unknown>)[condition.field];
        if (condition.op === "eq") return rowValue === condition.value;
        if (condition.op === "lt") {
          return (
            typeof rowValue === "number" &&
            typeof condition.value === "number" &&
            rowValue < condition.value
          );
        }
        return false;
      });
    }

    if (this.table === "creditLedger" && this.indexName === "by_reason_createdAt") {
      rows.sort((a, b) => {
        const ledgerA = a as LedgerDoc;
        const ledgerB = b as LedgerDoc;
        return (
          ledgerA.createdAt - ledgerB.createdAt ||
          ledgerA._creationTime - ledgerB._creationTime
        );
      });
    }

    if (this.orderDirection && this.table === "creditLedger") {
      rows.sort((a, b) => {
        const ledgerA = a as LedgerDoc;
        const ledgerB = b as LedgerDoc;
        const comparison =
          ledgerA.createdAt - ledgerB.createdAt ||
          ledgerA._creationTime - ledgerB._creationTime;

        return this.orderDirection === "asc" ? comparison : -comparison;
      });
    }

    return rows;
  }
}

class MockDb {
  sessions: SessionDoc[] = [];
  creditLedger: LedgerDoc[] = [];
  private sessionIdCounter = 1;
  private ledgerIdCounter = 1;

  query(table: TableName): MockQuery {
    return new MockQuery(this, table);
  }

  async patch(id: string, patch: Record<string, unknown>): Promise<void> {
    const session = this.sessions.find((entry) => entry._id === id);
    if (!session) {
      throw new Error(`Session not found for patch: ${id}`);
    }
    Object.assign(session, patch);
  }

  async insert(table: TableName, payload: Record<string, unknown>): Promise<string> {
    if (table === "sessions") {
      const id = `session-${this.sessionIdCounter++}`;
      this.sessions.push({
        _id: id,
        sid: payload.sid as string,
        tier: payload.tier as string,
        credits: payload.credits as number,
        dailySpendUsd: payload.dailySpendUsd as number | undefined,
        dailySpendLimitUsd: payload.dailySpendLimitUsd as number | undefined,
        lastDayReset: payload.lastDayReset as number | undefined,
      });
      return id;
    }

    const id = `ledger-${this.ledgerIdCounter++}`;
    this.creditLedger.push({
      _id: id,
      _creationTime: this.ledgerIdCounter,
      sid: payload.sid as string,
      delta: payload.delta as number,
      reason: payload.reason as string,
      modelId: payload.modelId as string | undefined,
      costUsd: payload.costUsd as number | undefined,
      generationId: payload.generationId as string | undefined,
      createdAt: payload.createdAt as number,
    });
    return id;
  }
}

function createHarness(overrides?: Partial<SessionDoc>): {
  sid: string;
  db: MockDb;
  ctx: { db: MockDb };
  session: SessionDoc;
} {
  const db = new MockDb();
  const session: SessionDoc = {
    _id: "session-1",
    sid: "test-session",
    tier: "paid",
    credits: 100,
    dailySpendUsd: 0,
    dailySpendLimitUsd: 5,
    lastDayReset: Date.now(),
    ...overrides,
  };
  db.sessions.push(session);
  return { sid: session.sid, db, ctx: { db }, session };
}

type ReserveArgs = {
  sid: string;
  amount: number;
  modelId: string;
  generationId: string;
  costUsd?: number;
};

type ReleaseArgs = {
  sid: string;
  generationId: string;
};

type DeductArgs = {
  sid: string;
  amount: number;
  modelId: string;
  generationId: string;
  costUsd?: number;
  actualAmount?: number;
  actualCostUsd?: number;
};

type ReconcileArgs = {
  maxAgeMs?: number;
  limit?: number;
};

// Intentional fragile coupling: Convex wraps mutation handlers in an object
// with a `_handler` property. These casts extract the raw handler for unit
// testing. If Convex changes its internal export shape, update these casts.
const reserveHandler = (
  reserveCreditsInternal as unknown as {
    _handler: (ctx: { db: MockDb }, args: ReserveArgs) => Promise<Record<string, unknown>>;
  }
)._handler;

const releaseHandler = (
  releaseReservationInternal as unknown as {
    _handler: (ctx: { db: MockDb }, args: ReleaseArgs) => Promise<Record<string, unknown>>;
  }
)._handler;

const deductHandler = (
  deductCreditsInternal as unknown as {
    _handler: (ctx: { db: MockDb }, args: DeductArgs) => Promise<Record<string, unknown>>;
  }
)._handler;

const reconcileHandler = (
  reconcileStaleReservations as unknown as {
    _handler: (ctx: { db: MockDb }, args: ReconcileArgs) => Promise<Record<string, unknown>>;
  }
)._handler;

describe("validatePositiveAmount", () => {
  it("should throw an error for zero amount", () => {
    expect(() => validatePositiveAmount(0)).toThrow(
      "Amount must be a positive number, received: 0"
    );
  });

  it("should throw an error for negative amounts", () => {
    expect(() => validatePositiveAmount(-1)).toThrow(
      "Amount must be a positive number, received: -1"
    );
    expect(() => validatePositiveAmount(-100)).toThrow(
      "Amount must be a positive number, received: -100"
    );
    expect(() => validatePositiveAmount(-0.01)).toThrow(
      "Amount must be a positive number, received: -0.01"
    );
  });

  it("should throw an error for non-finite numbers", () => {
    expect(() => validatePositiveAmount(Infinity)).toThrow();
    expect(() => validatePositiveAmount(-Infinity)).toThrow();
    expect(() => validatePositiveAmount(NaN)).toThrow();
  });

  it("should not throw for positive amounts", () => {
    expect(() => validatePositiveAmount(1)).not.toThrow();
    expect(() => validatePositiveAmount(100)).not.toThrow();
    expect(() => validatePositiveAmount(0.01)).not.toThrow();
    expect(() => validatePositiveAmount(999.99)).not.toThrow();
  });
});

describe("summarizeGenerationSettlement", () => {
  it("classifies empty entries as none", () => {
    const result = summarizeGenerationSettlement([]);
    expect(result.state).toBe("none");
    expect(result.reservedAmount).toBe(0);
  });

  it("classifies reservation-only entries as reserved", () => {
    const result = summarizeGenerationSettlement([
      { reason: "reservation", delta: -12, costUsd: 0.12 },
    ]);
    expect(result.state).toBe("reserved");
    expect(result.hasReservation).toBe(true);
    expect(result.reservedAmount).toBe(12);
    expect(result.reservationCostUsd).toBe(0.12);
  });

  it("classifies refund-without-generation as released", () => {
    const result = summarizeGenerationSettlement([
      { reason: "reservation", delta: -8, costUsd: 0.08 },
      { reason: "refund", delta: 8 },
    ]);
    expect(result.state).toBe("released");
  });

  it("classifies generation as charged even when refund also exists", () => {
    const result = summarizeGenerationSettlement([
      { reason: "reservation", delta: -10, costUsd: 0.1 },
      { reason: "generation", delta: -10, costUsd: 0.1 },
      { reason: "refund", delta: 10 },
    ]);
    expect(result.state).toBe("charged");
    expect(result.hasGeneration).toBe(true);
    expect(result.hasRefund).toBe(true);
  });

  it("sums multiple reservation entries for the same generation", () => {
    const result = summarizeGenerationSettlement([
      { reason: "reservation", delta: -3, costUsd: 0.03 },
      { reason: "reservation", delta: -2, costUsd: 0.02 },
    ]);

    expect(result.state).toBe("reserved");
    expect(result.reservedAmount).toBe(5);
    expect(result.reservationCostUsd).toBe(0.05);
  });

  it("keeps state as charged for replay-style duplicate terminal entries", () => {
    const result = summarizeGenerationSettlement([
      { reason: "reservation", delta: -10, costUsd: 0.1 },
      { reason: "generation", delta: -10, costUsd: 0.1 },
      { reason: "refund", delta: 10 },
      { reason: "generation", delta: -10, costUsd: 0.1 },
      { reason: "refund", delta: 10 },
    ]);

    expect(result.state).toBe("charged");
  });
});

describe("computeReservedChargeOutcome", () => {
  it("refund_excess: refunds when actual charge is lower than reservation", () => {
    const outcome = computeReservedChargeOutcome({
      currentCredits: 20,
      currentDailySpendUsd: 1.2,
      reservedAmount: 10,
      reservationCostUsd: 0.5,
      chargeAmount: 7,
      chargeCostUsd: 0.35,
    });

    expect(outcome.mode).toBe("refund_excess");
    if (outcome.mode !== "refund_excess") throw new Error("unexpected mode");
    expect(outcome.newBalance).toBe(23);
    expect(outcome.refunded).toBe(3);
    expect(outcome.generationCostUsd).toBe(0.35);
    expect(outcome.newDailySpendUsd).toBeCloseTo(1.05);
  });

  it("shortfall: preserves balance when additional charge exceeds available credits", () => {
    const outcome = computeReservedChargeOutcome({
      currentCredits: 2,
      currentDailySpendUsd: 1.2,
      reservedAmount: 10,
      reservationCostUsd: 0.5,
      chargeAmount: 15,
      chargeCostUsd: 0.9,
    });

    expect(outcome.mode).toBe("shortfall");
    if (outcome.mode !== "shortfall") throw new Error("unexpected mode");
    expect(outcome.newBalance).toBe(2);
    expect(outcome.shortfall).toBe(5);
    expect(outcome.generationCostUsd).toBe(0.5);
  });

  it("charge_additional: deducts extra credits when user can cover the delta", () => {
    const outcome = computeReservedChargeOutcome({
      currentCredits: 8,
      currentDailySpendUsd: 1.2,
      reservedAmount: 10,
      reservationCostUsd: 0.5,
      chargeAmount: 14,
      chargeCostUsd: 0.9,
    });

    expect(outcome.mode).toBe("charge_additional");
    if (outcome.mode !== "charge_additional") throw new Error("unexpected mode");
    expect(outcome.newBalance).toBe(4);
    expect(outcome.additionalCharged).toBe(4);
    expect(outcome.generationCostUsd).toBe(0.9);
    expect(outcome.newDailySpendUsd).toBeCloseTo(1.6);
  });

  it("exact: no-op daily spend when estimated and actual USD match", () => {
    const outcome = computeReservedChargeOutcome({
      currentCredits: 8,
      currentDailySpendUsd: 1.2,
      reservedAmount: 10,
      reservationCostUsd: 0.5,
      chargeAmount: 10,
      chargeCostUsd: 0.5,
    });

    expect(outcome.mode).toBe("exact");
    if (outcome.mode !== "exact") throw new Error("unexpected mode");
    expect(outcome.newBalance).toBe(8);
    expect(outcome.dailySpendChanged).toBe(false);
    expect(outcome.newDailySpendUsd).toBe(1.2);
  });

  it("exact: adjusts daily spend when credits match but USD estimate differs", () => {
    const outcome = computeReservedChargeOutcome({
      currentCredits: 8,
      currentDailySpendUsd: 0.1,
      reservedAmount: 10,
      reservationCostUsd: 0.5,
      chargeAmount: 10,
      chargeCostUsd: 0.9,
    });

    expect(outcome.mode).toBe("exact");
    if (outcome.mode !== "exact") throw new Error("unexpected mode");
    expect(outcome.dailySpendChanged).toBe(true);
    expect(outcome.newDailySpendUsd).toBeCloseTo(0.5);
  });
});

describe("internal mutation settlement invariants", () => {
  it("reserve -> release is idempotent and restores credits only once", async () => {
    const { sid, db, ctx, session } = createHarness({ credits: 100, dailySpendUsd: 0 });

    const reserveResult = await reserveHandler(ctx, {
      sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-release-idempotent",
      costUsd: 0.5,
    });
    expect(reserveResult).toMatchObject({ success: true, newBalance: 90 });
    expect(session.credits).toBe(90);
    expect(session.dailySpendUsd).toBeCloseTo(0.5);

    const releaseResult = await releaseHandler(ctx, {
      sid,
      generationId: "gen-release-idempotent",
    });
    expect(releaseResult).toMatchObject({ success: true, newBalance: 100 });
    expect(session.credits).toBe(100);
    expect(session.dailySpendUsd).toBe(0);

    const releaseAgain = await releaseHandler(ctx, {
      sid,
      generationId: "gen-release-idempotent",
    });
    expect(releaseAgain).toMatchObject({
      success: true,
      alreadyReleased: true,
      newBalance: 100,
    });
    expect(
      db.creditLedger.filter(
        (entry) =>
          entry.generationId === "gen-release-idempotent" &&
          entry.reason === "refund"
      )
    ).toHaveLength(1);
  });

  it("reserve -> deduct exact is one-way settled and replay-safe", async () => {
    const { sid, db, ctx, session } = createHarness({ credits: 100, dailySpendUsd: 0 });

    await reserveHandler(ctx, {
      sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-exact",
      costUsd: 0.5,
    });
    const deductResult = await deductHandler(ctx, {
      sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-exact",
      costUsd: 0.5,
      actualAmount: 10,
      actualCostUsd: 0.5,
    });
    expect(deductResult).toMatchObject({
      success: true,
      converted: true,
      newBalance: 90,
    });
    expect(session.credits).toBe(90);

    const deductReplay = await deductHandler(ctx, {
      sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-exact",
      costUsd: 0.5,
      actualAmount: 10,
      actualCostUsd: 0.5,
    });
    expect(deductReplay).toMatchObject({
      success: true,
      alreadyCharged: true,
      newBalance: 90,
    });

    const reserveAfterSettlement = await reserveHandler(ctx, {
      sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-exact",
      costUsd: 0.5,
    });
    expect(reserveAfterSettlement).toMatchObject({
      success: false,
      error: "Generation already settled",
    });
    expect(
      db.creditLedger.filter(
        (entry) =>
          entry.generationId === "gen-exact" && entry.reason === "generation"
      )
    ).toHaveLength(1);
  });

  it("reserve -> deduct refund_excess refunds balance and daily spend delta", async () => {
    const { sid, ctx, session } = createHarness({ credits: 100, dailySpendUsd: 0 });

    await reserveHandler(ctx, {
      sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-refund",
      costUsd: 1.0,
    });

    const deductResult = await deductHandler(ctx, {
      sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-refund",
      costUsd: 1.0,
      actualAmount: 7,
      actualCostUsd: 0.7,
    });

    expect(deductResult).toMatchObject({
      success: true,
      converted: true,
      refunded: 3,
      newBalance: 93,
    });
    expect(session.credits).toBe(93);
    expect(session.dailySpendUsd).toBeCloseTo(0.7);
  });

  it("reserve -> deduct charge_additional and shortfall behave as expected", async () => {
    const chargeAdditional = createHarness({
      credits: 20,
      dailySpendUsd: 0,
    });

    await reserveHandler(chargeAdditional.ctx, {
      sid: chargeAdditional.sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-additional",
      costUsd: 1.0,
    });
    const additionalResult = await deductHandler(chargeAdditional.ctx, {
      sid: chargeAdditional.sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-additional",
      costUsd: 1.0,
      actualAmount: 15,
      actualCostUsd: 1.5,
    });
    expect(additionalResult).toMatchObject({
      success: true,
      converted: true,
      additionalCharged: 5,
      newBalance: 5,
    });
    expect(chargeAdditional.session.credits).toBe(5);
    expect(chargeAdditional.session.dailySpendUsd).toBeCloseTo(1.5);

    const shortfall = createHarness({
      credits: 12,
      dailySpendUsd: 0,
    });

    await reserveHandler(shortfall.ctx, {
      sid: shortfall.sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-shortfall",
      costUsd: 1.0,
    });
    const shortfallResult = await deductHandler(shortfall.ctx, {
      sid: shortfall.sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-shortfall",
      costUsd: 1.0,
      actualAmount: 15,
      actualCostUsd: 1.5,
    });
    expect(shortfallResult).toMatchObject({
      success: true,
      converted: true,
      shortfall: 5,
      newBalance: 2,
    });
    expect(shortfall.session.credits).toBe(2);
    expect(shortfall.session.dailySpendUsd).toBeCloseTo(1.0);
  });

  it("reconcileStaleReservations only releases unresolved reservations", async () => {
    const { sid, db, ctx, session } = createHarness({
      credits: 30,
      dailySpendUsd: 0,
    });

    await reserveHandler(ctx, {
      sid,
      amount: 10,
      modelId: "test/model",
      generationId: "gen-stale-open",
      costUsd: 1.0,
    });
    await reserveHandler(ctx, {
      sid,
      amount: 5,
      modelId: "test/model",
      generationId: "gen-stale-settled",
      costUsd: 0.5,
    });
    await deductHandler(ctx, {
      sid,
      amount: 5,
      modelId: "test/model",
      generationId: "gen-stale-settled",
      costUsd: 0.5,
      actualAmount: 5,
      actualCostUsd: 0.5,
    });

    const staleTs = Date.now() - 60 * 60 * 1000;
    db.creditLedger
      .filter((entry) => entry.reason === "reservation")
      .forEach((entry) => {
        entry.createdAt = staleTs;
      });

    const reconcileResult = await reconcileHandler(ctx, {
      maxAgeMs: 30_000,
      limit: 10,
    });

    expect(reconcileResult).toMatchObject({
      released: 1,
      totalRefundedCredits: 10,
    });
    expect(session.credits).toBe(25);
    expect(session.dailySpendUsd).toBeCloseTo(0.5);
    expect(
      db.creditLedger.filter(
        (entry) =>
          entry.generationId === "gen-stale-open" && entry.reason === "refund"
      )
    ).toHaveLength(1);
    expect(
      db.creditLedger.filter(
        (entry) =>
          entry.generationId === "gen-stale-settled" && entry.reason === "refund"
      )
    ).toHaveLength(1);
  });

  it("reconcileStaleReservations continues within a shared createdAt bucket", async () => {
    const { sid, db, ctx, session } = createHarness({
      credits: 200,
      dailySpendUsd: 0,
    });

    for (let index = 0; index < 10; index += 1) {
      await reserveHandler(ctx, {
        sid,
        amount: 1,
        modelId: "test/model",
        generationId: `gen-open-${index}`,
        costUsd: 0.1,
      });
    }

    for (let index = 0; index < 50; index += 1) {
      const generationId = `gen-settled-${index}`;
      await reserveHandler(ctx, {
        sid,
        amount: 1,
        modelId: "test/model",
        generationId,
        costUsd: 0.1,
      });
      await deductHandler(ctx, {
        sid,
        amount: 1,
        modelId: "test/model",
        generationId,
        costUsd: 0.1,
        actualAmount: 1,
        actualCostUsd: 0.1,
      });
    }

    const staleTs = Date.now() - 60 * 60 * 1000;
    db.creditLedger
      .filter((entry) => entry.reason === "reservation")
      .forEach((entry) => {
        entry.createdAt = staleTs;
      });

    const reconcileResult = await reconcileHandler(ctx, {
      maxAgeMs: 30_000,
      limit: 10,
    });

    expect(reconcileResult).toMatchObject({
      released: 10,
      totalRefundedCredits: 10,
    });
    expect(session.credits).toBe(150);
    expect(
      db.creditLedger.filter(
        (entry) =>
          entry.reason === "refund" &&
          entry.generationId?.startsWith("gen-open-")
      )
    ).toHaveLength(10);
  });

  it("redacts identifiers in reconcileStaleReservations error logs", async () => {
    const { sid, db, ctx } = createHarness({
      credits: 20,
      dailySpendUsd: 0,
    });

    await reserveHandler(ctx, {
      sid,
      amount: 5,
      modelId: "test/model",
      generationId: "gen-log-redaction",
      costUsd: 0.5,
    });

    const staleTs = Date.now() - 60 * 60 * 1000;
    db.creditLedger
      .filter((entry) => entry.reason === "reservation")
      .forEach((entry) => {
        entry.createdAt = staleTs;
      });

    const error = new Error("patch failed");
    db.patch = vi.fn(async () => {
      throw error;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(reconcileHandler(ctx, {
      maxAgeMs: 30_000,
      limit: 1,
    })).rejects.toThrow("patch failed");

    const payload = errorSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    const lastCandidateContext = payload.lastCandidateContext as Record<string, unknown>;

    expect(lastCandidateContext.sessionId).toBeDefined();
    expect(lastCandidateContext.sid).not.toBe(sid);
    expect(lastCandidateContext.generationId).not.toBe("gen-log-redaction");
    expect(lastCandidateContext.sessionId).not.toBe("session-1");
    expect(String(lastCandidateContext.sid)).toContain("...");
    expect(String(lastCandidateContext.generationId)).toContain("...");
    expect(String(lastCandidateContext.sessionId)).toContain("...");

    errorSpy.mockRestore();
  });
});
