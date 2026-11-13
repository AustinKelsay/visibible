/* @vitest-environment jsdom */

/**
 * The reader's single-image controls and the server's quote (#60): the estimate and maximum shown are the ones the
 * quote endpoint returned, a click sends that quote's id, and a stale answer either re-accepts the same price or
 * waits for the guest to accept the new one.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery, useMutation } from "convex/react";
import { HeroImage } from "@/components/hero-image";
import { useSession } from "@/context/session-context";
import { useGeneration } from "@/context/generation-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
  useSearchParams: vi.fn(() => ({ get: vi.fn(() => null) })),
}));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
vi.mock("@/context/preferences-context", () => ({
  usePreferences: () => ({
    imageModel: "test-model", imageAspectRatio: "16:9", imageResolution: "1K", translation: "web", artStyle: "classical",
    setImageAspectRatio: preferenceSetter, setImageResolution: preferenceSetter,
  }),
}));
vi.mock("@/context/session-context", () => ({ useSession: vi.fn() }));
vi.mock("@/context/navigation-context", () => ({
  useNavigation: () => navigation,
}));
vi.mock("@/context/verse-view-context", () => ({ useVerseView: () => ({}) }));
vi.mock("@/context/generation-context", () => ({ useGeneration: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  trackImageGenerated: vi.fn(), trackImageGenerationStarted: vi.fn(), trackGenerationError: vi.fn(),
  trackCreditsInsufficient: vi.fn(), trackImageBrowsed: vi.fn(), trackImageFullscreenOpened: vi.fn(),
  trackSavedImageLoadFailed: vi.fn(), trackVerseImagesState: vi.fn(),
}));

const preferenceSetter = vi.fn();
const navigation = { setCurrentImageId: vi.fn(), isFullscreen: false, openFullscreen: vi.fn(), closeFullscreen: vi.fn() };
const savedImage = [{ id: "image-1", imageUrl: "https://example.com/1.png", model: "test-model", createdAt: 1 }];
const props = {
  verseText: "In the beginning God created the heavens and the earth.", caption: "Genesis 1:1",
  book: "Genesis", chapter: 1, verse: 1, testament: "old" as const, currentReference: "Genesis 1:1",
};
const quoteOf = (quoteId: string, estimateCredits: number, maximumCredits: number) =>
  ({ quoteId, operation: "image", policyVersion: "accepted-maximum-v1", estimateCredits, maximumCredits, expiresAt: Date.now() + 300_000 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const generated = () => json({ requestId: "r", imageUrl: "https://example.com/new.png", model: "test-model", creditsCost: 2 });

describe("HeroImage and the server's quote", () => {
  let container: HTMLDivElement;
  let root: Root;
  let quoteAnswers: Array<() => Response>;
  let generateAnswers: Array<() => Response>;
  let quoteRequests: Array<Record<string, unknown>>;
  let generateRequests: Array<Record<string, unknown>>;
  let registerGenerate: ReturnType<typeof vi.fn<(callback: () => void) => void>>;
  let updateState: ReturnType<typeof vi.fn>;
  let history: typeof savedImage;

  const session = (overrides: Record<string, unknown> = {}) =>
    vi.mocked(useSession).mockReturnValue({ tier: "paid", credits: 10, buyCredits: vi.fn(), updateCredits: vi.fn(), isLoading: false, ...overrides } as never);
  const render = () => act(async () => { root.render(<HeroImage {...props} />); });
  /** Let the quote's debounce pass and its answer arrive. */
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 480)); });
  const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const pushed = () => updateState.mock.lastCall?.[0] as { quoteLabel: string | null; priceChanged: boolean; isGenerating: boolean };
  const clickGenerateFromHeader = () => act(async () => { registerGenerate.mock.lastCall![0](); });
  /** The notice asking the guest to accept a fresh quote, if one is showing. */
  const priceNotice = () => [...container.querySelectorAll('[role="status"]')].map((notice) => notice.textContent).find((text) => text?.includes("price")) ?? null;
  const button = (label: string) => [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    document.cookie = "visibible_csrf=" + "a".repeat(64);
    history = savedImage;
    quoteAnswers = []; generateAnswers = []; quoteRequests = []; generateRequests = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/generate-image/quote") {
        quoteRequests.push(JSON.parse(String(init?.body)));
        return (quoteAnswers.shift() ?? (() => json({ quote: quoteOf(`quote-${quoteRequests.length}`, 2, 4) })))();
      }
      if (url === "/api/generate-image") {
        generateRequests.push(JSON.parse(String(init?.body)));
        return (generateAnswers.shift() ?? generated)();
      }
      // The catalog: a flat estimate of 5 credits, which the generate controls no longer show.
      return json({ models: [{ id: "test-model", creditsCost: 5, reservationCreditsCost: 10, estimatedCreditsByResolution: { "1K": 5 }, etaSeconds: 12 }] });
    }));
    session();
    registerGenerate = vi.fn<(callback: () => void) => void>();
    updateState = vi.fn();
    vi.mocked(useGeneration).mockReturnValue({ registerGenerate, updateState, unregisterGenerate: vi.fn(), registerBuyCredits: vi.fn(), registerSettings: vi.fn() } as never);
    vi.mocked(useMutation).mockReturnValue(vi.fn() as never);
    vi.mocked(useQuery).mockImplementation(((_query: unknown, args?: unknown) =>
      args && typeof args === "object" && "verseId" in args ? history : null) as never);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("gives the generate controls the server's estimate and maximum, and sends the quote's id on generate", async () => {
    await render();
    // Until the quote is read there is no number at all, not the catalog's.
    expect(pushed().quoteLabel).toBeNull();
    await settle();
    expect(quoteRequests).toEqual([{ reference: "Genesis 1:1", model: "test-model", translation: "web", aspectRatio: "16:9", resolution: "1K", style: "classical" }]);
    expect(pushed()).toMatchObject({ quoteLabel: "About 2 credits · at most 4", priceChanged: false });

    await clickGenerateFromHeader();
    expect(generateRequests).toHaveLength(1);
    expect(generateRequests[0]).toMatchObject({ reference: "Genesis 1:1", quoteId: "quote-1", requestId: expect.any(String) });
    expect(generateRequests[0]).not.toHaveProperty("automatic");
    // A quote is accepted once: the next one is read for the controls.
    await settle();
    expect(quoteRequests).toHaveLength(2);
    expect(pushed().quoteLabel).toBe("About 2 credits · at most 4");
  });

  it("shows the quote under the Generate button for a guest spending down a short balance", async () => {
    history = [];
    session({ credits: 3 }); // short of the catalog's 5: no first-visit image, an explicit one is allowed
    quoteAnswers.push(() => json({ quote: quoteOf("grace-quote", 2, 3) }));
    await render();
    await settle();
    expect(generateRequests).toHaveLength(0);
    expect(container.textContent).toContain("About 2 credits · at most 3");
    await act(async () => { button("Generate Image")!.click(); });
    expect(generateRequests).toMatchObject([{ quoteId: "grace-quote" }]);
  });

  it("waits for the guest to accept a fresh quote at a different price, then sends that quote's id", async () => {
    await render();
    await settle();
    generateAnswers.push(() => json({ error: "Quote stale", reason: "changed", quote: quoteOf("fresh-quote", 3, 6) }, 409));
    await clickGenerateFromHeader();
    await flush();
    expect(generateRequests).toHaveLength(1);
    expect(pushed()).toMatchObject({ quoteLabel: "About 3 credits · at most 6", priceChanged: true, isGenerating: false });
    expect(priceNotice()).toBe("The price changed. About 3 credits · at most 6.");
    expect(container.textContent).not.toContain("Quote stale");

    await act(async () => { button("Generate at this price")!.click(); });
    await flush();
    expect(generateRequests).toHaveLength(2);
    expect(generateRequests[1]).toMatchObject({ quoteId: "fresh-quote" });
    expect(pushed().priceChanged).toBe(false);
  });

  it("accepts a fresh quote for the guest when only the old one expired and the price is the one they accepted", async () => {
    await render();
    await settle();
    generateAnswers.push(() => json({ error: "Quote stale", reason: "expired", quote: quoteOf("renewed-quote", 2, 4) }, 409));
    await clickGenerateFromHeader();
    await flush();
    expect(generateRequests.map((request) => request.quoteId)).toEqual(["quote-1", "renewed-quote"]);
    expect(generateRequests[1].requestId).toBe(generateRequests[0].requestId);
    expect(pushed().priceChanged).toBe(false);
    expect(priceNotice()).toBeNull();
  });

  it("asks the guest to confirm when no price was on screen at the click", async () => {
    quoteAnswers.push(() => json({ error: "Preparing scene", retryable: true }, 503));
    await render();
    await settle();
    expect(pushed().quoteLabel).toBeNull();
    generateAnswers.push(() => json({ error: "Quote stale", reason: "missing", quote: quoteOf("first-quote", 2, 4) }, 409));
    await clickGenerateFromHeader();
    await flush();
    expect(generateRequests[0]).not.toHaveProperty("quoteId");
    expect(priceNotice()).toBe("Please confirm the price. About 2 credits · at most 4.");
    await act(async () => { button("Generate at this price")!.click(); });
    expect(generateRequests[1]).toMatchObject({ quoteId: "first-quote" });
  });

  it("sends a first-visit image as automatic generation, with no quote to accept", async () => {
    history = [];
    await render();
    await flush();
    expect(generateRequests).toHaveLength(1);
    expect(generateRequests[0]).toMatchObject({ automatic: true, reference: "Genesis 1:1" });
    expect(generateRequests[0]).not.toHaveProperty("quoteId");
  });

  it("reads no quote for the owner or for a guest without credits", async () => {
    session({ tier: "admin", credits: 0 });
    await render();
    await settle();
    await act(async () => root.unmount());
    root = createRoot(container);
    session({ credits: 0 });
    await render();
    await settle();
    expect(quoteRequests).toHaveLength(0);
  });
});
