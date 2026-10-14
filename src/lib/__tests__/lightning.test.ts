/**
 * Unit tests for the LNURL-pay Lightning client.
 * Uses a real unpaid 1-sat invoice from the receiving node as a fixture.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLightningInvoice,
  isLightningConfigured,
  lookupLightningInvoiceState,
} from "../lightning";

const PAY_URL = "https://node.example/lnurlp/pay";
const BOLT11 =
  "lnbc10n1p4val22pp5m2djyaf4ud2uzjjsp3lujw8z29tk20wy4w8c8qul555thfxlnu0sdpz2e5hx6tzd93xcefqu2qfggrxd9u8gatjv5cqzzsxqrrsssp5vkqnfpylqccekte07aztrcz8sdu02ffactg53d0ffv20xyky9eps9qxpqysgq4n4fagkqltfphev5qezuy959jsydagt8wzdqdwzskmgaaghxmtexrcm46hr0cdht0jtzpc2qj4l7e2y8d8z8u7cvf286zpzsgtkhz7qpp0jn3m";
const PAYMENT_HASH = "da9b227535e355c14a500c7fc938e25157653dc4ab8f83839fa528bba4df9f1f";

const fetchMock = vi.fn();

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubEnv("LNURL_PAY_URL", PAY_URL);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createLightningInvoice", () => {
  it("requests the amount in msats and reads hash and expiry from the invoice", async () => {
    fetchMock.mockResolvedValue(reply({ pr: BOLT11, routes: [], status: "OK" }));

    const invoice = await createLightningInvoice(1, "credits abc");

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe(PAY_URL);
    expect(url.searchParams.get("amount")).toBe("1000");
    expect(url.searchParams.get("comment")).toBe("credits abc");
    expect(invoice).toEqual({
      bolt11: BOLT11,
      paymentHash: PAYMENT_HASH,
      expiresAt: (1791950154 + 3600) * 1000,
    });
  });

  it("rejects an invoice for a different amount", async () => {
    fetchMock.mockResolvedValue(reply({ pr: BOLT11, routes: [], status: "OK" }));

    await expect(createLightningInvoice(2, "credits abc")).rejects.toThrow("amount does not match");
  });

  it("surfaces LNURL errors", async () => {
    fetchMock.mockResolvedValue(reply({ status: "ERROR", reason: "amount out of range" }, 400));

    await expect(createLightningInvoice(1, "credits abc")).rejects.toThrow("amount out of range");
  });
});

describe("lookupLightningInvoiceState", () => {
  it("checks the payment hash against the node", async () => {
    fetchMock.mockResolvedValue(reply({ status: "SETTLED" }));

    await expect(lookupLightningInvoiceState(PAYMENT_HASH.toUpperCase())).resolves.toBe("SETTLED");
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${PAY_URL}/check?id=${PAYMENT_HASH}`);
  });

  it("rejects unknown states", async () => {
    fetchMock.mockResolvedValue(reply({ status: "PAID" }));

    await expect(lookupLightningInvoiceState(PAYMENT_HASH)).rejects.toThrow("Unexpected");
  });

  it("fails when the node cannot look up the invoice", async () => {
    fetchMock.mockResolvedValue(reply({ status: "ERROR", reason: "lookup failed" }, 502));

    await expect(lookupLightningInvoiceState(PAYMENT_HASH)).rejects.toThrow("lookup failed");
  });
});

describe("isLightningConfigured", () => {
  it("requires LNURL_PAY_URL", () => {
    expect(isLightningConfigured()).toBe(true);
    vi.stubEnv("LNURL_PAY_URL", "");
    expect(isLightningConfigured()).toBe(false);
  });
});
