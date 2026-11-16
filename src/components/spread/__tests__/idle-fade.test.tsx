/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdle } from "../idle-fade";
import { LayerPanel, LayerProvider, useLayer } from "../layers";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Screen() {
  const idle = useIdle();
  const look = useLayer("look");
  return (
    <main data-idle={idle}>
      <button type="button" onClick={(event) => look.open(event.currentTarget)}>Aa</button>
      <LayerPanel id="look" label="Look">
        <button type="button">Classical</button>
      </LayerPanel>
    </main>
  );
}

let container: HTMLDivElement;
let root: Root;
const idle = () => container.querySelector("main")?.getAttribute("data-idle") === "true";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<LayerProvider><Screen /></LayerProvider>); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("idle fading and layers", () => {
  it("never goes idle while a layer is open, and starts waiting again once it closes", async () => {
    act(() => { container.querySelector("button")?.click(); });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(idle()).toBe(false);

    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    // Focus went back to the opener, which has not joined the fade, so the wait runs out as usual.
    act(() => { vi.advanceTimersByTime(3500); });
    expect(idle()).toBe(true);
  });

  it("wakes as soon as a layer opens", () => {
    act(() => { vi.advanceTimersByTime(3500); });
    expect(idle()).toBe(true);
    act(() => { container.querySelector("button")?.click(); });
    expect(idle()).toBe(false);
  });
});
