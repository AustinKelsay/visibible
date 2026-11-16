/* @vitest-environment jsdom */

// Video without a tab (#447), tested on the whole verse page: the play mark, playback in the whole-picture view and
// "Make a video" in the picture menu. The harness follows picture-menu.test.tsx; the video service is faked.

import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { answerPictureRead } from "./fake-picture-reads";
import VersePage from "../[book]/[chapter]/[verse]/page";
import { clearBibleApiCache, type Translation } from "@/lib/bible-api";
import type { VideoJobResponse } from "@/lib/video-generation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
const prefetch = vi.fn();
let translation: Translation = "web";
let artStyle = "classical";
let search = "";

vi.mock("@/lib/get-translation", () => ({ getTranslationFromCookies: async () => translation }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push, prefetch, refresh: vi.fn() }),
  usePathname: () => "/genesis/1/1",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: {
    href: string;
    children: ReactNode;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
        push(href);
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: () => vi.fn(async () => ({ success: true })),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
// Whether automatic painting is on: a tiny store, so turning the switch re-renders the reader as the real preference does.
let autoGenerate = false;
const autoGenerateListeners = new Set<() => void>();
const setAutoGenerate = vi.fn((enabled: boolean) => {
  autoGenerate = enabled;
  autoGenerateListeners.forEach((listener) => listener());
});
vi.mock("@/context/preferences-context", () => ({
  usePreferences: () => ({
    artStyle,
    translation,
    autoGenerate: useSyncExternalStore(
      (listener) => { autoGenerateListeners.add(listener); return () => autoGenerateListeners.delete(listener); },
      () => autoGenerate,
      () => autoGenerate,
    ),
    setAutoGenerate,
  }),
}));
type TestSession = { sid: string | null; tier: "paid" | "admin"; credits: number; pendingCredits: number; isLoading: boolean; accessStatus: "loading" | "ready" | "unavailable"; buyCredits: () => void };
const buyCredits = vi.fn();
let session: TestSession;
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/lib/analytics");

type SavedPicture = {
  id: string;
  imageUrl: string;
  thumbnailUrl?: string | null;
  artStyle: string;
  createdAt: number;
  model?: string;
  imageWidth?: number;
  imageHeight?: number;
  aspectRatio?: string;
  creditsCost?: number;
};
let savedPictures: SavedPicture[] = [];
let requestStatus: { status: string; error?: string } | null = null;
/** Finished, public videos (verseVideos.getHistory) and the reader's own jobs (verseVideos.getMyJobs). */
let publicVideos: VideoJobResponse[] = [];
let myJobs: VideoJobResponse[] = [];
const historyReads: Array<{ verseId: string; limit?: number }> = [];


// The image service: the catalog prices an image at 5 credits, a quote at about 2 (at most 4).
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let quoteRequests: Array<Record<string, unknown>> = [];
let paintRequests: Array<Record<string, unknown>> = [];
let paintAnswers: Array<() => Response | Promise<Response>> = [];
// The video service: generation on, a 5-second 768p clip at 50 credits.
const videoQuotes = [
  { duration: 5, resolution: "768p", credits: 50, providerCostUsd: 0.4 },
  { duration: 10, resolution: "480p", credits: 63, providerCostUsd: 0.5 },
];
let videoConfig: Record<string, unknown> = { enabled: true, model: "minimax/hailuo-3-max", modelName: "Hailuo 3 Max", quotes: videoQuotes };
let videoConfigReads = 0;
let videoRequests: Array<Record<string, unknown>> = [];
let videoAnswers: Array<(body: Record<string, unknown>) => Response | Promise<Response>> = [];
const painted = (savedImageId: string) => json({ requestId: "r", imageUrl: "https://img.test/new.png", savedImageId, model: "test-model" });

const params = (book = "genesis", chapter = "1", verse = "1") => ({ params: Promise.resolve({ book, chapter, verse }) });

let container: HTMLDivElement;
let root: Root;

async function openVerse(book: string, chapter: string, verse: string) {
  const page = await VersePage(params(book, chapter, verse));
  await act(async () => { root.render(page); });
}

function pressKey(key: string, target: EventTarget = document.body) {
  act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
}

beforeEach(() => {
  clearBibleApiCache();
  vi.clearAllMocks();
  translation = "web";
  artStyle = "classical";
  search = "";
  savedPictures = [];
  session = { sid: "reader", tier: "paid", credits: 0, pendingCredits: 0, isLoading: false, accessStatus: "ready", buyCredits };
  requestStatus = null;
  publicVideos = [];
  myJobs = [];
  historyReads.length = 0;
  videoConfig = { enabled: true, model: "minimax/hailuo-3-max", modelName: "Hailuo 3 Max", quotes: videoQuotes };
  videoConfigReads = 0;
  videoRequests = [];
  videoAnswers = [];
  autoGenerate = false;
  quoteRequests = [];
  paintRequests = [];
  paintAnswers = [];
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  // The browser store that keeps an unconfirmed video request across a reload.
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/image-models") {
      return json({ models: [{ id: DEFAULT_IMAGE_MODEL, creditsCost: 5, reservationCreditsCost: 10, estimatedCreditsByResolution: { "1K": 5 }, etaSeconds: 12 }] });
    }
    if (url === "/api/generate-image/quote") {
      quoteRequests.push(JSON.parse(String(init?.body)));
      return json({ quote: { quoteId: `quote-${quoteRequests.length}`, operation: "image", policyVersion: "accepted-maximum-v1", estimateCredits: 2, maximumCredits: 4, expiresAt: Date.now() + 300_000 } });
    }
    if (url === "/api/generate-video" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      videoRequests.push(body);
      return (videoAnswers.shift() ?? ((sent) => json(job({ id: "made", requestId: String(sent.requestId), status: "queued" }))))(body);
    }
    if (url === "/api/generate-video") {
      videoConfigReads += 1;
      return json(videoConfig);
    }
    if (url === "/api/generate-image") {
      paintRequests.push(JSON.parse(String(init?.body)));
      return (paintAnswers.shift() ?? (() => painted("new-picture")))();
    }
    // The Bible service is unreachable, so the reader uses the imported World English Bible.
    throw new DOMException("Timed out", "TimeoutError");
  }));
  vi.mocked(useQuery).mockImplementation(((query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(query);
    if (name === "verseImages:getGenerationRequestStatus") return requestStatus;
    if (name === "verseVideos:getHistory") {
      const read = args as { verseId: string; limit?: number };
      historyReads.push(read);
      return publicVideos.filter((video) => video.verseId === read.verseId).slice(0, read.limit ?? 20);
    }
    if (name === "verseVideos:getMyJobs") return myJobs;
    return answerPictureRead(savedPictures, query, args);
  }) as typeof useQuery);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const noon = (day: number) => Date.UTC(2026, 10, day, 12);

const chip = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Picture menu"]');
const menu = () => container.querySelector<HTMLElement>('[role="dialog"][aria-label="Picture menu"]');
const spreadPicture = () => container.querySelector<HTMLImageElement>('img[alt^="Picture of"]');
const menuButton = (name: string | RegExp) => [...menu()!.querySelectorAll("button")]
  .find((candidate) => (typeof name === "string" ? candidate.textContent?.trim() === name : name.test(candidate.textContent ?? "")));

async function openMenu() {
  await act(async () => { chip()!.click(); });
}

const job = (fields: Partial<VideoJobResponse> = {}): VideoJobResponse => ({
  id: "clip", requestId: "request", verseId: "john-1-5", reference: "John 1:5", status: "completed",
  duration: 5, resolution: "768p", createdAt: noon(6), estimatedCredits: 50, ...fields,
  ...(fields.status === undefined || fields.status === "completed" ? { videoUrl: fields.videoUrl ?? "https://media.test/clip.mp4" } : {}),
});
const playMark = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Play the video"]:not([hidden])');
const video = () => container.querySelector<HTMLVideoElement>("video");
const wholeView = () => container.querySelector('button[aria-label="Back to the words"]');
const makeVideo = () => menu() && menuButton(/make a video/i);

const john = (): SavedPicture[] => [
  { id: "john-1-3:classical", imageUrl: "https://img.test/john-3.png", artStyle: "classical", createdAt: noon(1) },
  { id: "john-1-5:classical", imageUrl: "https://img.test/john-5.png", artStyle: "classical", createdAt: noon(5) },
];

describe("the play mark", () => {
  it("shows on the picture of a verse with a video, and not on a verse without one", async () => {
    savedPictures = john();
    publicVideos = [job()];
    await openVerse("john", "1", "5");
    expect(playMark()?.getAttribute("aria-label")).toBe("Play the video of John 1:5");
    expect(historyReads.at(-1)).toEqual({ verseId: "john-1-5", limit: 1 });

    await openVerse("john", "1", "3");
    expect(spreadPicture()).not.toBeNull();
    expect(playMark()).toBeNull();
  });

  it("plays the video, muted with its controls, in the whole-picture view; Escape returns to the spread", async () => {
    savedPictures = john();
    publicVideos = [job()];
    await openVerse("john", "1", "5");
    expect(video()).toBeNull();

    await act(async () => { playMark()!.click(); });
    const player = video()!;
    expect(player.getAttribute("src")).toBe("https://media.test/clip.mp4");
    expect(player.getAttribute("aria-label")).toBe("Video of John 1:5");
    expect(player.autoplay).toBe(true);
    expect(player.muted).toBe(true);
    expect(player.controls).toBe(true);
    expect(document.activeElement).toBe(player);
    // The whole-picture view: the words are put aside and the verse is the caption.
    expect(container.querySelector("main")?.hasAttribute("data-whole-picture")).toBe(true);
    expect(container.querySelector("figcaption")?.textContent).toContain("John 1:5");
    expect(playMark()).toBeNull();
    expect(wholeView()).not.toBeNull();

    pressKey("Escape", player);
    await act(async () => {});
    expect(video()).toBeNull();
    expect(container.querySelector("main")?.hasAttribute("data-whole-picture")).toBe(false);
    expect(document.activeElement).toBe(playMark());
  });

  it("stops playing when the page turns in the whole-picture view, and the next verse shows its picture", async () => {
    savedPictures = john();
    publicVideos = [job(), job({ id: "clip-6", verseId: "john-1-6", reference: "John 1:6" })];
    savedPictures.push({ id: "john-1-6:classical", imageUrl: "https://img.test/john-6.png", artStyle: "classical", createdAt: noon(6) });
    await openVerse("john", "1", "5");
    await act(async () => { playMark()!.click(); });
    await act(async () => { container.querySelector<HTMLAnchorElement>('a[aria-label="Next verse"]')!.click(); });
    expect(push).toHaveBeenCalledWith("/john/1/6");

    await openVerse("john", "1", "6");
    expect(video()).toBeNull();
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/john-6.png");
    expect(playMark()?.getAttribute("aria-label")).toBe("Play the video of John 1:6");
  });

  it("plays the video of a verse with no picture from its unpainted picture area", async () => {
    savedPictures = john().filter((picture) => !picture.id.startsWith("john-1-5"));
    publicVideos = [job()];
    await openVerse("john", "1", "5");
    expect(spreadPicture()).toBeNull();
    expect(container.querySelector('[aria-label="Picture"]')?.textContent).toContain("No picture for John 1:5 yet");

    await act(async () => { playMark()!.click(); });
    await act(async () => {});
    expect(video()?.getAttribute("src")).toBe("https://media.test/clip.mp4");
    expect(container.querySelector("main")?.hasAttribute("data-whole-picture")).toBe(true);

    pressKey("Escape", video()!);
    await act(async () => {});
    expect(video()).toBeNull();
    expect(container.querySelector('[aria-label="Picture"]')?.textContent).toContain("No picture for John 1:5 yet");
    expect(document.activeElement).toBe(playMark());
  });

  it("keeps playing, with focus, when an unpainted verse's picture arrives while its video plays", async () => {
    savedPictures = john().filter((picture) => !picture.id.startsWith("john-1-5"));
    publicVideos = [job()];
    await openVerse("john", "1", "5");
    await act(async () => { playMark()!.click(); });
    const player = video()!;
    expect(document.activeElement).toBe(player);

    // The verse's saved picture arrives (someone painted it) while the video plays.
    savedPictures = john();
    await openVerse("john", "1", "5");
    expect(video()).toBe(player);
    expect(document.activeElement).toBe(player);

    pressKey("Escape", player);
    await act(async () => {});
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/john-5.png");
  });

  it("shows no play mark while the verse's videos are still being made or have failed", async () => {
    savedPictures = john();
    myJobs = [job({ id: "mine", status: "processing" })];
    await openVerse("john", "1", "5");
    expect(playMark()).toBeNull();
  });
});

describe("making a video from the picture menu", () => {
  it("offers Make a video at its price when video generation is on, and makes one from the verse", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    let answer!: (response: Response) => void;
    videoAnswers.push(() => new Promise<Response>((resolve) => { answer = resolve; }));
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();

    expect(makeVideo()?.textContent).toBe("Make a video · about 50 credits");
    await act(async () => { makeVideo()!.click(); });
    expect(videoRequests).toEqual([{
      requestId: expect.any(String), imageId: "john-1-5:classical", reference: "John 1:5", translation: "web", duration: 5, resolution: "768p", maxCredits: 50,
    }]);
    expect(menu()!.textContent).toContain("Starting your video…");

    await act(async () => { answer(json(job({ id: "made", requestId: String(videoRequests[0].requestId), status: "queued" }))); });
    await flush();
    expect(menu()!.querySelector('[role="status"]')?.textContent).toContain("Making a video");
    expect(makeVideo()).toBeUndefined();
    expect(buyCredits).not.toHaveBeenCalled();
    // Closed, the chip still says so, before the reader's jobs list catches up.
    pressKey("Escape", document.activeElement!);
    await act(async () => {});
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical, making a video");
  });

  it("is absent when video generation is off", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    videoConfig = { enabled: false, model: "minimax/hailuo-3-max", modelName: "Hailuo 3 Max", quotes: [] };
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();

    expect(videoConfigReads).toBe(1);
    expect(menu()!.textContent).not.toMatch(/video/i);
    expect(menuButton(/^Paint another/)).toBeDefined();
  });

  it("shows a video being made as in progress on the chip and in the menu, after a reload too", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    myJobs = [job({ id: "mine", status: "processing" })];
    await openVerse("john", "1", "5");
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical, making a video");

    await openMenu();
    await flush();
    expect(menu()!.querySelector('[role="status"]')?.textContent).toContain("Making a video");
    expect(makeVideo()).toBeUndefined();

    // Finished: the job leaves the reader's active list and the verse's video is public, so the play mark appears.
    myJobs = [job({ id: "mine" })];
    publicVideos = [job({ id: "mine" })];
    await openVerse("john", "1", "5");
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical");
    expect(playMark()).not.toBeNull();
    expect(makeVideo()?.textContent).toBe("Make a video · about 50 credits");
  });

  it("allows one video at a time: a video of another verse being made holds the action back", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    myJobs = [job({ id: "other", verseId: "john-1-3", reference: "John 1:3", status: "queued" })];
    await openVerse("john", "1", "5");
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical");
    await openMenu();
    await flush();
    expect(menu()!.textContent).toContain("Your video of John 1:3 is still being made");
    expect(makeVideo()).toBeUndefined();
  });

  it("asks a reader whose balance cannot cover the price to get credits, and makes nothing", async () => {
    savedPictures = john();
    session = { ...session, credits: 49 };
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();

    await act(async () => { menuButton("Get credits to make a video")!.click(); });
    expect(buyCredits).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    expect(videoRequests).toHaveLength(0);
  });

  it("shows the owner Make a video without a price", async () => {
    savedPictures = john();
    session = { ...session, tier: "admin", credits: 0 };
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();
    expect(makeVideo()?.textContent).toBe("Make a video");
  });

  it("says when video pricing failed and can reload it without making a video", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    videoConfig = { enabled: false, model: "minimax/hailuo-3-max", modelName: "Hailuo 3 Max", quotes: [], error: "Video pricing is unavailable right now." };
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();
    expect(menu()!.querySelector('[role="alert"]')?.textContent).toBe("Video pricing is unavailable right now.");

    videoConfig = { enabled: true, model: "minimax/hailuo-3-max", modelName: "Hailuo 3 Max", quotes: videoQuotes };
    await act(async () => { menuButton("Reload video pricing")!.click(); });
    await flush();
    expect(makeVideo()?.textContent).toBe("Make a video · about 50 credits");
    expect(videoRequests).toHaveLength(0);
  });

  it("keeps an unconfirmed request across a reload and checks the same request again, never a second video", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    videoAnswers.push(() => { throw new TypeError("Failed to fetch"); });
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();
    await act(async () => { makeVideo()!.click(); });
    const sent = videoRequests[0];
    expect(menu()!.textContent).toContain("Failed to fetch");

    // Reload: the price has gone up, but the check sends exactly what the reader accepted.
    act(() => root.unmount());
    root = createRoot(container);
    videoConfig = { ...videoConfig, quotes: videoQuotes.map((quote) => ({ ...quote, credits: 80 })) };
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();
    expect(makeVideo()).toBeUndefined();
    await act(async () => { menuButton("Check the video request again")!.click(); });
    await flush();
    expect(videoRequests).toEqual([sent, sent]);
    expect(menu()!.querySelector('[role="status"]')?.textContent).toContain("Making a video");
  });

  it("reports a video that failed while the reader watched it, and offers to make another", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    myJobs = [job({ id: "mine", status: "processing" })];
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();

    myJobs = [job({ id: "mine", status: "failed", error: "Video generation failed. Credits were returned." })];
    await openVerse("john", "1", "5");
    expect(menu()!.querySelector('[role="alert"]')?.textContent).toBe("Video generation failed. Credits were returned.");
    expect(makeVideo()?.textContent).toBe("Make a video · about 50 credits");
  });

  it("does not report an old failed video the reader did not watch", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    myJobs = [job({ id: "old", status: "failed", error: "Video generation failed. Credits were returned." })];
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();
    expect(menu()!.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("the retired Video tab", () => {
  it("opens the plain verse for an address carrying ?view=video, with no tab or view switch", async () => {
    savedPictures = john();
    publicVideos = [job()];
    search = "view=video";
    await openVerse("john", "1", "5");
    expect(container.querySelector("article h1")?.textContent).toBe("John 1:5");
    expect(container.querySelector("main")?.hasAttribute("data-whole-picture")).toBe(false);
    expect(video()).toBeNull();
    expect(container.querySelector('[role="tablist"], [role="tab"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Video generations|Create a video|Scripture in motion/i);
  });
});
