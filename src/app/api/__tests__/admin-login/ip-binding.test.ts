import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSessionValidation: {
  value: {
    valid: boolean;
    sid?: string;
    currentIpHash?: string;
  };
} = {
  value: { valid: false },
};

const mockConvex = {
  query: vi.fn(),
  mutation: vi.fn(),
  action: vi.fn(),
};

vi.mock("@/lib/session", () => ({
  validateSessionWithIp: vi.fn(async () => mockSessionValidation.value),
}));

vi.mock("@/lib/origin", () => ({
  validateOrigin: vi.fn(() => true),
  invalidOriginResponse: vi.fn(() => new Response("Invalid origin", { status: 403 })),
}));

vi.mock("@/lib/csrf", () => ({
  validateCsrfToken: vi.fn(() => true),
  CSRF_COOKIE_NAME: "visibible_csrf",
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "visibible_csrf" ? { value: "test-csrf-token" } : undefined,
  })),
}));

vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => mockConvex),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

describe("Admin Login IP Binding", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      ADMIN_PASSWORD: "super-secret-password",
      ADMIN_PASSWORD_SECRET: "super-secret-key",
    };
    mockSessionValidation.value = { valid: false };

    mockConvex.query.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if ("ipHash" in args) {
        return { allowed: true };
      }
      return null;
    });
    mockConvex.mutation.mockImplementation(async () => ({ locked: false }));
    mockConvex.action.mockImplementation(async () => ({ success: true }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects when session token is missing/invalid", async () => {
    mockSessionValidation.value = { valid: false };
    const { POST } = await import("../../admin-login/route");

    const response = await POST(
      new Request("http://localhost:3000/api/admin-login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "x-csrf-token": "test-csrf-token",
        },
        body: JSON.stringify({ password: "super-secret-password" }),
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Session required");
    expect(mockConvex.query).not.toHaveBeenCalled();
    expect(mockConvex.action).not.toHaveBeenCalled();
  });

  it("uses validateSessionWithIp ip hash for login lockout checks", async () => {
    mockSessionValidation.value = {
      valid: true,
      sid: "test-session",
      currentIpHash: "bound-ip-hash",
    };
    const { POST } = await import("../../admin-login/route");

    const response = await POST(
      new Request("http://localhost:3000/api/admin-login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "x-csrf-token": "test-csrf-token",
        },
        body: JSON.stringify({ password: "super-secret-password" }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockConvex.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ipHash: "bound-ip-hash" })
    );
    expect(mockConvex.action).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sid: "test-session" })
    );
  });
});

