"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGuestSession } from "@/context/guest-session-context";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "./csrf-constants";

/** Convex owns token refresh scheduling. No bearer token is persisted. */
export function useGuestAuth() {
  const { sid, isLoading, refetch } = useGuestSession();
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  useEffect(() => {
    // Focus is user activity: renew the HTTP session/CSRF cookie normally.
    const onFocus = () => { void refetch(); };
    // A network reconnect only retries bearer acquisition; it does not renew
    // the underlying cookie's idle deadline.
    const onOnline = () => setConnectionEpoch((epoch) => epoch + 1);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [refetch]);
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
        return latestSid.current === sid && typeof result.token === "string" ? result.token : null;
      } catch {
        return null;
      }
    })();
    pending.current = { sid, epoch: connectionEpoch, promise };
    try { return await promise; }
    finally { if (pending.current?.promise === promise) pending.current = null; }
  }, [sid, connectionEpoch]);
  return { isLoading, isAuthenticated: Boolean(sid), fetchAccessToken };
}
