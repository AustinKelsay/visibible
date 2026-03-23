"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/context/session-context";
import {
  trackContentEngaged,
  trackDefaultViewExposed,
  trackPreferenceChanged,
  type PreferenceChangeSource,
} from "@/lib/analytics";
import {
  buildViewOverrideCookieString,
  readLegacyChapterGalleryPreference,
  syncLegacyChapterGalleryPreference,
  type VerseViewEngagementTrigger,
  type VerseViewValue,
} from "@/lib/verse-view";

interface VerseViewContextType {
  assignedView: VerseViewValue;
  overrideView: VerseViewValue | null;
  effectiveView: VerseViewValue;
  isExperimentEligible: boolean;
  isSettled: boolean;
  setEffectiveView: (view: VerseViewValue, source: PreferenceChangeSource) => void;
  markEngaged: (trigger: VerseViewEngagementTrigger) => void;
}

interface VerseViewProviderProps {
  assignedView: VerseViewValue;
  initialOverrideView: VerseViewValue | null;
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new";
  children: ReactNode;
}

interface PendingEngagement {
  trigger: VerseViewEngagementTrigger;
  activeView: VerseViewValue;
}

const VerseViewContext = createContext<VerseViewContextType | null>(null);

function persistOverrideCookie(view: VerseViewValue) {
  document.cookie = buildViewOverrideCookieString(view);
}

function syncLegacyMirror(view: VerseViewValue) {
  try {
    syncLegacyChapterGalleryPreference(window.localStorage, view);
  } catch {
    // Ignore localStorage errors.
  }
}

export function VerseViewProvider({
  assignedView,
  initialOverrideView,
  book,
  chapter,
  verse,
  testament,
  children,
}: VerseViewProviderProps) {
  const { tier, credits, isLoading: sessionLoading } = useSession();
  const [overrideView, setOverrideView] = useState<VerseViewValue | null>(initialOverrideView);
  const [isExperimentEligible, setIsExperimentEligible] = useState(initialOverrideView === null);
  const [isSettled, setIsSettled] = useState(false);
  const exposureTrackedRef = useRef(false);
  const engagementTrackedRef = useRef(false);
  const pendingEngagementRef = useRef<PendingEngagement | null>(null);
  const effectiveView = overrideView ?? assignedView;

  const flushPendingEngagement = useCallback((pending: PendingEngagement) => {
    pendingEngagementRef.current = null;
    engagementTrackedRef.current = true;

    trackContentEngaged({
      book,
      chapter,
      verse,
      testament,
      trigger: pending.trigger,
      activeView: pending.activeView,
      tier,
      hasCredits: credits > 0,
    });
  }, [book, chapter, credits, testament, tier, verse]);

  useEffect(() => {
    if (initialOverrideView) {
      syncLegacyMirror(initialOverrideView);
      setIsSettled(true);
      return;
    }

    try {
      const migratedView = readLegacyChapterGalleryPreference(window.localStorage);
      if (migratedView) {
        setOverrideView(migratedView);
        setIsExperimentEligible(false);
        persistOverrideCookie(migratedView);
        syncLegacyMirror(migratedView);
      }
    } catch {
      // Ignore migration errors and fall back to the assigned view.
    } finally {
      setIsSettled(true);
    }
  }, [initialOverrideView]);

  useEffect(() => {
    if (sessionLoading || !isSettled || !isExperimentEligible || exposureTrackedRef.current) {
      return;
    }

    exposureTrackedRef.current = true;
    trackDefaultViewExposed({
      book,
      chapter,
      verse,
      testament,
      assignedView,
      tier,
      hasCredits: credits > 0,
    });
  }, [
    assignedView,
    book,
    chapter,
    credits,
    isExperimentEligible,
    isSettled,
    sessionLoading,
    testament,
    tier,
    verse,
  ]);

  useEffect(() => {
    if (
      sessionLoading ||
      !isSettled ||
      !isExperimentEligible ||
      engagementTrackedRef.current ||
      !pendingEngagementRef.current
    ) {
      return;
    }

    const pending = pendingEngagementRef.current;
    flushPendingEngagement(pending);
  }, [
    flushPendingEngagement,
    isExperimentEligible,
    isSettled,
    sessionLoading,
  ]);

  const setEffectiveView = useCallback((
    view: VerseViewValue,
    source: PreferenceChangeSource
  ) => {
    const currentEffectiveView = overrideView ?? assignedView;
    if (currentEffectiveView === view) {
      return;
    }

    persistOverrideCookie(view);
    syncLegacyMirror(view);
    trackPreferenceChanged({
      preference: "chapterGallery",
      value: view === "gallery" ? "enabled" : "disabled",
      source,
      tier,
      hasCredits: credits > 0,
    });
    setOverrideView(view);
  }, [assignedView, credits, overrideView, tier]);

  // We intentionally keep the first qualifying trigger only. Once
  // pendingEngagementRef.current is set, later markEngaged calls are ignored
  // until flushPendingEngagement runs. If sessionLoading is false and the view
  // isSettled/isExperimentEligible, we flush immediately; otherwise we hold the
  // first trigger until those conditions are met. engagementTrackedRef then
  // prevents any later re-reporting for the visit.
  const markEngaged = useCallback((trigger: VerseViewEngagementTrigger) => {
    if (engagementTrackedRef.current) {
      return;
    }

    const nextPending = pendingEngagementRef.current ?? {
      trigger,
      activeView: overrideView ?? assignedView,
    };
    pendingEngagementRef.current = nextPending;

    if (!sessionLoading && isSettled && isExperimentEligible) {
      flushPendingEngagement(nextPending);
    }
  }, [
    assignedView,
    flushPendingEngagement,
    isExperimentEligible,
    isSettled,
    overrideView,
    sessionLoading,
  ]);

  return (
    <VerseViewContext.Provider
      value={{
        assignedView,
        overrideView,
        effectiveView,
        isExperimentEligible,
        isSettled,
        setEffectiveView,
        markEngaged,
      }}
    >
      {children}
    </VerseViewContext.Provider>
  );
}

export function useVerseView() {
  const context = useContext(VerseViewContext);
  if (!context) {
    throw new Error("useVerseView must be used within VerseViewProvider");
  }
  return context;
}

export function useOptionalVerseView() {
  return useContext(VerseViewContext);
}
