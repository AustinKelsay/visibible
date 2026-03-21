interface ImageLoadingSkeletonProps {
  className?: string;
  compact?: boolean;
  isLiveRegion?: boolean;
  label?: string;
  theme?: "light" | "dark";
}

export function ImageLoadingSkeleton({
  className = "",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  compact = false,
  isLiveRegion = false,
  label = "Loading image",
  theme = "dark",
}: ImageLoadingSkeletonProps) {
  const isDark = theme === "dark";

  return (
    <div
      className={`relative block h-full w-full overflow-hidden pointer-events-none ${className}`}
      {...(isLiveRegion ? {
        role: "status",
        "aria-live": "polite" as const,
      } : {})}
    >
      <span className="sr-only">{label}</span>

      {/* Base background matching the image stage */}
      <div
        className={`absolute inset-0 ${
          isDark ? "bg-[#080808]" : "bg-[#f5f5f4]"
        }`}
      />

      {/* Subtle shimmer sweep */}
      <div
        className={`absolute inset-0 ${
          isDark ? "image-skeleton-shimmer" : "image-skeleton-shimmer-light"
        }`}
      />
    </div>
  );
}
