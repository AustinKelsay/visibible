/* @vitest-environment jsdom */

// The picture menu (#441), tested on the whole verse page. The harness follows spread.test.tsx.

import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { answerPictureRead } from "./fake-picture-reads";
import VersePage from "../[book]/[chapter]/[verse]/page";
import { clearBibleApiCache, type Translation } from "@/lib/bible-api";
import { trackPictureMenuOpened } from "@/lib/analytics";

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
    imageModel: "test-model",
    imageAspectRatio: "16:9",
    imageResolution: "1K",
    autoGenerate: useSyncExternalStore(
      (listener) => { autoGenerateListeners.add(listener); return () => autoGenerateListeners.delete(listener); },
      () => autoGenerate,
      () => autoGenerate,
    ),
    setAutoGenerate,
  }),
}));
type TestSession = { tier: "paid" | "admin"; credits: number; pendingCredits: number; isLoading: boolean; accessStatus: "loading" | "ready" | "unavailable"; buyCredits: () => void };
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



// The image service: the catalog prices an image at 5 credits, a quote at about 2 (at most 4).
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let quoteRequests: Array<Record<string, unknown>> = [];
let paintRequests: Array<Record<string, unknown>> = [];
let paintAnswers: Array<() => Response | Promise<Response>> = [];
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
  session = { tier: "paid", credits: 0, pendingCredits: 0, isLoading: false, accessStatus: "ready", buyCredits };
  requestStatus = null;
  autoGenerate = false;
  quoteRequests = [];
  paintRequests = [];
  paintAnswers = [];
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/image-models") {
      return json({ models: [{ id: "test-model", creditsCost: 5, reservationCreditsCost: 10, estimatedCreditsByResolution: { "1K": 5 }, etaSeconds: 12 }] });
    }
    if (url === "/api/generate-image/quote") {
      quoteRequests.push(JSON.parse(String(init?.body)));
      return json({ quote: { quoteId: `quote-${quoteRequests.length}`, operation: "image", policyVersion: "accepted-maximum-v1", estimateCredits: 2, maximumCredits: 4, expiresAt: Date.now() + 300_000 } });
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

/** Let the catalog, the quote's debounce and its answer arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 480)); });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const noon = (day: number) => Date.UTC(2026, 10, day, 12);

const chip = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Picture menu"]');
const menu = () => container.querySelector<HTMLElement>('[role="dialog"][aria-label="Picture menu"]');
const spreadPicture = () => container.querySelector<HTMLImageElement>('img[alt^="Picture of"]');
const versions = () => [...menu()!.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
const menuButton = (name: string | RegExp) => [...menu()!.querySelectorAll("button")]
  .find((candidate) => (typeof name === "string" ? candidate.textContent?.trim() === name : name.test(candidate.textContent ?? "")));

async function openMenu() {
  await act(async () => { chip()!.click(); });
}

// John 1:5 has two Classical pictures, a Watercolor one, a Fresco one and one in a style the reader may not see.
const john5 = (): SavedPicture[] => [
  { id: "john-1-5:classical-old", imageUrl: "https://img.test/classical-old.png", artStyle: "classical", createdAt: noon(1), model: "google/gemini-3.1-flash-image", imageWidth: 1376, imageHeight: 768, aspectRatio: "16:9", creditsCost: 3 },
  { id: "john-1-5:classical-new", imageUrl: "https://img.test/classical-new.png", thumbnailUrl: "https://img.test/classical-new-small.webp", artStyle: "classical", createdAt: noon(5), model: "google/gemini-nano-banana-2.1", imageWidth: 1024, imageHeight: 1024, aspectRatio: "1:1", creditsCost: 2 },
  { id: "john-1-5:fresco", imageUrl: "https://img.test/fresco.png", artStyle: "fresco", createdAt: noon(7) },
  { id: "john-1-5:watercolor", imageUrl: "https://img.test/watercolor.png", thumbnailUrl: "https://img.test/watercolor-small.webp", artStyle: "watercolor", createdAt: noon(3) },
  { id: "john-1-5:hidden", imageUrl: "https://img.test/hidden.png", artStyle: "not-a-reader-style", createdAt: noon(9) },
];

describe("the picture menu", () => {
  it("sits on a painted verse's picture and not on an unpainted verse", async () => {
    savedPictures = john5();
    await openVerse("john", "1", "5");
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical · 1 of 2");

    await openVerse("john", "1", "6");
    expect(chip()).toBeNull();
  });

  it("lists the chosen style newest first, then the other styles the reader may see, as thumbnails", async () => {
    savedPictures = john5();
    await openVerse("john", "1", "5");
    await openMenu();

    expect(menu()).not.toBeNull();
    expect(versions().map((version) => version.getAttribute("aria-label"))).toEqual([
      "Classical picture, Nov 5, 2026",
      "Classical picture, Nov 1, 2026",
      "Ink & Watercolor picture, Nov 3, 2026",
      "Fresco picture, Nov 7, 2026",
    ]);
    expect(versions().map((version) => version.querySelector("img")?.getAttribute("src"))).toEqual([
      "https://img.test/classical-new-small.webp",
      "https://img.test/classical-old.png",
      "https://img.test/watercolor-small.webp",
      "https://img.test/fresco.png",
    ]);
    // The picture on the spread is marked and focused.
    expect(versions()[0].getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(versions()[0]);
    expect(trackPictureMenuOpened).toHaveBeenCalledTimes(1);
    expect(trackPictureMenuOpened).toHaveBeenCalledWith(expect.objectContaining({ pictureCount: 2 }));
  });

  it("is a layer: Escape closes it and focus returns to the chip", async () => {
    savedPictures = john5();
    await openVerse("john", "1", "5");
    await openMenu();
    expect(chip()?.getAttribute("aria-expanded")).toBe("true");

    pressKey("Escape", document.activeElement!);
    await act(async () => {});
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(chip());
    expect(chip()?.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows a chosen version on the spread until the page is turned", async () => {
    savedPictures = john5();
    await openVerse("john", "1", "5");
    await openMenu();

    act(() => { versions()[1].click(); });
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/classical-old.png");
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical · 2 of 2");
    act(() => { versions()[2].click(); });
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/watercolor.png");
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Ink & Watercolor");
    // The address does not change.
    expect(push).not.toHaveBeenCalled();

    await openVerse("john", "1", "6");
    await openVerse("john", "1", "5");
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/classical-new.png");
  });

  it("ignores an image in the address and opens the verse with its newest picture", async () => {
    savedPictures = john5();
    search = "image=john-1-5:classical-old";
    await openVerse("john", "1", "5");
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/classical-new.png");
  });

  it("shows the chosen picture's style, date, size, model and cost", async () => {
    savedPictures = john5();
    await openVerse("john", "1", "5");
    await openMenu();
    act(() => { versions()[1].click(); });
    act(() => { menuButton("Details")!.click(); });

    const details = menu()!.querySelector('dl[aria-label="Picture details"]')!;
    const rows = [...details.querySelectorAll("dt")].map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`);
    expect(rows).toEqual([
      "Style: Classical",
      "Date: Nov 1, 2026",
      "Size: 1376 × 768 · 16:9",
      "Model: Nano Banana 2",
      "Cost: 3 credits",
    ]);
  });

  it("paints another at the quoted price and shows the new picture as the newest", async () => {
    savedPictures = john5();
    session = { ...session, tier: "paid", credits: 10 };
    let finish!: (response: Response) => void;
    paintAnswers.push(() => new Promise<Response>((resolve) => { finish = resolve; }));
    await openVerse("john", "1", "5");
    await openMenu();
    act(() => { versions()[1].click(); });
    await settle();

    expect(menuButton(/^Paint another/)?.textContent).toBe("Paint another · about 2 credits");
    await act(async () => { menuButton(/^Paint another/)!.click(); });
    expect(paintRequests).toEqual([expect.objectContaining({ reference: "John 1:5", style: "classical", quoteId: "quote-1", generation: 3 })]);
    expect(paintRequests[0]).not.toHaveProperty("automatic");
    expect(menu()!.querySelector('[role="progressbar"]')?.getAttribute("aria-label")).toBe("Painting another picture");

    // Closing the menu does not stop the painting; the chip says it is painting.
    pressKey("Escape", document.activeElement!);
    await act(async () => {});
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical · 2 of 2, painting another");

    await act(async () => { finish(painted("john-1-5:painted-another")); });
    await flush();
    savedPictures = [...john5(), { id: "john-1-5:painted-another", imageUrl: "https://img.test/painted-another.png", artStyle: "classical", createdAt: noon(10) }];
    await openVerse("john", "1", "5");
    expect(spreadPicture()?.getAttribute("src")).toBe("https://img.test/painted-another.png");
    expect(chip()?.getAttribute("aria-label")).toBe("Picture menu, Classical · 1 of 3");
    expect(buyCredits).not.toHaveBeenCalled();
  });

  it("asks a reader whose balance cannot cover it to get credits, and paints nothing", async () => {
    savedPictures = john5();
    session = { ...session, tier: "paid", credits: 0 };
    await openVerse("john", "1", "5");
    await openMenu();
    await settle();

    expect(menuButton(/^Paint another/)).toBeUndefined();
    await act(async () => { menuButton("Get credits to paint another")!.click(); });
    expect(buyCredits).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    expect(paintRequests).toHaveLength(0);
    expect(quoteRequests).toHaveLength(0);
  });

  it("shows the owner Paint another without a price", async () => {
    savedPictures = john5();
    session = { ...session, tier: "admin", credits: 0 };
    await openVerse("john", "1", "5");
    await openMenu();
    await settle();

    expect(menuButton("Paint another")).toBeDefined();
    expect(quoteRequests).toHaveLength(0);
  });

  it("reports the chosen picture, then returns focus to the chip", async () => {
    savedPictures = john5();
    await openVerse("john", "1", "5");
    const fetch = vi.fn(async (url: string) => {
      if (url === "/api/feedback") return new Response(JSON.stringify({ success: true }), { status: 200 });
      throw new DOMException("Timed out", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetch);
    await openMenu();
    act(() => { versions()[2].click(); });
    act(() => { menuButton("Report this picture")!.click(); });

    const form = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Report this picture"]')!;
    expect(form).not.toBeNull();
    expect(menu()).toBeNull();
    expect(form.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe("This picture");
    const message = form.querySelector<HTMLTextAreaElement>('textarea[aria-label="Feedback message"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(message, "The faces are smudged");
      message.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { form.querySelector<HTMLButtonElement>('button[aria-label="Submit feedback"]')!.click(); });

    const [, request] = fetch.mock.calls.find(([url]) => url === "/api/feedback") as unknown as [string, RequestInit];
    expect(JSON.parse(request.body as string)).toMatchObject({
      kind: "image",
      message: "The faces are smudged",
      imageContext: { imageId: "john-1-5:watercolor" },
    });

    pressKey("Escape", document.activeElement!);
    await act(async () => {});
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(chip());
  });

  it("keeps taps on the chip and in its menu off the picture's whole-picture view", async () => {
    savedPictures = john5();
    await openVerse("john", "1", "5");
    await openMenu();
    act(() => { versions()[1].click(); });
    expect(container.querySelector('button[aria-label="Back to the words"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Show the whole picture of John 1:5"]')).not.toBeNull();
  });
});
