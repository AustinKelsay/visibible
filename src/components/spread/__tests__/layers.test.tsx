/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayerPanel, LayerProvider, useLayer } from "../layers";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Opener({ id, label }: { id: string; label: string }) {
  const layer = useLayer(id);
  return (
    <>
      <button type="button" onClick={(event) => layer.toggle(event.currentTarget)}>{`Open ${label}`}</button>
      <LayerPanel id={id} label={label}>
        <button type="button">{`${label} first`}</button>
        <button type="button">{`${label} last`}</button>
      </LayerPanel>
    </>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <LayerProvider>
        <Opener id="look" label="Look" />
        <Opener id="contents" label="Contents" />
      </LayerProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (name: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === name)!;
const dialogs = () => Array.from(container.querySelectorAll('[role="dialog"]')).map((d) => d.getAttribute("aria-label"));

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

describe("spread layers", () => {
  it("opens one layer at a time and focuses inside it", () => {
    act(() => button("Open Look").click());
    expect(dialogs()).toEqual(["Look"]);
    expect(document.activeElement).toBe(button("Look first"));

    act(() => button("Open Contents").click());
    expect(dialogs()).toEqual(["Contents"]);
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const opener = button("Open Look");
    opener.focus();
    act(() => opener.click());
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    await flush();
    expect(dialogs()).toEqual([]);
    expect(document.activeElement).toBe(button("Open Look"));
  });

  it("keeps Tab inside the open panel", () => {
    act(() => button("Open Look").click());
    button("Look last").focus();
    const panel = container.querySelector('[role="dialog"]')!;
    act(() => { panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
    expect(document.activeElement).toBe(button("Look first"));
  });
});
