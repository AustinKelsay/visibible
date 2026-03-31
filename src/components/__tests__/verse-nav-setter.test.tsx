/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VerseNavSetter } from "@/components/verse-nav-setter";
import { useVerseNav, VerseNavProvider } from "@/context/verse-nav-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const verseNav = useVerseNav();

  return (
    <div data-testid="probe">
      {verseNav
        ? `${verseNav.book}:${verseNav.chapter}:${verseNav.verseNumber}:${verseNav.nextUrl ?? "none"}`
        : "null"}
    </div>
  );
}

function TestTree({
  oldVisible,
  newVisible,
}: {
  oldVisible: boolean;
  newVisible: boolean;
}) {
  return (
    <VerseNavProvider>
      {oldVisible ? (
        <VerseNavSetter
          key="old"
          book="Genesis"
          chapter={1}
          verseNumber={1}
          totalVerses={31}
          nextUrl="/genesis/1/2"
        />
      ) : null}
      {newVisible ? (
        <VerseNavSetter
          key="new"
          book="Genesis"
          chapter={1}
          verseNumber={2}
          totalVerses={31}
          prevUrl="/genesis/1/1"
          nextUrl="/genesis/1/3"
        />
      ) : null}
      <Probe />
    </VerseNavProvider>
  );
}

describe("VerseNavSetter", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    root = null;
    container = null;
  });

  async function renderTree(tree: ReactNode) {
    await act(async () => {
      root?.render(tree);
    });
  }

  it("keeps the next page navigation when the previous page setter unmounts", async () => {
    await renderTree(<TestTree oldVisible={true} newVisible={false} />);
    expect(container?.querySelector('[data-testid="probe"]')?.textContent).toBe(
      "Genesis:1:1:/genesis/1/2"
    );

    await renderTree(<TestTree oldVisible={true} newVisible={true} />);
    expect(container?.querySelector('[data-testid="probe"]')?.textContent).toBe(
      "Genesis:1:2:/genesis/1/3"
    );

    await renderTree(<TestTree oldVisible={false} newVisible={true} />);
    expect(container?.querySelector('[data-testid="probe"]')?.textContent).toBe(
      "Genesis:1:2:/genesis/1/3"
    );
  });

  it("clears the navigation when leaving verse pages entirely", async () => {
    await renderTree(<TestTree oldVisible={false} newVisible={true} />);
    expect(container?.querySelector('[data-testid="probe"]')?.textContent).toBe(
      "Genesis:1:2:/genesis/1/3"
    );

    await renderTree(<TestTree oldVisible={false} newVisible={false} />);
    expect(container?.querySelector('[data-testid="probe"]')?.textContent).toBe("null");
  });
});
