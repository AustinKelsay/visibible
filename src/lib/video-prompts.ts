import type { VideoDuration } from "./video-generation";

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

/** One continuous shot illustrating the verse, with neighbors for context only. */
export function buildVideoPrompt(
  passage: VideoPassage,
  duration: VideoDuration,
): string {
  const context = [
    passage.prevVerse &&
      `Preceding verse (${passage.prevVerse.reference}): "${passage.prevVerse.text}"`,
    passage.nextVerse &&
      `Following verse (${passage.nextVerse.reference}): "${passage.nextVerse.text}"`,
  ].filter(Boolean);
  return [
    `A reverent, cinematic live-action depiction of ${passage.reference}: "${passage.verseText}"`,
    context.length
      ? `Surrounding context, for understanding only; depict only the focal verse:\n${context.join("\n")}`
      : null,
    "Historically grounded: ancient Near Eastern people, clothing, architecture, tools, and landscape appropriate to the passage's time and place. Naturalistic anatomy and faces. No modern objects.",
    `One continuous ${duration}-second shot with no cuts. Restrained, deliberate motion: a slow, steady camera move and natural movement of people, cloth, light, water, or weather. No sudden action, no morphing, no fantasy effects unless the verse describes them.`,
    "Soft natural or atmospheric light, muted earth tones, quiet dignity.",
    "No on-screen text, captions, subtitles, letters, logos, or watermarks.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
