/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerProvider, useLayer } from "../layers";
import { usePageTurn } from "../page-turn";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ tier: "paid", credits: 0 }) }));
vi.mock("@/lib/analytics", () => ({ trackVerseNavigation: vi.fn() }));

function Reader() {
  usePageTurn({ bookName: "John", chapter: 1, verseNumber: 5, prevUrl: "/john/1/4", nextUrl: "/john/1/6" });
  const look = useLayer("look");
  const whole = useLayer("whole-picture");
  return (
    <>
      <button type="button" onClick={() => look.open()}>Look</button>
      <button type="button" onClick={() => whole.open()}>Whole</button>
    </>
  );
}

const click = (name: string) => act(() => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === name)!.click());

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  push.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<LayerProvider><Reader /></LayerProvider>));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const pressRight = () => act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });

describe("arrow keys and layers", () => {
  it("turn the page when no layer is open", () => {
    pressRight();
    expect(push).toHaveBeenCalledWith("/john/1/6");
  });

  it("do nothing while a layer such as Look is open", () => {
    click("Look");
    pressRight();
    expect(push).not.toHaveBeenCalled();
  });

  it("still turn the page in the whole-picture view", () => {
    click("Whole");
    pressRight();
    expect(push).toHaveBeenCalledWith("/john/1/6");
  });
});
