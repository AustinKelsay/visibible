"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayers } from "@/components/spread/layers";
import { useSession } from "@/context/session-context";
import { useMomentWord } from "@/context/work-scope-context";
import { trackVerseNavigation, type VerseNavigationSource } from "@/lib/analytics";
import { getVerseNavigationDirection, type VerseNavigationDirection } from "@/lib/verse-keyboard-navigation";

export interface PageTurnTargets {
  bookName: string;
  chapter: number;
  verseNumber: number;
  prevUrl?: string;
  nextUrl?: string;
}

/**
 * The last turn on this tab, so the spread it opens can arrive from the side it was turned towards, in
 * the whole-picture view when it was turned from there, and playing its picture's video when Play on turned it.
 */
let lastTurn: { direction: VerseNavigationDirection; targetUrl: string; at: number; wholePicture: boolean; playOn: boolean } | null = null;
const ARRIVAL_WINDOW_MS = 5000;

function turnedTo(url: string) {
  return lastTurn && lastTurn.targetUrl === url && Date.now() - lastTurn.at < ARRIVAL_WINDOW_MS ? lastTurn : null;
}

/**
 * The direction this spread was turned to from the previous one, or null when the reader arrived any other
 * way (a link, a reload, the browser's back button). Read once when the spread mounts.
 */
export function useArrival(url: string): VerseNavigationDirection | null {
  const [arrival] = useState(() => turnedTo(url)?.direction ?? null);
  return arrival;
}

/**
 * Whether this spread was turned to from the whole-picture view, so it opens in that view too. Read once
 * when the spread mounts; arriving any other way opens the spread with its words.
 */
export function useArrivesInWholePicture(url: string): boolean {
  const [whole] = useState(() => turnedTo(url)?.wholePicture ?? false);
  return whole;
}

/** How many turns this tab has recorded, so a spread can tell whether the reader already turned away from it. */
let turnsRecorded = 0;

/**
 * Whether a turn has been recorded since this spread mounted: the reader is already on the way to another spread, so
 * Play on must not turn the page as well when the clip ends before that page arrives.
 */
export function useTurnedAway(): () => boolean {
  const [atMount] = useState(() => turnsRecorded);
  return () => turnsRecorded !== atMount;
}

/** Records that the reader is leaving this spread another way (a Contents tile), so Play on does not turn as well. */
export function noteTurnAway() {
  turnsRecorded += 1;
}

/**
 * Whether Play on turned to this spread at the end of the previous verse's video, so its picture's video starts at
 * once and Play on stays on. Read once when the spread mounts; any other turn arrives on the still picture.
 */
export function useArrivesPlaying(url: string): boolean {
  const [playing] = useState(() => turnedTo(url)?.playOn ?? false);
  return playing;
}

/** Marks the turn just recorded as made by Play on, so the next spread arrives playing. */
export function markPlayOnTurn() {
  if (lastTurn) lastTurn.playOn = true;
}

/** Records a turn. `targetUrl` defaults to the previous or next verse; a verse mark passes its own. */
export type TrackPageTurn = (direction: VerseNavigationDirection, source: VerseNavigationSource, targetUrl?: string) => void;

/**
 * Turns the page with the left and right arrow keys (never while the reader types in a field, or while a
 * layer other than the whole-picture view is open) and
 * returns the tracker the page's own previous and next controls report through.
 */
export function usePageTurn({ bookName, chapter, verseNumber, prevUrl, nextUrl }: PageTurnTargets): TrackPageTurn {
  const router = useRouter();
  const { tier, credits } = useSession();
  const { openLayer } = useLayers();
  const layerBlocksKeys = openLayer !== null && openLayer !== "whole-picture";

  const trackTurn = useCallback<TrackPageTurn>((direction, source, target) => {
    const targetUrl = target ?? (direction === "prev" ? prevUrl : nextUrl);
    if (!targetUrl) return;
    lastTurn = { direction, targetUrl, at: Date.now(), wholePicture: openLayer === "whole-picture", playOn: false };
    turnsRecorded += 1;
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
  }, [bookName, chapter, verseNumber, prevUrl, nextUrl, tier, credits, openLayer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = getVerseNavigationDirection(event);
      const targetUrl = direction === "prev" ? prevUrl : direction === "next" ? nextUrl : undefined;
      if (!direction || !targetUrl || layerBlocksKeys) return;
      event.preventDefault();
      trackTurn(direction, "keyboard");
      router.push(targetUrl);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [prevUrl, nextUrl, router, trackTurn, layerBlocksKeys]);

  return trackTurn;
}

interface PageTurnLinkProps {
  direction: VerseNavigationDirection;
  href?: string;
  onTurn: TrackPageTurn;
  className?: string;
}

/** Previous or next verse (or prose passage). At either end of the book it keeps its place but cannot be used. */
export function PageTurnLink({ direction, href, onTurn, className = "" }: PageTurnLinkProps) {
  const word = useMomentWord();
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const shape = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${className}`;
  if (!href) {
    return (
      <span aria-hidden="true" className={`${shape} text-ink/(--quiet-25)`}>
        <Icon size={20} strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={`${direction === "prev" ? "Previous" : "Next"} ${word}`}
      onClick={() => onTurn(direction, "dock")}
      className={`${shape} text-ink/85 transition-colors duration-[var(--motion-fast)] hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`}
    >
      <Icon size={20} strokeWidth={1.5} />
    </Link>
  );
}
