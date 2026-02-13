"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { DEFAULT_CREDITS_COST } from "@/lib/image-models";

interface SessionContextType {
  sid: string | null;
  tier: "paid" | "admin";
  credits: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateCredits: (newBalance: number) => void;
  buyCredits: () => void;
  isBuyModalOpen: boolean;
  closeBuyModal: () => void;
}

const SessionContext = createContext<SessionContextType | null>(null);

interface SessionResponse {
  sid: string | null;
  tier: "paid" | "admin";
  credits: number;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sid, setSid] = useState<string | null>(null);
  const [tier, setTier] = useState<"paid" | "admin">("paid");
  const [credits, setCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const hasShownOnboardingRef = useRef(false);

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
        const postResponse = await fetch("/api/session", { method: "POST" });
        if (!postResponse.ok) {
          throw new Error("Failed to create session");
        }
        const newData: SessionResponse = await postResponse.json();
        setSid(newData.sid);
        setTier(newData.tier);
        setCredits(newData.credits);
        
        // Check if we should show onboarding for new session
        const hasSeenOnboarding = localStorage.getItem("visibible_onboarding_seen") === "true";
        if (!hasSeenOnboarding && newData.tier !== "admin" && !hasShownOnboardingRef.current) {
          // Small delay to ensure modal renders properly
          setTimeout(() => {
            setIsBuyModalOpen(true);
            localStorage.setItem("visibible_onboarding_seen", "true");
            hasShownOnboardingRef.current = true;
          }, 500);
        }
      } else {
        setSid(data.sid);
        setTier(data.tier);
        setCredits(data.credits);
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
    setIsLoading(true);
    await fetchSession();
  }, [fetchSession]);

  const updateCredits = useCallback((newBalance: number) => {
    setCredits(newBalance);
  }, []);

  const buyCredits = useCallback(() => {
    setIsBuyModalOpen(true);
  }, []);

  const closeBuyModal = useCallback(() => {
    setIsBuyModalOpen(false);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        sid,
        tier,
        credits,
        isLoading,
        error,
        refetch,
        updateCredits,
        buyCredits,
        isBuyModalOpen,
        closeBuyModal,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}

/**
 * Hook to check if user can generate images.
 * Returns true if user has sufficient credits for the given cost.
 * - Admin tier always returns true (unlimited access).
 * - For unpriced models (null cost), requires credits >= DEFAULT_CREDITS_COST.
 * - For priced models, requires credits >= creditsCost (no tier check).
 * Note: HeroImage uses its own inline logic that also checks tier === "paid".
 */
export function useCanGenerate(creditsCost: number | null): boolean {
  const { tier, credits } = useSession();

  // Admin has unlimited access
  if (tier === "admin") return true;

  if (creditsCost === null) {
    // Unpriced model - use default cost to match generation endpoint behavior
    return credits >= DEFAULT_CREDITS_COST;
  }

  // For priced models, check credits regardless of tier
  return credits >= creditsCost;
}
