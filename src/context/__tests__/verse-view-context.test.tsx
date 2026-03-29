/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVerseView, VerseViewProvider } from "@/context/verse-view-context";
import { trackPreferenceChanged } from "@/lib/analytics";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sessionState = {
  tier: "paid" as const,
  credits: 10,
};

vi.mock("@/context/session-context", () => ({
  useSession: vi.fn(() => sessionState),
}));

const searchParamsGetMock = vi.fn(() => null);

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => ({
    get: searchParamsGetMock,
  })),
}));

vi.mock("@/lib/analytics", () => ({
  trackPreferenceChanged: vi.fn(),
}));

function ExposureHarness() {
  const { effectiveView, isSettled } = useVerseView();
  return <div data-settled={String(isSettled)} data-view={effectiveView} />;
}

describe("VerseViewProvider", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.credits = 10;
    searchParamsGetMock.mockReturnValue(null);
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

  async function renderProvider(child: ReactNode) {
    await act(async () => {
      root?.render(
        <VerseViewProvider>
          {child}
        </VerseViewProvider>
      );
    });
  }

  it("defaults to the reader view", async () => {
    await renderProvider(<ExposureHarness />);

    expect(container?.querySelector("[data-settled]")?.getAttribute("data-settled")).toBe("true");
    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("reader");
  });

  it("tracks preference changes when the gallery is toggled on", async () => {
    function ToggleHarness() {
      const { setEffectiveView } = useVerseView();
      return (
        <button
          type="button"
          onClick={() => setEffectiveView("gallery", "header_gallery_toggle")}
        >
          Toggle
        </button>
      );
    }

    await renderProvider(<ToggleHarness />);

    await act(async () => {
      container?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(trackPreferenceChanged).toHaveBeenCalledWith(expect.objectContaining({
      preference: "chapterGallery",
      value: "enabled",
      source: "header_gallery_toggle",
      tier: "paid",
      hasCredits: true,
    }));
  });

  it("tracks preference changes when the gallery is toggled back off", async () => {
    function ToggleHarness() {
      const { setEffectiveView } = useVerseView();
      return (
        <>
          <button
            type="button"
            onClick={() => setEffectiveView("gallery", "header_gallery_toggle")}
          >
            Enable
          </button>
          <button
            type="button"
            onClick={() => setEffectiveView("reader", "header_gallery_toggle")}
          >
            Disable
          </button>
        </>
      );
    }

    await renderProvider(<ToggleHarness />);

    const buttons = container?.querySelectorAll("button");
    expect(buttons?.length).toBe(2);
    if (!buttons || buttons.length < 2) {
      throw new Error("Missing toggle buttons");
    }

    await act(async () => {
      buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      buttons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(trackPreferenceChanged).toHaveBeenCalledWith(expect.objectContaining({
      preference: "chapterGallery",
      value: "disabled",
      source: "header_gallery_toggle",
      tier: "paid",
      hasCredits: true,
    }));
  });

  it("ignores no-op updates", async () => {
    function ToggleHarness() {
      const { setEffectiveView } = useVerseView();
      return (
        <button
          type="button"
          onClick={() => setEffectiveView("reader", "header_gallery_toggle")}
        >
          Toggle
        </button>
      );
    }

    await renderProvider(<ToggleHarness />);

    await act(async () => {
      container?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(trackPreferenceChanged).not.toHaveBeenCalled();
  });
});
