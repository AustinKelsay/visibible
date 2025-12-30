"use client";

import { Zap, Shield } from "lucide-react";
import { useSession } from "@/context/session-context";

export function CreditsBadge() {
  const { tier, credits, isLoading, buyCredits, openOnboarding } = useSession();

  if (isLoading) {
    // Skeleton loading state
    return (
      <div className="h-8 w-24 bg-[var(--surface)] rounded-[var(--radius-full)] animate-pulse" />
    );
  }

  // Admin tier - show admin badge
  if (tier === "admin") {
    return (
      <div className="flex items-center gap-1.5 h-8 px-3 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] text-sm font-medium">
        <Shield size={16} strokeWidth={2} />
        <span>Admin</span>
      </div>
    );
  }

  if (tier === "free" || credits === 0) {
    // Free tier - prompt to buy (click opens onboarding for admin access too)
    return (
      <button
        onClick={openOnboarding}
        className="flex items-center gap-1.5 h-8 px-3 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] active:scale-[0.98]"
      >
        <Zap size={16} strokeWidth={2} />
        <span>Get Credits</span>
      </button>
    );
  }

  // Paid tier - show balance
  return (
    <button
      onClick={buyCredits}
      className="flex items-center gap-1.5 h-8 px-3 bg-[var(--surface)] text-[var(--foreground)] rounded-[var(--radius-full)] text-sm font-medium hover:bg-[var(--divider)] transition-colors duration-[var(--motion-fast)]"
    >
      <Zap size={16} strokeWidth={2} className="text-[var(--accent)]" />
      <span>{credits}</span>
    </button>
  );
}
