/* @vitest-environment jsdom */

/**
 * The chat composer and the server's quote (#60): the estimate and maximum shown come from the quote endpoint, a send
 * carries that quote's id, and a stale answer either re-accepts the same price or waits for the guest to accept the
 * new one.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "@/components/chat";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const chat = {
  messages: [] as Array<{ id: string; role: string; parts: Array<{ type: string; text: string }> }>,
  status: "ready",
  error: undefined as Error | undefined,
  sendMessage: vi.fn(),
  // Like the SDK: asking again clears the error and shows the turn as submitted.
  regenerate: vi.fn(async () => { chat.error = undefined; chat.status = "submitted"; }),
};
const session = { tier: "paid", credits: 100, buyCredits: vi.fn() };
vi.mock("@ai-sdk/react", () => ({ useChat: () => chat }));
vi.mock("@/context/preferences-context", () => ({ usePreferences: () => ({ chatModel: "test/model", translation: "web" }) }));
vi.mock("@/context/session-context", () => ({ useSession: () => session }));
vi.mock("@/components/chat-model-selector", () => ({ ChatModelSelector: () => null }));
vi.mock("@/components/chat-metadata", () => ({ ConversationSummary: () => null, MessageMetadataDisplay: () => null }));
vi.mock("@/components/markdown-renderer", () => ({ MarkdownRenderer: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock("@/lib/analytics", () => ({ trackChatMessageSent: vi.fn(), trackCreditsInsufficient: vi.fn(), trackChatErrorShown: vi.fn() }));

const quoteOf = (quoteId: string, estimateCredits: number, maximumCredits: number) =>
  ({ quoteId, operation: "chat", policyVersion: "accepted-maximum-v1", estimateCredits, maximumCredits, expiresAt: Date.now() + 300_000 });
const staleError = (quote: ReturnType<typeof quoteOf>, reason: string) =>
  new Error(JSON.stringify({ error: "Quote stale", message: "The price for this message needs to be confirmed again.", reason, quote }));
const context = { book: "Genesis", chapter: 1, verseRange: "1" };

describe("Chat composer and the server's quote", () => {
  let container: HTMLDivElement;
  let root: Root;
  let quoteAnswers: Array<() => Response>;
  let quoteRequests: Array<Record<string, unknown>>;
  const render = () => act(async () => { root.render(<Chat context={context as never} variant="sidebar" />); });
  const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const input = () => container.querySelector("input")!;
  const ask = async (text: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), text);
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  };
  const sentBody = () => chat.sendMessage.mock.lastCall![1].body as Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(chat, { messages: [], status: "ready", error: undefined });
    Object.assign(session, { tier: "paid", credits: 100 });
    quoteAnswers = []; quoteRequests = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      quoteRequests.push(JSON.parse(String(init?.body)));
      return (quoteAnswers.shift() ?? (() => new Response(JSON.stringify({ quote: quoteOf(`quote-${quoteRequests.length}`, 3, 13) }))))();
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows the server's estimate and maximum for a message and sends the quote's id", async () => {
    await render();
    await flush();
    expect(quoteRequests).toEqual([{ model: "test/model" }]);
    expect(container.textContent).toContain("About 3 credits · at most 13 per message");

    await ask("What does this mean?");
    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({ context, translation: "web", model: "test/model", quoteId: "quote-1" });
    // A quote is accepted once: the next message's is read.
    await flush();
    expect(quoteRequests).toHaveLength(2);
  });

  it("waits for the guest to accept a fresh quote at a different price, then asks again with it", async () => {
    await render();
    await flush();
    await ask("What does this mean?");
    chat.messages = [{ id: "u1", role: "user", parts: [{ type: "text", text: "What does this mean?" }] }];
    chat.error = staleError(quoteOf("fresh-quote", 5, 18), "changed");
    await render();
    expect(chat.regenerate).not.toHaveBeenCalled();
    const notice = container.querySelector('form [role="status"]')!;
    expect(notice.textContent).toBe("The price changed. About 5 credits · at most 18. Send at this price");
    // The refusal is a price to confirm, not a failure.
    expect(container.textContent).not.toContain("Quote stale");
    expect(container.textContent).not.toContain("Try again or select a different model");

    await act(async () => notice.querySelector("button")!.click());
    expect(chat.regenerate).toHaveBeenCalledTimes(1);
    expect(chat.regenerate).toHaveBeenCalledWith({ body: { context, translation: "web", model: "test/model", quoteId: "fresh-quote" } });
    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("accepts a fresh quote for the guest when only the old one expired and the price is the one they accepted", async () => {
    await render();
    await flush();
    await ask("What does this mean?");
    chat.error = staleError(quoteOf("renewed-quote", 3, 13), "expired");
    await render();
    expect(chat.regenerate).toHaveBeenCalledTimes(1);
    expect(chat.regenerate).toHaveBeenCalledWith({ body: expect.objectContaining({ quoteId: "renewed-quote" }) });
    expect(container.querySelector('form [role="status"]')).toBeNull();
    // A second refusal is not accepted for them again.
    Object.assign(chat, { status: "error", error: staleError(quoteOf("third-quote", 3, 13), "expired") });
    await render();
    expect(chat.regenerate).toHaveBeenCalledTimes(1);
    expect(container.querySelector('form [role="status"]')!.textContent).toContain("About 3 credits · at most 13");
  });

  it("asks the guest to confirm when no price was on screen at the send", async () => {
    quoteAnswers.push(() => new Response(JSON.stringify({ error: "Service temporarily unavailable" }), { status: 503 }));
    await render();
    await flush();
    expect(container.textContent).not.toContain("per message");
    await ask("What does this mean?");
    expect(sentBody()).not.toHaveProperty("quoteId");
    chat.error = staleError(quoteOf("first-quote", 3, 13), "missing");
    await render();
    expect(chat.regenerate).not.toHaveBeenCalled();
    expect(container.querySelector('form [role="status"]')!.textContent).toBe("Please confirm the price. About 3 credits · at most 13. Send at this price");
  });

  it("does not let a guest send a message whose maximum they cannot afford", async () => {
    session.credits = 5;
    quoteAnswers.push(() => new Response(JSON.stringify({ quote: quoteOf("dear-quote", 3, 13) })));
    await render();
    await flush();
    expect(input().disabled).toBe(true);
    expect(input().placeholder).toBe("Add credits to chat");
  });

  it("reads no quote and shows no price for the owner", async () => {
    Object.assign(session, { tier: "admin", credits: 0 });
    await render();
    await flush();
    expect(quoteRequests).toHaveLength(0);
    expect(container.textContent).not.toContain("per message");
    await ask("What does this mean?");
    expect(sentBody()).toEqual({ context, translation: "web", model: "test/model" });
  });
});
