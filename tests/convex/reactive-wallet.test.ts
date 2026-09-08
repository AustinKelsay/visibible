import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";
const sid = "wallet-owner";
beforeEach(() => vi.stubEnv("GUEST_AUTH_ISSUER", "https://guest.example"));
afterEach(() => vi.unstubAllEnvs());
async function setup(credits = 100) {
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert("sessions", { sid, tier: "paid", credits, createdAt: Date.now(), lastSeenAt: Date.now() }));
  const guest = t.withIdentity({ subject: sid, issuer: "https://guest.example", guestExpiresAt: Date.now() / 1000 + 600 });
  return { t, wallet: () => guest.query(api.guestAuth.current, {}) };
}
const reservation = (generationId: string, amount = 20) => ({ sid, generationId, amount, modelId: "test" });
describe("authoritative available credits and holds", () => {
  it("tracks overlapping holds, purchases, cheaper settlement and refunds atomically", async () => {
    const { t, wallet } = await setup();
    await Promise.all([
      t.mutation(internal.sessions.reserveCreditsInternal, reservation("one", 30)),
      t.mutation(internal.sessions.reserveCreditsInternal, reservation("two", 20)),
    ]);
    expect(await wallet()).toMatchObject({ credits: 50, pendingCredits: 50 });
    await t.mutation(internal.sessions.addCreditsInternal, { sid, amount: 100, reason: "purchase" });
    expect(await wallet()).toMatchObject({ credits: 150, pendingCredits: 50 });
    await t.mutation(internal.sessions.deductCreditsInternal, { ...reservation("one", 30), actualAmount: 10 });
    expect(await wallet()).toMatchObject({ credits: 170, pendingCredits: 20 });
    await Promise.all(Array.from({ length: 3 }, () => t.mutation(internal.sessions.releaseReservationInternal, { sid, generationId: "two" })));
    expect(await wallet()).toMatchObject({ credits: 190, pendingCredits: 0 });
  });
  it.each([20, 30, 150])("clears holds for exact/additional/shortfall settlement at %i", async (actualAmount) => {
    const { t, wallet } = await setup();
    await t.mutation(internal.sessions.reserveCreditsInternal, reservation("one"));
    await t.mutation(internal.sessions.deductCreditsInternal, { ...reservation("one"), actualAmount });
    const result = await wallet();
    expect(result?.pendingCredits).toBe(0);
    expect(result?.credits).toBe(actualAmount === 150 ? 80 : 100 - actualAmount);
    await t.mutation(internal.sessions.deductCreditsInternal, { ...reservation("one"), actualAmount });
    expect(await wallet()).toEqual(result);
  });
  it("clears a crashed request's hold during stale-reservation reconciliation", async () => {
    const { t, wallet } = await setup();
    await t.mutation(internal.sessions.reserveCreditsInternal, reservation("stale"));
    await t.run(async ctx => {
      const entry = await ctx.db.query("creditLedger").first();
      await ctx.db.patch(entry!._id, { createdAt: Date.now() - 3600000 });
    });
    await t.mutation(internal.sessions.reconcileStaleReservations, {});
    expect(await wallet()).toMatchObject({ credits: 100, pendingCredits: 0 });
  });
  it("backfills legacy markers without altering amounts and tolerates settlement between pages", async () => {
    const { t, wallet } = await setup();
    await t.run(async ctx => {
      for (let i = 0; i < 55; i++) await ctx.db.insert("creditLedger", { sid, delta: -1, reason: "reservation", generationId: `legacy-${i}`, createdAt: i });
      await ctx.db.insert("creditLedger", { sid, delta: 1, reason: "refund", generationId: "legacy-0", createdAt: 56 });
    });
    const first = await t.mutation(internal.walletMigration.backfillPendingHolds, {});
    expect(first.isDone).toBe(false);
    await t.mutation(internal.sessions.releaseReservationInternal, { sid, generationId: "legacy-54" });
    const last = await t.mutation(internal.walletMigration.backfillPendingHolds, { cursor: first.continueCursor });
    expect(last.isDone).toBe(true);
    expect(await wallet()).toMatchObject({ credits: 101, pendingCredits: 53 });
    expect((await t.run(ctx => ctx.db.query("creditLedger").collect())).filter(e => e.reason === "reservation").every(e => e.delta === -1)).toBe(true);
  });
});
