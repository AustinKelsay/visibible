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
  withSessionRefreshCookie: vi.fn((response: Response) => response),
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
  usdToSats: vi.fn((usd: number) => usd * 1_000),
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
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    mockSessionValidation.value = { valid: false };

    mockConvex.mutation.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if ("endpoint" in args) {
        return { allowed: true, retryAfter: 0 };
      }
      if ("invoiceId" in args && "bolt11" in args) {
        const amountUsd = typeof args.amountUsd === "number" ? args.amountUsd : 3;
        const amountSats = typeof args.amountSats === "number" ? args.amountSats : amountUsd * 1000;
        return {
          invoiceId: args.invoiceId,
          bolt11: args.bolt11,
          amountUsd,
          amountSats,
          expiresAt: Date.now() + 3600_000,
          credits: amountUsd * 100,
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

  it("supports creating the $1 credit bundle", async () => {
    mockSessionValidation.value = {
      valid: true,
      sid: "invoice-session",
      currentIpHash: "bound-ip-hash",
    };
    const { usdToSats } = await import("@/lib/btc-price");
    const { POST } = await import("../../invoice/route");

    const response = await POST(
      new Request("http://localhost:3000/api/invoice", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ amountUsd: 1 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        amountUsd: 1,
        amountSats: 1000,
        credits: 100,
      })
    );
    expect(usdToSats).toHaveBeenCalledWith(1, 100_000);
    expect(mockConvex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amountUsd: 1,
      })
    );
  });

  it("rejects unsupported credit bundle amounts", async () => {
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
          "content-type": "application/json",
        },
        body: JSON.stringify({ amountUsd: 2 }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Unsupported credit bundle");
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

  it("returns invoice status when session is valid and invoice belongs to session", async () => {
    mockSessionValidation.value = {
      valid: true,
      sid: "invoice-session",
      currentIpHash: "bound-ip-hash",
    };
    const paidAt = Date.now();
    const expiresAt = paidAt + 3600_000;

    mockConvex.query.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if (args.invoiceId === "test-invoice") {
        return {
          invoiceId: "test-invoice",
          sid: "invoice-session",
          status: "paid",
          amountUsd: 3,
          amountSats: 3000,
          bolt11: "lnbc1test",
          expiresAt,
          paidAt,
        };
      }
      return null;
    });

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

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        invoiceId: "test-invoice",
        status: "paid",
        amountUsd: 3,
        amountSats: 3000,
        bolt11: "lnbc1test",
        expiresAt,
        paidAt,
      })
    );
    expect(mockConvex.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ invoiceId: "test-invoice" })
    );
  });

  it("confirms invoice payment when settled for an IP-bound session", async () => {
    mockSessionValidation.value = {
      valid: true,
      sid: "invoice-session",
      currentIpHash: "bound-ip-hash",
    };
    const now = Date.now();
    const { lookupLndInvoice } = await import("@/lib/lnd");
    vi.mocked(lookupLndInvoice).mockResolvedValueOnce({
      memo: "Visibible: settled-invoice",
      r_preimage: "",
      r_hash: "hash-base64",
      value: "3000",
      value_msat: "3000000",
      settled: true,
      creation_date: String(Math.floor(now / 1000) - 60),
      settle_date: String(Math.floor(now / 1000)),
      payment_request: "lnbc1test",
      expiry: "900",
      state: "SETTLED",
      amt_paid_sat: "3000",
      amt_paid_msat: "3000000",
    });

    mockConvex.query.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if (args.invoiceId === "settled-invoice") {
        return {
          invoiceId: "settled-invoice",
          sid: "invoice-session",
          status: "pending",
          amountUsd: 3,
          amountSats: 3000,
          bolt11: "lnbc1test",
          expiresAt: now + 60_000,
          paidAt: undefined,
          paymentHash: "hex-payment-hash",
        };
      }
      return null;
    });

    mockConvex.action.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if ("invoiceId" in args && "paymentHash" in args) {
        return {
          success: true,
          alreadyPaid: false,
          newBalance: 500,
          creditsAdded: 300,
        };
      }
      return { success: true };
    });

    const { POST } = await import("../../invoice/[id]/route");

    const response = await POST(
      new Request("http://localhost:3000/api/invoice/settled-invoice", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
        },
      }),
      {
        params: Promise.resolve({ id: "settled-invoice" }),
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        alreadyPaid: false,
        newBalance: 500,
        creditsAdded: 300,
      })
    );
    expect(mockConvex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        identifier: "bound-ip-hash:invoice-session",
        endpoint: "invoice-status",
      })
    );
    expect(mockConvex.action).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        invoiceId: "settled-invoice",
        paymentHash: "hex-payment-hash",
      })
    );
  });

  it("uses validateSessionWithIp sid + ip hash for invoice status polling rate limiting", async () => {
    mockSessionValidation.value = {
      valid: true,
      sid: "invoice-session",
      currentIpHash: "bound-ip-hash",
    };
    const paidAt = Date.now();
    const expiresAt = paidAt + 3600_000;

    mockConvex.query.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if (args.invoiceId === "test-invoice") {
        return {
          invoiceId: "test-invoice",
          sid: "invoice-session",
          status: "paid",
          amountUsd: 3,
          amountSats: 3000,
          bolt11: "lnbc1test",
          expiresAt,
          paidAt,
        };
      }
      return null;
    });

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

    expect(response.status).toBe(200);
    expect(mockConvex.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        identifier: "bound-ip-hash:invoice-session",
        endpoint: "invoice-status",
      })
    );
  });

  it("returns 429 when invoice status polling rate limit is exceeded", async () => {
    mockSessionValidation.value = {
      valid: true,
      sid: "invoice-session",
      currentIpHash: "bound-ip-hash",
    };
    mockConvex.mutation.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if (args.endpoint === "invoice-status") {
        return { allowed: false, retryAfter: 42 };
      }
      return { success: true };
    });

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

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("Too many invoice status requests");
    expect(body.retryAfter).toBe(42);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(mockConvex.query).not.toHaveBeenCalled();
  });

  it("returns 429 when invoice confirm polling rate limit is exceeded", async () => {
    mockSessionValidation.value = {
      valid: true,
      sid: "invoice-session",
      currentIpHash: "bound-ip-hash",
    };
    mockConvex.mutation.mockImplementation(async (_apiPath: unknown, args: Record<string, unknown>) => {
      if (args.endpoint === "invoice-status") {
        return { allowed: false, retryAfter: 30 };
      }
      return { success: true };
    });

    const { POST } = await import("../../invoice/[id]/route");

    const response = await POST(
      new Request("http://localhost:3000/api/invoice/test-invoice", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
        },
      }),
      {
        params: Promise.resolve({ id: "test-invoice" }),
      }
    );

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("Too many invoice status requests");
    expect(body.retryAfter).toBe(30);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(mockConvex.query).not.toHaveBeenCalled();
    expect(mockConvex.action).not.toHaveBeenCalled();
  });
});
