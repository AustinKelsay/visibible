"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useMemo, useEffect, useRef, startTransition } from "react";
import { ChevronUp, Loader2, MessageCircle, Send, Zap } from "lucide-react";
import { usePreferences } from "@/context/preferences-context";
import { useSession } from "@/context/session-context";
import { ChatModelSelector } from "./chat-model-selector";
import { ConversationSummary, MessageMetadataDisplay, MessageMetadata } from "./chat-metadata";
import { MarkdownRenderer } from "./markdown-renderer";
import {
  trackChatMessageSent,
  trackCreditsInsufficient,
  trackChatErrorShown,
} from "@/lib/analytics";
import { resolveChatErrorType } from "@/lib/analytics-event-utils";

type VerseContext = {
  number: number;
  text: string;
  reference?: string;
};

type PageContext = {
  book?: string;
  chapter?: number;
  verseRange?: string;
  heroCaption?: string;
  imageTitle?: string;
  verses?: Array<{ number?: number; text?: string }>;
  prevVerse?: VerseContext;
  nextVerse?: VerseContext;
};

type ChatProps = {
  context?: PageContext;
  variant?: "inline" | "sidebar";
};

// Extended message type to include metadata
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Array<{ type: string; text?: string }>;
  metadata?: MessageMetadata;
}

// Get user-friendly error message
function getErrorMessage(error: Error | null): string {
  if (!error) return "";

  const msg = error.message?.toLowerCase() ?? "";

  // Rate limit errors
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("rate-limited")) {
    return "We're experiencing high demand right now. Please wait a moment and try again.";
  }

  // Model unavailable
  if (msg.includes("no endpoints") || msg.includes("temporarily unavailable") || msg.includes("503")) {
    return "This model is temporarily unavailable. Please try a different model or wait a few minutes.";
  }

  // Service busy
  if (msg.includes("retry") || msg.includes("busy") || msg.includes("traffic")) {
    return "The AI service is busy. Please try again in a moment.";
  }

  // Fallback to actual message or generic
  return error.message || "Something went wrong. Please try again.";
}

export function Chat({ context, variant = "inline" }: ChatProps) {
  const { chatModel } = usePreferences();
  const { tier, credits, buyCredits } = useSession();

  const chatId = useMemo(() => {
    if (!context) return `${variant}-global`;
    const book = (context.book ?? "book").replace(/\s+/g, "-");
    const chapter = typeof context.chapter === "number" ? context.chapter : "chapter";
    const verseRange = (context.verseRange ?? "verse").replace(/\s+/g, "-");
    return `${variant}-${book}-${chapter}-${verseRange}`.toLowerCase();
  }, [context, variant]);

  const { messages, sendMessage, status, error } = useChat({ id: chatId });
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const prevChatIdRef = useRef<string>(chatId);
  const lastTrackedErrorKeyRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSidebar = variant === "sidebar";

  // Check if user can send - admin bypasses, otherwise need credits
  const isAdmin = tier === "admin";
  const canSend = isAdmin || credits >= 1;
  const passageLabel = context?.book && typeof context.chapter === "number"
    ? `${context.book} ${context.chapter}${context.verseRange ? `:${context.verseRange}` : ""}`
    : null;
  const starterQuestions = passageLabel
    ? [`What does ${passageLabel} mean?`, `What is the historical context of ${passageLabel}?`, `How does ${passageLabel} fit the rest of the chapter?`]
    : ["What is the main message of the Bible?", "How do the Old and New Testaments fit together?", "Where is a good place to start reading?"];

  // Include both context and model in request body
  const requestBody = {
    ...(context ? { context } : {}),
    model: chatModel,
  };

  const isLoading = status === "streaming" || status === "submitted";
  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (!error) {
      lastTrackedErrorKeyRef.current = null;
      return;
    }

    const errorType = resolveChatErrorType(error);
    if (!errorType) return;

    const errorKey = `${chatId}:${variant}:${chatModel}:${errorType}:${error.message}`;
    if (lastTrackedErrorKeyRef.current === errorKey) return;
    lastTrackedErrorKeyRef.current = errorKey;

    trackChatErrorShown({
      variant,
      chatModel,
      errorType,
      hasContext: Boolean(context),
      tier,
      hasCredits: credits > 0,
    });
  }, [error, chatId, variant, chatModel, context, tier, credits]);

  // Reset state when chatId changes (using startTransition to avoid cascading renders)
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      startTransition(() => {
        setIsExpanded(false);
        setInput("");
      });
    }
  }, [chatId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (!canSend) {
      // Track insufficient credits
      trackCreditsInsufficient({
        feature: "chat",
        source: "chat_submit",
        requiredCredits: 1,
        tier,
        hasCredits: credits > 0,
      });
      return;
    }
    sendMessage({ text: input }, { body: requestBody });
    // Track message sent
    trackChatMessageSent({
      variant,
      chatModel,
      messageCount: messages.length + 1,
      hasContext: Boolean(context),
      tier,
      hasCredits: credits > 0,
    });
    setInput("");
    setIsExpanded(true);
  };

  // Cast messages to include metadata
  const typedMessages = messages as ChatMessage[];

  return (
    <section
      className={
        isSidebar
          ? "flex flex-col h-full bg-[var(--background)]"
          : "border-t border-[var(--divider)] bg-[var(--background)]"
      }
    >
      {/* Messages Area */}
      {isSidebar ? (
        // Sidebar: always visible, flex-1 to fill space
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {typedMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-[var(--radius-lg)] px-4 py-3 ${
                  message.role === "user"
                    ? "bg-[var(--accent)] text-[var(--accent-text)]"
                    : "bg-[var(--surface)] text-[var(--foreground)]"
                }`}
              >
                {message.parts.map((part, i) =>
                  part.type === "text" && part.text ? (
                    <MarkdownRenderer key={i} content={part.text} />
                  ) : null
                )}
                {message.role === "assistant" && (
                  <MessageMetadataDisplay metadata={message.metadata} />
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[var(--surface)] rounded-[var(--radius-lg)] px-4 py-3">
                <div className="flex space-x-1.5">
                  <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce [animation-delay:0.15s]" />
                  <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce [animation-delay:0.3s]" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-[var(--radius-md)]">
              <p className="text-amber-700 dark:text-amber-400 font-medium">
                {getErrorMessage(error)}
              </p>
              <p className="text-amber-600 dark:text-amber-500 text-xs mt-1">
                Try again or select a different model.
              </p>
            </div>
          )}

          {!hasMessages && !isLoading && (
            canSend ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[var(--muted)]">{passageLabel ? `Ask a question about ${passageLabel}` : "Ask a question about Scripture"}</p>
                <div className="mt-4 flex flex-col items-center gap-2">
                  {starterQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => {
                        setInput(question);
                        inputRef.current?.focus();
                      }}
                      className="max-w-full rounded-[var(--radius-full)] border border-[var(--divider)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--divider)] transition-colors duration-[var(--motion-fast)] focus-ring"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto my-8 max-w-xs rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--surface)] p-4 text-center">
                <MessageCircle size={20} strokeWidth={1.5} className="mx-auto text-[var(--accent)]" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-[var(--foreground)]">Chat uses credits</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Add credits to ask questions about {passageLabel ?? "Scripture"}.
                </p>
                <button
                  type="button"
                  onClick={buyCredits}
                  className="mt-3 min-h-[40px] px-4 rounded-[var(--radius-full)] border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)] text-sm font-medium hover:bg-[var(--accent-hover)] md:bg-transparent md:text-[var(--foreground)] md:hover:bg-[var(--accent)]/10 transition-colors duration-[var(--motion-fast)] focus-ring"
                >
                  {/* Solid on phones; outlined on desktop, where the header already has the blue Get Credits button.
                      Foreground text keeps contrast in dark mode. */}
                  Get Credits
                </button>
                <p className="mt-4 text-[11px] uppercase tracking-wider text-[var(--muted)]">You could ask</p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                  {starterQuestions.map((question) => <li key={question}>“{question}”</li>)}
                </ul>
              </div>
            )
          )}
        </div>
      ) : (
        // Inline: expandable messages area
        <>
          {(hasMessages || isLoading) && (
            <div
              className={`overflow-hidden transition-all duration-[var(--motion-base)] ease-out ${
                isExpanded ? "max-h-[50vh]" : "max-h-0"
              }`}
            >
              <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 overflow-y-auto max-h-[50vh]">
                {typedMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-[var(--radius-lg)] px-4 py-3 ${
                        message.role === "user"
                          ? "bg-[var(--accent)] text-[var(--accent-text)]"
                          : "bg-[var(--surface)] text-[var(--foreground)]"
                      }`}
                    >
                      {message.parts.map((part, i) =>
                        part.type === "text" && part.text ? (
                          <MarkdownRenderer key={i} content={part.text} />
                        ) : null
                      )}
                      {message.role === "assistant" && (
                        <MessageMetadataDisplay metadata={message.metadata} />
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[var(--surface)] rounded-[var(--radius-lg)] px-4 py-3">
                      <div className="flex space-x-1.5">
                        <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce [animation-delay:0.15s]" />
                        <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce [animation-delay:0.3s]" />
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="text-sm p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-[var(--radius-md)]">
                    <p className="text-amber-700 dark:text-amber-400 font-medium">
                      {getErrorMessage(error)}
                    </p>
                    <p className="text-amber-600 dark:text-amber-500 text-xs mt-1">
                      Try again or select a different model.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Toggle Button (when messages exist) - inline only */}
          {hasMessages && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center justify-center gap-2 py-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] border-b border-[var(--divider)]"
              aria-label={isExpanded ? "Collapse chat" : "Expand chat"}
            >
              <ChevronUp
                size={16}
                strokeWidth={1.5}
                className={`transition-transform duration-[var(--motion-fast)] ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
              <span className="text-xs uppercase tracking-wider">
                {isExpanded ? "Hide" : "Show"} conversation
              </span>
            </button>
          )}

          {/* Conversation Summary - inline only */}
          <ConversationSummary messages={typedMessages} currentModel={chatModel} />
        </>
      )}

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className={isSidebar ? "shrink-0 p-4 border-t border-[var(--divider)]" : "max-w-2xl mx-auto p-4"}
      >
        {/* Model indicator row with credits */}
        <div className="flex items-center justify-between mb-2">
          <ChatModelSelector variant="indicator" />

          {/* Credits display - only show for non-admins */}
          {tier !== "admin" && (
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="flex items-center gap-1">
                <Zap size={12} />
                {credits} credits
              </span>
            </div>
          )}
        </div>

        {/* Warning banner when can't send */}
        {!canSend && !isAdmin && hasMessages && (
          <div className="mb-2 p-2 bg-[var(--surface)] rounded-[var(--radius-md)] text-sm text-[var(--muted)]">
            Out of credits.{" "}
            <button
              type="button"
              onClick={buyCredits}
              className="font-medium text-[var(--accent)] hover:underline"
            >
              Get Credits
            </button>
          </div>
        )}

        {/* Input and send button */}
        <div className="flex gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!canSend}
            placeholder={!canSend ? "Add credits to chat" : `Ask about ${passageLabel ?? "Scripture"}…`}
            aria-label="Ask about this scripture"
            className="flex-1 min-h-[44px] px-4 py-2 bg-[var(--surface)] border border-[var(--divider)] rounded-[var(--radius-full)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-shadow duration-[var(--motion-fast)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !canSend}
            className="min-h-[44px] min-w-[44px] px-5 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--surface)] disabled:text-[var(--muted)] disabled:border disabled:border-[var(--divider)] disabled:cursor-not-allowed transition-all duration-[var(--motion-fast)] active:scale-[0.98]"
            aria-label="Send message"
            title="Send"
          >
            {isLoading ? (
              <Loader2 size={20} strokeWidth={2} className="animate-spin mx-auto" />
            ) : (
              <Send size={20} strokeWidth={2} className="mx-auto" />
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
