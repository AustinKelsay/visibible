/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuyCreditsModal } from "@/components/buy-credits-modal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/context/session-context", () => ({
  useSession: () => ({ isBuyModalOpen: true, closeBuyModal: vi.fn(), credits: 0, tier: "free" }),
}));
const prefs = vi.hoisted(() => ({ imageModel: "google/gemini-3.1-flash-image", imageResolution: "1K" }));
vi.mock("@/context/preferences-context", () => ({ usePreferences: () => prefs }));
vi.mock("@/lib/analytics", () => ({
  trackCreditsModalOpened: vi.fn(),
  trackCreditsModalClosed: vi.fn(),
  trackInvoiceCreated: vi.fn(),
  trackInvoiceCopied: vi.fn(),
  trackInvoiceCancelled: vi.fn(),
  trackPaymentCompleted: vi.fn(),
  trackPaymentExpired: vi.fn(),
}));

function modelsResponse(models: unknown[]) {
  return Promise.resolve({ json: () => Promise.resolve({ models }) } as Response);
}

describe("Get Credits pack estimate", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    prefs.imageResolution = "1K";
    const memoryStorage = () => {
      const store = new Map<string, string>();
      return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    };
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function openPacks() {
    await act(async () => root.render(<BuyCreditsModal />));
    const next = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Get Credits to Generate"));
    await act(async () => next!.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }

  const catalog = [
    { id: "google/gemini-3.1-flash-lite-image", name: "Nano Banana 2 Lite", availability: "available", estimatedCreditsByResolution: { "1K": 5 } },
    { id: "google/gemini-3.1-flash-image", name: "Nano Banana 2", availability: "available", estimatedCreditsByResolution: { "1K": 9, "2K": 14 } },
  ];

  it("estimates with the model generation runs, not the selected one", async () => {
    vi.stubGlobal("fetch", vi.fn(() => modelsResponse(catalog)));
    await openPacks();
    expect(document.body.textContent).toContain("About 20 images");
    expect(document.body.textContent).toContain("About 60 images");
  });

  it("leaves the estimate out at a resolution the generation model cannot make", async () => {
    prefs.imageResolution = "2K";
    vi.stubGlobal("fetch", vi.fn(() => modelsResponse(catalog)));
    await openPacks();
    expect(document.body.textContent).toContain("100 credits");
    expect(document.body.textContent).not.toMatch(/About \d+ images/);
  });

  it("leaves the estimate out when the generation model has no price", async () => {
    vi.stubGlobal("fetch", vi.fn(() => modelsResponse([])));
    await openPacks();
    expect(document.body.textContent).toContain("100 credits");
    expect(document.body.textContent).not.toMatch(/About \d+ images/);
  });
});
