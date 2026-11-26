"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGuestSession } from "@/context/guest-session-context";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "./csrf-constants";

/** A failed sign-in is tried again after this long, doubling each time it fails again, up to the cap (#574). */
const RETRY_FIRST_MS = 5_000;
const RETRY_MAX_MS = 60_000;

/** Convex owns token refresh scheduling. No bearer token is persisted. */
export function useGuestAuth() {
  const { sid, isLoading, refetch } = useGuestSession();
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  // Convex signs the page out after a fetch with no token and never retries by itself: only a new fetchAccessToken
  // starts another sign-in. So a failed fetch is remembered and tried again when the reader returns, and on a timer
  // that backs off while it keeps failing (#574). A healthy sign-in sends nothing extra.
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useCallback(() => {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    setConnectionEpoch((epoch) => epoch + 1);
  }, []);
  useEffect(() => {
    const retryIfFailed = () => { if (failures.current > 0) retry(); };
    // Focus is user activity: renew the HTTP session/CSRF cookie normally.
    const onFocus = () => { void refetch(); retryIfFailed(); };
    // A network reconnect only retries bearer acquisition; it does not renew
    // the underlying cookie's idle deadline.
    const onOnline = () => setConnectionEpoch((epoch) => epoch + 1);
    const onVisible = () => { if (document.visibilityState === "visible") retryIfFailed(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [refetch, retry]);
  const latestSid = useRef(sid);
  useLayoutEffect(() => {
    latestSid.current = sid;
    return () => { latestSid.current = null; };
  }, [sid]);
  const pending = useRef<{ sid: string; epoch: number; promise: Promise<string | null> } | null>(null);
  const fetchAccessToken = useCallback(async () => {
    if (!sid) return null;
    if (pending.current?.sid === sid && pending.current.epoch === connectionEpoch) return pending.current.promise;
    const promise = (async () => {
      const token = await (async () => {
        try {
          const csrf = document.cookie.split("; ").find((part) =>
            part.startsWith(`${CSRF_COOKIE_NAME}=`))?.slice(CSRF_COOKIE_NAME.length + 1);
          const response = await fetch("/api/convex-token", {
            signal: AbortSignal.timeout(10_000),
            method: "POST", credentials: "same-origin", cache: "no-store",
            headers: { [CSRF_HEADER_NAME]: csrf ?? "" },
          });
          if (!response.ok) return null;
          const result = await response.json();
          return typeof result.token === "string" ? result.token : null;
        } catch {
          return null;
        }
      })();
      // A reply for a session no longer shown is discarded, and is no failure of the current one.
      if (latestSid.current !== sid) return null;
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      if (token === null) {
        failures.current++;
        retryTimer.current = setTimeout(retry, Math.min(RETRY_FIRST_MS * 2 ** (failures.current - 1), RETRY_MAX_MS));
      } else {
        failures.current = 0;
      }
      return token;
    })();
    pending.current = { sid, epoch: connectionEpoch, promise };
    try { return await promise; }
    finally { if (pending.current?.promise === promise) pending.current = null; }
  }, [sid, connectionEpoch, retry]);
  return { isLoading, isAuthenticated: Boolean(sid), fetchAccessToken };
}
