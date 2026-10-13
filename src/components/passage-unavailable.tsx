"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { TranslationSelector } from "./translation-selector";
import { TRANSLATIONS, type Translation } from "@/lib/bible-api";

export function PassageUnavailable({ reference, translation, retryable }: {
  reference: string; translation: Translation; retryable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-24">
      <section className="max-w-lg space-y-5 text-center" aria-labelledby="passage-unavailable-heading">
        <p className="text-sm text-[var(--muted)]">{reference} · {TRANSLATIONS[translation].name}</p>
        <h1 id="passage-unavailable-heading" className="text-2xl font-semibold">
          {retryable ? "Scripture is temporarily unavailable" : "This passage is unavailable in this translation"}
        </h1>
        <p className="text-[var(--muted)]">
          {retryable
            ? "We could not reach the Scripture service. Your place is saved in this URL. Try again or choose another translation."
            : "The Scripture service did not provide this verse for the selected translation. Choose another translation to stay at this passage."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => startTransition(() => router.refresh())}
            disabled={pending}
            className="min-h-11 rounded-lg bg-[var(--accent)] px-5 py-2 text-[var(--accent-text)] disabled:opacity-50"
          >
            {pending ? "Retrying…" : "Try again"}
          </button>
          <TranslationSelector variant="full" />
        </div>
      </section>
    </main>
  );
}
