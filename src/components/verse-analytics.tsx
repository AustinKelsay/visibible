"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/context/session-context";
import { trackVerseView } from "@/lib/analytics";

interface VerseAnalyticsProps {
  book: string;
  chapter: number;
  verse: number;
  testament: "old" | "new";
  translation: string;
}

/**
 * Client component that fires verse_view analytics event on mount.
 * Renders nothing - purely for tracking.
 */
export function VerseAnalytics({
  book,
  chapter,
  verse,
  testament,
  translation,
}: VerseAnalyticsProps) {
  const { tier, credits, isLoading } = useSession();
  const lastTrackedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const trackKey = `${book}-${chapter}-${verse}-${testament}-${translation}`;
    if (lastTrackedKeyRef.current === trackKey) return;
    lastTrackedKeyRef.current = trackKey;

    trackVerseView({
      book,
      chapter,
      verse,
      testament,
      translation,
      tier,
      hasCredits: credits > 0,
    });
  }, [book, chapter, verse, testament, translation, tier, credits, isLoading]);

  return null;
}
