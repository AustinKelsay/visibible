/**
 * The owner's image allowance (#552): an admin session paints eight verses at once, so its image requests are allowed
 * at twice a guest's rate. The tier is read in Convex from the session, never taken from the caller.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";

const SECRET = "server-only";
beforeEach(() => vi.stubEnv("CONVEX_SERVER_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

async function allowedOf(tier: "paid" | "admin", options: { revoked?: boolean; passSid?: boolean; adminUntil?: number } = {}) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("sessions", { sid: "s1", tier, credits: 100, createdAt: Date.now(), lastSeenAt: Date.now(), ...(options.revoked ? { revokedAt: Date.now() } : {}), ...(options.adminUntil !== undefined ? { adminUntil: options.adminUntil } : {}) });
  });
  let allowed = 0;
  for (let i = 0; i < 50; i++) {
    const result = await t.mutation(api.rateLimit.checkRateLimit, { identifier: "ip:s1", endpoint: "generate-image", serverSecret: SECRET, ...(options.passSid === false ? {} : { sid: "s1" }) });
    if (result.allowed) allowed++;
  }
  return allowed;
}

describe("image allowance by tier", () => {
  it("allows a guest 20 image requests a minute", async () => {
    expect(await allowedOf("paid")).toBe(20);
  });

  it("allows the owner 40", async () => {
    expect(await allowedOf("admin")).toBe(40);
  });

  it("gives a revoked owner session, or a call without the session, a guest's allowance", async () => {
    expect(await allowedOf("admin", { revoked: true })).toBe(20);
    expect(await allowedOf("admin", { passSid: false })).toBe(20);
  });

  it("gives an owner whose admin window has lapsed, before the cron demotes it, a guest's allowance", async () => {
    expect(await allowedOf("admin", { adminUntil: Date.now() - 1000 })).toBe(20);
    expect(await allowedOf("admin", { adminUntil: Date.now() + 60_000 })).toBe(40);
  });

  it("reports the owner's allowance as admission applies it", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => { await ctx.db.insert("sessions", { sid: "s1", tier: "admin", credits: 100, createdAt: Date.now(), lastSeenAt: Date.now() }); });
    await t.mutation(api.rateLimit.checkRateLimit, { identifier: "ip:s1", endpoint: "generate-image", serverSecret: SECRET, sid: "s1" });
    expect(await t.query(api.rateLimit.getRateLimitStatus, { identifier: "ip:s1", endpoint: "generate-image", serverSecret: SECRET, sid: "s1" })).toMatchObject({ remaining: 39, limit: 40 });
  });
});
