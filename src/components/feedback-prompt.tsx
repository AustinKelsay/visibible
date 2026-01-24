"use client";

import { X, MessageCircleHeart } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigation } from "@/context/navigation-context";

const STORAGE_KEY = "visibible_feedback_prompt";
const MIN_VISITS_BEFORE_SHOW = 5; // Minimum verse visits before showing
const MAX_VISITS_BEFORE_SHOW = 15; // Maximum verse visits before showing
const COOLDOWN_HOURS = 24; // Hours to wait after dismissal before showing again

interface FeedbackPromptState {
  lastDismissed: number | null;
  visitCount: number;
  showAtVisit: number;
}

function getStoredState(): FeedbackPromptState {
  if (typeof window === "undefined") {
    return { lastDismissed: null, visitCount: 0, showAtVisit: getRandomVisitThreshold() };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore localStorage errors
  }
  return { lastDismissed: null, visitCount: 0, showAtVisit: getRandomVisitThreshold() };
}

function saveState(state: FeedbackPromptState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore localStorage errors
  }
}

function getRandomVisitThreshold(): number {
  return Math.floor(Math.random() * (MAX_VISITS_BEFORE_SHOW - MIN_VISITS_BEFORE_SHOW + 1)) + MIN_VISITS_BEFORE_SHOW;
}

function isCooldownActive(lastDismissed: number | null): boolean {
  if (!lastDismissed) return false;
  const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;
  return Date.now() - lastDismissed < cooldownMs;
}

/**
 * Feedback prompt CTA that appears occasionally to ask for user feedback.
 * Shows after a random number of verse visits (5-15) and respects a 24-hour cooldown.
 * Positioned above the ChatPrompt near the FAB.
 */
export function FeedbackPrompt() {
  const { isChatOpen, chatContext, openFeedback } = useNavigation();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [promptState, setPromptState] = useState<FeedbackPromptState>(() => getStoredState());
  const hasReachedThreshold =
    !isCooldownActive(promptState.lastDismissed) && promptState.visitCount >= promptState.showAtVisit;
  const lastContextKeyRef = useRef<string>("");
  const showTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track verse visits and determine when to show
  useEffect(() => {
    if (!chatContext) return;

    const currentContextKey = `${chatContext.book}-${chatContext.chapter}-${chatContext.verseRange}`;

    // Only count if this is a new verse (not initial load of same verse)
    if (currentContextKey !== lastContextKeyRef.current && lastContextKeyRef.current !== "") {
      // Defer state update to avoid synchronous setState in effect
      requestAnimationFrame(() => {
        setPromptState((prev) => {
          const nextState = { ...prev, visitCount: prev.visitCount + 1 };
          saveState(nextState);
          return nextState;
        });
      });
    }

    lastContextKeyRef.current = currentContextKey;
  }, [chatContext?.book, chatContext?.chapter, chatContext?.verseRange, chatContext]);

  // Show/hide logic - now depends on hasReachedThreshold
  useEffect(() => {
    /**
     * Determines if the prompt should be shown based on current state.
     */
    function checkShouldShow(): boolean {
      // Don't show if sidebar is open or already dismissed this session
      if (isChatOpen || isDismissed) {
        return false;
      }
      // Don't show if threshold not reached
      if (!hasReachedThreshold) {
        return false;
      }
      return true;
    }

    // Hide immediately if we shouldn't show
    if (!checkShouldShow()) {
      requestAnimationFrame(() => {
        setIsVisible(false);
      });
      return () => {
        // Clear any existing timers
        if (showTimerRef.current) {
          clearTimeout(showTimerRef.current);
          showTimerRef.current = null;
        }
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = null;
        }
      };
    }

    // Show prompt after a delay (longer than ChatPrompt to avoid overlap)
    showTimerRef.current = setTimeout(() => {
      setIsVisible(true);
      // Start auto-dismiss timer only after we've actually shown the prompt
      dismissTimerRef.current = setTimeout(() => {
        setIsVisible(false);
        setIsDismissed(true);
      }, 8000); // 8 seconds visible
    }, 2000); // 2 second delay (ChatPrompt shows at 500ms)

    return () => {
      // Clear both timers on cleanup
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [isChatOpen, isDismissed, hasReachedThreshold]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
    setIsDismissed(true);

    // Update stored state with dismissal time and reset visit count
    setPromptState((prev) => {
      const nextState = {
        ...prev,
        lastDismissed: Date.now(),
        visitCount: 0,
        showAtVisit: getRandomVisitThreshold(),
      };
      saveState(nextState);
      return nextState;
    });
  };

  const handleClick = () => {
    openFeedback();
    setIsVisible(false);
    setIsDismissed(true);

    // Update stored state
    setPromptState((prev) => {
      const nextState = {
        ...prev,
        lastDismissed: Date.now(),
        visitCount: 0,
        showAtVisit: getRandomVisitThreshold(),
      };
      saveState(nextState);
      return nextState;
    });
  };

  // Don't render if sidebar is open or dismissed
  if (isChatOpen || isDismissed) return null;

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
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      className={`
        fixed z-30
        bottom-[160px] right-6
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
      aria-label="Share your feedback"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <MessageCircleHeart
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-[var(--accent)]"
          />
          <span className="leading-relaxed">Have feedback? We&apos;d love to hear from you!</span>
        </div>
        <button
          onClick={handleDismiss}
          className="
            shrink-0 min-h-[20px] min-w-[20px]
            flex items-center justify-center
            text-[var(--muted)] hover:text-[var(--foreground)]
            transition-colors duration-[var(--motion-fast)]
          "
          aria-label="Dismiss prompt"
          title="Dismiss"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
