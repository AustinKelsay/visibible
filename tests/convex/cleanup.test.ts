import { convexTest } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const session = (sid: string, credits = 0) => ({
  sid, credits, tier: "paid", createdAt: 1, lastSeenAt: 1, expiresAt: 2,
});
afterEach(() => vi.useRealTimers());

describe("expired-session retention", () => {
  it("retains funds, ledger links and invoices while deleting only empty unlinked sessions", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const sid of ["empty", "funded", "ledger", "invoice"]) {
        await ctx.db.insert("sessions", session(sid, sid === "funded" ? 100 : 0));
      }
      await ctx.db.insert("creditLedger", { sid: "ledger", delta: -1, reason: "reservation", createdAt: 1, generationId: "held" });
      await ctx.db.insert("invoices", { sid: "invoice", invoiceId: "pending", status: "expired", amountUsd: 1, amountSats: 1000, bolt11: "synthetic", createdAt: 1, expiresAt: 2 });
    });
    const preview = await t.mutation(internal.cleanup.cleanupExpiredSessions, { dryRun: true });
    expect(preview).toMatchObject({ deleted: 0, eligible: 1, retained: 3 });
    expect(await t.run((ctx) => ctx.db.query("sessions").collect())).toHaveLength(4);
    expect(await t.mutation(internal.cleanup.cleanupExpiredSessions, {})).toMatchObject({ deleted: 1, retained: 3 });
    const rows = await t.run((ctx) => ctx.db.query("sessions").collect());
    expect(rows.map((row) => row.sid).sort()).toEqual(["funded", "invoice", "ledger"]);
  });

  it("continues beyond a retained first page without looping or starving later eligible rows", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) await ctx.db.insert("sessions", session(`funded-${i}`, 1));
      await ctx.db.insert("sessions", { ...session("empty"), expiresAt: 3 });
    });
    expect(await t.mutation(internal.cleanup.cleanupExpiredSessions, {})).toMatchObject({ scanned: 50, retained: 50, hasMore: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await t.run((ctx) => ctx.db.query("sessions").collect());
    expect(rows).toHaveLength(60);
    expect(rows.some((row) => row.sid === "empty")).toBe(false);
  });

  it("does not delete sessions whose access/storage expiry has not elapsed", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("sessions", { ...session("active"), expiresAt: Date.now() + 60000 }));
    expect(await t.mutation(internal.cleanup.cleanupExpiredSessions, {})).toMatchObject({ deleted: 0, scanned: 0 });
  });
  it("resumes after the run budget instead of starving rows behind retained sessions", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 1001; i++) await ctx.db.insert("sessions", session(`retained-${i}`, 1));
      await ctx.db.insert("sessions", session("eventual-empty"));
    });
    await t.mutation(internal.cleanup.cleanupExpiredSessions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query("sessions").withIndex("by_sid", (q) => q.eq("sid", "eventual-empty")).first())).not.toBeNull();
    await t.mutation(internal.cleanup.cleanupExpiredSessions, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query("sessions").withIndex("by_sid", (q) => q.eq("sid", "eventual-empty")).first())).toBeNull();
  });

});
