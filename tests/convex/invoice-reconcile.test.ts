import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";
import { GET } from "../../src/app/api/invoice/[id]/route";
import { lookupLightningInvoiceState } from "../../src/lib/lightning";

let t = convexTest(schema, modules);
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: () => ({ query: t.query, action: t.action, mutation: t.mutation }),
  getConvexServerSecret: () => "test-secret",
}));
vi.mock("@/lib/session", () => ({
  validateSessionWithIp: async () => ({ valid: true, sid: "buyer", currentIpHash: "test-ip" }),
  withSessionRefreshCookie: (response: Response) => response,
}));
vi.mock("@/lib/origin", () => ({ validateOrigin: () => true }));
vi.mock("../../src/lib/lightning", () => ({
  lookupLightningInvoiceState: vi.fn(),
  isLightningConfigured: () => true,
}));

const HOUR = 3_600_000;
const START = Date.UTC(2026, 10, 14, 12);
const hash = "ab".repeat(32);
const lookup = vi.mocked(lookupLightningInvoiceState);

/** Save an invoice the way the purchase route does; its expiry is one hour away. */
async function createInvoice(invoiceId = "purchase", paymentHash = hash) {
  await t.mutation(api.invoices.createInvoice, {
    invoiceId, sid: "buyer", amountUsd: 1, amountSats: 1000, bolt11: `lnbc-${invoiceId}`,
    paymentHash, expiresAt: Date.now() + HOUR, serverSecret: "test-secret",
  });
}
/** Run every scheduled look until none is left, one scheduled time at a time so each look sees its own clock. */
const runToEnd = () => t.finishAllScheduledFunctions(() => void vi.advanceTimersToNextTimer());
async function saved() {
  return t.run(async (ctx) => ({
    invoices: await ctx.db.query("invoices").collect(),
    session: await ctx.db.query("sessions").first(),
    ledger: await ctx.db.query("creditLedger").collect(),
  }));
}
/** Seconds after START at which the node was asked. */
function lookTimes(times: number[]) {
  return times.map((at) => Math.round((at - START) / 1000));
}
function recordLooks(answer: () => Promise<"OPEN" | "SETTLED" | "CANCELED" | "ACCEPTED">) {
  const times: number[] = [];
  lookup.mockImplementation(() => {
    times.push(Date.now());
    return answer();
  });
  return times;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  t = convexTest(schema, modules);
  vi.stubEnv("CONVEX_SERVER_SECRET", "test-secret");
  vi.stubEnv("LNURL_PAY_URL", "https://node.example/lnurlp/pay");
  lookup.mockReset().mockResolvedValue("OPEN");
  await t.run(async (ctx) => {
    await ctx.db.insert("sessions", { sid: "buyer", credits: 0, tier: "free", createdAt: 1, lastSeenAt: 1, expiresAt: 2 });
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("settlement without a browser", () => {
  it("credits a payment made after every tab closed", async () => {
    lookup.mockResolvedValueOnce("OPEN").mockResolvedValueOnce("OPEN").mockResolvedValue("SETTLED");
    await createInvoice();
    await runToEnd();
    const after = await saved();
    expect(after.invoices[0]).toMatchObject({ status: "paid", reconciledAt: expect.any(Number) });
    expect(after.session).toMatchObject({ credits: 100, tier: "paid" });
    expect(after.ledger).toEqual([expect.objectContaining({ invoiceId: "purchase", delta: 100, reason: "purchase" })]);
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(lookup).toHaveBeenCalledWith(hash);
  });

  it("spreads its looks out, looks once more just after expiry, then marks the invoice expired", async () => {
    const times = recordLooks(async () => "OPEN");
    await createInvoice();
    await runToEnd();
    expect(lookTimes(times)).toEqual([30, 60, 120, 240, 480, 960, 1860, 2760, 3660, 3721]);
    const after = await saved();
    expect(after.invoices[0]).toMatchObject({ status: "expired", reconciledAt: expect.any(Number) });
    expect(after.ledger).toHaveLength(0);
  });

  it("expires an invoice the node canceled without waiting for expiry", async () => {
    lookup.mockResolvedValue("CANCELED");
    await createInvoice();
    await runToEnd();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect((await saved()).invoices[0].status).toBe("expired");
  });

  it("keeps looking through an outage, never credits on a failed look, and stops two hours after expiry", async () => {
    const times = recordLooks(async () => { throw new Error("Lightning request failed: 502"); });
    await createInvoice();
    await runToEnd();
    // Nine looks before expiry, then eight more a quarter of an hour apart.
    expect(times).toHaveLength(17);
    expect(lookTimes(times).slice(9, 12)).toEqual([3721, 4621, 5521]);
    const after = await saved();
    expect(after.invoices[0]).toMatchObject({
      status: "pending", reconciledAt: expect.any(Number), lastCheckError: "Lightning request failed: 502",
    });
    expect(after.invoices[0].lastCheckedAt).toBeUndefined();
    expect(after.ledger).toHaveLength(0);
    expect(await t.query(internal.invoiceReconciliation.status, {})).toEqual([expect.objectContaining({
      invoiceId: "purchase", status: "pending", watching: false, looksAfterExpiry: 8,
      lastError: "Lightning request failed: 502", ageMs: expect.any(Number),
    })]);
  });

  it("credits once the node answers again after an outage", async () => {
    lookup.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline")).mockResolvedValue("SETTLED");
    await createInvoice();
    await runToEnd();
    const after = await saved();
    expect(after.invoices[0]).toMatchObject({ status: "paid" });
    expect(after.invoices[0].lastCheckError).toBeUndefined();
    expect(after.ledger).toHaveLength(1);
  });

  it("plans the next look before the current one reports back", async () => {
    let answer!: (state: "OPEN") => void;
    lookup.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    await createInvoice();
    vi.advanceTimersToNextTimer();
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersToNextTimer();
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    // The node has been asked and has not answered, and the next look is already waiting.
    const jobs = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.map((job) => `${job.name} ${job.state.kind}`).sort()).toEqual([
      "invoiceReconciliation:check inProgress",
      "invoiceReconciliation:tick pending",
      "invoiceReconciliation:tick success",
    ]);
    answer("OPEN");
    await runToEnd();
  });

  it("never credits twice when the browser and the server both see the payment", async () => {
    lookup.mockResolvedValue("SETTLED");
    await createInvoice();
    const response = await GET(new Request("http://localhost:3000/api/invoice/purchase"), { params: Promise.resolve({ id: "purchase" }) });
    expect((await response.json()).status).toBe("paid");
    await runToEnd();
    const after = await saved();
    expect(after.session?.credits).toBe(100);
    expect(after.ledger).toHaveLength(1);
  });

  it("stops and reports when the node settled an invoice that cannot be credited", async () => {
    lookup.mockResolvedValue("SETTLED");
    await createInvoice();
    await t.run(async (ctx) => {
      const session = await ctx.db.query("sessions").first();
      await ctx.db.delete(session!._id);
    });
    await runToEnd();
    const after = await saved();
    expect(after.invoices[0]).toMatchObject({
      status: "pending", reconciledAt: expect.any(Number), lastCheckError: "Settled but not credited: Session not found",
    });
    expect(after.ledger).toHaveLength(0);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});

describe("invoices that were never scheduled", () => {
  async function seedLegacy(status: "pending" | "expired", invoiceId: string, paymentHash: string) {
    await t.run(async (ctx) => {
      await ctx.db.insert("invoices", {
        invoiceId, sid: "buyer", amountUsd: 1, amountSats: 1000, bolt11: `lnbc-${invoiceId}`,
        paymentHash, status, createdAt: START - 30 * 24 * HOUR, expiresAt: START - 30 * 24 * HOUR + HOUR,
      });
    });
  }

  it("credits a historical invoice that settled after it was marked expired, once", async () => {
    await seedLegacy("expired", "old-paid", "cd".repeat(32));
    await seedLegacy("pending", "old-open", "ef".repeat(32));
    lookup.mockImplementation(async (paymentHash) => (paymentHash === "cd".repeat(32) ? "SETTLED" : "OPEN"));
    expect(await t.mutation(internal.invoiceReconciliation.sweepUnscheduled, {})).toEqual({ configured: true, scheduled: 2 });
    await runToEnd();
    const after = await saved();
    expect(after.invoices.map((row) => [row.invoiceId, row.status]).sort()).toEqual([["old-open", "expired"], ["old-paid", "paid"]]);
    expect(after.session?.credits).toBe(100);
    expect(after.ledger).toEqual([expect.objectContaining({ invoiceId: "old-paid", delta: 100 })]);
    // A second sweep finds nothing left to schedule and nothing is credited again.
    expect(await t.mutation(internal.invoiceReconciliation.sweepUnscheduled, {})).toEqual({ configured: true, scheduled: 0 });
    await runToEnd();
    expect((await saved()).ledger).toHaveLength(1);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("gives up on a historical invoice the node cannot look up after eight tries", async () => {
    await seedLegacy("pending", "old-unknown", "12".repeat(32));
    lookup.mockRejectedValue(new Error("Lightning request failed: lookup failed"));
    await t.mutation(internal.invoiceReconciliation.sweepUnscheduled, {});
    await runToEnd();
    expect(lookup).toHaveBeenCalledTimes(8);
    expect((await saved()).invoices[0]).toMatchObject({
      status: "pending", reconciledAt: expect.any(Number), lastCheckError: "Lightning request failed: lookup failed",
    });
  });

  it("schedules a bounded batch per run and leaves the rest for the next", async () => {
    for (let i = 0; i < 30; i++) await seedLegacy("pending", `old-${i}`, i.toString(16).padStart(64, "0"));
    expect(await t.mutation(internal.invoiceReconciliation.sweepUnscheduled, {})).toEqual({ configured: true, scheduled: 25 });
    expect(await t.mutation(internal.invoiceReconciliation.sweepUnscheduled, {})).toEqual({ configured: true, scheduled: 5 });
    expect(await t.mutation(internal.invoiceReconciliation.sweepUnscheduled, {})).toEqual({ configured: true, scheduled: 0 });
    expect((await saved()).invoices.every((row) => row.reconcileAt !== undefined)).toBe(true);
  });

  it("schedules nothing while Convex has no LNURL_PAY_URL, then catches up", async () => {
    vi.stubEnv("LNURL_PAY_URL", "");
    await createInvoice();
    expect(await t.mutation(internal.invoiceReconciliation.sweepUnscheduled, {})).toEqual({ configured: false, scheduled: 0 });
    await runToEnd();
    expect(lookup).not.toHaveBeenCalled();
    expect((await saved()).invoices[0].reconcileAt).toBeUndefined();

    vi.stubEnv("LNURL_PAY_URL", "https://node.example/lnurlp/pay");
    lookup.mockResolvedValue("SETTLED");
    expect(await t.mutation(internal.invoiceReconciliation.sweepUnscheduled, {})).toEqual({ configured: true, scheduled: 1 });
    await runToEnd();
    expect((await saved()).session?.credits).toBe(100);
  });
});
