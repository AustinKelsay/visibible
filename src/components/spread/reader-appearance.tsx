"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { READER_SETTINGS_KEY, isAdvancedSettingOffered, readAdvancedSettings, useAdvancedSettings } from "@/lib/advanced-settings";

/** Set on `<html>` while the reader is drawn light; globals.css turns the reader's surfaces light under it. */
export const READER_APPEARANCE_ATTRIBUTE = "data-reader-appearance";

/**
 * Runs while the page is still being read, before the reader is painted: it reads the stored appearance (the same
 * record and value `advanced-settings.ts` reads), resolves "follow the system", and marks the document. A light
 * reader therefore never paints dark first, and a dark one never paints light.
 */
const BEFORE_FIRST_PAINT = `(function(){try{var r=JSON.parse(localStorage.getItem(${JSON.stringify(READER_SETTINGS_KEY)})||"null");var a=r&&r.advanced&&r.advanced.appearance;if(a==="system")a=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";if(a==="light")document.documentElement.setAttribute("${READER_APPEARANCE_ATTRIBUTE}","light")}catch(e){}})()`;

const noSubscription = () => () => {};

function prefersLight(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: light)") : null;
}

/**
 * Draws the reader in the appearance chosen in Advanced: dark unless the reader chose light, or follows a system set
 * to light. The choice is read from `useAdvancedSettings`, so with the Appearance item cut the reader is dark.
 * Rendered first in the spread: in the server's page it carries the script that applies the choice before the first
 * paint; after that it follows changes to the choice and, for "follow the system", to the system setting.
 */
export function ReaderAppearance() {
  const { appearance } = useAdvancedSettings();
  // True only in the server's page and while it is hydrated: a script React adds later never runs.
  const fromServer = useSyncExternalStore(noSubscription, () => false, () => true);

  useLayoutEffect(() => {
    // Read the choice itself: while the page hydrates the hook still answers the server's default.
    const chosen = readAdvancedSettings().appearance;
    const system = chosen === "system" ? prefersLight() : null;
    const apply = () => {
      const light = chosen === "light" || (system?.matches ?? false);
      if (light) document.documentElement.setAttribute(READER_APPEARANCE_ATTRIBUTE, "light");
      else document.documentElement.removeAttribute(READER_APPEARANCE_ATTRIBUTE);
    };
    apply();
    system?.addEventListener("change", apply);
    return () => system?.removeEventListener("change", apply);
  }, [appearance]);

  // Leaving the reader: the rest of the site follows the system, as before.
  useLayoutEffect(() => () => document.documentElement.removeAttribute(READER_APPEARANCE_ATTRIBUTE), []);

  return fromServer && isAdvancedSettingOffered("appearance") ? <script dangerouslySetInnerHTML={{ __html: BEFORE_FIRST_PAINT }} /> : null;
}
