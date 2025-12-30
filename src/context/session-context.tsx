"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { DEFAULT_CREDITS_COST } from "@/lib/image-models";

interface SessionContextType {
  sid: string | null;
  tier: "free" | "paid" | "admin";
  credits: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateCredits: (newBalance: number) => void;
  buyCredits: () => void;
  isBuyModalOpen: boolean;
  closeBuyModal: () => void;
  isOnboardingOpen: boolean;
  openOnboarding: () => void;
  closeOnboarding: () => void;
}

const SessionContext = createContext<SessionContextType | null>(null);

interface SessionResponse {
  sid: string | null;
  tier: "free" | "paid" | "admin";
  credits: number;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sid, setSid] = useState<string | null>(null);
  const [tier, setTier] = useState<"free" | "paid" | "admin">("free");
  const [credits, setCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

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

  const openOnboarding = useCallback(() => {
    setIsOnboardingOpen(true);
  }, []);

  const closeOnboarding = useCallback(() => {
    setIsOnboardingOpen(false);
    // Mark as seen in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("visibible_onboarding_seen", "true");
    }
    setHasSeenOnboarding(true);
  }, []);

  // Check localStorage for onboarding status on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const seen = localStorage.getItem("visibible_onboarding_seen");
      setHasSeenOnboarding(seen === "true");
    }
  }, []);

  // Show onboarding for new free users who haven't seen it
  useEffect(() => {
    if (
      !isLoading &&
      !hasSeenOnboarding &&
      tier === "free" &&
      credits === 0 &&
      sid
    ) {
      setIsOnboardingOpen(true);
    }
  }, [isLoading, hasSeenOnboarding, tier, credits, sid]);

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
        isOnboardingOpen,
        openOnboarding,
        closeOnboarding,
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
