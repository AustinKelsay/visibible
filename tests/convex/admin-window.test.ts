import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { ADMIN_WINDOW_MS } from "../../convex/sessions";
import { modules } from "./modules";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-14T00:00:00Z")); });
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const [sid, tier, credits] of [["owner", "paid", 40], ["guest", "paid", 250], ["legacy-admin", "admin", 0]] as const) {
      await ctx.db.insert("sessions", { sid, tier, credits, createdAt: Date.now(), lastSeenAt: Date.now() });
    }
  });
  const tiers = () => t.run(async (ctx) => Object.fromEntries(
    (await ctx.db.query("sessions").collect()).map((session) => [session.sid, { tier: session.tier, credits: session.credits, adminUntil: session.adminUntil }]),
  ));
  return { t, tiers };
}

describe("admin window", () => {
  it("ends admin tier seven days after the admin login and leaves the wallet alone", async () => {
    const { t, tiers } = await setup();
    await t.mutation(internal.sessions.upgradeToAdminInternal, { sid: "owner" });
    expect((await tiers()).owner).toEqual({ tier: "admin", credits: 40, adminUntil: Date.now() + ADMIN_WINDOW_MS });

    vi.setSystemTime(Date.now() + 7 * DAY - 1000);
    await t.mutation(internal.sessions.expireAdminSessions, {});
    expect((await tiers()).owner.tier).toBe("admin");

    vi.setSystemTime(Date.now() + 2000);
    expect(await t.mutation(internal.sessions.expireAdminSessions, {})).toEqual({ expired: 1 });
    expect(await tiers()).toMatchObject({ owner: { tier: "paid", credits: 40 }, guest: { tier: "paid", credits: 250 } });
    expect((await tiers()).owner.adminUntil).toBeUndefined();
  });

  it("starts a new window at each admin login", async () => {
    const { t, tiers } = await setup();
    await t.mutation(internal.sessions.upgradeToAdminInternal, { sid: "owner" });
    vi.setSystemTime(Date.now() + 6 * DAY);
    await t.mutation(internal.sessions.upgradeToAdminInternal, { sid: "owner" });
    vi.setSystemTime(Date.now() + 6 * DAY);
    await t.mutation(internal.sessions.expireAdminSessions, {});
    expect((await tiers()).owner.tier).toBe("admin");
  });

  it("returns an admin session that has no window to paid", async () => {
    const { t, tiers } = await setup();
    expect(await t.mutation(internal.sessions.expireAdminSessions, {})).toEqual({ expired: 1 });
    expect((await tiers())["legacy-admin"].tier).toBe("paid");
  });
});
