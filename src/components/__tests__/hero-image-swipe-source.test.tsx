/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery, useMutation } from "convex/react";
import { HeroImage } from "@/components/hero-image";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { usePreferences } from "@/context/preferences-context";
import { useSession } from "@/context/session-context";
import { useNavigation } from "@/context/navigation-context";
import { useVerseView } from "@/context/verse-view-context";
import { useGeneration } from "@/context/generation-context";
import { trackImageBrowsed } from "@/lib/analytics";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
}));

vi.mock("@/components/convex-client-provider", () => ({
  useConvexEnabled: vi.fn(),
}));

vi.mock("@/context/preferences-context", () => ({
  usePreferences: vi.fn(),
}));

vi.mock("@/context/session-context", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/context/navigation-context", () => ({
  useNavigation: vi.fn(),
}));

vi.mock("@/context/verse-view-context", () => ({
  useVerseView: vi.fn(),
}));

vi.mock("@/context/generation-context", () => ({
  useGeneration: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackImageGenerated: vi.fn(),
  trackImageGenerationStarted: vi.fn(),
  trackGenerationError: vi.fn(),
  trackCreditsInsufficient: vi.fn(),
  trackImageBrowsed: vi.fn(),
  trackImageFullscreenOpened: vi.fn(),
  trackSavedImageLoadFailed: vi.fn(),
  trackVerseImagesState: vi.fn(),
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);
const useConvexEnabledMock = vi.mocked(useConvexEnabled);
const usePreferencesMock = vi.mocked(usePreferences);
const useSessionMock = vi.mocked(useSession);
const useNavigationMock = vi.mocked(useNavigation);
const useVerseViewMock = vi.mocked(useVerseView);
const useGenerationMock = vi.mocked(useGeneration);
const trackImageBrowsedMock = vi.mocked(trackImageBrowsed);

const imageHistory = [
  {
    id: "image-latest",
    imageUrl: "https://example.com/latest.png",
    model: "test-model",
    createdAt: 2,
  },
  {
    id: "image-older",
    imageUrl: "https://example.com/older.png",
    model: "test-model",
    createdAt: 1,
  },
];

const baseProps = {
  verseText: "In the beginning God created the heavens and the earth.",
  caption: "Genesis 1:1",
  book: "Genesis",
  chapter: 1,
  verse: 1,
  testament: "old" as const,
  currentReference: "Genesis 1:1",
};

function createTouchEvent(
  type: "touchstart" | "touchend",
  coordinates: Array<{ clientX: number; clientY: number }>
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touchList = coordinates.map((touch) => ({
    clientX: touch.clientX,
    clientY: touch.clientY,
  }));

  Object.defineProperty(event, type === "touchstart" ? "touches" : "changedTouches", {
    configurable: true,
    value: touchList,
  });

  return event;
}

describe("HeroImage swipe handling", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [
          {
            id: "test-model",
            creditsCost: 5,
            reservationCreditsCost: 5,
            estimatedCreditsByResolution: { "1K": 5 },
            etaSeconds: 12,
          },
        ],
        scenePlannerCreditsCost: 0,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    useConvexEnabledMock.mockReturnValue(true);
    usePreferencesMock.mockReturnValue({
      imageModel: "test-model",
      imageAspectRatio: "16:9",
      imageResolution: "1K",
      setImageAspectRatio: vi.fn(),
      setImageResolution: vi.fn(),
      translation: "web",
    } as never);
    useSessionMock.mockReturnValue({
      tier: "paid",
      credits: 10,
      buyCredits: vi.fn(),
      updateCredits: vi.fn(),
      isLoading: false,
    } as never);
    useNavigationMock.mockReturnValue({
      setCurrentImageId: vi.fn(),
      isFullscreen: false,
      openFullscreen: vi.fn(),
      closeFullscreen: vi.fn(),
    } as never);
    useVerseViewMock.mockReturnValue({} as never);
    useGenerationMock.mockReturnValue({
      registerGenerate: vi.fn(),
      unregisterGenerate: vi.fn(),
      updateState: vi.fn(),
      registerBuyCredits: vi.fn(),
      registerSettings: vi.fn(),
    } as never);
    useMutationMock.mockReturnValue(vi.fn() as never);
    useQueryMock.mockImplementation(((...queryArgs: [unknown, unknown?]) => {
      const [, args] = queryArgs;
      if (args === "skip") {
        return null as never;
      }
      if (args && typeof args === "object" && "verseId" in args) {
        return imageHistory as never;
      }
      return null as never;
    }) as never);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  async function renderHeroImage() {
    await act(async () => {
      root?.render(<HeroImage {...baseProps} />);
    });
  }

  async function swipe(
    surface: HTMLDivElement,
    start: { clientX: number; clientY: number },
    end: { clientX: number; clientY: number }
  ) {
    await act(async () => {
      surface.dispatchEvent(createTouchEvent("touchstart", [start]));
      surface.dispatchEvent(createTouchEvent("touchend", [end]));
    });
  }

  it("ignores swipes that do not clear the horizontal threshold", async () => {
    await renderHeroImage();

    const overlaySurface = container?.querySelector(
      '[data-testid="hero-swipe-overlay"]'
    ) as HTMLDivElement | null;
    expect(overlaySurface).not.toBeNull();
    if (!overlaySurface) {
      throw new Error("Missing overlay swipe surface");
    }

    await swipe(
      overlaySurface,
      { clientX: 200, clientY: 100 },
      { clientX: 170, clientY: 105 }
    );

    expect(trackImageBrowsedMock).not.toHaveBeenCalled();
  });

  it("tracks overlay swipes through the inline image surface", async () => {
    await renderHeroImage();

    const overlaySurface = container?.querySelector(
      '[data-testid="hero-swipe-overlay"]'
    ) as HTMLDivElement | null;
    expect(overlaySurface).not.toBeNull();
    if (!overlaySurface) {
      throw new Error("Missing overlay swipe surface");
    }

    await swipe(
      overlaySurface,
      { clientX: 220, clientY: 100 },
      { clientX: 120, clientY: 104 }
    );

    expect(trackImageBrowsedMock).toHaveBeenCalledWith(expect.objectContaining({
      surface: "overlay",
      direction: "older",
      imageId: "image-older",
      currentIndex: 2,
      totalImages: 2,
    }));
  });

  it("tracks fullscreen swipes through the fullscreen surface", async () => {
    useNavigationMock.mockReturnValue({
      setCurrentImageId: vi.fn(),
      isFullscreen: true,
      openFullscreen: vi.fn(),
      closeFullscreen: vi.fn(),
    } as never);

    await renderHeroImage();

    const fullscreenSurface = container?.querySelector(
      '[data-testid="hero-swipe-fullscreen"]'
    ) as HTMLDivElement | null;
    expect(fullscreenSurface).not.toBeNull();
    if (!fullscreenSurface) {
      throw new Error("Missing fullscreen swipe surface");
    }

    await swipe(
      fullscreenSurface,
      { clientX: 220, clientY: 140 },
      { clientX: 120, clientY: 145 }
    );

    expect(trackImageBrowsedMock).toHaveBeenCalledWith(expect.objectContaining({
      surface: "fullscreen",
      direction: "older",
      imageId: "image-older",
      currentIndex: 2,
      totalImages: 2,
    }));
  });
});
