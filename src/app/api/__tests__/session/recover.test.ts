import { createHash } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../session/recover/route";
import { createSessionToken, verifySessionToken } from "@/lib/session";

const mocks = vi.hoisted(() => ({
  cookie: "", csrf: "c".repeat(64), mutation: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => name === "visibible_session" ? { value: mocks.cookie }
    : name === "visibible_csrf" ? { value: mocks.csrf } : undefined,
}) }));
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: () => ({ mutation: mocks.mutation }),
  getConvexServerSecret: () => "new-server-secret",
}));
vi.mock("@/lib/validate-env", () => ({ validateSecurityEnv: vi.fn() }));

const code = "a".repeat(64);
const invalidHeaders: Record<string, string>[] = [
  { origin: "https://foreign.example" }, { "x-csrf-token": "wrong" }, { "x-csrf-token": "" },
];
function request(body = JSON.stringify({ code }), headers: Record<string, string> = {}) {
  return new Request("https://recovery.example/api/session/recover", {
    method: "POST", headers: { origin: "https://recovery.example", "x-csrf-token": mocks.csrf, ...headers }, body,
  });
}
beforeEach(async () => {
  vi.stubEnv("SESSION_SECRET", "new-session-key-for-isolated-tests-1234567890");
  vi.stubEnv("IP_HASH_SECRET", "new-ip-hash-key-for-isolated-tests-1234567890");
  mocks.cookie = await createSessionToken("fresh-session");
  mocks.mutation.mockReset();
  mocks.mutation.mockResolvedValueOnce({ allowed: true }).mockResolvedValue({ ok: true, sid: "preserved-wallet" });
});
afterEach(() => vi.unstubAllEnvs());

describe("recovery HTTP boundary", () => {
  it("passes only the code hash and authenticated SID to Convex, then signs a fresh wallet cookie", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ recovered: true });
    expect(mocks.mutation.mock.calls[1][1]).toMatchObject({
      tokenHash: createHash("sha256").update(code).digest("hex"),
      requesterSid: "fresh-session", serverSecret: "new-server-secret",
    });
    expect(JSON.stringify(mocks.mutation.mock.calls)).not.toContain(code);
    const cookie = response.cookies.get("visibible_session");
    expect(await verifySessionToken(cookie!.value)).toMatchObject({ sid: "preserved-wallet" });
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
  });

  it("rejects an old signed cookie after key rotation without consuming the claim", async () => {
    vi.stubEnv("SESSION_SECRET", "old-session-key-for-isolated-tests-1234567890");
    mocks.cookie = await createSessionToken("preserved-wallet");
    vi.stubEnv("SESSION_SECRET", "new-session-key-for-isolated-tests-1234567890");
    expect((await POST(request())).status).toBe(401);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it.each(invalidHeaders)("rejects invalid origin or CSRF before backend calls: %j", async (headers) => {
    expect((await POST(request(undefined, headers))).status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("applies the recovery rate limit before trying the code", async () => {
    mocks.mutation.mockReset().mockResolvedValue({ allowed: false, retryAfter: 75 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("75");
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
    expect(mocks.mutation.mock.calls[0][1].endpoint).toBe("session-recovery");
  });

  it.each(["{", "null", JSON.stringify({ code: "old-session-id" }), JSON.stringify({ code: 123 })])("rejects malformed claim bodies", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
  });

  it("bounds a body without Content-Length", async () => {
    expect((await POST(request("x".repeat(1025)))).status).toBe(413);
    expect(mocks.mutation).toHaveBeenCalledTimes(1);
  });

  it("does not replace the cookie when the backend protects another balance", async () => {
    mocks.mutation.mockReset().mockResolvedValueOnce({ allowed: true }).mockResolvedValue({ ok: false, reason: "use_empty_session" });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(response.cookies.get("visibible_session")).toBeUndefined();
  });

  it("returns a generic retryable error without exposing backend details", async () => {
    mocks.mutation.mockReset().mockRejectedValue(new Error("private backend detail"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private backend detail");
  });
});
