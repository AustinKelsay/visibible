"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/context/session-context";
import type { MessageMetadata } from "@/components/chat-metadata";
import { parseQuote, parseStaleQuote, sameQuoteNumbers, type DisplayQuote } from "@/lib/quote-display";

/** One turn of a conversation, with the answer's metadata. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Array<{ type: string; text?: string }>;
  metadata?: MessageMetadata;
}

/** The passage a question is about. The server reads its text itself. */
export interface ChatPassage {
  book: string;
  chapter: number;
  verseRange: string;
}

/** The fresh quote in a "quote stale" answer, which the chat transport surfaces as an error holding the response text. */
function staleQuoteOf(error: Error | undefined): DisplayQuote | null {
  if (!error) return null;
  try {
    return parseStaleQuote(409, JSON.parse(error.message));
  } catch {
    return null;
  }
}

/** A reader-facing message for a failed answer. */
export function chatErrorMessage(error: Error | null | undefined): string {
  if (!error) return "";
  const msg = error.message?.toLowerCase() ?? "";
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("rate-limited")) {
    return "We're experiencing high demand right now. Please wait a moment and try again.";
  }
  if (msg.includes("no endpoints") || msg.includes("temporarily unavailable") || msg.includes("503")) {
    return "This model is temporarily unavailable. Please try a different model or wait a few minutes.";
  }
  if (msg.includes("retry") || msg.includes("busy") || msg.includes("traffic")) {
    return "The AI service is busy. Please try again in a moment.";
  }
  return error.message || "Something went wrong. Please try again.";
}

/**
 * A paid conversation with the chat route (#60): the server's quote for the next message, whether the balance covers
 * it, sending with the quote's id, and the "quote stale" answer. A fresh quote at the price just accepted (the old
 * one had only expired) is accepted for the guest once; any other price waits for `confirmPrice`. Admins read no quote.
 */
export function usePaidChat({ id, model, passage, translation }: { id: string; model: string; passage: ChatPassage | null; translation: string }) {
  const { tier, credits } = useSession();
  const { messages, sendMessage, regenerate, status, error: chatError } = useChat({ id });
  // A stale quote is not a failure to show: the composer asks the guest to confirm the fresh price instead.
  const staleQuote = useMemo(() => staleQuoteOf(chatError), [chatError]);
  const error = staleQuote ? undefined : chatError;
  const isAdmin = tier === "admin";

  // The server's quote for one message with this model about this passage (priced from the context the server will
  // send): the estimate and maximum shown, and the id a send accepts. Read again when the model, passage, translation
  // or balance changes and after each send, since a quote is accepted once.
  const [quoteEpoch, setQuoteEpoch] = useState(0);
  const [quoteState, setQuoteState] = useState<{ key: string; quote: DisplayQuote | null; required?: number } | null>(null);
  const passageKey = passage ? `${passage.book}|${passage.chapter}|${passage.verseRange}` : null;
  const quoteKey = JSON.stringify([model, passageKey, translation, credits, quoteEpoch]);
  const currentQuote = quoteState && quoteState.key === quoteKey ? quoteState : null;
  const quote = staleQuote ?? currentQuote?.quote ?? null;
  const quoteWanted = !isAdmin && credits >= 1;
  /** The quote sent with the turn in flight, and whether its fresh replacement was already accepted for the guest. */
  const sentQuote = useRef<{ quote: DisplayQuote | null; resent: boolean }>({ quote: null, resent: false });

  useEffect(() => {
    if (!quoteWanted) return;
    const controller = new AbortController();
    fetch("/api/chat/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, ...(passage ? { context: passage } : {}), translation }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = response.ok || response.status === 402 ? await response.json() : null;
        if (controller.signal.aborted) return;
        // A 402 names the maximum this model needs, which the balance does not cover.
        setQuoteState({ key: quoteKey, quote: response.ok ? parseQuote(body?.quote) : null, ...(typeof body?.required === "number" ? { required: body.required } : {}) });
      })
      .catch(() => {
        // No price is shown; sending still asks the server, which answers with the quote to accept.
      });
    return () => controller.abort();
    // The passage is read through `quoteKey`, so a new object for the same verse asks no new quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteWanted, model, translation, quoteKey]);

  /** Admins bypass; otherwise the message's maximum must be affordable. */
  const canSend = isAdmin || credits >= (quote?.maximumCredits ?? currentQuote?.required ?? 1);
  const requestBody = { ...(passage ? { context: passage } : {}), translation, model };
  const isLoading = status === "streaming" || status === "submitted";

  /** Ask again for the answer to the question already sent, accepting this quote. */
  const resendWith = (accepted: DisplayQuote, resent: boolean) => {
    sentQuote.current = { quote: accepted, resent };
    void regenerate({ body: { ...requestBody, quoteId: accepted.quoteId } });
    setQuoteEpoch((epoch) => epoch + 1);
  };
  const resendsItself = Boolean(staleQuote) && !sentQuote.current.resent && sameQuoteNumbers(staleQuote, sentQuote.current.quote);
  /** Why the guest must accept `staleQuote` before the answer comes, or null. */
  const priceToConfirm = staleQuote && !isLoading && !resendsItself
    ? (sentQuote.current.quote ? "The price changed." : "Please confirm the price.")
    : null;
  useEffect(() => {
    if (staleQuote && resendsItself) resendWith(staleQuote, true);
    // Only a new stale answer starts a resend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleQuote]);

  /** Send a question with the current quote. The caller checks `canSend` first. */
  const send = (text: string) => {
    sentQuote.current = { quote, resent: false };
    void sendMessage({ text }, { body: { ...requestBody, ...(quote ? { quoteId: quote.quoteId } : {}) } });
    setQuoteEpoch((epoch) => epoch + 1);
  };

  return {
    messages: messages as ChatMessage[],
    status,
    isLoading,
    error,
    isAdmin,
    tier,
    credits,
    /** The price of the next message, when the server quoted one. */
    quote,
    staleQuote,
    priceToConfirm,
    canSend,
    send,
    /** Accept the fresh price and ask again. */
    confirmPrice: () => staleQuote && resendWith(staleQuote, true),
  };
}
