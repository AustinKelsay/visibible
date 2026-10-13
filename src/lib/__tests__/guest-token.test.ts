import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify } from "jose";
import { issueGuestToken, publicGuestKeys } from "../guest-token";

const issuer = "https://guest.example";
const audience = "visibible-guest-test";
async function key(kid: string) {
  const pair = await generateKeyPair("RS256", { extractable: true });
  return { private: { ...await exportJWK(pair.privateKey), kid },
    public: { ...await exportJWK(pair.publicKey), kid } };
}
const oldKey = await key("old");
const newKey = await key("new");
beforeEach(() => {
  vi.stubEnv("GUEST_AUTH_ISSUER", issuer);
  vi.stubEnv("GUEST_AUTH_AUDIENCE", audience);
  vi.stubEnv("GUEST_AUTH_PRIVATE_JWK", JSON.stringify(oldKey.private));
  vi.stubEnv("GUEST_AUTH_JWKS", JSON.stringify({ keys: [oldKey.public, newKey.public] }));
});
afterEach(() => vi.unstubAllEnvs());
const now = () => Math.floor(Date.now() / 1000);
describe("guest token contract", () => {
  it("preserves SID, omits tier, and caps token lifetime at five minutes", async () => {
    const issued = await issueGuestToken("existing-owner", now() + 10000);
    const { payload, protectedHeader } = await jwtVerify(issued.token, createLocalJWKSet(publicGuestKeys()), { issuer, audience });
    expect(payload.sub).toBe("existing-owner");
    expect(payload.tier).toBeUndefined();
    expect(payload.exp! - payload.iat!).toBe(300);
    expect(protectedHeader).toEqual({ kid: "old", alg: "RS256", typ: "JWT" });
  });
  it("returns a distinct fresh token even within the same clock second", async () => {
    const first = await issueGuestToken("owner", now() + 300);
    const second = await issueGuestToken("owner", now() + 300);
    expect(first.token).not.toBe(second.token);
  });
  it("never outlives the cookie or issues from an expired session", async () => {
    const expiry = now() + 12;
    expect((await issueGuestToken("owner", expiry)).expiresAt).toBe(expiry);
    await expect(issueGuestToken("owner", now())).rejects.toThrow("expired");
    await expect(issueGuestToken("owner", Infinity)).rejects.toThrow();
  });
  it("rejects wrong signature, issuer, audience and expired tokens", async () => {
    const { token } = await issueGuestToken("owner", now() + 300);
    const keys = createLocalJWKSet(publicGuestKeys());
    await expect(jwtVerify(token, keys, { issuer: "wrong", audience })).rejects.toThrow();
    await expect(jwtVerify(token, keys, { issuer, audience: "wrong" })).rejects.toThrow();
    await expect(jwtVerify(token, keys, { issuer, audience, currentDate: new Date(Date.now() + 301000) })).rejects.toThrow();
    await expect(jwtVerify(token, createLocalJWKSet({ keys: [{ ...newKey.public, kid: "old" }] }), { issuer, audience })).rejects.toThrow();
  });
  it("supports rotation overlap and rejects retired keys", async () => {
    const old = await issueGuestToken("owner", now() + 300);
    vi.stubEnv("GUEST_AUTH_PRIVATE_JWK", JSON.stringify(newKey.private));
    const current = await issueGuestToken("owner", now() + 300);
    for (const token of [old.token, current.token]) {
      await expect(jwtVerify(token, createLocalJWKSet(publicGuestKeys()), { issuer, audience })).resolves.toBeDefined();
    }
    vi.stubEnv("GUEST_AUTH_JWKS", JSON.stringify({ keys: [newKey.public] }));
    await expect(jwtVerify(old.token, createLocalJWKSet(publicGuestKeys()), { issuer, audience })).rejects.toThrow();
  });
  it("projects public parameters even if given private key material", () => {
    vi.stubEnv("GUEST_AUTH_JWKS", JSON.stringify({ keys: [oldKey.private] }));
    expect(Object.keys(publicGuestKeys().keys[0]).sort()).toEqual(["alg", "e", "kid", "kty", "n", "use"]);
  });
});
