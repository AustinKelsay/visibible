import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { FREE_ANSWER_LIMITS } from "../../convex/freeAnswers";
import { modules } from "./modules";

const SECRET = "free-answers-secret";
const noon = Date.parse("2026-11-17T12:00:00Z");

beforeEach(() => {
  process.env.CONVEX_SERVER_SECRET = SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(noon);
});
afterEach(() => vi.useRealTimers());

function setup() {
  const t = convexTest(schema, modules);
  let next = 0;
  const reserve = (sid = "guest", network = "net-1", worstCaseUsd = 0.003, generationId = `gen-${++next}`) =>
    t.mutation(api.freeAnswers.reserve, { sid, network, worstCaseUsd, generationId, serverSecret: SECRET });
  const settle = (generationId: string, outcome: "returned" | "settled", costUsd?: number) =>
    t.mutation(api.freeAnswers.settle, { generationId, outcome, ...(costUsd === undefined ? {} : { costUsd }), serverSecret: SECRET });
  const status = (sid = "guest", network = "net-1", worstCaseUsd = 0.003) =>
    t.query(api.freeAnswers.status, { sid, network, worstCaseUsd, serverSecret: SECRET });
  const report = (day?: string) => t.query(api.freeAnswers.report, { ...(day ? { day } : {}), serverSecret: SECRET });
  const budget = (period: string) => t.run((ctx) => ctx.db.query("freeAnswerBudget").withIndex("by_period", (q) => q.eq("period", period)).unique());
  return { t, reserve, settle, status, report, budget };
}

describe("free answers", () => {
  it("allows 20 a session and 100 a network each UTC day, then refuses with the reason", async () => {
    const { reserve, status } = setup();
    expect(FREE_ANSWER_LIMITS).toEqual({ perSession: 20, perNetwork: 100, dailyUsd: 1, monthlyUsd: 30 });
    expect(await status()).toEqual({ available: true, remaining: 20 });
    for (let i = 0; i < 20; i++) expect(await reserve()).toMatchObject({ allowed: true, remaining: 19 - i });
    expect(await reserve()).toEqual({ allowed: false, reason: "session" });
    expect(await status()).toEqual({ available: false, reason: "session" });

    // New sessions on the same network share its 100.
    for (let s = 1; s <= 4; s++) for (let i = 0; i < 20; i++) await reserve(`guest-${s}`);
    expect(await reserve("guest-5")).toEqual({ allowed: false, reason: "network" });
    expect(await reserve("guest-5", "net-2")).toMatchObject({ allowed: true });
  });

  it("lets no concurrent burst past a limit", async () => {
    const { reserve } = setup();
    const results = await Promise.all(Array.from({ length: 30 }, () => reserve()));
    expect(results.filter((result) => result.allowed)).toHaveLength(20);
  });

  it("holds each answer's worst case against the day's and the month's budget", async () => {
    const { reserve, budget, t } = setup();
    for (let i = 0; i < 3; i++) expect(await reserve(`guest-${i}`, `net-${i}`, 0.3)).toMatchObject({ allowed: true });
    expect(await reserve("guest-x", "net-x", 0.3)).toEqual({ allowed: false, reason: "day" });
    expect(await budget("2026-11-17")).toMatchObject({ spentUsd: expect.closeTo(0.9, 10), answers: 3 });
    expect(await budget("2026-11")).toMatchObject({ spentUsd: expect.closeTo(0.9, 10), answers: 3 });

    const month = await budget("2026-11");
    await t.run((ctx) => ctx.db.patch(month!._id, { spentUsd: 29.999 }));
    vi.setSystemTime(Date.parse("2026-11-18T00:00:01Z"));
    expect(await reserve("guest-y", "net-y", 0.003)).toEqual({ allowed: false, reason: "month" });
  });

  it("starts each UTC day afresh but keeps the month", async () => {
    const { reserve, budget } = setup();
    for (let i = 0; i < 20; i++) await reserve();
    expect(await reserve()).toMatchObject({ allowed: false });
    vi.setSystemTime(Date.parse("2026-11-18T00:00:00Z"));
    expect(await reserve()).toMatchObject({ allowed: true, remaining: 19 });
    expect((await budget("2026-11"))?.answers).toBe(21);
    expect((await budget("2026-11-18"))?.answers).toBe(1);
  });

  it("settles to the cost, keeps the hold when the cost is unknown, and gives a failed turn back", async () => {
    const { reserve, settle, budget, status } = setup();
    await reserve("guest", "net-1", 0.003, "known");
    await reserve("guest", "net-1", 0.003, "unknown");
    await reserve("guest", "net-1", 0.003, "failed");
    expect(await status()).toEqual({ available: true, remaining: 17 });

    expect(await settle("known", "settled", 0.0004)).toMatchObject({ settled: true });
    expect(await settle("unknown", "settled")).toMatchObject({ settled: true });
    expect(await settle("failed", "returned")).toMatchObject({ settled: true });
    expect(await budget("2026-11-17")).toMatchObject({ spentUsd: expect.closeTo(0.0034, 10), answers: 2 });
    expect(await status()).toEqual({ available: true, remaining: 18 });

    // Settling again changes nothing.
    expect(await settle("known", "settled", 0)).toMatchObject({ settled: false });
    expect(await settle("failed", "returned")).toMatchObject({ settled: false });
    expect(await budget("2026-11-17")).toMatchObject({ spentUsd: expect.closeTo(0.0034, 10), answers: 2 });
  });

  it("settles against the day the answer was reserved in, not the day it finished", async () => {
    const { reserve, settle, budget } = setup();
    vi.setSystemTime(Date.parse("2026-11-17T23:59:59Z"));
    await reserve("guest", "net-1", 0.003, "late");
    vi.setSystemTime(Date.parse("2026-11-18T00:00:05Z"));
    await reserve("guest", "net-1", 0.003, "early");
    await settle("late", "returned");
    expect((await budget("2026-11-17"))?.spentUsd).toBeCloseTo(0, 10);
    expect((await budget("2026-11-18"))?.spentUsd).toBeCloseTo(0.003, 10);
  });

  it("counts a generation once, however often it is reserved", async () => {
    const { reserve, status } = setup();
    await reserve("guest", "net-1", 0.003, "same");
    await reserve("guest", "net-1", 0.003, "same");
    expect(await status()).toEqual({ available: true, remaining: 19 });
  });

  it("reports the day for the owner and warns at 80% of the month", async () => {
    const { reserve, settle, report, budget, t } = setup();
    for (let i = 0; i < 20; i++) await reserve();
    await settle("gen-1", "settled", 0.001);
    expect(await report()).toMatchObject({
      day: "2026-11-17", answers: 20, sessionsAtLimit: 1, networksAtLimit: 0, dailyBudgetUsd: 1,
      month: "2026-11", monthlyBudgetUsd: 30, monthWarning: false,
    });
    const month = await budget("2026-11");
    await t.run((ctx) => ctx.db.patch(month!._id, { spentUsd: 24.5 }));
    expect((await report()).monthWarning).toBe(true);
    expect((await settle("gen-2", "settled", 0.001)).monthWarning).toBe(true);
  });

  it("refuses callers without the server secret and nonsense worst cases", async () => {
    const { t } = setup();
    await expect(t.mutation(api.freeAnswers.reserve, { sid: "g", network: "n", worstCaseUsd: 0.003, generationId: "x", serverSecret: "wrong" })).rejects.toThrow();
    await expect(t.mutation(api.freeAnswers.reserve, { sid: "g", network: "n", worstCaseUsd: 0, generationId: "x", serverSecret: SECRET })).rejects.toThrow();
    await expect(t.query(api.freeAnswers.status, { sid: "g", network: "n", worstCaseUsd: Number.NaN, serverSecret: SECRET })).rejects.toThrow();
  });

  it("drops old counts and records but keeps the budget", async () => {
    const { reserve, t, budget } = setup();
    await reserve();
    vi.setSystemTime(Date.parse("2026-12-30T12:00:00Z"));
    expect(await t.mutation(internal.freeAnswers.cleanup, {})).toEqual({ counts: 2, answers: 1 });
    expect((await budget("2026-11"))?.answers).toBe(1);
  });
});
