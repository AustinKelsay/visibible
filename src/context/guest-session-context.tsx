"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

interface GuestSessionContextType {
  sid: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  buyCredits: () => void;
  /** Open the credits dialog at its welcome step. The welcome opens only this way, never by itself. */
  showWelcome: () => void;
  isBuyModalOpen: boolean;
  /** Whether the open credits dialog was asked to start at the welcome. */
  welcomeRequested: boolean;
  closeBuyModal: () => void;
}

const GuestSessionContext = createContext<GuestSessionContextType | null>(null);

interface SessionResponse {
  sid: string | null;
  tier: "paid" | "admin";
  credits: number;
  status?: "missing" | "invalid";
  invalidReason?: "expired" | "invalid" | "not_found";
}

export function GuestSessionProvider({ children }: { children: ReactNode }) {
  const [sid, setSid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [welcomeRequested, setWelcomeRequested] = useState(false);

  const fetchSession = useCallback(async () => {
    try {
      setError(null);

      // First, try to get existing session
      const getResponse = await fetch("/api/session");
      if (!getResponse.ok) {
        throw new Error("Failed to fetch session");
      }

      const data: SessionResponse = await getResponse.json();

      // If no session exists, create one
      if (!data.sid) {
        if (data.status === "invalid") {
          const invalidReasonMessage =
            data.invalidReason === "expired"
              ? "Your previous session expired. Its balance record is kept on our server. Reload to start a new session, then use balance recovery for earlier credits."
              : "Your previous session could not be restored. Reload to start a new session, then use balance recovery for earlier credits.";
          setSid(null);

          setError(invalidReasonMessage);
          return;
        }

        const postResponse = await fetch("/api/session", { method: "POST" });
        if (!postResponse.ok) {
          throw new Error("Failed to create session");
        }
        const newData: SessionResponse = await postResponse.json();
        setSid(newData.sid);
        // A new visitor lands on the page; the credits dialog opens only when asked for.
      } else {
        setSid(data.sid);
      }
    } catch (err) {
      console.error("Session error:", err);
      setError(err instanceof Error ? err.message : "Session error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch session on mount
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const refetch = useCallback(async () => {
    // Background activity renewal must not reset established Convex authentication.
    await fetchSession();
  }, [fetchSession]);

  const buyCredits = useCallback(() => {
    setWelcomeRequested(false);
    setIsBuyModalOpen(true);
  }, []);

  const showWelcome = useCallback(() => {
    setWelcomeRequested(true);
    setIsBuyModalOpen(true);
  }, []);

  const closeBuyModal = useCallback(() => {
    setIsBuyModalOpen(false);
    setWelcomeRequested(false);
  }, []);

  return (
    <GuestSessionContext.Provider
      value={{
        sid,
        isLoading,
        error,
        refetch,
        buyCredits,
        showWelcome,
        isBuyModalOpen,
        welcomeRequested,
        closeBuyModal,
      }}
    >
      {children}
    </GuestSessionContext.Provider>
  );
}

export function useGuestSession() {
  const context = useContext(GuestSessionContext);
  if (!context) {
    throw new Error("useGuestSession must be used within GuestSessionProvider");
  }
  return context;
}
