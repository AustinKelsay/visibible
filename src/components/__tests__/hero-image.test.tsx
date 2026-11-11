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
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
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

describe("HeroImage interactions", () => {
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

  it("does not submit generation when the saved model is absent from the catalog", async () => {
    const registerGenerate = vi.fn<(callback: () => void) => void>();
    const updateState = vi.fn();
    useGenerationMock.mockReturnValue({ registerGenerate, updateState, unregisterGenerate: vi.fn(),
      registerBuyCredits: vi.fn(), registerSettings: vi.fn() } as never);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ models: [] }) });
    await renderHeroImage();
    expect(updateState.mock.lastCall?.[0]).toMatchObject({ canGenerate: false, pricingUnavailable: "Saved model unavailable. Choose another model." });
    await act(async () => { registerGenerate.mock.lastCall![0](); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["failure", "navigation"])("follows HTTP 202 and exits the busy state on %s", async (outcome) => {
    const registerGenerate = vi.fn<(callback: () => void) => void>();
    const updateState = vi.fn();
    useGenerationMock.mockReturnValue({
      registerGenerate, updateState, unregisterGenerate: vi.fn(),
      registerBuyCredits: vi.fn(), registerSettings: vi.fn(),
    } as never);
    let requestStatus = { status: "generating", error: undefined as string | undefined };
    useQueryMock.mockImplementation((_query, args?: unknown) => {
      if (args && typeof args === "object" && "requestId" in args) return requestStatus;
      if (args && typeof args === "object" && "verseId" in args) return imageHistory;
      return null;
    });
    const generateFetch = vi.fn<(init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ requestId: "existing-request", reused: true, status: "generating" }), { status: 202 }));
    const catalogFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => url.includes("generate-image") ? generateFetch(init) : catalogFetch(url));
    document.cookie = "visibible_csrf=" + "a".repeat(64);
    await renderHeroImage();
    await act(async () => { registerGenerate.mock.lastCall![0](); });
    expect(generateFetch).toHaveBeenCalledTimes(1);
    // The engine reads the verse and its neighbours from the work itself; the client sends only the reference and settings.
    const sent = JSON.parse(String(generateFetch.mock.calls[0][0]?.body)) as Record<string, unknown>;
    expect(sent).toMatchObject({ reference: baseProps.currentReference });
    for (const field of ["text", "theme", "prevVerse", "nextVerse"]) expect(sent).not.toHaveProperty(field);
    expect(updateState.mock.lastCall?.[0]).toMatchObject({ isGenerating: true });
    expect(container?.textContent).not.toContain("Missing image URL");
    if (outcome === "failure") {
      requestStatus = { status: "failed", error: "Original operation failed" };
      await renderHeroImage();
      expect(container?.textContent).toContain("Original operation failed");
    } else {
      await act(async () => { root?.render(<HeroImage {...baseProps} verse={2} currentReference="Genesis 1:2" />); });
    }
    expect(updateState.mock.lastCall?.[0]).toMatchObject({ isGenerating: false });
    document.cookie = "visibible_csrf=; Max-Age=0";
  });

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

  it("records one impression per saved image the reader actually sees", async () => {
    const recordImpression = vi.fn(async () => null);
    useMutationMock.mockReturnValue(recordImpression as never);
    await renderHeroImage();
    const image = container?.querySelector<HTMLImageElement>('img[src="https://example.com/latest.png"]');
    expect(image).toBeTruthy();
    expect(recordImpression).not.toHaveBeenCalled();
    await act(async () => { image!.dispatchEvent(new Event("load")); });
    await act(async () => { image!.dispatchEvent(new Event("load")); });
    expect(recordImpression.mock.calls).toEqual([[{ imageId: "image-latest" }]]);
  });

  it("shows the saved-image skeleton, not generation progress, while images load", async () => {
    useQueryMock.mockImplementation(((_query: unknown, args?: unknown) =>
      args && typeof args === "object" && "verseId" in args ? undefined : null) as never);
    await renderHeroImage();
    const status = [...(container?.querySelectorAll('[role="status"]') ?? [])].map((node) => node.textContent);
    expect(status).toContain("Loading saved image");
  });

  it("moves the one phone pager under the painting and explains why generation is off", async () => {
    const pagerHolder = () => {
      const holders = [...(container?.querySelectorAll("span") ?? [])]
        .filter((span) => span.textContent === "Image 1 of 2").map((span) => span.closest("div.sm\\:hidden")).filter(Boolean);
      expect(holders).toHaveLength(1);
      return holders[0]!;
    };
    await renderHeroImage();
    expect(pagerHolder().className).toContain("absolute");
    await act(async () => { root?.unmount(); });
    root = createRoot(container!);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ models: [] }) });
    await renderHeroImage();
    expect(pagerHolder().className).not.toContain("absolute");
    const note = [...(container?.querySelectorAll("p") ?? [])].find((p) => p.textContent === "Saved model unavailable. Choose another model.");
    expect(note?.className).toContain("sm:hidden");
  });

  it("registers its generate action once, however often it re-renders", async () => {
    const registerGenerate = vi.fn();
    useGenerationMock.mockReturnValue({ registerGenerate, unregisterGenerate: vi.fn(), updateState: vi.fn(),
      registerBuyCredits: vi.fn(), registerSettings: vi.fn() } as never);
    await renderHeroImage();
    await act(async () => { root?.render(<HeroImage {...baseProps} caption="Genesis 1:1 (again)" />); });
    await act(async () => { root?.render(<HeroImage {...baseProps} verseText="Changed text" />); });
    expect(registerGenerate).toHaveBeenCalledTimes(1);
  });
});
