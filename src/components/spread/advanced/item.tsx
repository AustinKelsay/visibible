"use client";

import { useId, type ReactNode } from "react";

/** One item's frame: a small heading over its controls. `headingId` lets a control be named by the heading. */
export function AdvancedItem({ title, headingId, children }: { title: string; headingId?: string; children: ReactNode }) {
  const generatedId = useId();
  const id = headingId ?? generatedId;
  return (
    <section aria-labelledby={id} className="rounded-xl bg-ink/[0.04] px-1 py-2">
      <h3 id={id} className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-ink/55">
        {title}
      </h3>
      {children}
    </section>
  );
}
