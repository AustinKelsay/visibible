/* @vitest-environment jsdom */

/**
 * Ask on the words page (#442), through the whole verse page. The reader's own chat client runs; only the network
 * is faked: the quote endpoint answers with a quote and the chat endpoint streams an answer chunk by chunk, so no
 * model is ever called.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import VersePage from "../[book]/[chapter]/[verse]/page";
import { clearBibleApiCache } from "@/lib/bible-api";
import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import { trackAskOpened, trackAskQuestionSent, trackCreditsInsufficient } from "@/lib/analytics";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
const session = { tier: "paid" as "paid" | "admin", credits: 100, isLoading: false, buyCredits: vi.fn() };

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
// No saved pictures: every verse is unpainted.
vi.mock("convex/react", async () => {
  const { answerPictureRead } = await import("./fake-picture-reads");
  return {
    useQuery: (query: Parameters<typeof answerPictureRead>[1], args: unknown) => (args === "skip" ? undefined : answerPictureRead([], query, args, null)),
    useMutation: () => vi.fn(async () => ({ success: true })),
    useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  };
});
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
// A model saved by the old chat picker is not used: the reader asks the default model.
vi.mock("@/context/preferences-context", () => ({ usePreferences: () => ({ artStyle: "classical", translation: "web", chatModel: "saved/old-pick", imageModel: "test-model", imageAspectRatio: "16:9", imageResolution: "1K", autoGenerate: false, setAutoGenerate: vi.fn() }) }));
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/lib/analytics");

type Quote = { quoteId: string; estimateCredits: number; maximumCredits: number; expiresAt: number };
const quoteOf = (quoteId: string, estimateCredits = 3, maximumCredits = 13): Quote => ({ quoteId, estimateCredits, maximumCredits, expiresAt: Date.now() + 300_000 });

/** What the fake server was asked, and the answer streams it is still writing. */
let quoteRequests: Array<Record<string, unknown>>;
let chatRequests: Array<{ messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>; [key: string]: unknown }>;
let quoteAnswer: () => Response;
let answers: Array<ReadableStreamDefaultController<UIMessageChunk>>;

function startAnswer(): Response {
  const stream = new ReadableStream<UIMessageChunk>({ start: (controller) => { answers.push(controller); } });
  return createUIMessageStreamResponse({ stream });
}

/** Write `text` into the newest answer, then optionally finish it. */
async function writeAnswer(text: string, { finish = false } = {}) {
  const controller = answers[answers.length - 1];
  await act(async () => {
    controller.enqueue({ type: "text-delta", id: "answer", delta: text });
    if (finish) {
      controller.enqueue({ type: "text-end", id: "answer" });
      controller.enqueue({ type: "finish" });
      controller.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function beginAnswer() {
  const controller = answers[answers.length - 1];
  await act(async () => {
    controller.enqueue({ type: "start" });
    controller.enqueue({ type: "text-start", id: "answer" });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

let container: HTMLDivElement;
let root: Root;

const params = (book: string, chapter: string, verse: string) => ({ params: Promise.resolve({ book, chapter, verse }) });
async function openVerse(book = "john", chapter = "1", verse = "5") {
  const page = await VersePage(params(book, chapter, verse));
  await act(async () => { root.render(page); });
  await flush();
}
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const askPage = () => container.querySelector<HTMLElement>('[role="dialog"][aria-label^="Ask about"]');
const wordsPage = () => container.querySelector<HTMLElement>("article")!;
function button(name: string | RegExp, within: ParentNode = container) {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find((item) => {
    const label = item.getAttribute("aria-label") ?? item.textContent ?? "";
    return typeof name === "string" ? label === name : name.test(label);
  });
  if (!found) throw new Error(`No button ${name}`);
  return found;
}
function field(label: string) {
  const found = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!found) throw new Error(`No field ${label}`);
  return found;
}
async function type(input: HTMLInputElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit(input: HTMLInputElement) {
  await act(async () => { input.form!.requestSubmit(); });
  await flush();
}
async function click(target: HTMLElement) {
  await act(async () => { target.click(); });
  await flush();
}
function pressEscape() {
  act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
}
const turnTexts = () => [...(askPage()?.querySelectorAll("[data-turn]") ?? [])].map((turn) => `${turn.getAttribute("data-turn")}: ${turn.textContent}`);

beforeEach(() => {
  clearBibleApiCache();
  vi.clearAllMocks();
  Object.assign(session, { tier: "paid", credits: 100 });
  quoteRequests = [];
  chatRequests = [];
  answers = [];
  let quotes = 0;
  quoteAnswer = () => new Response(JSON.stringify({ quote: quoteOf(`quote-${++quotes}`) }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/api/chat/quote")) {
      quoteRequests.push(JSON.parse(String(init?.body)));
      return quoteAnswer();
    }
    if (url.endsWith("/api/chat")) {
      chatRequests.push(JSON.parse(String(init?.body)));
      return startAnswer();
    }
    // The Bible service is unreachable, so the reader uses the imported World English Bible.
    throw new DOMException("Timed out", "TimeoutError");
  }));
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

describe("asking at the foot of the words page", () => {
  it("offers two suggested questions and a field, with the quoted price on the send control", async () => {
    await openVerse();
    const words = wordsPage();
    expect(words.textContent).toContain("Ask about this verse");
    expect(button("What does John 1:5 mean?", words)).toBeTruthy();
    expect(button("Summarize John 1 so far", words)).toBeTruthy();
    expect(field("Ask about John 1:5")).toBeTruthy();
    // The quote is for a question about this verse, whose context is the chapter so far.
    expect(quoteRequests).toEqual([{ model: DEFAULT_CHAT_MODEL, context: { book: "John", chapter: 1, verseRange: "5" }, translation: "web" }]);
    const send = button(/^Send question/, words);
    expect(send.getAttribute("aria-label")).toBe("Send question · About 3 credits · at most 13");
    expect(send.textContent).toContain("3 credits");
    // No chat sidebar, its toggle or a model picker: the site picks the model.
    expect(container.querySelector('aside, [aria-label="Toggle chat"], [aria-label*="chat model"]')).toBeNull();
  });

  it("turns the page over to the verse quote and streams the answer to a suggested question", async () => {
    await openVerse();
    await click(button("What does John 1:5 mean?", wordsPage()));

    expect(chatRequests).toHaveLength(1);
    expect(chatRequests[0]).toMatchObject({
      context: { book: "John", chapter: 1, verseRange: "5" },
      translation: "web",
      model: DEFAULT_CHAT_MODEL,
      quoteId: "quote-1",
    });
    expect(chatRequests[0].messages.map((message) => message.parts.map((part) => part.text).join(""))).toEqual(["What does John 1:5 mean?"]);

    const back = askPage();
    expect(back).not.toBeNull();
    expect(back!.textContent).toContain("John 1:5");
    expect(back!.querySelector("blockquote")?.textContent).toContain("The light shines in the darkness");
    expect(button("Back to the verse", back!)).toBeTruthy();

    await beginAnswer();
    await writeAnswer("Darkness is ");
    expect(turnTexts()).toEqual(["user: What does John 1:5 mean?", "assistant: Darkness is"]);
    await writeAnswer("more than night.", { finish: true });
    expect(turnTexts()).toEqual(["user: What does John 1:5 mean?", "assistant: Darkness is more than night."]);

    expect(trackAskOpened).toHaveBeenCalledWith(expect.objectContaining({ source: "words_page" }));
    expect(trackAskQuestionSent).toHaveBeenCalledWith(expect.objectContaining({ source: "suggestion", messageCount: 1 }));
  });
});

describe("the chapter so far", () => {
  it("offers no summary at a chapter's first verse", async () => {
    await openVerse("john", "1", "1");
    const words = wordsPage();
    expect(button("What does John 1:1 mean?", words)).toBeTruthy();
    expect(button("What is the historical context of John 1:1?", words)).toBeTruthy();
    expect(words.textContent).not.toContain("so far");
  });

  it("asks for a summary of the chapter so far about the verse on screen, at its own quote", async () => {
    await openVerse("john", "1", "2");
    await click(button("Summarize John 1 so far", wordsPage()));
    expect(chatRequests).toHaveLength(1);
    expect(chatRequests[0]).toMatchObject({ context: { book: "John", chapter: 1, verseRange: "2" }, translation: "web", quoteId: "quote-1" });
    expect(chatRequests[0].messages.map((message) => message.parts.map((part) => part.text).join(""))).toEqual(["Summarize John 1 so far"]);
    expect(quoteRequests[0]).toMatchObject({ context: { book: "John", chapter: 1, verseRange: "2" } });
  });
});

describe("a conversation on one verse", () => {
  it("answers a follow-up with the earlier turns in view, and a page turn clears the conversation", async () => {
    await openVerse();
    await type(field("Ask about John 1:5"), "What is the darkness?");
    await submit(field("Ask about John 1:5"));
    await beginAnswer();
    await writeAnswer("A world turned away from God.", { finish: true });

    const followUp = field("Ask a follow-up about John 1:5");
    expect(document.activeElement).toBe(followUp);
    await type(followUp, "And the light?");
    await submit(followUp);
    expect(chatRequests).toHaveLength(2);
    expect(chatRequests[1].messages.map((message) => `${message.role}: ${message.parts.map((part) => part.text ?? "").join("")}`)).toEqual([
      "user: What is the darkness?",
      "assistant: A world turned away from God.",
      "user: And the light?",
    ]);
    // A quote is accepted once: each question carries a fresh one.
    expect(chatRequests.map((request) => request.quoteId)).toEqual(["quote-1", "quote-2"]);
    await beginAnswer();
    await writeAnswer("The life of the Word.", { finish: true });
    expect(turnTexts()).toHaveLength(4);
    expect(trackAskQuestionSent).toHaveBeenLastCalledWith(expect.objectContaining({ source: "field", messageCount: 3 }));

    await openVerse("john", "1", "6");
    expect(askPage()).toBeNull();
    await type(field("Ask about John 1:6"), "Who was John?");
    await submit(field("Ask about John 1:6"));
    expect(chatRequests[2].messages).toHaveLength(1);
    expect(chatRequests[2]).toMatchObject({ context: { book: "John", chapter: 1, verseRange: "6" } });
    expect(turnTexts()).toEqual(["user: Who was John?"]);
  });
});

describe("turning back to the verse", () => {
  it("returns on Escape or \"Back to the verse\" and puts focus back in the field", async () => {
    await openVerse();
    await type(field("Ask about John 1:5"), "What is the darkness?");
    await submit(field("Ask about John 1:5"));
    expect(askPage()).not.toBeNull();

    pressEscape();
    await flush();
    expect(askPage()).toBeNull();
    expect(document.activeElement).toBe(field("Ask about John 1:5"));

    await click(button("What does John 1:5 mean?", wordsPage()));
    expect(askPage()).not.toBeNull();
    await click(button("Back to the verse", askPage()!));
    expect(askPage()).toBeNull();
    expect(document.activeElement).toBe(field("Ask about John 1:5"));
  });

  it("opens from the phone dock with the suggestions and a field, and returns focus to the dock", async () => {
    await openVerse();
    const dock = button("Ask a question…");
    await click(dock);
    const back = askPage()!;
    expect(back).not.toBeNull();
    expect(button("What does John 1:5 mean?", back)).toBeTruthy();
    expect(document.activeElement).toBe(back.querySelector('input[aria-label="Ask about John 1:5"]'));
    expect(trackAskOpened).toHaveBeenCalledWith(expect.objectContaining({ source: "dock" }));
    expect(chatRequests).toHaveLength(0);

    await click(button("What does John 1:5 mean?", back));
    expect(chatRequests).toHaveLength(1);
    expect(turnTexts()).toEqual(["user: What does John 1:5 mean?"]);

    pressEscape();
    await flush();
    expect(document.activeElement).toBe(dock);
  });
});

describe("asking without enough credits", () => {
  it("opens the credits dialog from a suggestion and keeps the question in the field, unsent after a purchase", async () => {
    session.credits = 0;
    await openVerse();
    expect(quoteRequests).toHaveLength(0);
    expect(button(/^Send question/, wordsPage()).getAttribute("aria-label")).toBe("Send question");

    await click(button("What does John 1:5 mean?", wordsPage()));
    expect(session.buyCredits).toHaveBeenCalledTimes(1);
    expect(trackCreditsInsufficient).toHaveBeenCalledWith(expect.objectContaining({ feature: "chat", source: "ask_submit" }));
    expect(field("Ask about John 1:5").value).toBe("What does John 1:5 mean?");
    expect(askPage()).toBeNull();

    // The purchase lands; the question waits for the reader.
    session.credits = 100;
    await openVerse();
    expect(chatRequests).toHaveLength(0);
    expect(field("Ask about John 1:5").value).toBe("What does John 1:5 mean?");
    expect(button(/^Send question/, wordsPage()).getAttribute("aria-label")).toBe("Send question · About 3 credits · at most 13");
  });

  it("opens the credits dialog when the balance is below the question's maximum", async () => {
    session.credits = 5;
    quoteAnswer = () => new Response(JSON.stringify({ error: "Insufficient credits", required: 13, available: 5 }), { status: 402 });
    await openVerse();
    await type(field("Ask about John 1:5"), "What is the darkness?");
    await submit(field("Ask about John 1:5"));
    expect(session.buyCredits).toHaveBeenCalledTimes(1);
    expect(chatRequests).toHaveLength(0);
    expect(field("Ask about John 1:5").value).toBe("What is the darkness?");
  });
});

describe("the owner", () => {
  it("asks without a balance or a price", async () => {
    Object.assign(session, { tier: "admin", credits: 0 });
    await openVerse();
    expect(quoteRequests).toHaveLength(0);
    expect(button(/^Send question/, wordsPage()).getAttribute("aria-label")).toBe("Send question");
    await click(button("What does John 1:5 mean?", wordsPage()));
    expect(session.buyCredits).not.toHaveBeenCalled();
    expect(chatRequests).toHaveLength(1);
    expect(chatRequests[0]).not.toHaveProperty("quoteId");
  });
});
