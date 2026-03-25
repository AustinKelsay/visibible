"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/context/session-context";
import {
  trackPreferenceChanged,
  type PreferenceChangeSource,
} from "@/lib/analytics";
import type {
  VerseViewEngagementTrigger,
  VerseViewValue,
} from "@/lib/verse-view";

interface VerseViewContextType {
  effectiveView: VerseViewValue;
  isSettled: boolean;
  setEffectiveView: (view: VerseViewValue, source: PreferenceChangeSource) => void;
  markEngaged: (trigger: VerseViewEngagementTrigger) => void;
}

interface VerseViewProviderProps {
  children: ReactNode;
}

const VerseViewContext = createContext<VerseViewContextType | null>(null);

export function VerseViewProvider({ children }: VerseViewProviderProps) {
  const { tier, credits } = useSession();
  const [effectiveView, setEffectiveViewState] = useState<VerseViewValue>("reader");

  const setEffectiveView = useCallback((
    view: VerseViewValue,
    source: PreferenceChangeSource
  ) => {
    setEffectiveViewState((currentView) => {
      if (currentView === view) {
        return currentView;
      }

      trackPreferenceChanged({
        preference: "chapterGallery",
        value: view === "gallery" ? "enabled" : "disabled",
        source,
        tier,
        hasCredits: credits > 0,
      });

      return view;
    });
  }, [credits, tier]);

  const markEngaged = useCallback((trigger: VerseViewEngagementTrigger) => {
    void trigger;
    // Keep the API in place so existing callers do not need to coordinate
    // separate no-op guards now that view-comparison analytics are gone.
  }, []);

  const value = useMemo(() => ({
    effectiveView,
    isSettled: true,
    setEffectiveView,
    markEngaged,
  }), [effectiveView, markEngaged, setEffectiveView]);

  return (
    <VerseViewContext.Provider value={value}>
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
