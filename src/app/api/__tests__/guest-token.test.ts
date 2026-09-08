import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { generateKeyPair, exportJWK, jwtVerify, createLocalJWKSet } from "jose";
import schema from "../../../../convex/schema";
import { modules } from "../../../../tests/convex/modules";

const cookieJar = new Map<string, { value: string }>();
let t = convexTest(schema, modules);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => cookieJar.get(key) }) }));
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: () => t,
  getConvexServerSecret: () => "server-only",
}));
const pair = await generateKeyPair("RS256", { extractable: true });
const publicKey = { ...await exportJWK(pair.publicKey), kid: "test" };
const privateKey = { ...await exportJWK(pair.privateKey), kid: "test" };

beforeEach(async () => {
  vi.stubEnv("SESSION_SECRET", "session-secret-that-is-at-least-32-characters");
  vi.stubEnv("IP_HASH_SECRET", "ip-hash-secret-that-is-at-least-32-characters");
  vi.stubEnv("CONVEX_SERVER_SECRET", "server-only");
  vi.stubEnv("GUEST_AUTH_ISSUER", "https://guest.example");
  vi.stubEnv("GUEST_AUTH_AUDIENCE", "test-guest");
  vi.stubEnv("GUEST_AUTH_PRIVATE_JWK", JSON.stringify(privateKey));
  vi.stubEnv("GUEST_AUTH_JWKS", JSON.stringify({ keys: [publicKey] }));
  t = convexTest(schema, modules);
  cookieJar.clear();
  cookieJar.set("visibible_csrf", { value: "test-csrf" });
  const { createSessionToken } = await import("@/lib/session");
  cookieJar.set("visibible_session", { value: await createSessionToken("existing-sid") });
  await t.run((ctx) => ctx.db.insert("sessions", {
    sid: "existing-sid", tier: "paid", credits: 123, createdAt: Date.now(), lastSeenAt: Date.now(),
  }));
});
afterEach(() => vi.unstubAllEnvs());
async function post(headers: Record<string, string> = {}) {
  const { POST } = await import("../convex-token/route");
  return POST(new Request("http://localhost:3100/api/convex-token", {
    method: "POST", headers: { origin: "http://localhost:3100", "x-csrf-token": "test-csrf", ...headers },
  }));
}
describe("guest token HTTP admission", () => {
  it("signs for the cookie owner and does not renew the session cookie", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).not.toContain("visibible_session");
    const { token } = await response.json();
    const verified = await jwtVerify(token, createLocalJWKSet({ keys: [publicKey] }), {
      issuer: "https://guest.example", audience: "test-guest",
    });
    expect(verified.payload.sub).toBe("existing-sid");
  });
  it("caps issuance at the presented cookie deadline even when activity could renew it", async () => {
    const { createSessionToken, SESSION_IDLE_TIMEOUT_SECONDS } = await import("@/lib/session");
    const now = Math.floor(Date.now() / 1000);
    const activity = now - SESSION_IDLE_TIMEOUT_SECONDS + 30;
    cookieJar.set("visibible_session", { value: await createSessionToken("existing-sid", undefined, {
      sessionStartedAt: activity, activityAt: activity,
    }) });
    const response = await post();
    expect(response.status).toBe(200);
    expect((await response.json()).expiresAt).toBe(now + 30);
    expect(response.headers.get("Set-Cookie")).not.toContain("visibible_session");
  });
  it("rejects cross-origin and missing or mismatched CSRF before issuance", async () => {
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ "x-csrf-token": "wrong" })).status).toBe(403);
    cookieJar.delete("visibible_csrf");
    expect((await post()).status).toBe(403);
  });
  it("rejects missing, forged and expired signed cookies", async () => {
    cookieJar.delete("visibible_session");
    expect((await post()).status).toBe(401);
    cookieJar.set("visibible_session", { value: "forged" });
    expect((await post()).status).toBe(401);
    const { createSessionToken } = await import("@/lib/session");
    cookieJar.set("visibible_session", { value: await createSessionToken("existing-sid", undefined, {
      sessionStartedAt: Math.floor(Date.now() / 1000) - 40 * 86400,
    }) });
    expect((await post()).status).toBe(401);
  });
  it("denies deleted and revoked sessions despite valid cookies", async () => {
    const id = await t.run(async (ctx) => (await ctx.db.query("sessions").first())!._id);
    await t.run((ctx) => ctx.db.patch(id, { revokedAt: Date.now() }));
    expect((await post()).status).toBe(401);
    await t.run((ctx) => ctx.db.delete(id));
    expect((await post()).status).toBe(401);
  });
  it("enforces the persisted per-session rate limit", async () => {
    for (let i = 0; i < 30; i++) expect((await post()).status).toBe(200);
    const response = await post();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });
});
