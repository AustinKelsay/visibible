"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useGuestSession } from "./guest-session-context";

type SessionContextType = ReturnType<typeof useGuestSession> & {
  tier: "paid" | "admin";
  credits: number;
  pendingCredits: number;
  accessStatus: "loading" | "ready" | "unavailable";
};
const SessionContext = createContext<SessionContextType | null>(null);

/** UI balances and tier come exclusively from the authenticated subscription. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const guest = useGuestSession();
  const auth = useConvexAuth();
  const wallet = useQuery(api.guestAuth.current, auth.isAuthenticated ? {} : "skip");
  const isLoading = guest.isLoading || auth.isLoading || (auth.isAuthenticated && wallet === undefined);
  const available = auth.isAuthenticated && wallet?.sid === guest.sid && Boolean(wallet);
  const error = guest.error ?? (!isLoading && !available
    ? "Session access is unavailable or expired. Reload to reconnect."
    : null);
  return (
    <SessionContext.Provider value={{
      ...guest,
      sid: available ? guest.sid : null,
      credits: available ? wallet!.credits : 0,
      pendingCredits: available ? wallet!.pendingCredits : 0,
      tier: available && wallet!.tier === "admin" ? "admin" : "paid",
      isLoading,
      error,
      accessStatus: isLoading ? "loading" : available ? "ready" : "unavailable",
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within SessionProvider");
  return context;
}
