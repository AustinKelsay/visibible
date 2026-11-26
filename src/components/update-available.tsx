"use client";

import { useEffect, useState, type ButtonHTMLAttributes } from "react";
import { RefreshCw } from "lucide-react";

/** How often an open, visible page asks whether a newer version is live. */
export const UPDATE_CHECK_EVERY_MS = 10 * 60_000;
/** Returning to the tab asks too, but never more than once in this long. */
const MIN_CHECK_GAP_MS = 60_000;

/**
 * The deployment this page's code came from: Next.js builds the deployment ID into the client code when one is
 * configured (every Vercel deployment). Not `<html data-dpl-id>`: React drops that attribute when it hydrates
 * `<html>`. Null in local development, where nothing is checked.
 */
function pageVersion(): string | null {
  return process.env.NEXT_DEPLOYMENT_ID || null;
}

/**
 * Whether a newer version of the site is live than the one this page runs: it asks `/api/version` when the tab
 * becomes visible or regains focus, and every few minutes while visible. A failed or empty answer changes nothing.
 * Once it is true it stays true and stops asking.
 */
function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const own = pageVersion();
    if (!own || available) return;

    let lastAsked = 0;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState === "hidden" || Date.now() - lastAsked < MIN_CHECK_GAP_MS) return;
      lastAsked = Date.now();
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const { version } = (await response.json()) as { version?: unknown };
        if (!stopped && typeof version === "string" && version && version !== own) setAvailable(true);
      } catch {
        // Offline or the server is busy: ask again later.
      }
    };

    const timer = setInterval(check, UPDATE_CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [available]);

  return available;
}

/**
 * A small refresh icon that appears only when a newer version of the site is live; tapping it reloads the page. It
 * never reloads on its own. A polite status, mounted from the start so screen readers hear it, says the same. The
 * reader's corner and the site header place and style it.
 */
export function UpdateAvailable(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick" | "children">) {
  const available = useUpdateAvailable();
  return (
    <>
      <span role="status" className="sr-only">{available ? "A newer version of Visibible is available." : ""}</span>
      {available ? (
        <button
          {...props}
          type="button"
          aria-label="Update available. Refresh to update"
          title="Update available. Refresh to update"
          onClick={() => window.location.reload()}
        >
          <span aria-hidden="true" className="relative flex">
            <RefreshCw size={15} strokeWidth={1.75} />
            {/* A notification dot in the icon's own colour: the site has no alert colour. */}
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-current" />
          </span>
        </button>
      ) : null}
    </>
  );
}
