import type { VideoDuration } from "./video-generation";
import { SHARED_STYLES } from "./work-preparation";

interface PassageVerse {
  number: number;
  text: string;
  reference: string;
}

/** Server-resolved passage (see resolveGenerationPassage); never client text. */
export interface VideoPassage {
  reference: string;
  verseText: string;
  prevVerse: PassageVerse | null;
  nextVerse: PassageVerse | null;
}

/**
 * The image-to-video prompt (#479): the saved picture is the first frame, so the prompt asks to animate that painting
 * in its own art style (the shared style description's rendering, palette and materials) and composition, with
 * restrained motion. The verse and its neighbours are context for what moves, never a new scene.
 */
export function buildVideoPrompt(
  passage: VideoPassage,
  duration: VideoDuration,
  artStyleId: string,
): string {
  const style = SHARED_STYLES.get(artStyleId);
  const context = [
    passage.prevVerse &&
      `Preceding verse (${passage.prevVerse.reference}): "${passage.prevVerse.text}"`,
    passage.nextVerse &&
      `Following verse (${passage.nextVerse.reference}): "${passage.nextVerse.text}"`,
  ].filter(Boolean);
  return [
    `Animate this painting. The first frame is a ${style.label} picture of ${passage.reference}: "${passage.verseText}"`,
    context.length
      ? `Surrounding context, for understanding only; animate only what the painting shows:\n${context.join("\n")}`
      : null,
    `Keep the painting's ${style.label} art style in every frame. Rendering: ${style.rendering} Palette: ${style.palette} Materials: ${style.materials} It stays a painting throughout and never turns photographic.`,
    "Keep the same composition, framing, setting and subjects as the first frame: the same people with the same faces and clothing, in the same places. Nothing new enters the scene.",
    `One continuous ${duration}-second shot with no cuts. Restrained, gentle motion: a slow, steady camera drift and quiet natural movement of people, cloth, light, water, smoke, leaves or weather. No sudden action, no morphing, no change of style.`,
    "No on-screen text, captions, subtitles, letters, logos, or watermarks.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
