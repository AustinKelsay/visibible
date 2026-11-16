import { Play } from "lucide-react";

const BOX = { badge: "h-5 w-5", small: "h-6 w-6", large: "h-11 w-11 md:h-14 md:w-14" } as const;
const ICON = { badge: "h-2 w-2", small: "h-2.5 w-2.5", large: "h-4 w-4 md:h-5 md:w-5" } as const;

/**
 * The play mark (#447, #480): a picture with its own finished video shows it in Play on the spread, on its Contents
 * tile, and as a badge on its picture-menu thumbnail. It is only the mark; the control around it gives it a name.
 */
export function PlayMark({ size = "small" }: { size?: keyof typeof BOX }) {
  const box = BOX[size];
  const icon = ICON[size];
  return (
    <span data-play-mark aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-sm ${box}`}>
      <Play className={`${icon} translate-x-[1px] fill-current`} strokeWidth={0} />
    </span>
  );
}
