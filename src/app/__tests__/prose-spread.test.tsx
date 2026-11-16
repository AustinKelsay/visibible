/* @vitest-environment jsdom */

/**
 * The owner-only prose reader on the spread (#451): a moment of a prose work rendered as a whole page, with its text
 * on the words page, the same picture, whole-picture view, picture menu and unpainted behaviour as a verse, Look
 * without translation, no Ask, and Contents showing the work's divisions and moments. A visitor who is not the owner
 * cannot open it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import MomentPage from "../read/[work]/[moment]/page";
import WorkPage from "../read/[work]/page";
import LibraryPage from "../read/page";
import { createWorkReader } from "@/lib/work-input";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import { answerPictureRead, type SavedPicture } from "./fake-picture-reads";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WORK = "alice-in-wonderland";
const push = vi.fn();
let owner = true;
let artStyle = "watercolor";
let textSize = "medium";

// Alice's first two chapters, cut into four moments: three in "Down the Rabbit-Hole", one in "The Pool of Tears".
const MOMENTS = [
  { firstUnit: "down-the-rabbit-hole-1", lastUnit: "down-the-rabbit-hole-2" },
  { firstUnit: "down-the-rabbit-hole-3", lastUnit: "down-the-rabbit-hole-4" },
  { firstUnit: "down-the-rabbit-hole-5", lastUnit: "down-the-rabbit-hole-6" },
  { firstUnit: "the-pool-of-tears-1", lastUnit: "the-pool-of-tears-3" },
];
const reader = createWorkReader(JSON.parse(readFileSync(path.join(process.cwd(), "works", WORK, "work.json"), "utf8")));

vi.mock("@/lib/works/viewer", () => ({ isOwnerViewer: async () => owner }));
vi.mock("@/lib/convex-client", () => ({ getConvexClient: () => ({}) }));
vi.mock("@/lib/works/prose-book", async (original) => {
  const actual = await original<typeof import("@/lib/works/prose-book")>();
  return { ...actual, loadProseBook: async (work: Parameters<typeof actual.buildProseBook>[0]) => actual.buildProseBook(work, reader, MOMENTS) };
});
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/read/alice-in-wonderland/down-the-rabbit-hole-1",
  useSearchParams: () => new URLSearchParams(),
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
vi.mock("@/context/preferences-context", () => ({
  TEXT_SIZES: ["small", "medium", "large"],
  usePreferences: () => ({
    artStyle,
    setArtStyle: (style: string) => { artStyle = style; },
    textSize,
    setTextSize: (size: string) => { textSize = size; },
    translation: "web",
    translationInfo: { name: "World English Bible", code: "WEB", year: null },
    setTranslation: vi.fn(),
    autoGenerate: false,
    setAutoGenerate: vi.fn(),
  }),
}));
const buyCredits = vi.fn();
let session: { tier: "paid" | "admin"; credits: number; pendingCredits: number; isLoading: boolean; accessStatus: "ready"; buyCredits: () => void; sid: string };
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
// No painting job runs: a prose work has none.
vi.mock("@/context/bulk-generation-context", () => ({ useBulkGeneration: () => ({ state: { bulkId: null, status: "idle" }, startBulkGeneration: vi.fn() }) }));
vi.mock("@/lib/analytics");

let savedPictures: SavedPicture[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let paintRequests: Array<Record<string, unknown>> = [];
let catalogRequests: string[] = [];

let container: HTMLDivElement;
let root: Root;

const momentParams = (moment: string) => ({ params: Promise.resolve({ work: WORK, moment }) });

async function openMoment(moment: string) {
  const page = await MomentPage(momentParams(moment));
  await act(async () => { root.render(page); });
}

function button(name: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
}
function buttonWithText(text: RegExp) {
  return [...container.querySelectorAll("button")].find((candidate) => text.test(candidate.textContent ?? ""));
}
function link(name: string) {
  return [...container.querySelectorAll<HTMLAnchorElement>(`a[aria-label="${name}"]`)];
}
function pressKey(key: string) {
  act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
}
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 480)); });

beforeEach(() => {
  vi.clearAllMocks();
  owner = true;
  artStyle = "watercolor";
  textSize = "medium";
  savedPictures = [];
  paintRequests = [];
  catalogRequests = [];
  session = { tier: "admin", credits: 0, pendingCredits: 0, isLoading: false, accessStatus: "ready", buyCredits, sid: "owner" };
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/image-models")) {
      catalogRequests.push(url);
      return json({ models: [{ id: DEFAULT_IMAGE_MODEL, creditsCost: 5, reservationCreditsCost: 10, estimatedCreditsByResolution: { "1K": 5 }, etaSeconds: 12 }] });
    }
    if (url === "/api/generate-video") {
      // Video generation is on, as it may be in production: a prose moment still offers no video.
      return json({ enabled: true, model: "minimax/hailuo-3-max", modelName: "Hailuo 3 Max", quotes: [{ duration: 5, resolution: "768p", providerCostUsd: 0.4, credits: 50 }] });
    }
    if (url === "/api/generate-image") {
      paintRequests.push(JSON.parse(String(init?.body)));
      return new Promise<Response>(() => {});
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
  vi.mocked(useQuery).mockImplementation(((query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    if (getFunctionName(query) === "verseImages:getGenerationRequestStatus") return null;
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

describe("who may open a prose work", () => {
  it("lets the owner open a moment", async () => {
    await openMoment("down-the-rabbit-hole-1");
    expect(container.querySelector("article")).not.toBeNull();
  });

  it("does not find a moment, the work's page or a library card for a visitor who is not the owner", async () => {
    owner = false;
    await expect(MomentPage(momentParams("down-the-rabbit-hole-1"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(WorkPage({ params: Promise.resolve({ work: WORK }) })).rejects.toThrow("NEXT_NOT_FOUND");
    await act(async () => { root.render(await LibraryPage()); });
    expect(container.textContent).toContain("The Bible");
    expect(container.textContent).not.toContain("Alice");
  });

  it("does not find a moment the work does not have", async () => {
    await expect(MomentPage(momentParams("down-the-rabbit-hole-2"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("a prose moment on the spread", () => {
  it("shows the moment's picture and its text on the words page, without Ask or a translation", async () => {
    savedPictures = [{ id: "down-the-rabbit-hole-1:a", imageUrl: "https://img.test/alice-1.png", artStyle: "watercolor", createdAt: 1 }];
    await openMoment("down-the-rabbit-hole-1");

    const picture = container.querySelector<HTMLImageElement>('img[alt^="Picture of"]');
    expect(picture?.getAttribute("src")).toBe("https://img.test/alice-1.png");
    expect(picture?.alt).toBe("Picture of Down the Rabbit-Hole ¶1–2");

    const words = container.querySelector("article")!;
    expect(words.textContent).toContain("Alice’s Adventures in Wonderland");
    expect(words.querySelector("h1")?.textContent).toBe("Down the Rabbit-Hole");
    const paragraphs = [...words.querySelectorAll("p")].map((paragraph) => paragraph.textContent);
    expect(paragraphs).toContainEqual(expect.stringMatching(/^Alice was beginning to get very tired/));
    expect(paragraphs).toContainEqual(expect.stringMatching(/^So she was considering in her own mind/));
    expect(words.querySelector('[aria-label="Passage 1 of 3"]')?.textContent).toBe("1 / 3");

    expect(container.textContent).not.toMatch(/Ask about|Ask a question/);
    expect(container.querySelector('input[aria-label^="Ask"]')).toBeNull();
    expect(container.textContent).not.toContain("World English Bible");
    // The old header and image stage are gone.
    expect(container.querySelector("header")).toBeNull();
  });

  it("shows the text's _underscored_ words as italics", async () => {
    await openMoment("down-the-rabbit-hole-3");
    const emphasis = [...container.querySelectorAll("article em")].map((element) => element.textContent);
    expect(emphasis).toContain("very");
    expect(container.querySelector("article")?.textContent).not.toContain("_very_");
  });

  it("turns between moments by the dock, the arrow keys and across a division", async () => {
    await openMoment("down-the-rabbit-hole-3");
    act(() => { link("Previous passage")[0].click(); });
    expect(push).toHaveBeenLastCalledWith("/read/alice-in-wonderland/down-the-rabbit-hole-1");
    pressKey("ArrowRight");
    expect(push).toHaveBeenLastCalledWith("/read/alice-in-wonderland/down-the-rabbit-hole-5");

    act(() => root.unmount());
    root = createRoot(container);
    await openMoment("down-the-rabbit-hole-5");
    expect(container.querySelector('[aria-label="Passage 3 of 3"]')).not.toBeNull();
    act(() => { link("Next passage")[0].click(); });
    expect(push).toHaveBeenLastCalledWith("/read/alice-in-wonderland/the-pool-of-tears-1");
  });

  it("turns the page with a horizontal swipe", async () => {
    await openMoment("down-the-rabbit-hole-3");
    const target = container.querySelector("article p:nth-of-type(2)")!;
    const touch = (type: string, x: number) => {
      const list = [{ clientX: x, clientY: 300, identifier: 0, target }];
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: type === "touchend" ? [] : list },
        targetTouches: { value: type === "touchend" ? [] : list },
        changedTouches: { value: list },
      });
      act(() => { target.dispatchEvent(event); });
    };
    touch("touchstart", 300);
    for (const x of [250, 200, 150, 100]) touch("touchmove", x);
    touch("touchend", 100);
    expect(push).toHaveBeenLastCalledWith("/read/alice-in-wonderland/down-the-rabbit-hole-5");
  });

  it("marks the division's moments along the top, brighter where painted", async () => {
    savedPictures = [{ id: "down-the-rabbit-hole-3:a", imageUrl: "https://img.test/alice-3.png", artStyle: "watercolor", createdAt: 1 }];
    await openMoment("down-the-rabbit-hole-1");
    const marks = container.querySelector('nav[aria-label="Passages of Down the Rabbit-Hole"]');
    expect([...marks!.querySelectorAll("a")].map((mark) => [mark.getAttribute("aria-label"), mark.getAttribute("href")])).toEqual([
      ["Passage 1, unpainted", "/read/alice-in-wonderland/down-the-rabbit-hole-1"],
      ["Passage 2, painted", "/read/alice-in-wonderland/down-the-rabbit-hole-3"],
      ["Passage 3, unpainted", "/read/alice-in-wonderland/down-the-rabbit-hole-5"],
    ]);
  });

  it("shows the picture menu on the picture without making it move, and the whole picture with the moment as its caption", async () => {
    savedPictures = [{ id: "down-the-rabbit-hole-1:a", imageUrl: "https://img.test/alice-1.png", artStyle: "watercolor", createdAt: 1 }];
    await openMoment("down-the-rabbit-hole-1");
    expect(container.querySelector('button[aria-label^="Picture menu"]')).not.toBeNull();

    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label^="Picture menu"]')!.click(); });
    await settle();
    const menu = container.querySelector('[role="dialog"][aria-label="Picture menu"]')!;
    expect(menu.textContent).toContain("Paint another");
    expect(menu.textContent).not.toMatch(/Make this picture move|video/i);
    pressKey("Escape");
    await act(async () => {});

    act(() => { button("Show the whole picture of Down the Rabbit-Hole ¶1–2")!.click(); });
    expect(container.querySelector("img")?.style.objectFit).toBe("contain");
    expect(container.querySelector("figcaption")?.textContent).toContain("Down the Rabbit-Hole ¶1–2");
    expect(container.querySelector("figcaption")?.textContent).toContain("Alice was beginning to get very tired");
    pressKey("Escape");
    await act(async () => {});
    expect(container.querySelector("figcaption")).toBeNull();
  });

  it("paints an unpainted moment in the work's style, under the moment, glowing with the division's nearest earlier picture", async () => {
    savedPictures = [{ id: "down-the-rabbit-hole-1:a", imageUrl: "https://img.test/alice-1.png", thumbnailUrl: "https://img.test/alice-1.webp", artStyle: "watercolor", createdAt: 1 }];
    await openMoment("down-the-rabbit-hole-5");
    await settle();

    const area = container.querySelector('[aria-label="Picture"]')!;
    expect(area.querySelector("img")?.getAttribute("src")).toBe("https://img.test/alice-1.webp");
    expect(area.textContent).toContain("No picture for Down the Rabbit-Hole ¶5–6 yet");
    expect(area.textContent).toContain("Paint passages automatically as I read");
    expect(catalogRequests).toContain("/api/image-models?work=alice-in-wonderland");

    await act(async () => { buttonWithText(/^Paint this passage$/)!.click(); });
    expect(paintRequests).toEqual([expect.objectContaining({ workId: WORK, unitId: "down-the-rabbit-hole-5", style: "watercolor" })]);
  });
});

describe("Look on a prose moment", () => {
  it("offers the work's art styles and text size, without translation", async () => {
    await openMoment("down-the-rabbit-hole-1");
    act(() => { container.querySelectorAll<HTMLButtonElement>('button[aria-label="Look"]')[0].click(); });
    const look = container.querySelector('[role="dialog"][aria-label="Look"]')!;
    expect([...look.querySelectorAll('input[type="radio"]')].map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "Ink & Watercolor", "Classical", "Fresco", "Small", "Medium", "Large",
    ]);
    expect(look.querySelector("select")).toBeNull();
    expect(look.textContent).not.toMatch(/Translation/);
  });
});

describe("Contents on a prose moment", () => {
  const contents = () => container.querySelector('[role="dialog"][aria-label="Contents"]');

  it("lists the work's divisions and the moments of the one on screen as tiles, and opens the one chosen", async () => {
    savedPictures = [
      { id: "down-the-rabbit-hole-1:a", imageUrl: "https://img.test/alice-1.png", thumbnailUrl: "https://img.test/alice-1.webp", artStyle: "watercolor", createdAt: 1 },
    ];
    await openMoment("down-the-rabbit-hole-3");
    act(() => { button("Down the Rabbit-Hole ¶3–4, Contents")!.click(); });

    expect(contents()?.textContent).toContain("Alice’s Adventures in Wonderland");
    const divisions = contents()!.querySelector('[role="group"][aria-label="Chapter"]')!;
    expect([...divisions.querySelectorAll("button")].slice(0, 2).map((choice) => [choice.getAttribute("aria-label"), choice.getAttribute("aria-pressed")])).toEqual([
      ["Chapter 1, Down the Rabbit-Hole", "true"],
      ["Chapter 2, The Pool of Tears", "false"],
    ]);
    const tiles = () => [...contents()!.querySelectorAll("ol a")].map((tile) => tile.getAttribute("aria-label"));
    expect(tiles()).toEqual(["Passage 1", "Passage 2, not painted yet", "Passage 3, not painted yet"]);
    expect(contents()!.querySelector('a[aria-current="page"]')?.getAttribute("aria-label")).toBe("Passage 2, not painted yet");
    expect(contents()!.querySelector("ol img")?.getAttribute("src")).toBe("https://img.test/alice-1.webp");
    // The Bible's chapter painting is not offered for a prose work.
    expect(contents()!.textContent).not.toMatch(/Paint the/);

    act(() => { (divisions.querySelectorAll("button")[1] as HTMLButtonElement).click(); });
    expect(contents()?.textContent).toContain("The Pool of Tears");
    expect(tiles()).toEqual(["Passage 1, not painted yet"]);
    act(() => { (contents()!.querySelector("ol a") as HTMLAnchorElement).click(); });
    expect(push).toHaveBeenLastCalledWith("/read/alice-in-wonderland/the-pool-of-tears-1");
    expect(contents()).toBeNull();
  });
});

describe("the corner menu on a prose moment", () => {
  it("keeps Advanced without the answering model or the Bible's passage details", async () => {
    await openMoment("down-the-rabbit-hole-1");
    act(() => { button("Visibible menu")!.click(); });
    act(() => { buttonWithText(/^Advanced$/)!.click(); });
    const advanced = container.querySelector('[role="group"][aria-label="Advanced"]')!;
    expect(advanced.textContent).toContain("Image settings");
    expect(advanced.textContent).not.toContain("Answering model");
    expect(advanced.textContent).not.toContain("Passage details");
  });
});
