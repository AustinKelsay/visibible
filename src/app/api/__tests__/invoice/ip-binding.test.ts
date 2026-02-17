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

vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => mockConvex),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

vi.mock("@/lib/btc-price", () => ({
  getBtcPrice: vi.fn(async () => 100_000),
  usdToSats: vi.fn(() => 3_000),
}));

vi.mock("@/lib/lnd", () => ({
  createLndInvoice: vi.fn(async () => ({
    payment_request: "lnbc1test",
    r_hash: "base64-hash",
  })),
  base64ToHex: vi.fn(() => "hex-payment-hash"),
  isLndConfigured: vi.fn(() => true),
  lookupLndInvoice: vi.fn(async () => ({ state: "OPEN" })),
}));

describe("Invoice IP Binding", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockSessionValidation.value = { valid: false };

    mockConvex.mutation.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if ("endpoint" in args) {
        return { allowed: true, retryAfter: 0 };
      }
      if ("invoiceId" in args && "bolt11" in args) {
        return {
          invoiceId: args.invoiceId,
          bolt11: args.bolt11,
          amountUsd: 3,
          amountSats: 3000,
          expiresAt: Date.now() + 3600_000,
          credits: 300,
        };
      }
      return { success: true };
    });
    mockConvex.query.mockImplementation(async () => null);
    mockConvex.action.mockImplementation(async () => ({ success: true }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects invoice creation when session token is missing/invalid", async () => {
    mockSessionValidation.value = { valid: false };
    const { POST } = await import("../../invoice/route");

    const response = await POST(
      new Request("http://localhost:3000/api/invoice", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
        },
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Session required");
    expect(mockConvex.mutation).not.toHaveBeenCalled();
  });

  it("uses validateSessionWithIp ip hash for invoice rate limiting", async () => {
    mockSessionValidation.value = {
      valid: true,
      sid: "invoice-session",
      currentIpHash: "bound-ip-hash",
    };
    const { POST } = await import("../../invoice/route");

    const response = await POST(
      new Request("http://localhost:3000/api/invoice", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mockConvex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        identifier: "bound-ip-hash",
        endpoint: "invoice",
      })
    );
  });

  it("rejects invoice status polling when session token is missing/invalid", async () => {
    mockSessionValidation.value = { valid: false };
    const { GET } = await import("../../invoice/[id]/route");

    const response = await GET(
      new Request("http://localhost:3000/api/invoice/test-invoice", {
        method: "GET",
        headers: {
          origin: "http://localhost:3000",
        },
      }),
      {
        params: Promise.resolve({ id: "test-invoice" }),
      }
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Session required");
    expect(mockConvex.query).not.toHaveBeenCalled();
  });
});

