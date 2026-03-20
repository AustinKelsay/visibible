import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSessionValidation: {
  value: {
    valid: boolean;
    sid?: string;
    currentIpHash?: string;
    refreshedToken?: string;
    invalidReason?: "missing" | "expired" | "invalid";
  };
} = {
  value: { valid: false, invalidReason: "missing" },
};

const mockConvex = {
  query: vi.fn(),
  mutation: vi.fn(),
};

vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => mockConvex),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

vi.mock("@/lib/session", () => ({
  generateSessionId: vi.fn(() => "new-session"),
  createSessionToken: vi.fn(async () => "new-token"),
  getSessionCookieOptions: vi.fn((token: string) => ({
    name: "visibible_session",
    value: token,
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  })),
  getClearedSessionCookieOptions: vi.fn(() => ({
    name: "visibible_session",
    value: "",
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })),
  hashIp: vi.fn(async () => "mock-ip-hash"),
  getClientIp: vi.fn(() => "127.0.0.1"),
  validateSessionWithIp: vi.fn(async () => mockSessionValidation.value),
}));

vi.mock("@/lib/csrf", () => ({
  generateCsrfToken: vi.fn(() => "csrf-token"),
  getCsrfCookieOptions: vi.fn(() => ({
    name: "visibible_csrf",
    value: "csrf-token",
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  })),
}));

describe("Session API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionValidation.value = { valid: false, invalidReason: "missing" };
    mockConvex.query.mockResolvedValue(null);
    mockConvex.mutation.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns invalid status and clears the stale session cookie", async () => {
    mockSessionValidation.value = { valid: false, invalidReason: "invalid" };
    const { GET } = await import("../../session/route");

    const response = await GET(
      new Request("http://localhost:3000/api/session", { method: "GET" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sid: null,
      tier: "paid",
      credits: 0,
      status: "invalid",
      invalidReason: "invalid",
    });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("visibible_session=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("returns missing status when there is no session cookie", async () => {
    mockSessionValidation.value = { valid: false, invalidReason: "missing" };
    const { GET } = await import("../../session/route");

    const response = await GET(
      new Request("http://localhost:3000/api/session", { method: "GET" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sid: null,
      tier: "paid",
      credits: 0,
      status: "missing",
    });
  });
});
