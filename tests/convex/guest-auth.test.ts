import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";
const issuer = "https://guest.example";
beforeEach(() => {
  vi.stubEnv("GUEST_AUTH_ISSUER", issuer);
  vi.stubEnv("CONVEX_SERVER_SECRET", "server-only");
});
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  const id = await t.run((ctx) => ctx.db.insert("sessions", {
    sid: "original-sid", tier: "admin", credits: 123, createdAt: Date.now(), lastSeenAt: Date.now(),
  }));
  const identity = { subject: "original-sid", issuer, guestExpiresAt: Math.floor(Date.now() / 1000) + 300, tier: "admin" };
  return { t, id, identity, guest: t.withIdentity(identity) };
}
describe("verified guest lookup", () => {
  it("returns the existing balance and always reads the current tier", async () => {
    const { t, id, guest } = await setup();
    expect(await guest.query(api.guestAuth.current, {})).toEqual({ sid: "original-sid", tier: "admin", credits: 123 });
    await t.run((ctx) => ctx.db.patch(id, { tier: "paid" }));
    expect((await guest.query(api.guestAuth.current, {}))?.tier).toBe("paid");
  });
  it("denies unauthenticated, expired, foreign issuer and deleted subjects", async () => {
    const { t, id, identity, guest } = await setup();
    expect(await t.query(api.guestAuth.current, {})).toBeNull();
    for (const claims of [{ issuer: "wrong" }, { guestExpiresAt: 0 }, { subject: "foreign" }]) {
      expect(await t.withIdentity({ ...identity, ...claims }).query(api.guestAuth.current, {})).toBeNull();
    }
    await t.run((ctx) => ctx.db.delete(id));
    expect(await guest.query(api.guestAuth.current, {})).toBeNull();
  });
  it("revocation denies both valid bearer tokens and new issuance", async () => {
    const { t, id, guest } = await setup();
    await t.run((ctx) => ctx.db.patch(id, { revokedAt: Date.now() }));
    expect(await guest.query(api.guestAuth.current, {})).toBeNull();
    expect(await t.query(api.guestAuth.sessionForToken, { sid: "original-sid", serverSecret: "server-only" })).toBeNull();
    await expect(t.query(api.guestAuth.sessionForToken, { sid: "original-sid", serverSecret: "wrong" })).rejects.toThrow("Unauthorized");
  });
});
