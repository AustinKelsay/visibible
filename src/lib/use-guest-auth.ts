"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGuestSession } from "@/context/guest-session-context";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "./csrf-constants";

/** A failed sign-in is tried again after this long, doubling each time it fails again, up to the cap (#574). */
const RETRY_FIRST_MS = 5_000;
const RETRY_MAX_MS = 60_000;

/** Exchanges the session cookie for a Convex bearer token; null when none comes back. */
async function requestGuestToken(): Promise<string | null> {
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
}

/** Convex owns token refresh scheduling. No bearer token is persisted. */
export function useGuestAuth() {
  const { sid, isLoading, refetch } = useGuestSession();
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  // Convex signs the page out after a fetch with no token and never retries by itself: only a new fetchAccessToken
  // starts another sign-in. So a failed sign-in of the current session is tried again when the reader returns, and on
  // a timer that backs off while it keeps failing (#574). A healthy sign-in sends nothing extra.
  const failure = useRef({
    /** Failed sign-ins in a row, which set the timer's delay. */
    count: 0,
    /** The last sign-in failed and no retry has started since. */
    waiting: false,
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  const clearRetryTimer = useCallback(() => {
    if (failure.current.timer !== null) clearTimeout(failure.current.timer);
    failure.current.timer = null;
  }, []);
  /** Starts one new sign-in after a failed one. A return fires both focus and visibility: only the first retries. */
  const retryFailedSignIn = useCallback(() => {
    if (!failure.current.waiting) return;
    failure.current.waiting = false;
    clearRetryTimer();
    setConnectionEpoch((epoch) => epoch + 1);
  }, [clearRetryTimer]);
  useEffect(() => {
    // Focus is user activity: renew the HTTP session/CSRF cookie normally.
    const onFocus = () => { void refetch(); retryFailedSignIn(); };
    // A network reconnect only retries bearer acquisition; it does not renew
    // the underlying cookie's idle deadline.
    const onOnline = () => setConnectionEpoch((epoch) => epoch + 1);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") retryFailedSignIn(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refetch, retryFailedSignIn]);
  const latestSid = useRef(sid);
  useLayoutEffect(() => {
    latestSid.current = sid;
    const state = failure.current;
    return () => {
      latestSid.current = null;
      // Another session, or none: the old one's failures and retry go with it.
      clearRetryTimer();
      state.count = 0;
      state.waiting = false;
    };
  }, [sid, clearRetryTimer]);
  const latestEpoch = useRef(connectionEpoch);
  useLayoutEffect(() => { latestEpoch.current = connectionEpoch; }, [connectionEpoch]);
  const pending = useRef<{ sid: string; epoch: number; promise: Promise<string | null> } | null>(null);
  const fetchAccessToken = useCallback(async () => {
    if (!sid) return null;
    if (pending.current?.sid === sid && pending.current.epoch === connectionEpoch) return pending.current.promise;
    const promise = (async () => {
      const token = await requestGuestToken();
      // A reply for a session no longer shown is discarded, and is no failure of the current one.
      if (latestSid.current !== sid) return null;
      // A superseded attempt's reply is ignored by Convex, so it says nothing about the current sign-in.
      if (latestEpoch.current !== connectionEpoch) return token;
      clearRetryTimer();
      if (token === null) {
        failure.current.count++;
        failure.current.waiting = true;
        const delay = Math.min(RETRY_FIRST_MS * 2 ** (failure.current.count - 1), RETRY_MAX_MS);
        failure.current.timer = setTimeout(retryFailedSignIn, delay);
      } else {
        failure.current.count = 0;
        failure.current.waiting = false;
      }
      return token;
    })();
    pending.current = { sid, epoch: connectionEpoch, promise };
    try { return await promise; }
    finally { if (pending.current?.promise === promise) pending.current = null; }
  }, [sid, connectionEpoch, clearRetryTimer, retryFailedSignIn]);
  return { isLoading, isAuthenticated: Boolean(sid), fetchAccessToken };
}
