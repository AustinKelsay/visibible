"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, Check, Copy, Zap, ChevronDown, Shield, Sparkles, BookOpen, ArrowRight } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useSession } from "@/context/session-context";
import {
  trackInvoiceCreated,
  trackPaymentCompleted,
  trackPaymentExpired,
} from "@/lib/analytics";

function CashAppLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 30.647 30.647"
      className={className}
      aria-label="Cash App"
    >
      <path
        fill="#00D54B"
        d="M19.954 0c3.091 0 4.612 0 6.282.525a6.503 6.503 0 013.9 3.9c.525 1.656.525 3.191.525 6.268v9.261c0 3.074 0 4.609-.525 6.268a6.503 6.503 0 01-3.9 3.9c-1.656.525-3.191.525-6.268.525H10.665c-3.074 0-4.609 0-6.268-.525a6.503 6.503 0 01-3.9-3.9C0 24.566 0 23.045 0 19.954v-9.275C0 7.605 0 6.07.525 4.41a6.502 6.502 0 013.9-3.9C6.066 0 7.605 0 10.679 0z"
        fillRule="evenodd"
        clipRule="evenodd"
      />
      <path
        fill="#fff"
        d="M16.096 10.044a6.382 6.382 0 014.113 1.51.628.628 0 00.862-.017l1.184-1.188a.606.606 0 00-.032-.89 9.388 9.388 0 00-3.166-1.773l.355-1.748a.617.617 0 00-.607-.741h-2.28a.62.62 0 00-.606.486l-.318 1.566c-3.035.149-5.609 1.652-5.609 4.733 0 2.663 2.127 3.808 4.375 4.61 2.127.79 3.255 1.084 3.255 2.198s-1.124 1.815-2.78 1.815a6.119 6.119 0 01-4.322-1.691.617.617 0 00-.865 0l-1.27 1.24a.613.613 0 000 .883 8.406 8.406 0 003.67 2.01l-.355 1.62a.631.631 0 00.603.759h2.287a.62.62 0 00.61-.49l.33-1.535c3.637-.223 5.86-2.18 5.86-5.045 0-2.638-2.216-3.751-4.907-4.659-1.539-.578-2.868-.957-2.868-2.099s1.241-1.553 2.482-1.553z"
      />
    </svg>
  );
}

function BitcoinLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={className}
      aria-label="Bitcoin"
    >
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <path
        fill="#fff"
        d="M22.5 14.1c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.7 2.6c-.4-.1-.8-.2-1.3-.3l.7-2.7-1.6-.4-.7 2.7c-.3-.1-.7-.2-1-.2v0l-2.3-.6-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.1c0 0 .1 0 .2.1-.1 0-.1 0-.2 0l-1.1 4.4c-.1.2-.3.5-.7.4 0 0-1.2-.3-1.2-.3l-.8 1.8 2.1.5c.4.1.8.2 1.2.3l-.7 2.8 1.6.4.7-2.7c.4.1.9.2 1.3.3l-.7 2.7 1.6.4.7-2.8c2.9.5 5.1.3 6-2.3.7-2.1 0-3.3-1.5-4.1 1.1-.2 1.9-1 2.1-2.5zm-3.8 5.3c-.5 2.1-4 1-5.1.7l.9-3.7c1.1.3 4.7.8 4.2 3zm.5-5.4c-.5 1.9-3.4.9-4.3.7l.8-3.3c1 .2 4 .7 3.5 2.6z"
      />
    </svg>
  );
}

function LightningLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={className}
      aria-label="Lightning"
    >
      <circle cx="16" cy="16" r="16" fill="#2563eb" />
      <path
        fill="#fff"
        d="M17.5 6L10 17h5.5l-1 9L22 15h-5.5l1-9z"
      />
    </svg>
  );
}

function MiniVerseStrip() {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Cycle through verses every 2.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setSelectedIndex((prev) => (prev + 1) % 5);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Sample verse data: verse number and dot count (0-3)
  const verses = [
    { verse: 1, dots: 2 },
    { verse: 2, dots: 0 },
    { verse: 3, dots: 1 },
    { verse: 4, dots: 3 },
    { verse: 5, dots: 0 },
  ];

  return (
    <div className="flex justify-center items-center gap-1.5 py-4 mt-4 mb-2">
      {verses.map((v, index) => {
        const isSelected = index === selectedIndex;
        return (
          <div
            key={v.verse}
            className={`min-h-[36px] min-w-[36px] flex flex-col items-center justify-center rounded-[var(--radius-sm)] transition-all duration-500 ease-in-out ${
              isSelected
                ? "bg-[var(--accent)] scale-110 shadow-lg shadow-[var(--accent)]/25"
                : "bg-[var(--divider)] opacity-70"
            }`}
          >
            <span
              className={`text-xs font-medium transition-all duration-500 ease-in-out ${
                isSelected ? "text-[var(--accent-text)]" : "text-[var(--muted)]"
              }`}
            >
              {v.verse}
            </span>
            {/* Dots container */}
            <div
              className="relative h-2 mt-0.5"
              style={{ width: v.dots > 0 ? `${8 + (Math.min(v.dots, 3) - 1) * 6}px` : "8px" }}
            >
              {v.dots > 0 ? (
                Array.from({ length: Math.min(v.dots, 3) }).map((_, i) => (
                  <span
                    key={i}
                    className={`absolute w-2 h-2 rounded-full border border-[var(--background)]/30 transition-all duration-500 ease-in-out ${
                      isSelected
                        ? "bg-[var(--accent-text)] animate-dot-pulse"
                        : "bg-[var(--accent)]"
                    }`}
                    style={{
                      left: `${i * 6}px`,
                      animationDelay: isSelected ? `${i * 0.1}s` : undefined,
                    }}
                  />
                ))
              ) : (
                <span
                  className={`absolute w-2 h-2 rounded-full border border-[var(--background)]/30 transition-all duration-500 ease-in-out ${
                    isSelected ? "bg-[var(--accent-text)]/50" : "bg-[var(--muted)]/40"
                  }`}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface Invoice {
  invoiceId: string;
  bolt11: string;
  amountUsd: number;
  amountSats: number;
  expiresAt: number;
  credits: number;
}

type ModalState = "welcome" | "selection" | "loading" | "invoice" | "success" | "error";

export function BuyCreditsModal() {
  const { isBuyModalOpen, closeBuyModal, refetch, credits, tier } = useSession();
  const [state, setState] = useState<ModalState>("welcome");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceCreatedAt, setInvoiceCreatedAt] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const prevModalOpenRef = useRef(false);
  const hasSeenWelcomeRef = useRef(false);
  const hasTrackedExpiredRef = useRef(false);

  // Admin login state
  const [showAdminInput, setShowAdminInput] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  /**
   * Creates a new Lightning invoice for purchasing credits.
   * Memoized with useCallback to ensure stable reference for useEffect dependencies.
   */
  const createInvoice = useCallback(async () => {
    setState("loading");
    setError(null);
    hasTrackedExpiredRef.current = false; // Reset expiry tracking for new invoice

    try {
      const response = await fetch("/api/invoice", { method: "POST" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create invoice");
      }

      const data: Invoice = await response.json();
      setInvoice(data);
      setInvoiceCreatedAt(Date.now());
      setState("invoice");
      // Track invoice created
      trackInvoiceCreated({
        amountUsd: data.amountUsd,
        tier,
        hasCredits: credits > 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
      setState("error");
    }
  }, [tier, credits]);

  // When modal opens, check if we have a valid unexpired invoice
  useEffect(() => {
    if (!isBuyModalOpen) {
      prevModalOpenRef.current = false;
      hasSeenWelcomeRef.current = false;
      return;
    }

    // Only run initialization logic when modal transitions from closed to open
    const modalJustOpened = !prevModalOpenRef.current;
    prevModalOpenRef.current = true;

    if (!modalJustOpened) return;

    // Check invoice expiry once when modal opens
    if (invoice && invoice.expiresAt > Date.now()) {
      // Resume existing valid invoice
      setState("invoice");
    } else {
      // Check if user has seen welcome before
      const hasSeenWelcome = localStorage.getItem("visibible_welcome_seen") === "true";
      if (!hasSeenWelcome && !hasSeenWelcomeRef.current) {
        setState("welcome");
        hasSeenWelcomeRef.current = true;
      } else {
        setState("selection");
      }
      setInvoice(null);
      setQrDataUrl("");
    }
  }, [isBuyModalOpen, invoice]);

  // Reset state when modal closes (preserve invoice for persistence)
  useEffect(() => {
    if (!isBuyModalOpen) {
      setCopied(false);
      setShowAdminInput(false);
      setAdminPassword("");
      setAdminError(null);
    }
  }, [isBuyModalOpen]);

  const handleAdminLogin = async () => {
    if (!adminPassword.trim()) {
      setAdminError("Please enter a password");
      return;
    }

    setAdminSubmitting(true);
    setAdminError(null);

    // Read CSRF token from cookie
    const csrfToken = document.cookie
      .split("; ")
      .find((row) => row.startsWith("visibible_csrf="))
      ?.split("=")[1];

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "",
        },
        body: JSON.stringify({ password: adminPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        setAdminError(data.error || "Invalid password");
        return;
      }

      // Success - refetch session and close
      await refetch();
      closeBuyModal();
    } catch {
      setAdminError("Failed to authenticate");
    } finally {
      setAdminSubmitting(false);
    }
  };

  const handleAdminKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !adminSubmitting) {
      handleAdminLogin();
    }
  };

  // Generate QR code when invoice is created
  useEffect(() => {
    if (invoice?.bolt11) {
      // Use uppercase for better QR code scanning (alphanumeric mode)
      QRCode.toDataURL(invoice.bolt11.toUpperCase(), {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then(setQrDataUrl)
        .catch((err) => console.error("QR generation failed:", err));
    }
  }, [invoice?.bolt11]);

  // Poll for payment status
  useEffect(() => {
    if (state !== "invoice" || !invoice) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/invoice/${invoice.invoiceId}`);
        if (!response.ok) return;

        const data = await response.json();
        if (data.status === "paid") {
          // Clear interval immediately to prevent double-tracking during async operations
          clearInterval(pollInterval);
          setState("success");
          // Track payment completed
          if (invoice) {
            trackPaymentCompleted({
              amountUsd: invoice.amountUsd,
              credits: invoice.credits,
              tier,
              hasCredits: true, // They just paid, so they have credits now
            });
          }
          // Refetch session to update credits
          await refetch();
        } else if (data.status === "expired" || data.status === "failed") {
          setError("Invoice expired. Please try again.");
          setState("error");
          // Track payment expired (only once per invoice)
          if (invoice && !hasTrackedExpiredRef.current) {
            hasTrackedExpiredRef.current = true;
            trackPaymentExpired({
              invoiceAgeSeconds: Math.floor((Date.now() - invoiceCreatedAt) / 1000),
              tier,
              hasCredits: credits > 0,
            });
          }
          clearInterval(pollInterval);
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    setTimeLeftMs(Math.max(0, invoice.expiresAt - Date.now()));

    // Check expiration + update countdown
    const expirationCheck = setInterval(() => {
      if (!invoice) return;
      const remaining = invoice.expiresAt - Date.now();
      setTimeLeftMs(Math.max(0, remaining));
      if (remaining <= 0) {
        setError("Invoice expired. Please try again.");
        setState("error");
        // Track payment expired (only once per invoice)
        if (!hasTrackedExpiredRef.current) {
          hasTrackedExpiredRef.current = true;
          trackPaymentExpired({
            invoiceAgeSeconds: Math.floor((Date.now() - invoiceCreatedAt) / 1000),
            tier,
            hasCredits: credits > 0,
          });
        }
        clearInterval(pollInterval);
        clearInterval(expirationCheck);
      }
    }, 1000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(expirationCheck);
    };
  }, [state, invoice, invoiceCreatedAt, refetch, tier, credits]);

  const copyBolt11 = useCallback(async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice.bolt11);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  }, [invoice]);

  const handleClose = () => {
    if (state === "success") {
      // Reset state fully on success close
      setState("welcome");
      setInvoice(null);
      setQrDataUrl("");
      closeBuyModal();
    } else if (state === "loading") {
      // Don't allow closing while loading
      return;
    } else {
      // Allow closing but preserve invoice state for later
      closeBuyModal();
    }
  };

  const handleWelcomeNext = () => {
    localStorage.setItem("visibible_welcome_seen", "true");
    setState("selection");
  };

  const handleBrowseFree = () => {
    localStorage.setItem("visibible_welcome_seen", "true");
    closeBuyModal();
  };

  const handleCancelInvoice = () => {
    setState("selection");
    setInvoice(null);
    setQrDataUrl("");
  };

  if (!isBuyModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full md:max-w-md bg-[var(--background)] rounded-t-[var(--radius-lg)] md:rounded-[var(--radius-lg)] p-6 animate-in slide-in-from-bottom md:slide-in-from-bottom-0 md:fade-in duration-[var(--motion-base)]">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          aria-label="Close"
          title="Close"
        >
          <X size={20} strokeWidth={2} />
        </button>

        {/* Stepper indicator */}
        {(state === "welcome" || state === "selection") && (
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className={`h-1.5 rounded-full transition-all ${state === "welcome" ? "w-8 bg-[var(--accent)]" : "w-1.5 bg-[var(--divider)]"}`} />
            <div className={`h-1.5 rounded-full transition-all ${state === "selection" ? "w-8 bg-[var(--accent)]" : "w-1.5 bg-[var(--divider)]"}`} />
          </div>
        )}

        {/* Welcome Page */}
        {state === "welcome" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent)]/10 rounded-full mb-4">
                <Sparkles size={32} className="text-[var(--accent)]" />
              </div>
              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">
                Welcome to Visibible Alpha
              </h2>
              <p className="text-[var(--muted)] text-sm">
                Bringing the Bible to life in real time
              </p>
            </div>

            {/* Product description */}
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-[var(--surface)] rounded-[var(--radius-md)]">
                <BookOpen size={20} className="text-[var(--accent)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)] mb-1">
                    Generate visuals verse by verse
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Watch as AI transforms scripture into stunning, real-time imagery. Each verse comes alive with unique visual interpretations.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-[var(--surface)] rounded-[var(--radius-md)]">
                <Zap size={20} className="text-[var(--accent)] flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--foreground)] mb-1">
                    Participate in the experience
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Browse existing images for free, or purchase credits to generate your own.
                  </p>
                  <div className="flex flex-col items-center -ml-8">
                    <MiniVerseStrip />
                    <p className="text-[10px] text-[var(--muted)]/70 tracking-wide">
                      Dots show verses with images
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="space-y-3 pt-2">
              <button
                onClick={handleWelcomeNext}
                className="w-full py-3 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] font-medium hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2"
              >
                <span>Buy Credits to Generate</span>
                <ArrowRight size={18} />
              </button>
              <button
                onClick={handleBrowseFree}
                className="w-full py-3 bg-[var(--surface)] text-[var(--foreground)] rounded-[var(--radius-full)] font-medium hover:bg-[var(--divider)] transition-colors"
              >
                Browse for Free
              </button>
            </div>
          </div>
        )}

        {/* Buy Credits Page */}
        {state === "selection" && (
          <>
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-[var(--accent)]/10 rounded-full mb-3">
                <Zap size={24} className="text-[var(--accent)]" />
              </div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Buy Credits
              </h2>
            </div>

            <div className="mb-4 rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3 text-xs">
              <p className="text-[var(--foreground)] font-medium mb-2">Early Access</p>
              <ul className="space-y-1 text-[var(--muted)]">
                <li>Credits are used for AI image generation</li>
                <li>Lightning payments only (no on-chain)</li>
                <li>No refunds during alpha</li>
              </ul>
            </div>

            {/* Content */}
            <div className="space-y-4">
              {/* Current credits display */}
              {credits > 0 && (
                <div className="flex items-center justify-between py-3 px-4 bg-[var(--surface)] rounded-[var(--radius-md)]">
                  <span className="text-sm text-[var(--muted)]">Current balance</span>
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    {credits} credits
                  </span>
                </div>
              )}

              {/* Package info */}
              <div className="text-center py-6 bg-[var(--surface)] rounded-[var(--radius-md)]">
                <p className="text-3xl font-bold text-[var(--foreground)]">
                  300 credits
                </p>
                <p className="text-[var(--muted)] mt-1">$3 USD</p>
              </div>

              {/* Payment methods info */}
              <div className="flex flex-col items-center gap-3 py-3">
                <p className="text-sm text-[var(--muted)]">Pay with</p>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                    <CashAppLogo className="w-6 h-6" />
                    <span className="text-sm font-medium text-[var(--foreground)]">CashApp</span>
                  </div>
                  <span className="text-[var(--muted)]">or</span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center">
                      <BitcoinLogo className="w-6 h-6" />
                      <LightningLogo className="w-6 h-6 -ml-2" />
                    </div>
                    <span className="text-sm font-medium text-[var(--foreground)]">Lightning</span>
                  </div>
                </div>
              </div>

              {/* Session-only warning */}
              <div className="rounded-[var(--radius-md)] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-xs">
                <p className="text-amber-800 dark:text-amber-200 font-medium mb-1">
                  ⚠️ Session-only credits
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  You have no account. Credits are stored in this browser session only. Clearing your cache or using a different browser will result in lost credits.
                </p>
              </div>

              {/* Buy button */}
              <button
                onClick={createInvoice}
                className="w-full py-3 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                Buy 300 Credits
              </button>

              {/* Admin Access */}
              <div className="pt-4 border-t border-[var(--divider)]">
                <button
                  onClick={() => setShowAdminInput(!showAdminInput)}
                  className="flex items-center justify-center gap-2 w-full py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  <Shield size={14} />
                  <span>Admin Access</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${showAdminInput ? "rotate-180" : ""}`}
                  />
                </button>

                {showAdminInput && (
                  <div className="mt-3 space-y-3">
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      onKeyDown={handleAdminKeyDown}
                      placeholder="Enter admin password"
                      className="w-full px-4 py-3 bg-[var(--surface)] border border-[var(--divider)] rounded-[var(--radius-md)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      disabled={adminSubmitting}
                    />
                    {adminError && (
                      <p className="text-sm text-[var(--error)]">{adminError}</p>
                    )}
                    <button
                      onClick={handleAdminLogin}
                      disabled={adminSubmitting}
                      className="w-full py-2 bg-[var(--surface)] text-[var(--foreground)] rounded-[var(--radius-md)] font-medium hover:bg-[var(--divider)] transition-colors disabled:opacity-50"
                    >
                      {adminSubmitting ? (
                        <Loader2 size={18} className="animate-spin mx-auto" />
                      ) : (
                        "Login as Admin"
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {state === "loading" && (
          <div className="flex flex-col items-center py-8">
            <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
            <p className="mt-4 text-[var(--muted)]">Creating invoice...</p>
          </div>
        )}

        {state === "invoice" && invoice && (
          <div className="space-y-4">
            {/* Price display */}
            <div className="text-center py-4 bg-[var(--surface)] rounded-[var(--radius-md)]">
              <p className="text-3xl font-bold text-[var(--foreground)]">
                {invoice.amountSats.toLocaleString()} sats
              </p>
              <p className="text-[var(--muted)]">
                ${invoice.amountUsd} = {invoice.credits} credits
              </p>
            </div>

            {/* Payment method info */}
            <div className="flex items-center justify-center gap-3 py-1">
              <p className="text-sm text-[var(--muted)]">Scan with</p>
              <div className="flex items-center gap-1.5">
                <CashAppLogo className="w-5 h-5" />
                <span className="text-sm font-medium text-[var(--foreground)]">CashApp</span>
              </div>
              <span className="text-sm text-[var(--muted)]">or</span>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center">
                  <BitcoinLogo className="w-5 h-5" />
                  <LightningLogo className="w-5 h-5 -ml-1.5" />
                </div>
                <span className="text-sm font-medium text-[var(--foreground)]">Lightning</span>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              {qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt="Lightning Invoice QR Code"
                  width={192}
                  height={192}
                  className="w-48 h-48 rounded-[var(--radius-md)]"
                />
              ) : (
                <div className="w-48 h-48 bg-[var(--surface)] rounded-[var(--radius-md)] flex items-center justify-center border border-[var(--divider)]">
                  <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
                </div>
              )}
            </div>

            {/* BOLT11 */}
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted)]">Lightning Invoice</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-[var(--surface)] p-3 rounded-[var(--radius-sm)] overflow-hidden text-ellipsis whitespace-nowrap">
                  {invoice.bolt11}
                </code>
                <button
                  onClick={copyBolt11}
                  className="p-2 bg-[var(--surface)] rounded-[var(--radius-sm)] hover:bg-[var(--divider)] transition-colors"
                  aria-label="Copy invoice"
                  title={copied ? "Copied!" : "Copy"}
                >
                  {copied ? (
                    <Check size={18} className="text-[var(--success)]" />
                  ) : (
                    <Copy size={18} className="text-[var(--muted)]" />
                  )}
                </button>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center justify-center gap-2 py-2">
              <Loader2 size={16} className="animate-spin text-[var(--muted)]" />
              <p className="text-sm text-[var(--muted)]">
                Waiting for payment...
              </p>
            </div>
            <p className="text-xs text-center text-[var(--muted)]">
              Expires in {formatTimeLeft(timeLeftMs)}
            </p>

            {/* Cancel and go back */}
            <button
              onClick={handleCancelInvoice}
              className="w-full py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Cancel and go back
            </button>
          </div>
        )}

        {state === "success" && (
          <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 bg-[var(--success)]/10 rounded-full flex items-center justify-center mb-4">
              <Check size={32} className="text-[var(--success)]" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              Payment Received!
            </h3>
            <p className="text-[var(--muted)] mt-1">
              {invoice?.credits ?? 300} credits added to your account
            </p>
            <button
              onClick={handleClose}
              className="mt-6 w-full py-3 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] font-medium hover:bg-[var(--accent-hover)] transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 bg-[var(--error)]/10 rounded-full flex items-center justify-center mb-4">
              <X size={32} className="text-[var(--error)]" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              Something went wrong
            </h3>
            <p className="text-[var(--muted)] mt-1 text-center">
              {error || "Please try again"}
            </p>
            <button
              onClick={createInvoice}
              className="mt-6 w-full py-3 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] font-medium hover:bg-[var(--accent-hover)] transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimeLeft(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
