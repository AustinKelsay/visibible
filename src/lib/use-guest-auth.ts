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
  // Convex follows a fetch with no token with one forced fetch, and when that fails too it signs the page out and
  // never retries by itself: only a new fetchAccessToken starts another sign-in. So a failed sign-in of the current
  // session is tried again when the reader returns, and on a timer that backs off while it keeps failing (#574).
  // A healthy sign-in sends nothing extra.
  const failure = useRef({
    /** Failed sign-ins in a row, which set the timer's delay. */
    count: 0,
    /** The last sign-in failed and no retry has started since. */
    waiting: false,
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  /** The attempt a reply must belong to for its outcome to count; -1 while a new attempt is being applied. */
  const latestEpoch = useRef(connectionEpoch);
  useLayoutEffect(() => { latestEpoch.current = connectionEpoch; }, [connectionEpoch]);
  const clearRetryTimer = useCallback(() => {
    if (failure.current.timer !== null) clearTimeout(failure.current.timer);
    failure.current.timer = null;
  }, []);
  /** A new attempt: it takes the place of any retry waiting, and the old attempt's replies stop counting at once. */
  const startNewSignIn = useCallback(() => {
    failure.current.waiting = false;
    clearRetryTimer();
    latestEpoch.current = -1;
    setConnectionEpoch((epoch) => epoch + 1);
  }, [clearRetryTimer]);
  /** Starts one new sign-in after a failed one, unless one has started since. */
  const retryFailedSignIn = useCallback(() => {
    if (failure.current.waiting) startNewSignIn();
  }, [startNewSignIn]);
  useEffect(() => {
    // Focus is user activity: renew the HTTP session/CSRF cookie normally. A failed sign-in is retried after that,
    // since after a long absence the token request needs the renewed CSRF cookie: its timer is held back meanwhile
    // (to the cap, should the refresh stall), and the backoff starts over now the reader is back.
    const onFocus = () => {
      if (failure.current.waiting) {
        clearRetryTimer();
        failure.current.timer = setTimeout(retryFailedSignIn, RETRY_MAX_MS);
      }
      failure.current.count = 0;
      void refetch().finally(retryFailedSignIn);
    };
    // A network reconnect only retries bearer acquisition; it does not renew
    // the underlying cookie's idle deadline.
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", startNewSignIn);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", startNewSignIn);
    };
  }, [refetch, clearRetryTimer, startNewSignIn, retryFailedSignIn]);
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
  const pending = useRef<{ sid: string; epoch: number; promise: Promise<string | null> } | null>(null);
  const fetchAccessToken = useCallback(async ({ forceRefreshToken }: { forceRefreshToken?: boolean } = {}) => {
    if (!sid) return null;
    if (pending.current?.sid === sid && pending.current.epoch === connectionEpoch) return pending.current.promise;
    const promise = (async () => {
      const token = await requestGuestToken();
      // A reply for a session no longer shown is discarded, and is no failure of the current one.
      if (latestSid.current !== sid) return null;
      // A superseded attempt's reply is ignored by Convex, so it says nothing about the current sign-in.
      if (latestEpoch.current !== connectionEpoch) return token;
      // Convex asks again, forced, before it gives up: only that fetch's failure is a failed sign-in.
      if (token === null && !forceRefreshToken) return null;
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
