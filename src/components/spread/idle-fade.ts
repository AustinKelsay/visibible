"use client";

import { useEffect, useState } from "react";
import { useLayers } from "@/components/spread/layers";

/** How long the spread waits without pointer or keyboard activity before its controls fade. */
export const IDLE_FADE_MS = 3000;

/** The attribute a control carries to fade with the others: `<nav data-fades …>`. */
export const FADES_ATTRIBUTE = "data-fades";

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "focusin", "focusout"] as const;

/**
 * Whether the spread is idle: no pointer or keyboard activity for IDLE_FADE_MS. The spread puts the answer
 * on its root as `data-idle`, and the CSS in globals.css fades every element marked `data-fades` inside it
 * on a computer (768 px and wider). It is never idle while a layer other than the whole-picture view is
 * open or while focus is inside a fading control, and any activity ends it.
 */
export function useIdle(): boolean {
  const { openLayer } = useLayers();
  const [idle, setIdle] = useState(false);
  // Opening or closing a layer counts as activity.
  const [seenLayer, setSeenLayer] = useState(openLayer);
  if (seenLayer !== openLayer) {
    setSeenLayer(openLayer);
    setIdle(false);
  }

  // The whole-picture view is for looking, so its controls fade like the spread's.
  const layerHoldsControls = openLayer !== null && openLayer !== "whole-picture";

  useEffect(() => {
    if (layerHoldsControls) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const focused = document.activeElement;
        // Focus stays put without further events, so a focused control keeps the controls shown until
        // focus leaves it (focusout starts the wait again).
        if (focused instanceof Element && focused.closest(`[${FADES_ATTRIBUTE}]`)) return;
        setIdle(true);
      }, IDLE_FADE_MS);
    };
    const onActivity = () => {
      setIdle(false);
      wait();
    };

    wait();
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { passive: true, capture: true });
    return () => {
      clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, { capture: true });
    };
  }, [layerHoldsControls]);

  return idle;
}
