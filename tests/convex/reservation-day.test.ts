import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const sid = "reservation-day-owner";
const beforeMidnight = Date.parse("2026-09-08T23:59:00Z");
const afterMidnight = Date.parse("2026-09-09T00:01:00Z");
const reserve = (generationId: string, costUsd: number) => ({
  sid, generationId, costUsd, amount: 10, modelId: "test",
});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(beforeMidnight); });
afterEach(() => vi.useRealTimers());
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert("sessions", {
    sid, tier: "paid", credits: 100, createdAt: Date.now(), lastSeenAt: Date.now(),
  }));
  const session = () => t.run(ctx => ctx.db.query("sessions").unique());
  return { t, session };
}

describe("reservation admission day", () => {
  it.each(["release", "cleanup", "cheaper", "exact", "additional"])(
    "keeps today's exposure intact during yesterday's %s", async (mode) => {
      const { t, session } = await setup();
      await t.mutation(internal.sessions.reserveCreditsInternal, reserve("yesterday", 4));
      vi.setSystemTime(afterMidnight);
      await t.mutation(internal.sessions.reserveCreditsInternal, reserve("today", 3));
      if (mode === "release") {
        await t.mutation(internal.sessions.releaseReservationInternal, { sid, generationId: "yesterday" });
      } else if (mode === "cleanup") {
        await t.mutation(internal.sessions.reconcileStaleReservations, { maxAgeMs: 60000 });
      } else {
        await t.mutation(internal.sessions.deductCreditsInternal, {
          ...reserve("yesterday", 4),
          actualAmount: mode === "cheaper" ? 5 : mode === "additional" ? 15 : 10,
          actualCostUsd: mode === "additional" ? 4.5 : 1,
        });
      }
      expect((await session())?.dailySpendUsd).toBe(3);
      expect(await t.mutation(internal.sessions.reserveCreditsInternal, reserve("over-limit", 3)))
        .toMatchObject({ success: false, error: "Daily spending limit exceeded" });
    }
  );
  it("returns an existing hold before checking the remaining daily allowance", async () => {
    const { t, session } = await setup();
    await t.mutation(internal.sessions.reserveCreditsInternal, reserve("one", 4));
    expect(await t.mutation(internal.sessions.reserveCreditsInternal, reserve("one", 4)))
      .toMatchObject({ success: true, alreadyReserved: true });
    expect((await session())?.dailySpendUsd).toBe(4);
    expect((await session())?.credits).toBe(90);
  });
  it("admits only one of concurrent requests exceeding the daily allowance", async () => {
    const { t, session } = await setup();
    const results = await Promise.all(["one", "two"].map(id =>
      t.mutation(internal.sessions.reserveCreditsInternal, reserve(id, 3))));
    expect(results.filter(r => r.success)).toHaveLength(1);
    expect((await session())?.dailySpendUsd).toBe(3);
  });
  it("still reconciles the previous bucket before any new-day admission", async () => {
    const { t, session } = await setup();
    await t.mutation(internal.sessions.reserveCreditsInternal, reserve("yesterday", 4));
    vi.setSystemTime(afterMidnight);
    await t.mutation(internal.sessions.releaseReservationInternal, { sid, generationId: "yesterday" });
    expect((await session())?.dailySpendUsd).toBe(0);
    expect(await t.mutation(internal.sessions.reserveCreditsInternal, reserve("today", 5)))
      .toMatchObject({ success: true });
  });
});
