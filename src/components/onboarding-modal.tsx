"use client";

import { useState, useEffect } from "react";
import { X, Zap, Eye, ChevronDown, Loader2, Shield } from "lucide-react";
import { useSession } from "@/context/session-context";

interface CreditRange {
  min: number;
  max: number;
}

export function OnboardingModal() {
  const {
    isOnboardingOpen,
    closeOnboarding,
    buyCredits,
    refetch,
  } = useSession();

  const [showAdminInput, setShowAdminInput] = useState(false);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditRange, setCreditRange] = useState<CreditRange>({ min: 1, max: 10 });

  // Fetch credit range from image models API
  useEffect(() => {
    if (isOnboardingOpen) {
      fetch("/api/image-models")
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to fetch credit range: ${res.status} ${res.statusText}`);
          }
          return res.json();
        })
        .then((data) => {
          if (data.creditRange) {
            setCreditRange(data.creditRange);
          }
        })
        .catch(() => {
          // Keep default range on error
        });
    }
  }, [isOnboardingOpen]);

  const handleBuyCredits = () => {
    closeOnboarding();
    buyCredits();
  };

  const handleAdminLogin = async () => {
    if (!password.trim()) {
      setError("Please enter a password");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Invalid password");
        return;
      }

      // Success - refetch session and close
      await refetch();
      closeOnboarding();
    } catch {
      setError("Failed to authenticate");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSubmitting) {
      handleAdminLogin();
    }
  };

  if (!isOnboardingOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeOnboarding}
      />

      {/* Modal */}
      <div className="relative w-full md:max-w-md bg-[var(--background)] rounded-t-[var(--radius-lg)] md:rounded-[var(--radius-lg)] p-6 animate-in slide-in-from-bottom md:slide-in-from-bottom-0 md:fade-in duration-[var(--motion-base)]">
        {/* Close button */}
        <button
          onClick={closeOnboarding}
          className="absolute top-4 right-4 p-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          aria-label="Close"
        >
          <X size={20} strokeWidth={2} />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Welcome to Vibible
          </h2>
          <p className="text-[var(--muted)] mt-1">
            AI-powered Scripture visualization
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {/* Buy Credits - Primary */}
          <button
            onClick={handleBuyCredits}
            className="w-full flex flex-col items-center justify-center gap-0.5 py-3 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            <span className="flex items-center gap-2">
              <Zap size={18} />
              <span>Buy 300 Credits - $3</span>
            </span>
            <span className="text-xs opacity-80">
              {creditRange.min === creditRange.max
                ? `${creditRange.min} credit per image`
                : `${creditRange.min}-${creditRange.max} credits per image`}
            </span>
          </button>

          {/* Browse Free - Secondary */}
          <button
            onClick={closeOnboarding}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--surface)] text-[var(--foreground)] rounded-[var(--radius-full)] font-medium hover:bg-[var(--divider)] transition-colors"
          >
            <Eye size={18} />
            <span>Browse for Free</span>
          </button>
        </div>

        <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">
          <p>
            <span className="text-[var(--foreground)] font-medium">Alpha notice:</span>{" "}
            This is an alpha version of the app, and we only support a strict,
            linear Lightning payment flow right now. No refunds, fiat or
            on-chain payments, or full accounts yet. These will be added later.
          </p>
        </div>

        {/* Admin Password Section - Collapsible */}
        <div className="mt-6 border-t border-[var(--divider)] pt-4">
          <button
            onClick={() => setShowAdminInput(!showAdminInput)}
            className="w-full flex items-center justify-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <span>Have an admin password?</span>
            <ChevronDown
              size={16}
              className={`transition-transform ${showAdminInput ? "rotate-180" : ""}`}
            />
          </button>

          {showAdminInput && (
            <div className="mt-3 space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter admin password"
                className="w-full px-4 py-2.5 bg-[var(--surface)] border border-[var(--divider)] rounded-[var(--radius-md)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
                disabled={isSubmitting}
              />
              {error && (
                <p className="text-sm text-[var(--error)]">{error}</p>
              )}
              <button
                onClick={handleAdminLogin}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--surface)] text-[var(--foreground)] rounded-[var(--radius-md)] font-medium hover:bg-[var(--divider)] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Shield size={16} />
                )}
                <span>{isSubmitting ? "Authenticating..." : "Unlock Admin Access"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
