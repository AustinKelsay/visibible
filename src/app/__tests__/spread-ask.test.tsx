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
vi.mock("@/context/preferences-context", () => ({ usePreferences: () => ({ artStyle: "classical", translation: "web", autoGenerate: false, setAutoGenerate: vi.fn() }) }));
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/lib/analytics");

type Quote = { quoteId: string; estimateCredits: number; maximumCredits: number; expiresAt: number };
const quoteOf = (quoteId: string, estimateCredits = 3, maximumCredits = 13): Quote => ({ quoteId, estimateCredits, maximumCredits, expiresAt: Date.now() + 300_000 });

/** What the fake server was asked, and the answer streams it is still writing. */
let quoteRequests: Array<Record<string, unknown>>;
let chatRequests: Array<{ messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>; [key: string]: unknown }>;
let quoteAnswer: () => Response | Promise<Response>;
/** Answers /api/chat gives before it streams (a refusal, say); empty means stream an answer. */
let chatAnswers: Array<() => Response>;
const staleAnswer = (reason: string, quote: Quote) =>
  new Response(JSON.stringify({ error: "Quote stale", message: "The price for this message needs to be confirmed again.", reason, quote }), { status: 409 });
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
/** The question topics (#529) and the suggested questions shown, on the words page's foot or the Ask page. */
const topics = (within: ParentNode) => within.querySelector<HTMLElement>('[role="group"][aria-label="Question topics"]');
const topicStates = (within: ParentNode) => [...topics(within)!.querySelectorAll("button")].map((chip) => `${chip.textContent}${chip.getAttribute("aria-pressed") === "true" ? " (chosen)" : ""}`);
const shownQuestions = (within: ParentNode) => [...within.querySelectorAll<HTMLButtonElement>("[data-suggestions] button")].map((item) => item.textContent);
const askFoot = () => wordsPage().querySelector<HTMLElement>('section[aria-label="Ask about this verse"]')!;
const turnTexts = () => [...(askPage()?.querySelectorAll("[data-turn]") ?? [])].map((turn) => `${turn.getAttribute("data-turn")}: ${turn.textContent}`);

beforeEach(() => {
  clearBibleApiCache();
  sessionStorage.clear();
  vi.clearAllMocks();
  Object.assign(session, { tier: "paid", credits: 100 });
  quoteRequests = [];
  chatRequests = [];
  answers = [];
  chatAnswers = [];
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
      return (chatAnswers.shift() ?? startAnswer)();
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
  it("offers question topics, opening on Meaning with the two usual questions first, and a field with the quoted price", async () => {
    await openVerse();
    const words = wordsPage();
    expect(words.textContent).toContain("Ask about this verse");
    expect(topicStates(askFoot())).toEqual(["Meaning (chosen)", "Context", "People & places", "Words", "For today"]);
    expect(shownQuestions(askFoot())).toEqual(["What does John 1:5 mean?", "Summarize John 1 so far", "Why does John 1:5 matter?"]);
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

describe("question topics (#529)", () => {
  it("shows a chosen topic's questions in place of Meaning's and asks one", async () => {
    await openVerse();
    await click(button("People & places", askFoot()));
    expect(topicStates(askFoot())).toEqual(["Meaning", "Context", "People & places (chosen)", "Words", "For today"]);
    expect(shownQuestions(askFoot())).toEqual(["Who is in John 1:5?", "Where does John 1:5 take place?"]);
    await click(button("Where does John 1:5 take place?", askFoot()));
    expect(chatRequests[0].messages.map((message) => message.parts.map((part) => part.text).join(""))).toEqual(["Where does John 1:5 take place?"]);
    expect(trackAskQuestionSent).toHaveBeenCalledWith(expect.objectContaining({ source: "suggestion", messageCount: 1 }));
  });

  it("keeps the chosen topic as the reader turns to other verses, on both sides of the words page", async () => {
    await openVerse();
    await click(button("Words", askFoot()));

    await openVerse("john", "1", "6");
    expect(topicStates(askFoot())).toEqual(["Meaning", "Context", "People & places", "Words (chosen)", "For today"]);
    expect(shownQuestions(askFoot())).toEqual(["What do the key words in John 1:6 mean in the original language?", "How do other translations word John 1:6?"]);
    await click(button("Ask a question…"));
    expect(topicStates(askPage()!)).toEqual(["Meaning", "Context", "People & places", "Words (chosen)", "For today"]);
    await click(button("For today", askPage()!));

    await openVerse("romans", "8", "28");
    expect(topicStates(askFoot())[4]).toBe("For today (chosen)");
    expect(shownQuestions(askFoot())).toEqual(["How can I apply Romans 8:28 today?", "What can I pray about from Romans 8:28?"]);
  });

  it("opens on Meaning in a new tab, and when the tab cannot store the topic it still keeps it while open", async () => {
    sessionStorage.setItem("visibible-ask-topic", "not-a-topic");
    await openVerse();
    expect(topicStates(askFoot())[0]).toBe("Meaning (chosen)");

    // A topic stored, then storage that can no longer be read.
    await click(button("People & places", askFoot()));
    expect(sessionStorage.getItem("visibible-ask-topic")).toBe("people-places");
    const unreadable = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    await openVerse("john", "1", "7");
    expect(topicStates(askFoot())[2]).toBe("People & places (chosen)");
    unreadable.mockRestore();

    // Storage that holds a topic but can no longer be written (a full quota), then cannot be read at all.
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    await click(button("Context", askFoot()));
    expect(topicStates(askFoot())[1]).toBe("Context (chosen)");
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    await click(button("Words", askFoot()));
    await openVerse("john", "1", "6");
    expect(topicStates(askFoot())[3]).toBe("Words (chosen)");

    // Once storage works again it holds the topic.
    write.mockRestore();
    read.mockRestore();
    await click(button("Meaning", askFoot()));
    expect(sessionStorage.getItem("visibible-ask-topic")).toBe("meaning");
  });

  it("names a verse or chapter of Psalms as one psalm, and the book as Psalms", async () => {
    await openVerse("psalms", "23", "4");
    expect(shownQuestions(askFoot())).toEqual(["What does Psalm 23:4 mean?", "Summarize Psalm 23 so far", "Why does Psalm 23:4 matter?"]);
    await click(button("Context", askFoot()));
    expect(shownQuestions(askFoot())).toEqual(["What leads up to Psalm 23:4?", "What is the historical context of Psalm 23:4?", "Who wrote Psalms, and for whom?"]);
    expect(field("Ask about Psalm 23:4")).toBeTruthy();
    // The request still names the book as the app stores it.
    expect(quoteRequests[0]).toMatchObject({ context: { book: "Psalms", chapter: 23, verseRange: "4" } });
    // Nothing the reader reads or hears on the page says "Psalms 23", while the book is still named Psalms.
    const labels = [...container.querySelectorAll("[aria-label], [alt]")].map((node) => `${node.getAttribute("aria-label") ?? ""} ${node.getAttribute("alt") ?? ""}`);
    expect([container.textContent, ...labels].filter((text) => /Psalms \d/.test(text ?? ""))).toEqual([]);
    expect(button("Psalm 23:4, Contents")).toBeTruthy();
    expect(wordsPage().textContent).toContain("Psalms · Chapter 23");
  });

  it("offers every topic's questions, with a first verse's historical context only once", async () => {
    await openVerse("john", "1", "1");
    const all: string[] = [];
    for (const topic of ["Meaning", "Context", "People & places", "Words", "For today"]) {
      await click(button(topic, askFoot()));
      all.push(...shownQuestions(askFoot()).map(String));
    }
    expect(all).toEqual([
      "What does John 1:1 mean?", "What is the historical context of John 1:1?", "Why does John 1:1 matter?",
      "What leads up to John 1:1?", "Who wrote John, and for whom?",
      "Who is in John 1:1?", "Where does John 1:1 take place?",
      "What do the key words in John 1:1 mean in the original language?", "How do other translations word John 1:1?",
      "How can I apply John 1:1 today?", "What can I pray about from John 1:1?",
    ]);
  });

  it("asks a stored question from any topic with no credits and no free answers left", async () => {
    session.credits = 0;
    quoteAnswer = () => new Response(JSON.stringify({
      error: "Insufficient credits", required: 1, available: 0, free: { available: false, reason: "session" }, stored: ["How can I apply John 1:5 today?"],
    }), { status: 402 });
    await openVerse();
    await click(button("For today", askFoot()));
    await click(button("How can I apply John 1:5 today?", askFoot()));
    expect(session.buyCredits).not.toHaveBeenCalled();
    expect(chatRequests).toHaveLength(1);
  });

  it("offers the same topics on the Ask page before the first question", async () => {
    await openVerse();
    await click(button("Ask a question…"));
    const back = askPage()!;
    expect(topicStates(back)).toEqual(["Meaning (chosen)", "Context", "People & places", "Words", "For today"]);
    await click(button("Words", back));
    expect(shownQuestions(back)).toEqual(["What do the key words in John 1:5 mean in the original language?", "How do other translations word John 1:5?"]);
    await click(button("How do other translations word John 1:5?", back));
    expect(chatRequests).toHaveLength(1);
    expect(topics(back)).toBeNull();
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
    quoteAnswer = () => new Response(JSON.stringify({ error: "Insufficient credits", required: 13, available: 0 }), { status: 402 });
    await openVerse();
    // Asked even with no credits, since the answer could be free; free answers are off here.
    expect(quoteRequests).toHaveLength(1);
    expect(button(/^Send question/, wordsPage()).getAttribute("aria-label")).toBe("Send question");
    expect(wordsPage().querySelector('[role="status"]')).toBeNull();

    await click(button("What does John 1:5 mean?", wordsPage()));
    expect(session.buyCredits).toHaveBeenCalledTimes(1);
    expect(trackCreditsInsufficient).toHaveBeenCalledWith(expect.objectContaining({ feature: "chat", source: "ask_submit" }));
    expect(field("Ask about John 1:5").value).toBe("What does John 1:5 mean?");
    expect(askPage()).toBeNull();

    // The purchase lands; the question waits for the reader.
    session.credits = 100;
    quoteAnswer = () => new Response(JSON.stringify({ quote: quoteOf("quote-after-purchase") }));
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

describe("free answers (#493)", () => {
  const freeAnswer = (free: Record<string, unknown>, extra: Record<string, unknown> = {}, status = 200) =>
    () => new Response(JSON.stringify({ quote: null, free, ...extra }), { status });

  it("sends a question with no credits and no quote while the guest's free answers last", async () => {
    session.credits = 0;
    quoteAnswer = freeAnswer({ available: true, remaining: 20 });
    await openVerse();
    const send = button(/^Send question/, wordsPage());
    expect(send.getAttribute("aria-label")).toBe("Send question · Free");
    expect(send.textContent).toBe("Free");

    await click(button("What does John 1:5 mean?", wordsPage()));
    expect(session.buyCredits).not.toHaveBeenCalled();
    expect(chatRequests).toHaveLength(1);
    expect(chatRequests[0]).toMatchObject({ model: DEFAULT_CHAT_MODEL, context: { book: "John", chapter: 1, verseRange: "5" } });
    expect(chatRequests[0]).not.toHaveProperty("quoteId");
    // The standing is read again for the next question.
    expect(quoteRequests).toHaveLength(2);
  });

  it("says when the guest's free answers are used up and offers credits, keeping the question", async () => {
    session.credits = 0;
    quoteAnswer = freeAnswer({ available: false, reason: "session" }, { error: "Insufficient credits", required: 1, available: 0 }, 402);
    await openVerse();
    const notice = wordsPage().querySelector('[role="status"]');
    expect(notice?.textContent).toBe("You've used today's free answers. They return at midnight UTC. Continue with credits");
    expect(button(/^Send question/, wordsPage()).getAttribute("aria-label")).toBe("Send question");

    await type(field("Ask about John 1:5"), "What is the darkness?");
    await submit(field("Ask about John 1:5"));
    expect(chatRequests).toHaveLength(0);
    expect(session.buyCredits).toHaveBeenCalledTimes(1);
    expect(field("Ask about John 1:5").value).toBe("What is the darkness?");
    await click(button("Continue with credits", wordsPage()));
    expect(session.buyCredits).toHaveBeenCalledTimes(2);
  });

  it("says when the site's free answers are used up for the day or paused for the month", async () => {
    session.credits = 0;
    quoteAnswer = freeAnswer({ available: false, reason: "day" }, { error: "Insufficient credits", required: 1, available: 0 }, 402);
    await openVerse();
    expect(wordsPage().querySelector('[role="status"]')?.textContent).toBe("Free answers are used up across Visibible today. Continue with credits");

    quoteAnswer = freeAnswer({ available: false, reason: "month" }, { error: "Insufficient credits", required: 1, available: 0 }, 402);
    await openVerse("john", "1", "6");
    expect(wordsPage().querySelector('[role="status"]')?.textContent).toBe("Free answers are paused. Continue with credits");
  });

  it("reads the standing again after the last free answer, so the next question is kept and credits offered", async () => {
    session.credits = 0;
    quoteAnswer = freeAnswer({ available: true, remaining: 1 });
    await openVerse();
    await click(button("What does John 1:5 mean?", wordsPage()));
    // The read right after sending can land before the server counts the turn.
    expect(quoteRequests).toHaveLength(2);
    quoteAnswer = freeAnswer({ available: false, reason: "session" }, { error: "Insufficient credits", required: 1, available: 0 }, 402);
    await beginAnswer();
    await writeAnswer("The last free answer.", { finish: true });
    await flush();

    expect(quoteRequests).toHaveLength(3);
    expect(button(/^Send question/, askPage()!).getAttribute("aria-label")).toBe("Send question");
    expect(askPage()!.querySelector('[role="status"]')?.textContent).toBe("You've used today's free answers. They return at midnight UTC. Continue with credits");
    const followup = field("Ask a follow-up about John 1:5");
    await type(followup, "Explain the light further");
    await submit(followup);
    expect(chatRequests).toHaveLength(1);
    expect(followup.value).toBe("Explain the light further");
    expect(session.buyCredits).toHaveBeenCalledTimes(1);
  });

  it("lets a question asked before the standing arrives wait for it, then sends it free", async () => {
    session.credits = 0;
    let release!: (response: Response) => void;
    quoteAnswer = () => new Promise<Response>((resolve) => { release = resolve; });
    await openVerse();
    await click(button("What does John 1:5 mean?", wordsPage()));
    expect(session.buyCredits).not.toHaveBeenCalled();
    expect(chatRequests).toHaveLength(0);
    expect(field("Ask about John 1:5").value).toBe("What does John 1:5 mean?");

    await act(async () => { release(new Response(JSON.stringify({ quote: null, free: { available: true, remaining: 20 } }))); });
    await flush();
    expect(chatRequests).toHaveLength(1);
    expect(chatRequests[0]).not.toHaveProperty("quoteId");
    expect(session.buyCredits).not.toHaveBeenCalled();
  });

  it("opens the credits dialog for a waiting question once the standing says free answers are used up", async () => {
    session.credits = 0;
    let release!: (response: Response) => void;
    quoteAnswer = () => new Promise<Response>((resolve) => { release = resolve; });
    await openVerse();
    await click(button("What does John 1:5 mean?", wordsPage()));
    await act(async () => {
      release(new Response(JSON.stringify({ error: "Insufficient credits", required: 1, available: 0, free: { available: false, reason: "session" } }), { status: 402 }));
    });
    await flush();
    expect(chatRequests).toHaveLength(0);
    expect(session.buyCredits).toHaveBeenCalledTimes(1);
    expect(field("Ask about John 1:5").value).toBe("What does John 1:5 mean?");
  });

  it("lets the server decide when the standing cannot be read, and reads it again after that answer", async () => {
    session.credits = 0;
    quoteAnswer = () => new Response("Service unavailable", { status: 503 });
    await openVerse();
    await click(button("What does John 1:5 mean?", wordsPage()));
    expect(session.buyCredits).not.toHaveBeenCalled();
    expect(chatRequests).toHaveLength(1);
    const reads = quoteRequests.length;
    quoteAnswer = freeAnswer({ available: false, reason: "session" }, { error: "Insufficient credits", required: 1, available: 0 }, 402);
    await beginAnswer();
    await writeAnswer("The last free answer.", { finish: true });
    await flush();
    expect(quoteRequests.length).toBe(reads + 1);
    expect(askPage()!.querySelector('[role="status"]')?.textContent).toContain("You've used today's free answers.");
  });

  it("drops a waiting question the reader cleared or changed before the standing arrived", async () => {
    session.credits = 0;
    let release!: (response: Response) => void;
    quoteAnswer = () => new Promise<Response>((resolve) => { release = resolve; });
    await openVerse();
    await click(button("What does John 1:5 mean?", wordsPage()));
    await type(field("Ask about John 1:5"), "Something else");
    await act(async () => { release(new Response(JSON.stringify({ quote: null, free: { available: true, remaining: 20 } }))); });
    await flush();
    expect(chatRequests).toHaveLength(0);
    expect(field("Ask about John 1:5").value).toBe("Something else");
  });

  it("reads a refused standing again just after midnight UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 17, 23, 59, 59, 900));
    vi.spyOn(Math, "random").mockReturnValue(0);
    session.credits = 0;
    quoteAnswer = freeAnswer({ available: false, reason: "session" }, { error: "Insufficient credits", required: 1, available: 0 }, 402);
    await openVerse();
    expect(quoteRequests).toHaveLength(1);
    quoteAnswer = freeAnswer({ available: true, remaining: 20 });
    // Midnight is 100 ms away; the read comes a second after it.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1300)); });
    await flush();
    expect(quoteRequests).toHaveLength(2);
    expect(button(/^Send question/, wordsPage()).getAttribute("aria-label")).toBe("Send question · Free");
    vi.useRealTimers();
  });

  it("shows the price as usual once free answers are used up and the balance can pay", async () => {
    quoteAnswer = () => new Response(JSON.stringify({ quote: quoteOf("paid-quote"), free: { available: false, reason: "network" } }));
    await openVerse();
    expect(button(/^Send question/, wordsPage()).getAttribute("aria-label")).toBe("Send question · About 3 credits · at most 13");
    expect(wordsPage().querySelector('[role="status"]')).toBeNull();
    await click(button("What does John 1:5 mean?", wordsPage()));
    expect(chatRequests[0]).toMatchObject({ quoteId: "paid-quote" });
  });
});

describe("stored answers to suggested questions (#505)", () => {
  it("asks a suggestion whose answer is stored even with no credits and no free answers left", async () => {
    session.credits = 0;
    quoteAnswer = () => new Response(JSON.stringify({
      error: "Insufficient credits", required: 1, available: 0, free: { available: false, reason: "session" }, stored: ["What does John 1:5 mean?"],
    }), { status: 402 });
    await openVerse();
    // The other suggestion has no stored answer, so it still needs credits.
    await click(button("Summarize John 1 so far", wordsPage()));
    expect(session.buyCredits).toHaveBeenCalledTimes(1);
    expect(chatRequests).toHaveLength(0);
    await click(button("What does John 1:5 mean?", wordsPage()));
    expect(session.buyCredits).toHaveBeenCalledTimes(1);
    expect(chatRequests).toHaveLength(1);
  });

  it("treats a stored suggestion asked again later in the conversation like any question", async () => {
    session.credits = 0;
    quoteAnswer = () => new Response(JSON.stringify({
      error: "Insufficient credits", required: 1, available: 0, free: { available: false, reason: "session" }, stored: ["What does John 1:5 mean?"],
    }), { status: 402 });
    await openVerse();
    await click(button("What does John 1:5 mean?", wordsPage()));
    await beginAnswer();
    await writeAnswer("A saved answer.", { finish: true });
    await flush();
    await click(button("Back to the verse", askPage()!));
    await click(button("What does John 1:5 mean?", wordsPage()));
    expect(chatRequests).toHaveLength(1);
    expect(session.buyCredits).toHaveBeenCalledTimes(1);
  });

  it("lets a fresh answer pressed before the standing arrives wait for it", async () => {
    session.credits = 0;
    let release: ((response: Response) => void) | null = null;
    quoteAnswer = () => new Response(JSON.stringify({ quote: null, free: { available: true, remaining: 20 }, stored: ["What does John 1:5 mean?"] }));
    await openVerse();
    await click(button("What does John 1:5 mean?", wordsPage()));
    // The read after this send is slow.
    quoteAnswer = () => new Promise<Response>((resolve) => { release = resolve; });
    await beginAnswer();
    const controller = answers[answers.length - 1];
    await act(async () => {
      controller.enqueue({ type: "text-delta", id: "answer", delta: "A saved answer." });
      controller.enqueue({ type: "text-end", id: "answer" });
      controller.enqueue({ type: "finish", messageMetadata: { stored: true, storedAt: 1 } });
      controller.close();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await flush();
    await click(button(/^Get a fresh answer/, askPage()!));
    expect(session.buyCredits).not.toHaveBeenCalled();
    expect(chatRequests).toHaveLength(1);
    // A follow-up typed meanwhile waits in the field rather than racing the fresh answer.
    await type(field("Ask a follow-up about John 1:5"), "And the darkness?");
    await submit(field("Ask a follow-up about John 1:5"));
    await act(async () => { release?.(new Response(JSON.stringify({ quote: null, free: { available: true, remaining: 19 }, stored: ["What does John 1:5 mean?"] }))); });
    await flush();
    expect(chatRequests).toHaveLength(2);
    expect(chatRequests[1]).toMatchObject({ fresh: true });
    expect(field("Ask a follow-up about John 1:5").value).toBe("And the darkness?");
  });

  it("offers a fresh answer in place of a stored one, priced like any question, and asks again with fresh", async () => {
    session.credits = 0;
    quoteAnswer = () => new Response(JSON.stringify({ quote: null, free: { available: true, remaining: 20 }, stored: ["What does John 1:5 mean?"] }));
    await openVerse();
    await click(button("What does John 1:5 mean?", wordsPage()));
    await beginAnswer();
    const controller = answers[answers.length - 1];
    await act(async () => {
      controller.enqueue({ type: "text-delta", id: "answer", delta: "A saved answer." });
      controller.enqueue({ type: "text-end", id: "answer" });
      controller.enqueue({ type: "finish", messageMetadata: { stored: true, storedAt: Date.parse("2026-11-17T12:00:00Z") } });
      controller.close();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await flush();
    const note = askPage()!.querySelector('[data-turn="assistant"]')!.textContent;
    expect(note).toContain("Saved answer · Get a fresh answer · Free");

    await click(button("Get a fresh answer · Free", askPage()!));
    expect(chatRequests).toHaveLength(2);
    expect(chatRequests[1]).toMatchObject({ fresh: true, context: { book: "John", chapter: 1, verseRange: "5" } });
    expect(chatRequests[1].messages.filter((message) => message.role === "user")).toHaveLength(1);
  });
});

describe("a question whose quote went stale", () => {
  it("waits for the reader to accept a fresh quote at a changed price, then sends with it", async () => {
    await openVerse();
    chatAnswers.push(() => staleAnswer("changed", quoteOf("fresh-quote", 5, 18)));
    await type(field("Ask about John 1:5"), "What is the darkness?");
    await submit(field("Ask about John 1:5"));
    await flush();

    const notice = askPage()!.querySelector('[role="status"]');
    expect(notice?.textContent).toBe("The price changed. About 5 credits · at most 18. Send at this price");
    expect(askPage()!.textContent).not.toContain("Quote stale");
    expect(chatRequests).toHaveLength(1);

    await click(button("Send at this price", askPage()!));
    expect(chatRequests).toHaveLength(2);
    expect(chatRequests[1]).toMatchObject({ quoteId: "fresh-quote" });
  });

  it("accepts a fresh quote for the reader once when only the old one expired at the price they accepted", async () => {
    await openVerse();
    chatAnswers.push(() => staleAnswer("expired", quoteOf("renewed-quote")));
    await type(field("Ask about John 1:5"), "What is the darkness?");
    await submit(field("Ask about John 1:5"));
    await flush();

    expect(chatRequests.map((request) => request.quoteId)).toEqual(["quote-1", "renewed-quote"]);
    expect(askPage()!.querySelector('[role="status"]')).toBeNull();
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

describe("closing Ask after the opener hides on resize", () => {
  it("moves focus to the visible Ask field instead of leaving it on body", async () => {
    await openVerse();
    const compact = button("Ask about this verse…", wordsPage());
    const regular = field("Ask about John 1:5");
    await click(compact);
    expect(askPage()).not.toBeNull();
    // Simulate resizing taller across the short breakpoint: the compact opener is now display:none (cannot take focus)
    // while the regular Ask field is visible.
    vi.spyOn(compact, "focus").mockImplementation(() => {});
    vi.spyOn(compact, "getClientRects").mockReturnValue([] as unknown as DOMRectList);
    vi.spyOn(regular, "getClientRects").mockReturnValue([new DOMRect(0, 0, 200, 36)] as unknown as DOMRectList);
    await click(button("Back to the verse", askPage()!));
    await flush();
    expect(document.activeElement).toBe(regular);
  });
});
