import { Play } from "lucide-react";

/**
 * The play mark (#447): a verse with a finished video shows it on its picture on the spread and on its Contents
 * tile. It is only the mark; the control around it gives it a name.
 */
export function PlayMark({ size = "small" }: { size?: "small" | "large" }) {
  const box = size === "large" ? "h-11 w-11 md:h-14 md:w-14" : "h-6 w-6";
  const icon = size === "large" ? "h-4 w-4 md:h-5 md:w-5" : "h-2.5 w-2.5";
  return (
    <span data-play-mark aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-sm ${box}`}>
      <Play className={`${icon} translate-x-[1px] fill-current`} strokeWidth={0} />
    </span>
  );
}
