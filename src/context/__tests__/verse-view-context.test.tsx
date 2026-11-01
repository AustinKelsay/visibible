/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVerseView, VerseViewProvider } from "@/context/verse-view-context";
import { trackPreferenceChanged } from "@/lib/analytics";
import type { VerseViewValue } from "@/lib/verse-view";
import { VerseModeTabs } from "@/components/verse-mode-tabs";
import { getVerseNavigationDirection } from "@/lib/verse-keyboard-navigation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sessionState = {
  tier: "paid" as const,
  credits: 10,
};

vi.mock("@/context/session-context", () => ({
  useSession: vi.fn(() => sessionState),
}));

const searchParamsGetMock = vi.fn<(key: string) => string | null>(() => null);

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
  let searchParamView: VerseViewValue | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.credits = 10;
    window.history.replaceState(null, "", "/genesis/1/1");
    searchParamView = null;
    searchParamsGetMock.mockImplementation((key: string) => (
      key === "view" ? searchParamView : null
    ));
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
    vi.unstubAllEnvs();
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

  it("initializes to the gallery view from the query string", async () => {
    searchParamView = "gallery";

    await renderProvider(<ExposureHarness />);

    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("gallery");
  });

  it("syncs back to the query-string view after the URL changes", async () => {
    await renderProvider(<ExposureHarness />);
    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("reader");

    searchParamView = "gallery";
    await renderProvider(<ExposureHarness />);

    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("gallery");
  });

  it("allows video deep links in development and production", async () => {
    searchParamView = "video";
    vi.stubEnv("NODE_ENV", "development");
    await renderProvider(<ExposureHarness />);
    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("video");
    vi.stubEnv("NODE_ENV", "production");
    await renderProvider(<ExposureHarness />);
    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("video");
  });

  it("switches to Video using the mode tabs without reporting a gallery preference", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await renderProvider(<><VerseModeTabs idPrefix="verse" /><ExposureHarness /></>);
    const buttons = container!.querySelectorAll("button");
    await act(async () => buttons[2].click());
    expect(buttons[2].getAttribute("aria-selected")).toBe("true");
    expect([...buttons].map((button) => button.tabIndex)).toEqual([-1, -1, 0]);
    expect(window.location.search).toBe("?view=video");
    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("video");
    expect(trackPreferenceChanged).not.toHaveBeenCalled();
    await act(async () => buttons[2].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("video");
    expect(document.activeElement).toBe(buttons[0]);
    // Enter/Space use the native button click; focusing another tab leaves Video active.
    await act(async () => buttons[0].click());
    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("reader");
    expect([...buttons].map((button) => button.tabIndex)).toEqual([0, -1, -1]);
    expect(window.location.search).toBe("");
    expect(trackPreferenceChanged).not.toHaveBeenCalled();
  });

  it("moves tab focus without activating a view or triggering verse shortcuts", async () => {
    await renderProvider(<><button type="button">Before tabs</button><VerseModeTabs idPrefix="verse" /><ExposureHarness /></>);
    const buttons = container!.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => buttons[0].focus());
    for (const [key, target] of [
      ["ArrowLeft", 2], ["ArrowRight", 0], ["ArrowRight", 1],
      ["ArrowRight", 2], ["Home", 0], ["End", 2],
    ] as const) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      await act(async () => document.activeElement!.dispatchEvent(event));
      expect(document.activeElement).toBe(buttons[target]);
      expect([...buttons].map((button) => button.tabIndex)).toEqual(
        [...buttons].map((_, index) => index === target ? 0 : -1)
      );
      expect(event.defaultPrevented).toBe(true);
      expect(getVerseNavigationDirection(event)).toBeNull();
      expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("reader");
      expect(window.location.search).toBe("");
    }
    for (const key of ["Tab", "ArrowUp", "ArrowDown", "Enter", " "]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      await act(async () => buttons[2].dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
    }
    await act(async () => container!.querySelector<HTMLButtonElement>("button")!.focus());
    expect([...buttons].map((button) => button.tabIndex)).toEqual([0, -1, -1]);
  });

  it("leaves modified tab shortcuts to the browser", async () => {
    await renderProvider(<><VerseModeTabs idPrefix="verse" /><ExposureHarness /></>);
    const buttons = container!.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => buttons[0].focus());
    for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
      for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
        const event = new KeyboardEvent("keydown", { key, [modifier]: true, bubbles: true, cancelable: true });
        await act(async () => buttons[0].dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(buttons[0]);
        expect(getVerseNavigationDirection(event)).toBeNull();
        expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("reader");
        expect(window.location.search).toBe("");
      }
    }
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
