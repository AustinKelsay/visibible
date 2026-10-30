"use client";

import { useRef, type KeyboardEvent } from "react";
import { BookOpen, Grid3x2, Film } from "lucide-react";
import { useVerseView } from "@/context/verse-view-context";
import type { VerseViewValue } from "@/lib/verse-view";

const modes = [
  { value: "reader", label: "Images", icon: BookOpen },
  { value: "gallery", label: "Gallery", icon: Grid3x2 },
  { value: "video", label: "Video", icon: Film },
] as const;

export function VerseModeTabs() {
  const { effectiveView, setEffectiveView } = useVerseView();
  const buttons = useRef<
    Partial<Record<VerseViewValue, HTMLButtonElement | null>>
  >({});
  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = modes.findIndex((mode) => mode.value === effectiveView);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % modes.length
        : event.key === "ArrowLeft"
          ? (index + modes.length - 1) % modes.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? modes.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setEffectiveView(modes[next].value, "unknown");
    buttons.current[modes[next].value]?.focus();
  }
  return (
    <nav
      className="border-b border-[var(--divider)] bg-[var(--background)]"
      aria-label="Verse mode"
    >
      <div className="max-w-5xl mx-auto px-4 flex gap-1">
        {modes.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            ref={(node) => {
              buttons.current[value] = node;
            }}
            type="button"
            aria-pressed={effectiveView === value}
            onClick={() => setEffectiveView(value, "unknown")}
            onKeyDown={handleKey}
            className={`min-h-12 px-4 inline-flex items-center justify-center gap-2 text-sm border-b-2 transition-colors ${effectiveView === value ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
