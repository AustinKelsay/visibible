/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoMode } from "../video-mode";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("convex/react", () => ({ useQuery: () => [] }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
vi.mock("@/context/session-context", () => ({ useSession: () => ({
  sid: "video-recovery-test", credits: 100, tier: "paid", isLoading: false, error: null, buyCredits: vi.fn(),
}) }));
vi.mock("@/context/preferences-context", () => ({ usePreferences: () => ({ translation: "web" }) }));

const config = {
  enabled: true, model: "minimax/hailuo-3-max", modelName: "Hailuo 3 Max",
  quotes: [
    { duration: 5, resolution: "768p", credits: 50, providerCostUsd: 0.4 },
    { duration: 10, resolution: "480p", credits: 63, providerCostUsd: 0.5 },
  ],
};
let root: Root;
let container: HTMLDivElement;
let get: ReturnType<typeof vi.fn<() => Promise<Response>>>;
let post: ReturnType<typeof vi.fn<(init: RequestInit) => Promise<Response>>>;

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  get = vi.fn(() => Promise.resolve(Response.json(config)));
  post = vi.fn();
  vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => init.method === "POST" ? post(init) : get()));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => root.render(
    <VideoMode verseId="genesis-1-1" reference="Genesis 1:1" verseText="In the beginning…" />,
  ));
}

describe("video recovery with the submission hook", () => {
  it("restores the exact settings and accepted cap shown for a retried request after remount", async () => {
    post.mockRejectedValueOnce(new Error("Connection interrupted"));
    await mount();
    for (const [id, value] of [["video-duration", "10"], ["video-resolution", "480p"]]) {
      await act(async () => {
        const select = container.querySelector<HTMLSelectElement>(`#${id}`)!;
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    await act(async () => container.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ));
    const original = JSON.parse(String(post.mock.calls[0][0].body));
    expect(original).toMatchObject({ duration: 10, resolution: "480p", maxCredits: 63 });

    await act(async () => root.unmount());
    root = createRoot(container);
    // A new live quote must not replace the cap the retry is actually sending.
    get.mockImplementation(() => Promise.resolve(Response.json({
      ...config, quotes: config.quotes.map((quote) => ({ ...quote, credits: 80 })),
    })));
    await mount();
    expect(container.querySelector<HTMLSelectElement>("#video-duration")?.value).toBe("10");
    expect(container.querySelector<HTMLSelectElement>("#video-resolution")?.value).toBe("480p");
    expect([...container.querySelectorAll("select")].every((select) => select.disabled)).toBe(true);
    expect(container.querySelector("form strong")?.textContent).toBe("63 credits");

    post.mockResolvedValue(Response.json({
      ...original, id: "video-job", verseId: "genesis-1-1", status: "queued", createdAt: 1, estimatedCredits: 63,
    }));
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Check previous request");
    await act(async () => retry!.click());
    expect(post).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(post.mock.calls[1][0].body))).toEqual(original);
  });

  it("can reload pricing after a catalog outage without submitting a generation", async () => {
    get.mockResolvedValueOnce(Response.json({ ...config, enabled: false, quotes: [], error: "Video pricing is unavailable right now." }));
    await mount();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    const reload = [...container.querySelectorAll("button")].find((button) => button.textContent === "Reload pricing");
    expect(reload).toBeDefined();
    await act(async () => reload!.click());
    expect(container.querySelector("form strong")?.textContent).toBe("50 credits");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});
