/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuyCreditsModal } from "@/components/buy-credits-modal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const session = vi.hoisted(() => ({ isBuyModalOpen: true, closeBuyModal: () => {}, credits: 0, tier: "free" }));
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/context/preferences-context", () => ({ usePreferences: () => ({ imageModel: "m", imageResolution: "1K" }) }));
vi.mock("@/lib/analytics", () => ({
  trackCreditsModalOpened: vi.fn(),
  trackCreditsModalClosed: vi.fn(),
  trackInvoiceCreated: vi.fn(),
  trackInvoiceCopied: vi.fn(),
  trackInvoiceCancelled: vi.fn(),
  trackPaymentCompleted: vi.fn(),
  trackPaymentExpired: vi.fn(),
}));

describe("purchase intent across retries", () => {
  let container: HTMLDivElement;
  let root: Root;
  let invoiceAnswers: Array<() => Promise<Response>>;
  let sentIntents: string[];

  beforeEach(() => {
    const memoryStorage = () => {
      const store = new Map<string, string>();
      return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    };
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    invoiceAnswers = [];
    sentIntents = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (url !== "/api/invoice") return Promise.resolve({ json: () => Promise.resolve({ models: [] }) } as Response);
      sentIntents.push(JSON.parse(String(init?.body)).intentId);
      return invoiceAnswers.shift()!();
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function click(label: string) {
    const button = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
    if (!button) throw new Error(`No "${label}" button in: ${document.body.textContent}`);
    await act(async () => button.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  const answer = (status: number, body: unknown) => () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("keeps the intent until the server settles its outcome", async () => {
    await act(async () => root.render(<BuyCreditsModal />));
    const next = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Get Credits to Generate"));
    if (next) await act(async () => next.click());

    invoiceAnswers.push(
      () => Promise.reject(new TypeError("Failed to fetch")),
      answer(429, { error: "Too many invoice creation requests" }),
      answer(500, { error: "Failed to create invoice" }),
      answer(409, { error: "Still being created", code: "invoice_in_progress" }),
      answer(409, { error: "Could not confirm", code: "invoice_unresolved" }),
      answer(409, { error: "Different bundle", code: "invoice_intent_conflict" }),
      answer(400, { error: "Unsupported credit bundle" }),
    );
    await click("Buy 300 Credits");
    for (let retry = 0; retry < 4; retry++) await click("Try Again");
    expect(document.body.textContent).toContain("Could not confirm");
    await click("Try Again");
    await click("Try Again");

    expect(sentIntents).toHaveLength(7);
    expect(sentIntents[0]).toMatch(/^[0-9a-f-]{36}$/);
    // A lost response, a rate limit, a server error and "still being created" settle nothing.
    expect(sentIntents.slice(1, 5)).toEqual(Array(4).fill(sentIntents[0]));
    // "Unresolved" ended the first intent, and "conflict" ended the second.
    expect(sentIntents[5]).not.toBe(sentIntents[0]);
    expect(sentIntents[6]).not.toBe(sentIntents[5]);
  });
});
