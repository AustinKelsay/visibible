/* @vitest-environment jsdom */

/**
 * Advanced (#449), through the whole verse page: the last row of the corner menu, collapsed until opened, and what
 * each item changes for the reader. Only the network is faked.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { useQuery } from "convex/react";
import { answerPictureRead } from "./fake-picture-reads";
import VersePage from "../[book]/[chapter]/[verse]/page";
import { clearBibleApiCache } from "@/lib/bible-api";
import { PreferencesProvider } from "@/context/preferences-context";
import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";
import { resetAdvancedSettingsForTests } from "@/lib/advanced-settings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
const session = {
  tier: "paid" as "paid" | "admin",
  credits: 100,
  pendingCredits: 0,
  isLoading: false,
  accessStatus: "ready" as const,
  buyCredits: vi.fn(),
  showWelcome: vi.fn(),
};

vi.mock("@/lib/get-translation", () => ({ getTranslationFromCookies: async () => "web" }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/john/1/5",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: { href: string; children: ReactNode; onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void }) => (
    <a href={href} {...props} onClick={(event) => { onClick?.(event); event.preventDefault(); push(href); }}>{children}</a>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: () => vi.fn(async () => ({ success: true })),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/lib/analytics");

type SavedPicture = { id: string; imageUrl: string; artStyle: string; createdAt: number; model?: string; imageWidth?: number; imageHeight?: number; aspectRatio?: string; creditsCost?: number };
let savedPictures: SavedPicture[];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let imageQuotes: Array<Record<string, unknown>>;
let paintRequests: Array<Record<string, unknown>>;
let chatQuotes: Array<Record<string, unknown>>;
const CATALOG = [
  { id: DEFAULT_IMAGE_MODEL, name: "Google: Nano Banana 2.1", provider: "Google", availability: "available", creditsCost: 5, estimatedCreditsByResolution: { "1K": 5 }, etaSeconds: 12 },
  { id: "google/gemini-3.1-flash-image", name: "Google: Nano Banana 2", provider: "Google", availability: "available", creditsCost: 9, estimatedCreditsByResolution: { "1K": 9, "2K": 14, "4K": 21 }, etaSeconds: 14 },
  { id: "google/gemini-2.5-flash-image", name: "Google: Nano Banana", provider: "Google", availability: "unavailable", unavailableReason: "Pricing unavailable", creditsCost: null },
];
const CHAT_MODELS = [
  { id: DEFAULT_CHAT_MODEL, name: "Mistral: Small (Default)", provider: "Mistral", contextLength: 131072, isFree: false },
  { id: "openai/gpt-oss-120b", name: "OpenAI: gpt-oss-120b", provider: "Openai", contextLength: 131072, isFree: false },
];

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

let container: HTMLDivElement;
let root: Root;

const params = (book: string, chapter: string, verse: string) => ({ params: Promise.resolve({ book, chapter, verse }) });
const flush = (ms = 0) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
async function openVerse(book = "john", chapter = "1", verse = "6") {
  const page = await VersePage(params(book, chapter, verse));
  await act(async () => { root.render(<PreferencesProvider>{page}</PreferencesProvider>); });
  // The stored settings load just after the first render.
  await flush();
  await flush();
}
/** Let the catalog, the quote's debounce and its answer arrive. */
const settle = () => flush(480);

function button(name: string | RegExp, within: ParentNode = container) {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find((item) => {
    const label = item.getAttribute("aria-label") ?? item.textContent?.trim() ?? "";
    return typeof name === "string" ? label === name : name.test(label);
  });
  if (!found) throw new Error(`No button ${name}`);
  return found;
}
async function click(target: HTMLElement) {
  await act(async () => { target.click(); });
  await flush();
}
const cornerMenu = () => container.querySelector<HTMLElement>('[role="dialog"][aria-label="Visibible menu"]');
const advanced = () => container.querySelector<HTMLElement>('[role="group"][aria-label="Advanced"]');
async function openAdvanced() {
  await click(button("Visibible menu"));
  await click(button("Advanced", cornerMenu()!));
  await flush();
  return advanced()!;
}
function radio(group: string, name: string | RegExp, within: ParentNode = container) {
  const groupNode = [...within.querySelectorAll<HTMLElement>('[role="radiogroup"]')]
    .find((node) => document.getElementById(node.getAttribute("aria-labelledby") ?? "")?.textContent === group);
  if (!groupNode) throw new Error(`No group ${group}`);
  return button(name, groupNode);
}
function pressEscape() {
  act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
}

beforeEach(() => {
  clearBibleApiCache();
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", memoryStorage());
  document.cookie = "visibible-translation=; path=/; max-age=0";
  resetAdvancedSettingsForTests();
  Object.assign(session, { tier: "paid", credits: 100 });
  savedPictures = [];
  imageQuotes = [];
  paintRequests = [];
  chatQuotes = [];
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "/api/image-models") return json({ models: CATALOG });
    if (url === "/api/generate-image/quote") {
      imageQuotes.push(JSON.parse(String(init?.body)));
      return json({ quote: { quoteId: `image-quote-${imageQuotes.length}`, operation: "image", policyVersion: "accepted-maximum-v1", estimateCredits: 2, maximumCredits: 4, expiresAt: Date.now() + 300_000 } });
    }
    if (url === "/api/generate-image") {
      paintRequests.push(JSON.parse(String(init?.body)));
      return new Promise<Response>(() => {});
    }
    if (url.endsWith("/api/chat/quote")) {
      const body = JSON.parse(String(init?.body));
      chatQuotes.push(body);
      const estimate = body.model === DEFAULT_CHAT_MODEL ? 3 : 7;
      return json({ quote: { quoteId: `chat-quote-${chatQuotes.length}`, estimateCredits: estimate, maximumCredits: estimate * 4, expiresAt: Date.now() + 300_000 } });
    }
    if (url === "/api/chat-models") return json({ models: CHAT_MODELS });
    // The Bible service is unreachable, so the reader uses the imported World English Bible.
    throw new DOMException("Timed out", "TimeoutError");
  }));
  vi.mocked(useQuery).mockImplementation(((query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(query);
    if (name === "verseImages:getGenerationRequestStatus") return null;
    if (name === "verseImages:getChapterImageStatus") return [];
    return answerPictureRead(savedPictures, query, args, null);
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

describe("Advanced in the corner menu", () => {
  it("is the menu's last row, collapsed until opened", async () => {
    await openVerse();
    await click(button("Visibible menu"));
    const menu = cornerMenu()!;
    const rows = [...menu.querySelectorAll("a, button")];
    const row = rows[rows.length - 1] as HTMLButtonElement;
    expect(row.textContent?.trim()).toBe("Advanced");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(advanced()).toBeNull();
    expect(menu.textContent).not.toMatch(/Aspect ratio|Answering model|Passage details/);

    await click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    const headings = [...advanced()!.querySelectorAll("h3")].map((heading) => heading.textContent);
    expect(headings).toEqual(["Image settings", "Answering model", "Passage details", "Welcome", "Feedback prompts"]);
  });
});

describe("image settings", () => {
  it("paints the next picture in the chosen shape", async () => {
    await openVerse();
    await settle();
    expect(imageQuotes.at(-1)).toMatchObject({ model: DEFAULT_IMAGE_MODEL, aspectRatio: "16:9", resolution: "1K" });

    const items = await openAdvanced();
    expect(radio("Aspect ratio", "Widescreen (16:9)", items).getAttribute("aria-checked")).toBe("true");
    await click(radio("Aspect ratio", "Ultra-wide (21:9)", items));
    expect(radio("Aspect ratio", "Ultra-wide (21:9)", items).getAttribute("aria-checked")).toBe("true");
    pressEscape();
    await settle();

    await click(button(/^Paint this verse/));
    expect(paintRequests).toEqual([expect.objectContaining({ reference: "John 1:6", aspectRatio: "21:9", resolution: "1K", model: DEFAULT_IMAGE_MODEL })]);
  });

  it("remembers the shape on this device", async () => {
    await openVerse();
    await click(radio("Aspect ratio", "Classic (3:2)", await openAdvanced()));
    act(() => root.unmount());
    resetAdvancedSettingsForTests();
    root = createRoot(container);
    await openVerse();
    await settle();
    expect(imageQuotes.at(-1)).toMatchObject({ aspectRatio: "3:2" });
  });

  it("shows the choices the server declines as unavailable", async () => {
    await openVerse();
    const items = await openAdvanced();
    // The model in use makes only 1K pictures.
    expect(radio("Resolution", /^1K Standard/, items).getAttribute("aria-disabled")).toBe("false");
    for (const resolution of [/^2K High/, /^4K Ultra/]) {
      const option = radio("Resolution", resolution, items);
      expect(option.getAttribute("aria-disabled")).toBe("true");
      expect(option.textContent).toContain("Not available");
    }
    const unpriced = radio("Model", /^Nano Banana(?! 2)/, items);
    expect(unpriced.getAttribute("aria-disabled")).toBe("true");
    expect(unpriced.textContent).toContain("Unavailable");
    await click(unpriced);
    expect(radio("Model", /^Nano Banana 2\.1/, items).getAttribute("aria-checked")).toBe("true");

    // A model that makes 2K offers it, at its price.
    await click(radio("Model", /^Nano Banana 2(?!\.)/, items));
    const twoK = radio("Resolution", /^2K High/, items);
    expect(twoK.getAttribute("aria-disabled")).toBe("false");
    expect(twoK.textContent).toContain("About 14 credits");
  });
});

describe("the answering model", () => {
  it("changes the model the next question is quoted and asked with", async () => {
    await openVerse("john", "1", "5");
    await flush();
    expect(chatQuotes.at(-1)).toMatchObject({ model: DEFAULT_CHAT_MODEL });
    const words = container.querySelector("article")!;
    expect(button(/^Send question/, words).getAttribute("aria-label")).toBe("Send question · About 3 credits · at most 12");

    const items = await openAdvanced();
    await click(button(/^Answering model: /, items));
    await flush();
    await click(button(/gpt-oss-120b/, items));
    pressEscape();
    await flush();

    expect(chatQuotes.at(-1)).toMatchObject({ model: "openai/gpt-oss-120b" });
    expect(button(/^Send question/, words).getAttribute("aria-label")).toBe("Send question · About 7 credits · at most 28");
  });
});

describe("passage details", () => {
  it("shows the details and statistics of the verse and its picture", async () => {
    savedPictures = [{
      id: "john-1-5:painting", imageUrl: "https://img.test/5.png", artStyle: "classical", createdAt: Date.UTC(2026, 10, 1),
      model: DEFAULT_IMAGE_MODEL, imageWidth: 1376, imageHeight: 768, aspectRatio: "16:9", creditsCost: 6,
    }];
    await openVerse("john", "1", "5");
    const items = await openAdvanced();
    await click(button(/^Details/, items));
    const text = items.textContent!;
    for (const fact of [
      "World English Bible", "John 1:5", "5 of 51", "New Testament", "51 verses",
      "Word Count", "Reading Time", "Images Saved1 saved", "Total Credits6 credits",
      "Dimensions1376 × 768", "Aspect Ratio16:9", "Cost6 credits",
    ]) expect(text).toContain(fact);
  });
});

describe("the welcome", () => {
  it("opens from its row and closes the menu", async () => {
    await openVerse("john", "1", "5");
    expect(session.showWelcome).not.toHaveBeenCalled();
    const items = await openAdvanced();
    await click(button("Show the welcome", items));
    expect(session.showWelcome).toHaveBeenCalledTimes(1);
    expect(cornerMenu()).toBeNull();
  });
});

describe("feedback prompts", () => {
  const prompt = () => [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Have feedback?"));
  /** Read `count` verses of John 1, from verse 1, and wait as long as the prompt takes to appear. */
  async function readVerses(count: number) {
    for (let verse = 1; verse <= count; verse++) await openVerse("john", "1", String(verse));
    await flush(2100);
  }

  it("are off by default", async () => {
    await readVerses(17);
    expect(prompt()).toBeUndefined();
  });

  it("appear only after the switch is turned on, and open the feedback form", async () => {
    await openVerse("john", "1", "1");
    const items = await openAdvanced();
    const toggle = items.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    pressEscape();

    await readVerses(17);
    expect(prompt()).toBeDefined();
    await click(prompt()!);
    expect(container.querySelector('[role="dialog"][aria-label="Send feedback"]')).not.toBeNull();
  });
});
