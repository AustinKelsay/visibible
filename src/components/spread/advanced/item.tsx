"use client";

import { useId, type ReactNode } from "react";

/** One item's frame: a small heading over its controls. */
export function AdvancedItem({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-xl bg-white/[0.04] px-1 py-2">
      <h3 id={headingId} className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/55">
        {title}
      </h3>
      {children}
    </section>
  );
}
