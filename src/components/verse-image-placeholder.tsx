"use client";

import type { ReactNode } from "react";
import { ImageOff } from "lucide-react";

interface VerseImagePlaceholderProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  theme?: "light" | "dark";
}

export function VerseImagePlaceholder({
  title = "No image yet",
  description = "Generate an AI illustration to bring this verse to life",
  action,
  className = "",
  compact = false,
  theme = "light",
}: VerseImagePlaceholderProps) {
  const isDark = theme === "dark";
  const rootSpacingClassName = compact ? "gap-3 px-4" : "gap-4 px-6";
  const iconShellClassName = compact ? "w-12 h-12" : "w-16 h-16";
  const descriptionClassName = compact
    ? "text-[11px] max-w-[14rem]"
    : "text-xs max-w-[240px]";

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center text-center ${
        isDark ? "text-white" : "text-[var(--foreground)]"
      } ${rootSpacingClassName} ${className}`}
    >
      <div
        className={`${iconShellClassName} rounded-full border flex items-center justify-center ${
          isDark
            ? "bg-white/10 border-white/20"
            : "bg-[var(--surface)] border-[var(--divider)]"
        }`}
      >
        <ImageOff
          size={compact ? 22 : 28}
          strokeWidth={1.5}
          className={isDark ? "text-white/70" : "text-[var(--muted)]"}
        />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">
          {title}
        </p>
        <p
          className={`${descriptionClassName} ${
            isDark ? "text-white/70" : "text-[var(--muted)]"
          }`}
        >
          {description}
        </p>
      </div>

      {action}
    </div>
  );
}
