/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoMode } from "../video-mode";
import type { VideoJobResponse } from "@/lib/video-generation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({
  session: { sid: "owner" as string | null, credits: 100, tier: "paid", isLoading: false, error: null, buyCredits: vi.fn() },
  publicJobs: [] as VideoJobResponse[],
  ownJobs: [] as VideoJobResponse[],
  generate: vi.fn(),
  config: { enabled: true, quotes: [{ duration: 5, resolution: "768p", credits: 50, providerCostUsd: 0.4 }] } as {
    enabled: boolean;
    quotes: Array<{ duration: number; resolution: string; credits: number; providerCostUsd: number }>;
  },
}));
vi.mock("../../../convex/_generated/api", () => ({ api: { verseVideos: { getHistory: "history", getMyJobs: "mine" } } }));
vi.mock("convex/react", () => ({ useQuery: (query: string) => query === "history" ? mocks.publicJobs : mocks.ownJobs }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
vi.mock("@/context/session-context", () => ({ useSession: () => mocks.session }));
vi.mock("@/context/preferences-context", () => ({ usePreferences: () => ({ translation: "web" }) }));
vi.mock("@/lib/use-video-generations", () => ({ useVideoGenerations: () => ({
  config: mocks.config,
  ready: true, accepted: null, request: null, submitting: false, generate: mocks.generate,
}) }));
const video: VideoJobResponse = {
  id: "clip-1", requestId: "request", verseId: "genesis-1-1", reference: "Genesis 1:1",
  status: "completed", duration: 5, resolution: "768p", createdAt: 1, estimatedCredits: 50,
  videoUrl: "https://media.example.com/clip.mp4",
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  mocks.session.sid = "owner";
  mocks.session.credits = 100;
  mocks.publicJobs = [];
  mocks.ownJobs = [];
  mocks.generate.mockReset();
  mocks.config = { enabled: true, quotes: [{ duration: 5, resolution: "768p", credits: 50, providerCostUsd: 0.4 }] };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function mount() {
  await act(async () => root.render(<VideoMode verseId="genesis-1-1" reference="Genesis 1:1" verseText="In the beginning…" nextUrl="/genesis/1/2" />));
}

describe("video workspace", () => {
  it("shows one empty state, without an empty list, when generation is off and no videos exist", async () => {
    mocks.config = { enabled: false, quotes: [] };
    await mount();
    expect(container.textContent).toContain("No video for this verse yet");
    expect(container.textContent).toContain("will appear here");
    expect(container.textContent).not.toContain("Video generations");
    expect(container.textContent).not.toContain("No videos for this verse yet.");
    expect(container.querySelector('a[aria-label="Next verse"]')?.textContent).toContain("Next verse");
  });

  it("keeps the public list when generation is off but videos exist", async () => {
    mocks.config = { enabled: false, quotes: [] };
    mocks.publicJobs = [video];
    await mount();
    expect(container.textContent).toContain("Video generations");
  });

  it("allows public playback without a generation session and starts muted", async () => {
    mocks.session.sid = null;
    mocks.publicJobs = [video];
    await mount();
    const player = container.querySelector<HTMLVideoElement>("video[controls]");
    expect(player?.src).toBe(video.videoUrl);
    expect(player?.muted).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(container.querySelector('a[aria-label="Next verse"]')?.getAttribute("href")).toBe("/genesis/1/2?view=video");
  });

  it("generates from the verse with the displayed quote and minimal controls", async () => {
    await mount();
    expect(container.textContent).toContain("50 credits");
    expect(container.textContent).toContain("shared publicly");
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelectorAll("select")).toHaveLength(2);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.generate).toHaveBeenCalledWith({ duration: 5, resolution: "768p", maxCredits: 50 });
  });

  it("shows a job from another verse and prevents a second generation", async () => {
    mocks.ownJobs = [{ ...video, status: "processing", verseId: "psalm-23-2", reference: "Psalm 23:2", videoUrl: undefined }];
    await mount();
    expect(container.textContent).toContain("Your video for Psalm 23:2 is still generating");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });

  it("offers the existing credit purchase flow when the balance is too low", async () => {
    mocks.session.credits = 10;
    await mount();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    const purchase = [...container.querySelectorAll("button")].find((button) => button.textContent?.startsWith("Add credits"));
    await act(async () => purchase!.click());
    expect(mocks.session.buyCredits).toHaveBeenCalled();
  });
});
