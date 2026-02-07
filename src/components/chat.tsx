"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useMemo, useEffect, useRef, startTransition } from "react";
import { ChevronUp, Loader2, Send, Zap } from "lucide-react";
import { usePreferences } from "@/context/preferences-context";
import { useSession } from "@/context/session-context";
import { ChatModelSelector } from "./chat-model-selector";
import { ConversationSummary, MessageMetadataDisplay, MessageMetadata } from "./chat-metadata";
import { MarkdownRenderer } from "./markdown-renderer";
import { trackChatMessageSent, trackCreditsInsufficient } from "@/lib/analytics";

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

  const isSidebar = variant === "sidebar";

  // Check if user can send - admin bypasses, otherwise need credits
  const isAdmin = tier === "admin";
  const canSend = isAdmin || credits >= 1;

  // Include both context and model in request body
  const requestBody = {
    ...(context ? { context } : {}),
    model: chatModel,
  };

  const isLoading = status === "streaming" || status === "submitted";
  const hasMessages = messages.length > 0;

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
            <div className="text-center text-[var(--muted)] text-sm py-8">
              Ask a question about this passage
            </div>
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
        {!canSend && !isAdmin && (
          <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md text-sm text-amber-700 dark:text-amber-400">
            Insufficient credits.{" "}
            <button
              type="button"
              onClick={buyCredits}
              className="underline font-medium"
            >
              Purchase credits
            </button>
          </div>
        )}

        {/* Input and send button */}
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!canSend}
            placeholder={!canSend ? "Chat limit reached" : "Ask about this passage..."}
            aria-label="Ask about this scripture"
            className="flex-1 min-h-[44px] px-4 py-2 bg-[var(--surface)] border border-[var(--divider)] rounded-[var(--radius-full)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-shadow duration-[var(--motion-fast)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !canSend}
            className="min-h-[44px] min-w-[44px] px-5 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[var(--motion-fast)] active:scale-[0.98]"
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
