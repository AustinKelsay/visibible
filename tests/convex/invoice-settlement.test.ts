import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";
import { GET, POST } from "../../src/app/api/invoice/[id]/route";
import { lookupLndInvoice, type LndInvoiceLookup } from "../../src/lib/lnd";

let t = convexTest(schema, modules);
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: () => ({
    query: t.query,
    action: t.action,
    mutation: t.mutation,
  }),
  getConvexServerSecret: () => "test-secret",
}));
vi.mock("@/lib/session", () => ({
  validateSessionWithIp: async () => ({ valid: true, sid: "purchase-guest", currentIpHash: "test-ip" }),
  withSessionRefreshCookie: (response: Response) => response,
}));
vi.mock("@/lib/origin", () => ({ validateOrigin: () => true }));
vi.mock("@/lib/lnd", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/lnd")>(),
  lookupLndInvoice: vi.fn(),
  isLndConfigured: () => true,
}));
const hash = "ab".repeat(32);
const evidence = { invoiceId: "purchase", paymentHash: hash, amountPaidSats: 1000 };
function lnd(overrides: Partial<LndInvoiceLookup> = {}): LndInvoiceLookup {
  return {
    state: "SETTLED", settled: true, r_hash: Buffer.from(hash, "hex").toString("base64"),
    amt_paid_sat: "1000", amt_paid_msat: "1000000", value: "1000", value_msat: "1000000",
    memo: "", r_preimage: "", payment_request: "lnbc-test", creation_date: "1",
    settle_date: "2", expiry: "900", ...overrides,
  };
}
async function seed(status: "pending" | "expired" = "pending", tier = "free") {
  await t.run(async (ctx) => {
    await ctx.db.insert("sessions", {
      sid: "purchase-guest", credits: 0, tier, createdAt: 1, lastSeenAt: 1, expiresAt: 2,
    });
    await ctx.db.insert("invoices", {
      invoiceId: "purchase", sid: "purchase-guest", amountUsd: 1, amountSats: 1000,
      bolt11: "lnbc-test", paymentHash: hash, status, createdAt: 1, expiresAt: 900001,
    });
  });
}
async function state() {
  return t.run(async (ctx) => ({
    invoice: await ctx.db.query("invoices").first(),
    session: await ctx.db.query("sessions").first(),
    ledger: await ctx.db.query("creditLedger").collect(),
  }));
}
function request(method: "GET" | "POST") {
  return new Request("http://localhost:3000/api/invoice/purchase", { method });
}
beforeEach(() => {
  t = convexTest(schema, modules);
  vi.stubEnv("CONVEX_SERVER_SECRET", "test-secret");
  vi.mocked(lookupLndInvoice).mockReset().mockResolvedValue(lnd());
});
afterEach(() => vi.unstubAllEnvs());

describe("verified late Lightning purchases", () => {
  for (const method of ["GET", "POST"] as const) {
    const handler = method === "GET" ? GET : POST;
    it.each(["pending", "expired"] as const)(`${method} credits a verified settlement first observed after local %s expiry`, async (status) => {
      await seed(status);
      const response = await handler(request(method), { params: Promise.resolve({ id: "purchase" }) });
      expect(response.status).toBe(200);
      if (method === "GET") expect((await response.json()).paidAt).toEqual(expect.any(Number));
      const saved = await state();
      expect(saved.invoice?.status).toBe("paid");
      expect(saved.session).toMatchObject({ credits: 100, tier: "paid" });
      expect(saved.ledger).toEqual([expect.objectContaining({ invoiceId: "purchase", delta: 100, reason: "purchase" })]);
    });
    it(`${method} distinguishes an outage from expiry and never grants credits`, async () => {
      await seed();
      vi.mocked(lookupLndInvoice).mockRejectedValue(new Error("Node offline"));
      const response = await handler(request(method), { params: Promise.resolve({ id: "purchase" }) });
      expect(response.status).toBe(502);
      expect((await state()).invoice?.status).toBe("pending");
      expect((await state()).ledger).toHaveLength(0);
    });
    it(`${method} expires verified unpaid invoices without granting credits`, async () => {
      await seed();
      vi.mocked(lookupLndInvoice).mockResolvedValue(lnd({ state: "OPEN", settled: false }));
      const response = await handler(request(method), { params: Promise.resolve({ id: "purchase" }) });
      expect(response.status).toBe(method === "GET" ? 200 : 410);
      expect((await state()).invoice?.status).toBe("expired");
      expect((await state()).ledger).toHaveLength(0);
    });
    it.each([{ amt_paid_sat: "999" }, { r_hash: Buffer.alloc(32).toString("base64") }])(`${method} rejects mismatched settlement evidence %j`, async (invalid) => {
      await seed();
      vi.mocked(lookupLndInvoice).mockResolvedValue(lnd(invalid));
      const response = await handler(request(method), { params: Promise.resolve({ id: "purchase" }) });
      expect(response.status).toBe(502);
      expect((await state()).ledger).toHaveLength(0);
    });
  }
  it("concurrent confirmations grant one purchase and preserve admin tier", async () => {
    await seed("expired", "admin");
    await Promise.all(Array.from({ length: 5 }, () => t.action(api.invoices.confirmPayment, {
      ...evidence, serverSecret: "test-secret",
    })));
    expect((await state()).session).toMatchObject({ credits: 100, tier: "admin" });
    expect((await state()).ledger).toHaveLength(1);
  });
  it("does not credit a second invoice record for the same payment", async () => {
    await seed();
    await t.mutation(internal.invoices.confirmPaymentInternal, evidence);
    await t.run(async (ctx) => {
      const original = (await ctx.db.query("invoices").first())!;
      await ctx.db.insert("invoices", {
        invoiceId: "duplicate", sid: original.sid, amountUsd: original.amountUsd,
        amountSats: original.amountSats, bolt11: original.bolt11, paymentHash: original.paymentHash,
        status: "pending", createdAt: 1, expiresAt: 2,
      });
    });
    await expect(t.mutation(internal.invoices.confirmPaymentInternal, { ...evidence, invoiceId: "duplicate" })).rejects.toThrow("Payment already credited");
    expect((await state()).session?.credits).toBe(100);
    expect((await state()).ledger).toHaveLength(1);
  });
  it("rolls back invoice-paid when its wallet cannot be credited", async () => {
    await seed();
    await t.run(async (ctx) => { const row = await ctx.db.query("sessions").first(); await ctx.db.delete(row!._id); });
    await expect(t.mutation(internal.invoices.confirmPaymentInternal, evidence)).rejects.toThrow("Session not found");
    expect((await state()).invoice?.status).toBe("pending");
    expect((await state()).ledger).toHaveLength(0);
  });
  it("rejects untrusted confirmation callers", async () => {
    await seed();
    await expect(t.action(api.invoices.confirmPayment, { ...evidence, serverSecret: "wrong" })).rejects.toThrow();
    expect((await state()).ledger).toHaveLength(0);
  });
});
