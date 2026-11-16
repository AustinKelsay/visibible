"use client";

import { useMemo, useRef, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { useLayers } from "@/components/spread/layers";
import type { TrackPageTurn } from "@/components/spread/page-turn";

/** How far a finger must travel sideways to turn the page. */
export const SWIPE_DISTANCE_PX = 56;
/** Movement before a touch counts as a direction; the first direction past it decides scroll or swipe. */
const DECIDE_AFTER_PX = 10;

interface SwipeTurnOptions {
  prevUrl?: string;
  nextUrl?: string;
  onTurn: TrackPageTurn;
}

type Gesture = { x: number; y: number; axis: "undecided" | "horizontal" | "vertical" | "cancelled" };

/**
 * Turns the page with a one-finger horizontal swipe on the spread: leftward for the next verse, rightward
 * for the previous one. A touch that first moves up or down is a scroll and never turns the page, so a long
 * verse still scrolls. Nothing turns while a layer other than the whole-picture view is open, or when the
 * touch starts in a text field. Spread the returned handlers onto the spread's root element.
 */
export function useSwipeTurn({ prevUrl, nextUrl, onTurn }: SwipeTurnOptions) {
  const router = useRouter();
  const { openLayer } = useLayers();
  const gesture = useRef<Gesture | null>(null);

  return useMemo(() => {
    const blocked = openLayer !== null && openLayer !== "whole-picture";
    return {
      onTouchStart(event: TouchEvent) {
        const point = event.touches[0];
        if (blocked || event.touches.length !== 1 || !point || startsInField(event.target)) {
          gesture.current = null;
          return;
        }
        gesture.current = { x: point.clientX, y: point.clientY, axis: "undecided" };
      },
      onTouchMove(event: TouchEvent) {
        const current = gesture.current;
        const point = event.touches[0];
        if (!current || !point) return;
        if (event.touches.length !== 1) {
          current.axis = "cancelled";
          return;
        }
        if (current.axis !== "undecided") return;
        const dx = Math.abs(point.clientX - current.x);
        const dy = Math.abs(point.clientY - current.y);
        if (Math.max(dx, dy) < DECIDE_AFTER_PX) return;
        current.axis = dx > dy ? "horizontal" : "vertical";
      },
      onTouchEnd(event: TouchEvent) {
        const current = gesture.current;
        gesture.current = null;
        const point = event.changedTouches[0];
        if (!current || !point || current.axis !== "horizontal" || event.touches.length > 0) return;
        const dx = point.clientX - current.x;
        const dy = point.clientY - current.y;
        if (Math.abs(dx) < SWIPE_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        const direction = dx < 0 ? "next" : "prev";
        const targetUrl = direction === "next" ? nextUrl : prevUrl;
        if (!targetUrl) return;
        onTurn(direction, "swipe");
        router.push(targetUrl);
      },
      onTouchCancel() {
        gesture.current = null;
      },
    };
  }, [openLayer, prevUrl, nextUrl, onTurn, router]);
}

function startsInField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'));
}
