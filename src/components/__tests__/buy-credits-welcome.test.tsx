/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuyCreditsModal } from "@/components/buy-credits-modal";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const session = vi.hoisted(() => ({ isBuyModalOpen: true, welcomeRequested: false, closeBuyModal: () => {}, credits: 0, tier: "paid" }));
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/lib/analytics");

describe("the welcome in the credits dialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const open = async (welcomeRequested: boolean) => {
    Object.assign(session, { isBuyModalOpen: true, welcomeRequested });
    await act(async () => root.render(<BuyCreditsModal />));
  };

  it("never opens by itself: a first-time visitor asking for credits lands on the packs", async () => {
    await open(false);
    expect(document.body.textContent).toContain("Buy 300 Credits");
    expect(document.body.textContent).not.toContain("Welcome to Visibible");
  });

  it("opens when it is asked for, and leads on to the packs", async () => {
    await open(true);
    expect(document.body.textContent).toContain("Welcome to Visibible Alpha");
    const next = [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Get Credits to Generate"))!;
    await act(async () => next.click());
    expect(document.body.textContent).toContain("Buy 300 Credits");
  });
});
