"use client";

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ArrowUp, ChevronLeft, Sparkles } from "lucide-react";
import { useSession } from "@/context/session-context";
import { usePreferences } from "@/context/preferences-context";
import { LayerPanel, useLayer, useLayers } from "@/components/spread/layers";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { chatErrorMessage, usePaidChat } from "@/components/use-paid-chat";
import { trackAskOpened, trackAskQuestionSent, trackChatErrorShown, trackCreditsInsufficient, type AskOpenSource } from "@/lib/analytics";
import { resolveChatErrorType } from "@/lib/analytics-event-utils";
import { useAdvancedSettings } from "@/lib/advanced-settings";
import { MAX_USER_MESSAGE_CHARS } from "@/lib/chat-limits";
import { formatQuote } from "@/lib/quote-display";

export interface AskVerse {
  bookName: string;
  chapter: number;
  verseNumber: number;
  verseText: string;
}

type AskState = ReturnType<typeof useAskState>;
const AskContext = createContext<AskState | null>(null);

function useAsk(): AskState {
  const state = useContext(AskContext);
  if (!state) throw new Error("Ask parts must be inside AskProvider");
  return state;
}

function useAskState({ bookName, chapter, verseNumber, verseText }: AskVerse) {
  const { translation } = usePreferences();
  const { buyCredits } = useSession();
  const reference = `${bookName} ${chapter}:${verseNumber}`;
  // The answering model is the default unless Advanced overrides it.
  const { answeringModel } = useAdvancedSettings();
  const chat = usePaidChat({
    id: `ask-${reference}`.toLowerCase().replace(/[\s:]+/g, "-"),
    model: answeringModel,
    passage: { book: bookName, chapter, verseRange: String(verseNumber) },
    translation,
  });
  const layer = useLayer("ask");
  const [input, setInput] = useState("");
  const footField = useRef<HTMLInputElement>(null);
  const analytics = { tier: chat.tier, hasCredits: chat.credits > 0 };

  /** Turn the words page over. Focus returns to `opener` when it turns back. */
  const openAsk = (source: AskOpenSource, opener: HTMLElement | null) => {
    if (layer.isOpen) return;
    layer.open(opener);
    trackAskOpened({ source, ...analytics });
  };

  /**
   * Send a question, from the words page's foot or its turned-over side. A balance that cannot cover the quote opens
   * the credits dialog instead and leaves the question in the field, unsent.
   */
  const ask = (text: string, source: "suggestion" | "field", from: "words_page" | "ask_page") => {
    const question = text.trim();
    if (!question) return;
    if (chat.isLoading) {
      // One answer at a time: show the one being written and keep this question for after it.
      setInput(text);
      if (from === "words_page") openAsk("words_page", footField.current);
      return;
    }
    if (!chat.canSend) {
      setInput(text);
      trackCreditsInsufficient({ feature: "chat", source: "ask_submit", requiredCredits: chat.quote?.maximumCredits ?? 1, ...analytics });
      buyCredits();
      return;
    }
    chat.send(question);
    trackAskQuestionSent({ source, messageCount: chat.messages.length + 1, ...analytics });
    setInput("");
    if (from === "words_page") openAsk("words_page", footField.current);
  };

  // Two questions about the verse on screen. From the chapter's second verse one is always a summary of the chapter so
  // far, which the server answers from the chapter's text up to this verse.
  const suggestions = [
    `What does ${reference} mean?`,
    verseNumber > 1 ? `Summarize ${bookName} ${chapter} so far` : `What is the historical context of ${reference}?`,
  ];

  return { reference, verseText, chat, answeringModel, input, setInput, ask, openAsk, footField, suggestions, close: layer.close };
}

/**
 * Ask for one verse: the conversation, the question being typed and the turned-over words page. It lasts while the
 * reader stays on the verse; give it `key` = the verse so a page turn clears it. Nothing is saved.
 */
export function AskProvider({ verse, children }: { verse: AskVerse; children: ReactNode }) {
  const state = useAskState(verse);
  const { closeLayer } = useLayers();
  // Leaving the verse ends its conversation, so its turned-over page closes too.
  useEffect(() => () => closeLayer("ask"), [closeLayer]);
  return <AskContext.Provider value={state}>{children}</AskContext.Provider>;
}

/** The foot of the words page on a computer: two suggested questions and a field. Sending turns the page over. */
export function AskFoot() {
  const { reference, suggestions, ask, footField } = useAsk();
  return (
    <section aria-label="Ask about this verse" className="hidden shrink-0 border-t border-white/10 pt-5 md:mx-12 md:block lg:mx-14">
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/55">
        <Sparkles size={12} strokeWidth={1.75} aria-hidden="true" />
        Ask about this verse
      </p>
      <ul className="mt-2.5 flex flex-col items-start gap-1.5">
        {suggestions.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => ask(question, "suggestion", "words_page")}
              className="rounded text-left font-serif text-lg italic text-white/80 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
      <AskForm from="words_page" fieldRef={footField} label={`Ask about ${reference}`} placeholder="Ask your own question…" className="mt-4" />
    </section>
  );
}

/** The phone dock's way into Ask: it turns the words page over to the suggestions and the field. */
export function AskDockButton() {
  const { openAsk } = useAsk();
  return (
    <button
      type="button"
      onClick={(event) => openAsk("dock", event.currentTarget)}
      className="flex min-h-11 flex-1 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white/90 transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white/70"
    >
      <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
      Ask a question…
    </button>
  );
}

// The shared markdown renderer reads the site's colour variables; the spread is dark whatever the system says.
const DARK_TEXT = { "--foreground": "rgba(255,255,255,0.9)", "--muted": "rgba(255,255,255,0.55)", "--surface": "rgba(255,255,255,0.07)", "--divider": "rgba(255,255,255,0.12)", "--accent": "#9ec5ff" } as CSSProperties;

/**
 * The other side of the words page: the verse as a short quote, the conversation, the field and "Back to the verse".
 * A layer, so Escape also turns it back and focus returns to the control that opened it.
 */
export function AskPage() {
  const { reference, verseText, chat, answeringModel, suggestions, ask, close } = useAsk();
  const { messages, isLoading, error, tier, credits } = chat;
  const conversation = useRef<HTMLDivElement>(null);
  const lastTrackedError = useRef<string | null>(null);
  const waiting = isLoading && messages[messages.length - 1]?.role !== "assistant";

  // Keep the newest words in view while an answer streams in.
  const lastText = messages[messages.length - 1]?.parts.map((part) => part.text ?? "").join("");
  useEffect(() => {
    const node = conversation.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, lastText, waiting]);

  useEffect(() => {
    const errorType = error ? resolveChatErrorType(error) : null;
    const key = error && errorType ? `${errorType}:${error.message}` : null;
    if (key === lastTrackedError.current) return;
    lastTrackedError.current = key;
    if (errorType) trackChatErrorShown({ variant: "ask", chatModel: answeringModel, errorType, hasContext: true, tier, hasCredits: credits > 0 });
  }, [error, answeringModel, tier, credits]);

  return (
    <LayerPanel
      id="ask"
      label={`Ask about ${reference}`}
      className="absolute inset-0 z-20 flex flex-col bg-[#0b0b0c] outline-none md:bg-[#0d0d0f]"
    >
      <div data-ask-page style={DARK_TEXT} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 px-4 pt-3 md:px-12 md:pt-12 lg:px-14">
          <button
            type="button"
            onClick={close}
            className="-ml-1 flex min-h-11 items-center gap-1 rounded-full pr-2 text-sm text-white/75 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white/70"
          >
            <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            Back to the verse
          </button>
          <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/55">{reference}</span>
        </div>
        <blockquote className="mx-4 line-clamp-3 border-b border-white/10 pt-1 pb-4 font-serif text-lg leading-snug text-white/70 md:mx-12 md:pt-3 md:pb-6 md:text-xl lg:mx-14">
          {verseText}
        </blockquote>

        <div ref={conversation} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-12 md:py-6 lg:px-14">
          {messages.length === 0 && !isLoading ? (
            <div>
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/55">
                <Sparkles size={12} strokeWidth={1.75} aria-hidden="true" />
                Ask about this verse
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {suggestions.map((question) => (
                  <li key={question}>
                    <button
                      type="button"
                      onClick={() => ask(question, "suggestion", "ask_page")}
                      className="w-full rounded-2xl bg-white/[0.06] px-4 py-3 text-left text-[15px] text-white/85 ring-1 ring-white/10 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white/70"
                    >
                      {question}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="flex flex-col gap-5" aria-live="polite">
              {messages.map((message) => {
                const text = message.parts.map((part) => (part.type === "text" ? part.text ?? "" : "")).join("");
                if (message.role === "user") {
                  return (
                    <li key={message.id} data-turn="user" className="max-w-[85%] self-end rounded-2xl bg-white/[0.12] px-4 py-2.5 text-[15px] text-white">
                      {text}
                    </li>
                  );
                }
                return (
                  <li key={message.id} data-turn="assistant" className="text-white/90 [&_p:last-child]:mb-0">
                    <MarkdownRenderer content={text} />
                    {message.metadata?.incomplete && <p className="mt-2 text-xs text-white/50">The answer was cut short at the length limit.</p>}
                    {(message.metadata?.earlierMessagesOmitted ?? 0) > 0 && (
                      <p className="mt-2 text-xs text-white/50">The conversation is long, so its earliest messages were not sent with this question.</p>
                    )}
                  </li>
                );
              })}
              {waiting && (
                <li aria-label="Answering" className="flex gap-1.5 py-2">
                  <span className="size-1.5 animate-bounce rounded-full bg-white/50" />
                  <span className="size-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:0.3s]" />
                </li>
              )}
            </ol>
          )}
          {error && (
            <div role="alert" className="mt-4 rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-300/20">
              {chatErrorMessage(error)}
            </div>
          )}
        </div>

        <AskForm
          from="ask_page"
          label={messages.length > 0 ? `Ask a follow-up about ${reference}` : `Ask about ${reference}`}
          placeholder={messages.length > 0 ? "Ask a follow-up…" : "Ask your own question…"}
          autoFocus
          className="px-4 pb-[max(0.75rem,var(--safe-area-inset-bottom))] md:px-12 md:pb-10 lg:px-14"
        />
      </div>
    </LayerPanel>
  );
}

/** A question field with its send control, which shows the quoted price before sending (admins see none). */
function AskForm({ from, label, placeholder, fieldRef, autoFocus, className }: {
  from: "words_page" | "ask_page";
  label: string;
  placeholder: string;
  fieldRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  className?: string;
}) {
  const { input, setInput, ask, chat } = useAsk();
  const { quote, staleQuote, priceToConfirm, isAdmin, isLoading, confirmPrice } = chat;
  const price = !isAdmin && quote && !staleQuote ? quote : null;

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        ask(input, "field", from);
      }}
    >
      {from === "ask_page" && priceToConfirm && staleQuote && (
        <p role="status" className="mb-2 text-sm text-white/70">
          {priceToConfirm} {formatQuote(staleQuote)}.{" "}
          <button type="button" onClick={confirmPrice} className="font-medium text-white underline underline-offset-2">
            Send at this price
          </button>
        </p>
      )}
      <div className="flex items-center gap-2 rounded-full bg-white/[0.07] py-1.5 pr-1.5 pl-5 ring-1 ring-white/10 focus-within:ring-white/30">
        <input
          ref={fieldRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={MAX_USER_MESSAGE_CHARS}
          aria-label={label}
          placeholder={placeholder}
          data-autofocus={autoFocus || undefined}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-white placeholder:text-white/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          aria-label={price ? `Send question · ${formatQuote(price)}` : "Send question"}
          title={price ? `${formatQuote(price)} per question` : undefined}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white pr-1 pl-1 text-xs font-medium text-black transition-opacity disabled:opacity-40 data-[price]:pl-3"
          data-price={price ? "" : undefined}
        >
          {price && <span className="tabular-nums">{price.estimateCredits} {price.estimateCredits === 1 ? "credit" : "credits"}</span>}
          <span className="flex size-7 items-center justify-center">
            <ArrowUp size={16} strokeWidth={2.25} aria-hidden="true" />
          </span>
        </button>
      </div>
    </form>
  );
}
