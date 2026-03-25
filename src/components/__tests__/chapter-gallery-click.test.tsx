/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { ChapterGallery } from "@/components/chapter-gallery";
import { useSession } from "@/context/session-context";
import { useVerseView } from "@/context/verse-view-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    onClick?: (event: MouseEvent) => void;
  }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        props.onClick?.(event as never);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/components/convex-client-provider", () => ({
  useConvexEnabled: vi.fn(),
}));

vi.mock("@/context/verse-view-context", () => ({
  useVerseView: vi.fn(),
}));

vi.mock("@/context/navigation-context", () => ({
  useNavigation: vi.fn(() => ({
    isFullscreen: false,
    openFullscreen: vi.fn(),
    closeFullscreen: vi.fn(),
  })),
}));

vi.mock("@/context/session-context", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackChapterGalleryItemOpened: vi.fn(),
  trackChapterGalleryLayoutChanged: vi.fn(),
  trackChapterGalleryViewed: vi.fn(),
  trackImageFullscreenOpened: vi.fn(),
  trackSavedImageLoadFailed: vi.fn(),
}));

const useQueryMock = vi.mocked(useQuery);
const useConvexEnabledMock = vi.mocked(useConvexEnabled);
const useVerseViewMock = vi.mocked(useVerseView);
const useSessionMock = vi.mocked(useSession);

const setEffectiveViewMock = vi.fn();
const markEngagedMock = vi.fn();

describe("ChapterGallery click behavior", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = "visibible_next_view=; Max-Age=0; path=/";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    useVerseViewMock.mockReturnValue({
      effectiveView: "gallery",
      setEffectiveView: setEffectiveViewMock,
      markEngaged: markEngagedMock,
    } as never);
    useSessionMock.mockReturnValue({
      tier: "paid",
      credits: 10,
      isLoading: false,
    } as never);
    useConvexEnabledMock.mockReturnValue(false);
    useQueryMock.mockReturnValue(null as never);
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

  async function renderGallery() {
    await act(async () => {
      root?.render(
        <ChapterGallery
          book="genesis"
          bookName="Genesis"
          chapter={1}
          currentVerse={1}
          verses={[
            { verse: 1, text: "In the beginning" },
            { verse: 2, text: "The earth was formless" },
          ]}
        />
      );
    });
  }

  it("does not persist the next-view cookie for modified clicks", async () => {
    await renderGallery();

    const link = container?.querySelector('a[href="/genesis/1/1"]');
    expect(link).not.toBeNull();

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
      }));
    });

    expect(document.cookie).not.toContain("visibible_next_view=reader");
    expect(setEffectiveViewMock).not.toHaveBeenCalled();
    expect(markEngagedMock).toHaveBeenCalledWith("chapter_gallery_item_opened");
  });

  it("persists the next-view cookie for unmodified primary clicks", async () => {
    await renderGallery();

    const link = container?.querySelector('a[href="/genesis/1/1"]');
    expect(link).not.toBeNull();

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }));
    });

    expect(document.cookie).toContain("visibible_next_view=reader");
    expect(setEffectiveViewMock).toHaveBeenCalledWith("reader", "chapter_gallery_card");
  });
});
