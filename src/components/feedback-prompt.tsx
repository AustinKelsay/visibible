"use client";

import { X, MessageCircleHeart } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useSession } from "@/context/session-context";
import { trackFeedbackPromptInteraction } from "@/lib/analytics";

const STORAGE_KEY = "visibible_feedback_prompt";
const MIN_VISITS_BEFORE_SHOW = 5; // Minimum verse visits before showing
const MAX_VISITS_BEFORE_SHOW = 15; // Maximum verse visits before showing
const COOLDOWN_HOURS = 24; // Hours to wait after dismissal before showing again

interface FeedbackPromptState {
  lastDismissed: number | null;
  visitCount: number;
  showAtVisit: number;
  /** The page last counted. */
  lastVisitKey?: string;
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

function buildDismissedState(previous: FeedbackPromptState): FeedbackPromptState {
  return {
    ...previous,
    lastDismissed: Date.now(),
    visitCount: 0,
    showAtVisit: getRandomVisitThreshold(),
  };
}

export interface FeedbackPromptProps {
  /** The page being read ("john-1-5"). Each new one counts as a visit. */
  visitKey: string;
  /** Open the feedback form. */
  onOpen: () => void;
  /** Keep the prompt hidden, for example while a layer is open over the page. */
  suppressed?: boolean;
  /** Where it sits. */
  className?: string;
}

/**
 * The occasional "Have feedback?" prompt. It shows after a random number of verse visits (5–15), for 8 seconds, and
 * not again for 24 hours after it is dismissed or used. The reader turns it on in Advanced; it is off by default.
 */
export function FeedbackPrompt({ visitKey, onOpen, suppressed = false, className = "" }: FeedbackPromptProps) {
  const { tier, credits, isLoading } = useSession();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [promptState, setPromptState] = useState<FeedbackPromptState>(() => getStoredState());
  const hasReachedThreshold =
    !isCooldownActive(promptState.lastDismissed) && promptState.visitCount >= promptState.showAtVisit;
  const analytics = useRef({ tier, hasCredits: credits > 0, isLoading });
  useEffect(() => {
    analytics.current = { tier, hasCredits: credits > 0, isLoading };
  });

  // Count a visit each time a new page is read. The last page is stored, so a remount does not count it again.
  useEffect(() => {
    const stored = getStoredState();
    if (stored.lastVisitKey === visitKey) return;
    const nextState = {
      ...stored,
      visitCount: stored.lastVisitKey === undefined ? stored.visitCount : stored.visitCount + 1,
      lastVisitKey: visitKey,
    };
    saveState(nextState);
    // Defer state update to avoid synchronous setState in effect
    requestAnimationFrame(() => setPromptState(nextState));
  }, [visitKey]);

  const track = (action: "shown" | "dismissed" | "clicked") => {
    const { tier, hasCredits, isLoading } = analytics.current;
    if (!isLoading) trackFeedbackPromptInteraction({ action, visitCount: promptState.visitCount, tier, hasCredits });
  };
  const trackRef = useRef(track);
  useEffect(() => {
    trackRef.current = track;
  });

  const finish = () => {
    setIsVisible(false);
    setIsDismissed(true);
    setPromptState((prev) => {
      const nextState = buildDismissedState(prev);
      saveState(nextState);
      return nextState;
    });
  };
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  // Show after a brief delay so it does not compete with the page, then dismiss itself after 8 seconds.
  useEffect(() => {
    if (suppressed || isDismissed || !hasReachedThreshold) {
      requestAnimationFrame(() => setIsVisible(false));
      return;
    }
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;
    const showTimer = setTimeout(() => {
      setIsVisible(true);
      trackRef.current("shown");
      dismissTimer = setTimeout(() => {
        trackRef.current("dismissed");
        finishRef.current();
      }, 8000);
    }, 2000);
    return () => {
      clearTimeout(showTimer);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, [suppressed, isDismissed, hasReachedThreshold]);

  if (suppressed || isDismissed || !isVisible) return null;

  return (
    <div
      role="status"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      className={`z-30 flex max-w-[min(20rem,calc(100vw-1.5rem))] items-center gap-1 rounded-2xl border border-ink/10 bg-reader-glass p-1 text-ink shadow-2xl backdrop-blur-2xl animate-in fade-in duration-[var(--motion-base)] ${className}`}
    >
      <button
        type="button"
        onClick={() => {
          track("clicked");
          onOpen();
          finish();
        }}
        className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink/90 hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-ink"
      >
        <MessageCircleHeart size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
        <span>Have feedback? We&apos;d love to hear from you!</span>
      </button>
      <button
        type="button"
        onClick={() => {
          track("dismissed");
          finish();
        }}
        aria-label="Dismiss prompt"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink/(--quiet-60) hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
