import { Pause, Play, RotateCcw } from "lucide-react";

const BOX = { badge: "h-5 w-5", small: "h-6 w-6", large: "h-11 w-11 md:h-14 md:w-14" } as const;
const ICON = { badge: "h-2 w-2", small: "h-2.5 w-2.5", large: "h-4 w-4 md:h-5 md:w-5" } as const;

/** What the mark shows: play (the default), pause while a video plays, or play again once it has ended. */
export type PlayGlyph = "play" | "pause" | "again";

/**
 * The play mark (#447, #480): a picture with its own finished video shows it in Play on the spread, on its Contents
 * tile, and as a badge on its picture-menu thumbnail. It is only the mark; the control around it gives it a name.
 * `loading` rings it while a pressed video waits for its first frame (the ring shows only after a short wait).
 */
export function PlayMark({ size = "small", glyph = "play", loading = false }: { size?: keyof typeof BOX; glyph?: PlayGlyph; loading?: boolean }) {
  const box = BOX[size];
  const icon = ICON[size];
  return (
    <span data-play-mark aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-sm ${box}`}>
      {glyph === "pause" ? (
        <Pause className={`${icon} fill-current`} strokeWidth={0} />
      ) : glyph === "again" ? (
        <RotateCcw className={icon} strokeWidth={2.5} />
      ) : (
        <Play className={`${icon} translate-x-[1px] fill-current`} strokeWidth={0} />
      )}
      {loading ? <span data-video-loading className="video-loading-ring absolute -inset-px rounded-full border-2 border-white/20 border-t-white" /> : null}
    </span>
  );
}
