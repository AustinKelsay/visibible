"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSession } from "@/context/session-context";
import { trackVerseNavigation, type VerseNavigationSource } from "@/lib/analytics";
import { getVerseNavigationDirection, type VerseNavigationDirection } from "@/lib/verse-keyboard-navigation";

export interface PageTurnTargets {
  bookName: string;
  chapter: number;
  verseNumber: number;
  prevUrl?: string;
  nextUrl?: string;
}

/** Records a turn. `targetUrl` defaults to the previous or next verse; a verse mark passes its own. */
/** The last turn on this tab, so the spread it opens can arrive from the side it was turned towards. */
let lastTurn: { direction: VerseNavigationDirection; targetUrl: string; at: number } | null = null;
const ARRIVAL_WINDOW_MS = 5000;

/**
 * The direction this spread was turned to from the previous one, or null when the reader arrived any other
 * way (a link, a reload, the browser's back button). Read once when the spread mounts.
 */
export function useArrival(url: string): VerseNavigationDirection | null {
  const [arrival] = useState(() =>
    lastTurn && lastTurn.targetUrl === url && Date.now() - lastTurn.at < ARRIVAL_WINDOW_MS ? lastTurn.direction : null,
  );
  return arrival;
}

export type TrackPageTurn = (direction: VerseNavigationDirection, source: VerseNavigationSource, targetUrl?: string) => void;

/**
 * Turns the page with the left and right arrow keys (never while the reader types in a field) and
 * returns the tracker the page's own previous and next controls report through.
 */
export function usePageTurn({ bookName, chapter, verseNumber, prevUrl, nextUrl }: PageTurnTargets): TrackPageTurn {
  const router = useRouter();
  const { tier, credits } = useSession();

  const trackTurn = useCallback<TrackPageTurn>((direction, source, target) => {
    const targetUrl = target ?? (direction === "prev" ? prevUrl : nextUrl);
    if (!targetUrl) return;
    lastTurn = { direction, targetUrl, at: Date.now() };
    trackVerseNavigation({
      book: bookName,
      chapter,
      verse: verseNumber,
      direction,
      source,
      targetUrl,
      tier,
      hasCredits: credits > 0,
    });
  }, [bookName, chapter, verseNumber, prevUrl, nextUrl, tier, credits]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = getVerseNavigationDirection(event);
      const targetUrl = direction === "prev" ? prevUrl : direction === "next" ? nextUrl : undefined;
      if (!direction || !targetUrl) return;
      event.preventDefault();
      trackTurn(direction, "keyboard");
      router.push(targetUrl);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [prevUrl, nextUrl, router, trackTurn]);

  return trackTurn;
}

interface PageTurnLinkProps {
  direction: VerseNavigationDirection;
  href?: string;
  onTurn: TrackPageTurn;
  className?: string;
}

/** Previous or next verse. At either end of the Bible it keeps its place but cannot be used. */
export function PageTurnLink({ direction, href, onTurn, className = "" }: PageTurnLinkProps) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const shape = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${className}`;
  if (!href) {
    return (
      <span aria-hidden="true" className={`${shape} text-white/25`}>
        <Icon size={20} strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={direction === "prev" ? "Previous verse" : "Next verse"}
      onClick={() => onTurn(direction, "dock")}
      className={`${shape} text-white/85 transition-colors duration-[var(--motion-fast)] hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
    >
      <Icon size={20} strokeWidth={1.5} />
    </Link>
  );
}
