import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../validate-env", () => ({
  validateSecurityEnv: vi.fn(),
  validateSessionSecret: vi.fn(),
  validateIpHashSecret: vi.fn(),
  validateSessionTimeoutConfig: vi.fn(),
  validateConvexSecret: vi.fn(),
  validateAdminSecret: vi.fn(),
  validateProxyConfig: vi.fn(),
}));

const originalEnv = process.env;

async function importSessionModule() {
  vi.resetModules();
  return await import("../session");
}

describe("session timeout policy", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SESSION_SECRET: "a".repeat(32),
      IP_HASH_SECRET: "b".repeat(32),
      SESSION_IDLE_TIMEOUT_MINUTES: "5",
      SESSION_ABSOLUTE_TIMEOUT_HOURS: "4",
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
  });

  it("expires tokens after idle timeout", async () => {
    const { createSessionToken, verifySessionToken } = await importSessionModule();

    const token = await createSessionToken("sid-1", "iphash-1");

    vi.setSystemTime(new Date("2026-01-01T00:04:59.000Z"));
    expect(await verifySessionToken(token)).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T00:05:01.000Z"));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("renews activity up to absolute timeout cap", async () => {
    const { createSessionToken, verifySessionToken } = await importSessionModule();

    const initialToken = await createSessionToken("sid-2", "iphash-2");
    const initialData = await verifySessionToken(initialToken);
    expect(initialData).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T03:59:00.000Z"));

    const refreshedToken = await createSessionToken("sid-2", "iphash-2", {
      sessionStartedAt: initialData!.sessionStartedAt,
    });

    vi.setSystemTime(new Date("2026-01-01T03:59:50.000Z"));
    expect(await verifySessionToken(refreshedToken)).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T04:00:01.000Z"));
    expect(await verifySessionToken(refreshedToken)).toBeNull();
  });

  it("refreshSessionOnActivity respects min interval and absolute cap", async () => {
    const {
      createSessionToken,
      verifySessionToken,
      refreshSessionOnActivity,
    } = await importSessionModule();

    const token = await createSessionToken("sid-3", "iphash-3");
    const data = await verifySessionToken(token);
    expect(data).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T00:00:30.000Z"));
    expect(
      await refreshSessionOnActivity({
        sid: data!.sid,
        ipHash: "iphash-3",
        sessionStartedAt: data!.sessionStartedAt,
        lastActivityAt: data!.lastActivityAt,
      })
    ).toBeNull();

    vi.setSystemTime(new Date("2026-01-01T00:01:01.000Z"));
    expect(
      await refreshSessionOnActivity({
        sid: data!.sid,
        ipHash: "iphash-3",
        sessionStartedAt: data!.sessionStartedAt,
        lastActivityAt: data!.lastActivityAt,
      })
    ).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T04:00:01.000Z"));
    expect(
      await refreshSessionOnActivity({
        sid: data!.sid,
        ipHash: "iphash-3",
        sessionStartedAt: data!.sessionStartedAt,
        lastActivityAt: data!.lastActivityAt,
      })
    ).toBeNull();
  });

  it("uses idle timeout for session cookie max-age", async () => {
    const { createSessionToken, getSessionCookieOptions } = await importSessionModule();

    const token = await createSessionToken("sid-4", "iphash-4");
    const cookieOptions = getSessionCookieOptions(token);

    expect(cookieOptions.maxAge).toBe(5 * 60);
  });
});
