"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf-constants";
import { useGuestSession } from "@/context/guest-session-context";

export default function RecoverPage() {
  const { isLoading } = useGuestSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || isLoading) return;
    setPending(true);
    setError(null);
    try {
      const session = await fetch("/api/session", { method: "POST", credentials: "same-origin", cache: "no-store" });
      if (!session.ok) throw new Error("Unable to start a session. Please try again later.");
      const csrf = document.cookie.split("; ").find((part) =>
        part.startsWith(`${CSRF_COOKIE_NAME}=`))?.slice(CSRF_COOKIE_NAME.length + 1);
      const response = await fetch("/api/session/recover", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: csrf ?? "" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Recovery failed. Please try again.");
      setCode("");
      // Reset all guest-auth subscriptions to the restored wallet.
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16 space-y-6">
      <h1 className="text-2xl font-bold">Recover a previous balance</h1>
      <p>We reset sign-in access after a security incident. Existing credit balances and payment records were preserved.</p>
      <p>Enter the private recovery code issued for your verified wallet. You do not need to buy credits to recover an existing balance.</p>
      <p className="text-sm text-[var(--muted)]">Keep your previous browser data and wallet payment history. Do not share recovery codes publicly.</p>
      <form onSubmit={recover} className="space-y-4">
        <label htmlFor="recovery-code" className="block font-medium">Recovery code</label>
        <input id="recovery-code" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false}
          required pattern="[a-f0-9]{64}" maxLength={64} value={code} disabled={pending}
          onChange={(event) => setCode(event.target.value)}
          className="w-full rounded border border-[var(--divider)] bg-[var(--surface)] p-3"
          aria-describedby={error ? "recovery-error" : undefined} />
        {error && <p id="recovery-error" role="alert" className="text-sm">{error}</p>}
        <button type="submit" disabled={pending || isLoading} className="rounded bg-[var(--accent)] px-4 py-3 text-[var(--background)] disabled:opacity-50">
          {isLoading ? "Starting session…" : pending ? "Recovering…" : "Recover balance"}
        </button>
      </form>
      <Link href="/" className="inline-block underline">Return to Visibible</Link>
    </main>
  );
}
