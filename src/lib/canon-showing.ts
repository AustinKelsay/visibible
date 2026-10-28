/** Shared no-form canon representation; no drafting or provider calls. */
import { z } from "zod";

export const canonShowingSchema = z.array(z.union([
  z.object({
    effect: z.enum(["light", "radiance", "cloud", "mist", "fire"]),
    colour: z.enum(["unspecified", "white", "gold", "silver", "red", "orange", "yellow", "green", "blue", "violet", "black", "multicoloured"]),
    brightness: z.enum(["unspecified", "faint", "soft", "bright", "brilliant"]),
  }).strict(),
  z.object({ effect: z.enum(["wind", "voice", "unseen presence"]) }).strict(),
])).min(1).max(5);
export type CanonShowing = z.infer<typeof canonShowingSchema>;

export function compileCanonShowing(name: string, showing: CanonShowing): string {
  return `${name}: ${showing.map((part) => "colour" in part
    ? [part.brightness, part.colour, part.effect].filter((word) => word !== "unspecified").join(" ")
    : part.effect).join("; ")}.`;
}
