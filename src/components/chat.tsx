"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import { ChevronUp, Loader2, Send } from "lucide-react";

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
};

export function Chat({ context }: ChatProps) {
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const requestBody = context ? { context } : undefined;

  const isLoading = status === "streaming" || status === "submitted";
  const hasMessages = messages.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(
      { text: input },
      requestBody ? { body: requestBody } : undefined
    );
    setInput("");
    setIsExpanded(true);
  };

  return (
    <section className="border-t border-[var(--divider)] bg-[var(--background)]">
      {/* Expandable Messages Area */}
      {(hasMessages || isLoading) && (
        <div
          className={`overflow-hidden transition-all duration-[var(--motion-base)] ease-out ${
            isExpanded ? "max-h-[50vh]" : "max-h-0"
          }`}
        >
          <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 overflow-y-auto max-h-[50vh]">
            {messages.map((message) => (
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
                    part.type === "text" ? (
                      <p key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed">
                        {part.text}
                      </p>
                    ) : null
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
              <div className="text-[var(--error)] text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded-[var(--radius-md)]">
                {error.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle Button (when messages exist) */}
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

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className="max-w-2xl mx-auto flex gap-3 p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this passage..."
          aria-label="Ask about this scripture"
          className="flex-1 min-h-[44px] px-4 py-2 bg-[var(--surface)] border border-[var(--divider)] rounded-[var(--radius-full)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-shadow duration-[var(--motion-fast)]"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="min-h-[44px] min-w-[44px] px-5 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[var(--motion-fast)] active:scale-[0.98]"
        >
          {isLoading ? (
            <Loader2 size={20} strokeWidth={2} className="animate-spin mx-auto" />
          ) : (
            <Send size={20} strokeWidth={2} className="mx-auto" />
          )}
        </button>
      </form>
    </section>
  );
}
