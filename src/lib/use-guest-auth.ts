"use client";

import { useCallback, useRef } from "react";
import { useSession } from "@/context/session-context";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "./csrf-constants";

/** Convex owns token refresh scheduling. No bearer token is persisted. */
export function useGuestAuth() {
  const { sid, isLoading } = useSession();
  const latestSid = useRef(sid);
  latestSid.current = sid;
  const pending = useRef<{ sid: string; promise: Promise<string | null> } | null>(null);
  const fetchAccessToken = useCallback(async () => {
    if (!sid) return null;
    if (pending.current?.sid === sid) return pending.current.promise;
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
    pending.current = { sid, promise };
    try { return await promise; }
    finally { if (pending.current?.promise === promise) pending.current = null; }
  }, [sid]);
  return { isLoading, isAuthenticated: Boolean(sid), fetchAccessToken };
}
