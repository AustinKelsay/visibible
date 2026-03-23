/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVerseView, VerseViewProvider } from "@/context/verse-view-context";
import {
  trackContentEngaged,
  trackDefaultViewExposed,
  trackPreferenceChanged,
} from "@/lib/analytics";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sessionState = {
  tier: "paid" as const,
  credits: 10,
  isLoading: false,
};

vi.mock("@/context/session-context", () => ({
  useSession: vi.fn(() => sessionState),
}));

vi.mock("@/lib/analytics", () => ({
  trackDefaultViewExposed: vi.fn(),
  trackContentEngaged: vi.fn(),
  trackPreferenceChanged: vi.fn(),
}));

function ExposureHarness() {
  const { effectiveView, isSettled } = useVerseView();
  return <div data-settled={String(isSettled)} data-view={effectiveView} />;
}

function EngagementHarness() {
  const { markEngaged } = useVerseView();
  return (
    <button
      type="button"
      onClick={() => {
        markEngaged("verse_navigation");
        markEngaged("image_generation_started");
      }}
    >
      Engage
    </button>
  );
}

describe("VerseViewProvider", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let originalLocalStorage: PropertyDescriptor | undefined;

  function createStorageMock(): Storage {
    const store = new Map<string, string>();

    return {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key: string) {
        store.delete(key);
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionState.isLoading = false;
    sessionState.credits = 10;
    originalLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      value: createStorageMock(),
      configurable: true,
    });
    document.cookie = "visibible_view_override=; Max-Age=0; path=/";
    window.localStorage.clear();
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
    if (originalLocalStorage) {
      Object.defineProperty(window, "localStorage", originalLocalStorage);
    }
  });

  async function renderProvider(
    child: ReactNode,
    initialOverrideView: "reader" | "gallery" | null = null
  ) {
    await act(async () => {
      root?.render(
        <VerseViewProvider
          assignedView="reader"
          initialOverrideView={initialOverrideView}
          book="Genesis"
          chapter={1}
          verse={1}
          testament="old"
        >
          {child}
        </VerseViewProvider>
      );
    });
  }

  it("fires default_view_exposed once for an eligible visit", async () => {
    await renderProvider(<ExposureHarness />);

    expect(trackDefaultViewExposed).toHaveBeenCalledTimes(1);
    expect(trackDefaultViewExposed).toHaveBeenCalledWith(expect.objectContaining({
      assignedView: "reader",
      tier: "paid",
      hasCredits: true,
    }));
  });

  it("suppresses exposure and migrates the legacy gallery preference", async () => {
    window.localStorage.setItem("visibible-preferences", JSON.stringify({
      chapterGalleryEnabled: true,
    }));

    await renderProvider(<ExposureHarness />);

    expect(trackDefaultViewExposed).not.toHaveBeenCalled();
    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("gallery");
    expect(document.cookie).toContain("visibible_view_override=gallery");
  });

  it("uses the initial override immediately and syncs the legacy mirror", async () => {
    await renderProvider(<ExposureHarness />, "gallery");

    expect(container?.querySelector("[data-view]")?.getAttribute("data-view")).toBe("gallery");
    expect(trackDefaultViewExposed).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("visibible-preferences")).toContain(
      "\"chapterGalleryEnabled\":true"
    );
  });

  it("fires content_engaged only once even after multiple qualifying actions", async () => {
    await renderProvider(<EngagementHarness />);

    await act(async () => {
      container?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(trackContentEngaged).toHaveBeenCalledTimes(1);
    expect(trackContentEngaged).toHaveBeenCalledWith(expect.objectContaining({
      trigger: "verse_navigation",
      activeView: "reader",
    }));
  });

  it("writes an explicit override and tracks the preference change", async () => {
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

    expect(document.cookie).toContain("visibible_view_override=gallery");
    expect(trackPreferenceChanged).toHaveBeenCalledWith(expect.objectContaining({
      preference: "chapterGallery",
      value: "enabled",
      source: "header_gallery_toggle",
    }));
  });
});
