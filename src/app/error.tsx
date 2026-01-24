"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="text-center px-4">
        <h1 className="text-4xl font-bold text-[var(--foreground)] mb-4">
          Something went wrong
        </h1>
        <p className="text-[var(--foreground-muted)] mb-8 max-w-md">
          We encountered an unexpected error. Please try again.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-[var(--divider)] text-[var(--foreground)] rounded-lg hover:bg-[var(--surface)] transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
