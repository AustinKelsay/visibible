/* @vitest-environment jsdom */

import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuyCreditsModal } from "@/components/buy-credits-modal";
import { LayerPanel, LayerProvider, useLayer } from "@/components/spread/layers";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The session, as a tiny store, so opening and closing the dialog re-renders it as the real session does.
const session = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { isBuyModalOpen: false, welcomeRequested: false, closeBuyModal: () => setOpen(false), credits: 0, tier: "paid" };
  let snapshot = { ...state };
  const setOpen = (isBuyModalOpen: boolean) => {
    snapshot = { ...snapshot, isBuyModalOpen };
    listeners.forEach((listener) => listener());
  };
  return { setOpen, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); }, get: () => snapshot };
});
vi.mock("@/context/session-context", () => ({ useSession: () => useSyncExternalStore(session.subscribe, session.get, session.get) }));
vi.mock("@/lib/analytics");

describe("the credits dialog over an open layer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    act(() => session.setOpen(false));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  // Ask, open, with a question its reader could not pay for still in the field.
  const render = () => act(async () => root.render(
    <LayerProvider initialLayer="ask">
      <LayerPanel id="ask" label="Ask">
        <input aria-label="Ask about this verse" defaultValue="What does it mean?" />
        <button type="button">Send</button>
      </LayerPanel>
      <BuyCreditsModal />
    </LayerProvider>
  ));
  const flush = () => act(async () => { await Promise.resolve(); });
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Credits"]');
  const ask = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Ask"]');
  const field = () => document.querySelector<HTMLInputElement>('input[aria-label="Ask about this verse"]')!;
  const press = (key: string, shiftKey = false) => {
    const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
    act(() => { document.activeElement!.dispatchEvent(event); });
    return event.defaultPrevented;
  };

  it("takes focus, keeps Tab inside, closes alone on Escape and gives focus back to the question", async () => {
    await render();
    field().focus();
    act(() => session.setOpen(true));
    await flush();

    expect(dialog()!.contains(document.activeElement)).toBe(true);
    expect(press("Tab", true)).toBe(true);
    expect(dialog()!.contains(document.activeElement)).toBe(true);

    expect(press("Escape")).toBe(true);
    await flush();
    expect(dialog()).toBeNull();
    expect(ask()).not.toBeNull();
    expect(document.activeElement).toBe(field());
    expect(field().value).toBe("What does it mean?");
  });

  it("keeps focus when the layer that opened it closes as it opens, as the picture menu's Get credits does", async () => {
    await act(async () => root.render(<LayerProvider><PictureMenu /><BuyCreditsModal /></LayerProvider>));
    const chip = document.querySelector<HTMLButtonElement>('button[aria-label="Picture menu chip"]')!;
    chip.focus();
    await act(async () => { chip.click(); });
    await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="Picture menu"] button')!.click(); });
    await flush();

    expect(document.querySelector('[aria-label="Picture menu"]')).toBeNull();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    // Closed, it gives focus to the chip the menu would have returned it to.
    expect(press("Escape")).toBe(true);
    await flush();
    expect(document.activeElement).toBe(chip);
  });
});

function PictureMenu() {
  const { open, close } = useLayer("picture");
  return (
    <>
      <button type="button" aria-label="Picture menu chip" onClick={(event) => open(event.currentTarget)} />
      <LayerPanel id="picture" label="Picture menu">
        <button type="button" onClick={() => { close(); session.setOpen(true); }}>Get credits to paint another</button>
      </LayerPanel>
    </>
  );
}
