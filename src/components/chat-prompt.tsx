"use client";

import { X } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigation } from "@/context/navigation-context";

/**
 * Contextual prompt CTA that appears near the chat FAB.
 * Shows verse-specific prompts like "Ask me about this verse" when context is available.
 * Auto-dismisses after 6 seconds or can be manually dismissed.
 */
export function ChatPrompt() {
  const { isChatOpen, chatContext, openChat } = useNavigation();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Don't show if chat is open or if dismissed
  useEffect(() => {
    if (isChatOpen || isDismissed || !chatContext) {
      setIsVisible(false);
      return;
    }

    // Show prompt after a brief delay (500ms) for better UX
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 500);

    // Auto-dismiss after 6 seconds
    const dismissTimer = setTimeout(() => {
      setIsVisible(false);
      setIsDismissed(true);
    }, 6500);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [isChatOpen, isDismissed, chatContext]);

  // Reset dismissed state when context changes (new verse)
  useEffect(() => {
    setIsDismissed(false);
  }, [chatContext?.book, chatContext?.chapter, chatContext?.verseRange]);

  // Don't render if no context or chat is open
  if (!chatContext || isChatOpen || isDismissed) return null;

  // Generate contextual prompt text
  const getPromptText = () => {
    if (chatContext.verses && chatContext.verses.length > 0) {
      const verse = chatContext.verses[0];
      if (verse.number) {
        return `Ask me about ${chatContext.book} ${chatContext.chapter}:${verse.number}`;
      }
      return `Ask me about this verse`;
    }
    if (chatContext.book && chatContext.chapter) {
      return `Ask me about ${chatContext.book} ${chatContext.chapter}`;
    }
    return "Ask me about this passage";
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
    setIsDismissed(true);
  };

  const handleClick = () => {
    openChat();
    setIsVisible(false);
    setIsDismissed(true);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick();
        }
      }}
      className={`
        fixed z-30
        bottom-[100px] right-6
        md:bottom-6 md:right-[88px]
        max-w-[calc(100vw-3rem)] sm:max-w-[240px] md:max-w-[280px]
        px-3 py-2.5 sm:px-4 sm:py-3
        bg-[var(--surface)] border border-[var(--divider)]
        rounded-[var(--radius-md)] shadow-md
        text-left
        text-xs sm:text-sm text-[var(--foreground)]
        hover:bg-[var(--divider)]
        transition-all duration-[var(--motion-base)] ease-out
        cursor-pointer
        ${isVisible ? "opacity-100 translate-y-0 md:translate-x-0" : "opacity-0 translate-y-4 md:translate-y-0 md:translate-x-4 pointer-events-none"}
      `}
      aria-label={getPromptText()}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex-1 leading-relaxed">{getPromptText()}</span>
        <button
          onClick={handleDismiss}
          className="
            shrink-0 min-h-[20px] min-w-[20px]
            flex items-center justify-center
            text-[var(--muted)] hover:text-[var(--foreground)]
            transition-colors duration-[var(--motion-fast)]
          "
          aria-label="Dismiss prompt"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
