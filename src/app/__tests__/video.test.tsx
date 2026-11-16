/* @vitest-environment jsdom */

// Moving pictures (#447, #480), tested on the whole verse page: Play on a picture with its own video, playback in the
// whole-picture view, the play badge on picture-menu thumbnails, and "Make this picture move…" with its inline review.
// The harness follows picture-menu.test.tsx; the video service is faked.

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
/**
 * Videos (each from its source picture, or from text alone without one) as the server holds them, read as
 * verseVideos.getPictureVideo, getPicturesWithVideo and getHistory do, and the reader's own jobs (verseVideos.getMyJobs).
 */
let publicVideos: VideoJobResponse[] = [];
let myJobs: VideoJobResponse[] = [];
/** When true, the verse history leaves out every video, as its 50-video cap would on a busy verse. */
let historyCapped = false;


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
  historyCapped = false;
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
    const finished = publicVideos.filter((video) => video.status === "completed" && video.sourceImageId !== undefined).sort((a, b) => b.createdAt - a.createdAt);
    if (name === "verseVideos:getPictureVideo") return finished.find((video) => video.sourceImageId === (args as { imageId: string }).imageId) ?? null;
    if (name === "verseVideos:getPicturesWithVideo") return (args as { imageIds: string[] }).imageIds.filter((id) => finished.some((video) => video.sourceImageId === id));
    if (name === "verseVideos:getHistory") return historyCapped ? [] : finished.filter((video) => video.verseId === (args as { verseId: string }).verseId);
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
  duration: 5, resolution: "768p", createdAt: noon(6), estimatedCredits: 50, sourceImageId: "john-1-5:classical", artStyle: "classical", ...fields,
  ...(fields.status === undefined || fields.status === "completed" ? { videoUrl: fields.videoUrl ?? "https://media.test/clip.mp4" } : {}),
});
const playMark = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Play the video"]:not([hidden])');
const video = () => container.querySelector<HTMLVideoElement>("video");
const wholeView = () => container.querySelector('button[aria-label="Back to the words"]');
const makeVideo = () => menu() && menuButton(/make this picture move/i);
const review = () => menu()?.querySelector<HTMLElement>('[role="group"][aria-label="Make this picture move"]') ?? null;
const confirm = () => review() && [...review()!.querySelectorAll("button")].find((button) => /^(Make the video|Get credits)/.test(button.textContent ?? ""));
const thumbnail = (name: RegExp) => [...menu()!.querySelectorAll<HTMLButtonElement>("li button")].find((button) => name.test(button.getAttribute("aria-label") ?? ""));
async function openReview() {
  await openMenu();
  await flush();
  await act(async () => { makeVideo()!.click(); });
}

const john = (): SavedPicture[] => [
  { id: "john-1-3:classical", imageUrl: "https://img.test/john-3.png", artStyle: "classical", createdAt: noon(1), aspectRatio: "16:9" },
  { id: "john-1-5:classical", imageUrl: "https://img.test/john-5.png", artStyle: "classical", createdAt: noon(5), aspectRatio: "16:9" },
];

describe("Play on the spread", () => {
  it("shows on a picture with its own video, and not on a verse without one", async () => {
    savedPictures = john();
    publicVideos = [job()];
    await openVerse("john", "1", "5");
    expect(playMark()?.getAttribute("aria-label")).toBe("Play the video of John 1:5");

    await openVerse("john", "1", "3");
    expect(spreadPicture()).not.toBeNull();
    expect(playMark()).toBeNull();
  });

  it("does not show for a video of another version of the verse until that version is chosen", async () => {
    savedPictures = [...john(), { id: "john-1-5:older", imageUrl: "https://img.test/john-5-older.png", artStyle: "classical", createdAt: noon(2), aspectRatio: "16:9" }];
    publicVideos = [job({ sourceImageId: "john-1-5:older" })];
    await openVerse("john", "1", "5");
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/john-5.png");
    expect(playMark()).toBeNull();

    await openMenu();
    // The older version's thumbnail carries the play badge; the shown one does not.
    const older = thumbnail(/has a video/)!;
    expect(older.querySelector("[data-play-mark]")).not.toBeNull();
    expect(thumbnail(/^Classical picture/)?.getAttribute("aria-pressed")).toBe("true");
    expect(menu()!.querySelectorAll("li [data-play-mark]")).toHaveLength(1);
    await act(async () => { older.click(); });
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/john-5-older.png");
    expect(playMark()).not.toBeNull();
  });

  it("badges a thumbnail whose video the capped verse history left out", async () => {
    savedPictures = [...john(), { id: "john-1-5:older", imageUrl: "https://img.test/john-5-older.png", artStyle: "classical", createdAt: noon(2), aspectRatio: "16:9" }];
    publicVideos = [job({ sourceImageId: "john-1-5:older" })];
    historyCapped = true;
    await openVerse("john", "1", "5");
    await openMenu();
    const older = thumbnail(/^Classical picture, Nov 2, 2026, has a video$/);
    expect(older?.querySelector("[data-play-mark]")).toBeInstanceOf(HTMLElement);
  });

  it("follows the art style chosen in Look: another style's picture brings its own video, or none", async () => {
    savedPictures = [...john(), { id: "john-1-5:watercolor", imageUrl: "https://img.test/john-5-watercolor.png", artStyle: "watercolor", createdAt: noon(4), aspectRatio: "16:9" }];
    publicVideos = [job({ id: "watercolor-clip", sourceImageId: "john-1-5:watercolor", artStyle: "watercolor", videoUrl: "https://media.test/watercolor.mp4" })];
    await openVerse("john", "1", "5");
    expect(playMark()).toBeNull();

    artStyle = "watercolor";
    await openVerse("john", "1", "5");
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/john-5-watercolor.png");
    await act(async () => { playMark()!.click(); });
    expect(video()?.getAttribute("src")).toBe("https://media.test/watercolor.mp4");
  });

  it("never shows on an unpainted verse, even one with a video made from its text", async () => {
    savedPictures = john().filter((picture) => !picture.id.startsWith("john-1-5"));
    publicVideos = [job({ sourceImageId: undefined, artStyle: undefined })];
    await openVerse("john", "1", "5");
    expect(container.querySelector('[aria-label="Picture"]')?.textContent).toContain("No picture for John 1:5 yet");
    expect(playMark()).toBeNull();
    expect(chip()).toBeNull();
  });

  it("plays the video from its picture, muted with its controls, in the whole-picture view; Escape returns to the spread", async () => {
    savedPictures = john();
    publicVideos = [job()];
    await openVerse("john", "1", "5");
    expect(video()).toBeNull();

    await act(async () => { playMark()!.click(); });
    const player = video()!;
    expect(player.getAttribute("src")).toBe("https://media.test/clip.mp4");
    // It starts from its own picture, so the painting appears to come alive.
    expect(player.getAttribute("poster")).toBe("https://img.test/john-5.png");
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
    savedPictures.push({ id: "john-1-6:classical", imageUrl: "https://img.test/john-6.png", artStyle: "classical", createdAt: noon(6), aspectRatio: "16:9" });
    publicVideos = [job(), job({ id: "clip-6", verseId: "john-1-6", reference: "John 1:6", sourceImageId: "john-1-6:classical" })];
    await openVerse("john", "1", "5");
    await act(async () => { playMark()!.click(); });
    await act(async () => { container.querySelector<HTMLAnchorElement>('a[aria-label="Next verse"]')!.click(); });
    expect(push).toHaveBeenCalledWith("/john/1/6");

    await openVerse("john", "1", "6");
    expect(video()).toBeNull();
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/john-6.png");
    expect(playMark()?.getAttribute("aria-label")).toBe("Play the video of John 1:6");
  });

  it("shows no Play while the picture's videos are still being made or have failed", async () => {
    savedPictures = john();
    myJobs = [job({ id: "mine", status: "processing" })];
    publicVideos = [job({ id: "broken", status: "failed" })];
    await openVerse("john", "1", "5");
    expect(playMark()).toBeNull();
  });
});

describe("making this picture move from the picture menu", () => {
  it("reviews the source picture, its style, the length and the price before anything is made", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();

    const row = makeVideo()!;
    expect(row.textContent).toBe("Make this picture move…");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    await act(async () => { row.click(); });
    expect(row.getAttribute("aria-expanded")).toBe("true");
    const group = review()!;
    expect(group.querySelector("img")?.getAttribute("src")).toBe("https://img.test/john-5.png");
    expect(group.textContent).toContain("Classical · 5 seconds · starts from this picture");
    expect(group.textContent).toContain("anyone reading John 1:5 in Classical can watch it");
    expect(confirm()?.textContent).toBe("Make the video · 50 credits");
    expect(videoRequests).toHaveLength(0);

    // "Not now" folds the review away without making anything.
    await act(async () => { [...group.querySelectorAll("button")].find((button) => button.textContent === "Not now")!.click(); });
    expect(review()).toBeNull();
    expect(makeVideo()?.getAttribute("aria-expanded")).toBe("false");
    expect(videoRequests).toHaveLength(0);
  });

  it("makes the video from the picture shown, at exactly the price shown", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    let answer!: (response: Response) => void;
    videoAnswers.push(() => new Promise<Response>((resolve) => { answer = resolve; }));
    await openVerse("john", "1", "5");
    await openReview();
    await act(async () => { confirm()!.click(); });
    expect(videoRequests).toEqual([{
      requestId: expect.any(String), imageId: "john-1-5:classical", reference: "John 1:5", translation: "web", duration: 5, resolution: "768p", maxCredits: 50,
    }]);
    expect(menu()!.textContent).toContain("Starting your video…");

    await act(async () => { answer(json(job({ id: "made", requestId: String(videoRequests[0].requestId), status: "queued" }))); });
    await flush();
    expect(menu()!.querySelector('[role="status"]')?.textContent).toContain("Making this picture move");
    expect(makeVideo()).toBeUndefined();
    expect(buyCredits).not.toHaveBeenCalled();
    // Closed, the chip still says so, before the reader's jobs list catches up.
    pressKey("Escape", document.activeElement!);
    await act(async () => {});
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical, making a video");
  });

  it("starts from the version chosen in the menu", async () => {
    savedPictures = [...john(), { id: "john-1-5:older", imageUrl: "https://img.test/john-5-older.png", artStyle: "classical", createdAt: noon(2), aspectRatio: "16:9" }];
    session = { ...session, credits: 80 };
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();
    await act(async () => { thumbnail(/^Classical picture/)!.click(); });
    await act(async () => { [...menu()!.querySelectorAll<HTMLButtonElement>("li button")].find((button) => button.getAttribute("aria-pressed") === "false")!.click(); });
    await act(async () => { makeVideo()!.click(); });
    expect(review()!.querySelector("img")?.getAttribute("src")).toBe("https://img.test/john-5-older.png");
    await act(async () => { confirm()!.click(); });
    expect(videoRequests[0]).toMatchObject({ imageId: "john-1-5:older" });
  });

  it("takes a reader whose balance cannot cover the price to get credits from the confirm button, and makes nothing", async () => {
    savedPictures = john();
    session = { ...session, credits: 49 };
    await openVerse("john", "1", "5");
    await openReview();

    expect(confirm()?.textContent).toBe("Get credits · needs 50 credits");
    await act(async () => { confirm()!.click(); });
    expect(buyCredits).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    expect(videoRequests).toHaveLength(0);
  });

  it("shows the owner the review without a price", async () => {
    savedPictures = john();
    session = { ...session, tier: "admin", credits: 0 };
    await openVerse("john", "1", "5");
    await openReview();
    expect(confirm()?.textContent).toBe("Make the video");
  });

  it("is absent when the picture shown already has a video", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    publicVideos = [job()];
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();
    expect(makeVideo()).toBeUndefined();
    expect(menuButton(/^Paint another/)).toBeDefined();
  });

  it("is absent when the picture shown has a video the capped verse history left out", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    publicVideos = [job()];
    historyCapped = true;
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();
    expect(makeVideo()).toBeUndefined();
  });

  it("is absent for a picture that is not 16:9", async () => {
    savedPictures = john().map((picture) => ({ ...picture, aspectRatio: "3:2" }));
    session = { ...session, credits: 80 };
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();
    expect(makeVideo()).toBeUndefined();
    expect(menu()!.textContent).not.toMatch(/video|move/i);
  });

  it("is absent when video generation is off", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    videoConfig = { enabled: false, model: "minimax/hailuo-3-max", modelName: "Hailuo 3 Max", quotes: [] };
    await openVerse("john", "1", "5");
    await openMenu();
    await flush();

    expect(videoConfigReads).toBe(1);
    expect(menu()!.textContent).not.toMatch(/video|move/i);
    expect(menuButton(/^Paint another/)).toBeDefined();
  });

  it("shows a video of the picture being made as in progress on the chip and in the menu, after a reload too", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    myJobs = [job({ id: "mine", status: "processing" })];
    await openVerse("john", "1", "5");
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical, making a video");

    await openMenu();
    await flush();
    expect(menu()!.querySelector('[role="status"]')?.textContent).toContain("Making this picture move");
    expect(makeVideo()).toBeUndefined();

    // Finished: the job leaves the reader's active list and the picture's video is public, so Play appears.
    myJobs = [job({ id: "mine" })];
    publicVideos = [job({ id: "mine" })];
    await openVerse("john", "1", "5");
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical");
    expect(playMark()).not.toBeNull();
    expect(makeVideo()).toBeUndefined();
    expect(menu()!.querySelector('[role="status"]')).toBeNull();
  });

  it("allows one video at a time: a video of another picture being made holds the action back", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    myJobs = [job({ id: "other", verseId: "john-1-3", reference: "John 1:3", sourceImageId: "john-1-3:classical", status: "queued" })];
    await openVerse("john", "1", "5");
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical");
    await openMenu();
    await flush();
    expect(menu()!.textContent).toContain("Your video of John 1:3 is still being made");
    expect(makeVideo()).toBeUndefined();
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
    expect(makeVideo()?.textContent).toBe("Make this picture move…");
    expect(videoRequests).toHaveLength(0);
  });

  it("keeps an unconfirmed request across a reload and checks the same request again, never a second video", async () => {
    savedPictures = john();
    session = { ...session, credits: 80 };
    videoAnswers.push(() => { throw new TypeError("Failed to fetch"); });
    await openVerse("john", "1", "5");
    await openReview();
    await act(async () => { confirm()!.click(); });
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
    expect(menu()!.querySelector('[role="status"]')?.textContent).toContain("Making this picture move");
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
    expect(makeVideo()?.textContent).toBe("Make this picture move…");
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
