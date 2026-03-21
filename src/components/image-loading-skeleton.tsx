interface ImageLoadingSkeletonProps {
  className?: string;
  compact?: boolean;
  isLiveRegion?: boolean;
  label?: string;
  theme?: "light" | "dark";
}

export function ImageLoadingSkeleton({
  className = "",
  compact = false,
  isLiveRegion = false,
  label = "Loading image",
  theme = "dark",
}: ImageLoadingSkeletonProps) {
  const isDark = theme === "dark";

  return (
    <div
      className={`relative isolate block h-full w-full overflow-hidden pointer-events-none ${className}`}
      {...(isLiveRegion ? {
        role: "status",
        "aria-live": "polite" as const,
      } : {})}
    >
      <span className="sr-only">{label}</span>

      <div
        className={`absolute inset-0 ${
          isDark
            ? "bg-[linear-gradient(180deg,#050505_0%,#0c0c0d_44%,#080808_100%)]"
            : "bg-[linear-gradient(180deg,#f7f7f6_0%,#efeeec_48%,#f8f7f4_100%)]"
        }`}
      />

      <div className="image-skeleton-grid absolute inset-0 opacity-50" />
      <div
        className={`image-skeleton-aura absolute ${
          compact ? "-inset-x-6 -inset-y-4" : "-inset-x-10 -inset-y-8"
        }`}
      />

      <div
        className={`absolute ${
          compact ? "inset-[10%]" : "inset-[7%] sm:inset-[8%]"
        } rounded-[calc(var(--radius-2xl)+2px)] border ${
          isDark
            ? "border-white/10 bg-white/[0.035] shadow-[0_30px_80px_rgba(0,0,0,0.38)]"
            : "border-black/8 bg-white/75 shadow-[0_24px_60px_rgba(15,23,42,0.08)]"
        }`}
      >
        <div className="image-skeleton-sheen absolute inset-0 rounded-[inherit]" />

        <div
          className={`absolute left-[11%] right-[11%] top-[12%] h-[54%] rounded-[calc(var(--radius-xl)+4px)] border ${
            isDark
              ? "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.02))]"
              : "border-black/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,255,255,0.55))]"
          }`}
        />

        <div
          className={`image-skeleton-breathe absolute left-[14%] right-[19%] bottom-[20%] h-[10px] rounded-full ${
            isDark ? "bg-white/12" : "bg-black/8"
          }`}
        />
        <div
          className={`image-skeleton-breathe absolute left-[14%] right-[30%] bottom-[12%] h-[10px] rounded-full ${
            isDark ? "bg-white/8" : "bg-black/6"
          }`}
          style={{ animationDelay: "220ms" }}
        />
      </div>
    </div>
  );
}
