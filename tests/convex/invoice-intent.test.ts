import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";
import { POST } from "../../src/app/api/invoice/route";
import { createLightningInvoice } from "../../src/lib/lightning";

let t = convexTest(schema, modules);
// Set to make the next invoice save fail after the node has already answered.
let failNextSave = false;
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: () => ({
    query: t.query,
    action: t.action,
    mutation: (fn: Parameters<typeof t.mutation>[0], args: Record<string, unknown>) => {
      if (failNextSave && "bolt11" in args) {
        failNextSave = false;
        throw new Error("Connection lost");
      }
      return t.mutation(fn, args as never);
    },
  }),
  getConvexServerSecret: () => "test-secret",
}));
vi.mock("@/lib/session", () => ({
  validateSessionWithIp: async () => ({ valid: true, sid: "buyer", currentIpHash: "test-ip" }),
  withSessionRefreshCookie: (response: Response) => response,
}));
vi.mock("@/lib/origin", () => ({ validateOrigin: () => true }));
vi.mock("@/lib/btc-price", () => ({
  getBtcPrice: async () => 100_000,
  usdToSats: (usd: number) => usd * 1_000,
}));
vi.mock("@/lib/lightning", () => ({
  createLightningInvoice: vi.fn(),
  isLightningConfigured: () => true,
}));

const INTENT = "11111111-1111-4111-8111-111111111111";
let hashes = 0;

function buy(body: Record<string, unknown> = { amountUsd: 1, intentId: INTENT }) {
  return POST(new Request("http://localhost:3000/api/invoice", { method: "POST", body: JSON.stringify(body) }));
}
async function saved() {
  return t.run(async (ctx) => ({
    intents: await ctx.db.query("invoiceIntents").collect(),
    invoices: await ctx.db.query("invoices").collect(),
  }));
}

beforeEach(async () => {
  t = convexTest(schema, modules);
  failNextSave = false;
  vi.stubEnv("CONVEX_SERVER_SECRET", "test-secret");
  vi.mocked(createLightningInvoice).mockReset().mockImplementation(async () => ({
    bolt11: `lnbc-test-${++hashes}`,
    paymentHash: hashes.toString(16).padStart(64, "0"),
    expiresAt: Date.now() + 3_600_000,
  }));
  await t.run(async (ctx) => {
    await ctx.db.insert("sessions", { sid: "buyer", credits: 0, tier: "free", createdAt: 1, lastSeenAt: 1, expiresAt: 2 });
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("purchase intents", () => {
  it("saves owner, bundle and sats quote before asking the node", async () => {
    let seenByNode: Awaited<ReturnType<typeof saved>> | undefined;
    vi.mocked(createLightningInvoice).mockImplementationOnce(async () => {
      seenByNode = await saved();
      return { bolt11: "lnbc-first", paymentHash: "ab".repeat(32), expiresAt: Date.now() + 3_600_000 };
    });
    const response = await buy();
    expect(response.status).toBe(200);
    expect(seenByNode?.intents).toEqual([expect.objectContaining({
      sid: "buyer", intentId: INTENT, amountUsd: 1, amountSats: 1000, status: "creating",
    })]);
    expect(seenByNode?.invoices).toHaveLength(0);
    const after = await saved();
    expect(after.intents[0].status).toBe("created");
    expect(after.invoices).toEqual([expect.objectContaining({ invoiceId: after.intents[0].invoiceId, bolt11: "lnbc-first" })]);
  });

  it("returns the saved invoice when the same intent is sent again", async () => {
    const first = await (await buy()).json();
    const again = await buy();
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    expect(createLightningInvoice).toHaveBeenCalledTimes(1);
    expect((await saved()).invoices).toHaveLength(1);
  });

  it("refuses the same intent for a different bundle", async () => {
    await buy();
    const other = await buy({ amountUsd: 3, intentId: INTENT });
    expect(other.status).toBe(409);
    expect((await other.json()).code).toBe("invoice_intent_conflict");
    expect(createLightningInvoice).toHaveBeenCalledTimes(1);
  });

  it("reports an intent unresolved, without a second invoice, when the node created one that was never saved", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    failNextSave = true;
    expect((await buy()).status).toBe(500);
    expect((await saved()).invoices).toHaveLength(0);

    const soon = await buy();
    expect(soon.status).toBe(409);
    expect((await soon.json()).code).toBe("invoice_in_progress");

    vi.setSystemTime(Date.now() + 31_000);
    const later = await buy();
    expect(later.status).toBe(409);
    expect(await later.json()).toMatchObject({ code: "invoice_unresolved", reference: INTENT });
    expect(createLightningInvoice).toHaveBeenCalledTimes(1);
    const after = await saved();
    expect(after.invoices).toHaveLength(0);
    expect(after.intents[0].status).toBe("unresolved");
    expect(await t.query(internal.invoices.listOpenInvoiceIntents, {})).toEqual([
      expect.objectContaining({ intentId: INTENT, status: "unresolved", amountSats: 1000 }),
    ]);
  });

  it("reports an intent unresolved when the request stopped before the node's answer was recorded", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("invoiceIntents", {
        sid: "buyer", intentId: INTENT, invoiceId: "lost", amountUsd: 1, amountSats: 1000,
        status: "creating", createdAt: 1, updatedAt: 1,
      });
    });
    const response = await buy();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("invoice_unresolved");
    expect(createLightningInvoice).not.toHaveBeenCalled();
  });

  it("reports an intent unresolved when the node never answered", async () => {
    vi.mocked(createLightningInvoice).mockRejectedValueOnce(Object.assign(new Error("no answer"), { unanswered: true }));
    const first = await buy();
    expect(first.status).toBe(409);
    expect((await first.json()).code).toBe("invoice_unresolved");
    expect((await buy()).status).toBe(409);
    expect(createLightningInvoice).toHaveBeenCalledTimes(1);
    expect((await saved()).intents[0].status).toBe("unresolved");
  });

  it("asks the node again, with the same quote, after it answered with an error", async () => {
    vi.mocked(createLightningInvoice).mockRejectedValueOnce(new Error("Lightning request failed: 500"));
    expect((await buy()).status).toBe(500);
    expect((await saved()).intents[0].status).toBe("failed");
    const retry = await buy();
    expect(retry.status).toBe(200);
    expect(createLightningInvoice).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = vi.mocked(createLightningInvoice).mock.calls;
    expect(secondCall).toEqual(firstCall);
    expect((await saved()).invoices).toHaveLength(1);
  });

  it("treats a request without an intent id as a new purchase each time", async () => {
    const first = await (await buy({ amountUsd: 1 })).json();
    const second = await (await buy({ amountUsd: 1 })).json();
    expect(second.invoiceId).not.toBe(first.invoiceId);
    expect((await saved()).invoices).toHaveLength(2);
  });

  it("rejects a malformed intent id before any work", async () => {
    const response = await buy({ amountUsd: 1, intentId: "not-a-uuid" });
    expect(response.status).toBe(400);
    expect(createLightningInvoice).not.toHaveBeenCalled();
    expect((await saved()).intents).toHaveLength(0);
  });

  it("keeps another session's intent with the same id separate", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("sessions", { sid: "other", credits: 0, tier: "free", createdAt: 1, lastSeenAt: 1, expiresAt: 2 });
    });
    await t.mutation(api.invoices.beginInvoice, {
      sid: "other", intentId: INTENT, invoiceId: "theirs", amountUsd: 3, amountSats: 3000, serverSecret: "test-secret",
    });
    const response = await buy();
    expect(response.status).toBe(200);
    expect((await response.json()).amountUsd).toBe(1);
  });

  it("refuses an invoice that is not the one its intent asked for, or whose payment hash is taken", async () => {
    await buy();
    const { invoices } = await saved();
    await t.mutation(api.invoices.beginInvoice, {
      sid: "buyer", intentId: "22222222-2222-4222-8222-222222222222", invoiceId: "second", amountUsd: 1, amountSats: 1000, serverSecret: "test-secret",
    });
    const base = {
      sid: "buyer", intentId: "22222222-2222-4222-8222-222222222222", amountUsd: 1 as const,
      bolt11: "lnbc-second", expiresAt: 3_600_000, serverSecret: "test-secret",
    };
    await expect(t.mutation(api.invoices.createInvoice, {
      ...base, invoiceId: "second", amountSats: 999, paymentHash: "cd".repeat(32),
    })).rejects.toThrow("Invoice does not match its purchase intent");
    await expect(t.mutation(api.invoices.createInvoice, {
      ...base, invoiceId: "second", amountSats: 1000, paymentHash: invoices[0].paymentHash!,
    })).rejects.toThrow("Payment hash already belongs to an invoice");
    expect((await saved()).invoices).toHaveLength(1);
  });
});
