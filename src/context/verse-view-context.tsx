"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/context/session-context";
import {
  trackPreferenceChanged,
  type PreferenceChangeSource,
} from "@/lib/analytics";
import type { VerseViewValue } from "@/lib/verse-view";

interface VerseViewContextType {
  effectiveView: VerseViewValue;
  isSettled: boolean;
  setEffectiveView: (view: VerseViewValue, source: PreferenceChangeSource) => void;
}

interface VerseViewProviderProps {
  children: ReactNode;
}

interface PendingPreferenceChange {
  source: PreferenceChangeSource;
  view: VerseViewValue;
}

interface VerseViewOverride {
  baseView: VerseViewValue;
  view: VerseViewValue;
}

const VerseViewContext = createContext<VerseViewContextType | null>(null);

export function VerseViewProvider({ children }: VerseViewProviderProps) {
  const { tier, credits } = useSession();
  const searchParams = useSearchParams();
  const routeView: VerseViewValue =
    searchParams.get("view") === "video"
      ? "video"
      : searchParams.get("view") === "gallery" ? "gallery" : "reader";
  const [viewOverride, setViewOverride] = useState<VerseViewOverride | null>(null);
  const pendingPreferenceChangeRef = useRef<PendingPreferenceChange | null>(null);
  const effectiveView =
    viewOverride && viewOverride.baseView === routeView
      ? viewOverride.view
      : routeView;

  useEffect(() => {
    const pendingChange = pendingPreferenceChangeRef.current;
    if (!pendingChange || pendingChange.view !== effectiveView) {
      return;
    }

    pendingPreferenceChangeRef.current = null;
    trackPreferenceChanged({
      preference: "chapterGallery",
      value: effectiveView === "gallery" ? "enabled" : "disabled",
      source: pendingChange.source,
      tier,
      hasCredits: credits > 0,
    });
  }, [credits, effectiveView, tier]);

  const setEffectiveView = useCallback((
    view: VerseViewValue,
    source: PreferenceChangeSource
  ) => {
    if (effectiveView === view) {
      return;
    }

    pendingPreferenceChangeRef.current = view === "video" || effectiveView === "video"
      ? null : { source, view };
    setViewOverride(view === routeView ? null : { baseView: routeView, view });
    const url = new URL(window.location.href);
    if (view === "reader") url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [effectiveView, routeView]);

  const value = useMemo(() => ({
    effectiveView,
    isSettled: true,
    setEffectiveView,
  }), [effectiveView, setEffectiveView]);

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
