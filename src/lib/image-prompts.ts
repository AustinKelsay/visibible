import { createHash } from "node:crypto";
import type { ImageAspectRatio, ImageResolution } from "./image-models";

export const PROMPT_VERSION = "2026-09-08-canonical";
export const DEFAULT_STYLE_PROFILE = "classical";
const SCENE_PLAN_MAX_FIELD_LENGTH = 180;
export const PROMPT_MAX_CHARS = 2800;
const CONTINUITY_HINT_MAX_CHARS = 160;
const SCENE_PLANNER_VERSE_MAX_CHARS = 280;

export type ScenePlan = {
  primarySubject: string;
  action: string;
  setting: string;
  secondaryElements?: string;
  mood?: string;
  timeOfDay?: string;
  composition?: string;
};

export type PromptPacket = {
  verseId: string;
  translationId: string;
  reference: string;
  currentVerse: string;
  styleProfileId: string;
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  chapterTheme?: {
    setting: string;
    palette: string;
    elements: string;
    style: string;
  };
  continuity?: {
    previous?: string;
    next?: string;
  };
  scenePlan?: ScenePlan;
  flags: {
    scenePlannerUsed: boolean;
    scenePlanFromCache: boolean;
    narrativeContextIncluded: boolean;
    generationNoteIncluded: boolean;
  };
  budget: {
    maxChars: number;
    finalChars: number;
  };
};



function normalizeSceneField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SCENE_PLAN_MAX_FIELD_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function normalizeScenePlan(value: unknown): ScenePlan | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const primarySubject = normalizeSceneField(data.primarySubject);
  const action = normalizeSceneField(data.action);
  const setting = normalizeSceneField(data.setting);
  if (!primarySubject || !action || !setting) return null;
  const scenePlan: ScenePlan = {
    primarySubject,
    action,
    setting,
  };
  const secondaryElements = normalizeSceneField(data.secondaryElements);
  const mood = normalizeSceneField(data.mood);
  const timeOfDay = normalizeSceneField(data.timeOfDay);
  const composition = normalizeSceneField(data.composition);
  if (secondaryElements) scenePlan.secondaryElements = secondaryElements;
  if (mood) scenePlan.mood = mood;
  if (timeOfDay) scenePlan.timeOfDay = timeOfDay;
  if (composition) scenePlan.composition = composition;
  return scenePlan;
}

export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function formatScenePlan(scenePlan: ScenePlan): string {
  const lines = [
    "SCENE PLAN (supporting; do not override priority rules):",
    `Primary subject: ${scenePlan.primarySubject}`,
    `Action: ${scenePlan.action}`,
    `Setting: ${scenePlan.setting}`,
  ];
  if (scenePlan.secondaryElements) {
    lines.push(`Secondary elements: ${scenePlan.secondaryElements}`);
  }
  if (scenePlan.mood) lines.push(`Mood: ${scenePlan.mood}`);
  if (scenePlan.timeOfDay) lines.push(`Time of day: ${scenePlan.timeOfDay}`);
  if (scenePlan.composition) lines.push(`Composition: ${scenePlan.composition}`);
  return `\n\n${lines.join("\n")}`;
}

export function clipText(value: string, maxChars: number): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function toContinuityHint(verse: { number: number; text: string } | null): string | undefined {
  if (!verse) return undefined;
  const text = clipText(verse.text, CONTINUITY_HINT_MAX_CHARS);
  return text ? `v${verse.number}: ${text}` : undefined;
}

export type StyleProfile = {
  id: string;
  label: string;
  rendering: string;
  palette?: string;
  lighting?: string;
  materials?: string;
  composition?: string;
  negative: string;
};

export const STYLE_PROFILES: Record<string, StyleProfile> = {
  classical: {
    id: "classical",
    label: "Classical Painterly",
    rendering:
      "Stylized, painterly, biblical-era, mysterious, expansive; epic scale and reverent tone. The painterly treatment belongs to the depicted world itself, not to a photographed physical artwork.",
    palette: "Mature, grounded color; rich but restrained contrast.",
    lighting: "Luminous, dramatic lighting.",
    materials: "Gritty, raw texture; avoid polished digital smoothness.",
    composition: "Cinematic, immersive viewpoint; heroic but grounded.",
    negative:
      "Avoid photorealism or a photographic look. Avoid childish/cartoonish styling. Never present the scene as a painting on a wall, gallery piece, framed artwork, mural, poster, manuscript page, or printed illustration. Do not show canvas texture, paper edges, matting, border, mockup, or surrounding room. The depicted world must fill the image edge-to-edge.",
  },
};


type VerseContext = { number: number; text: string; reference?: string };
export type ImagePromptInput = {
  verseId: string;
  translationId: string;
  reference: string;
  verseText: string;
  prevVerse: VerseContext | null;
  nextVerse: VerseContext | null;
  chapterTheme: PromptPacket["chapterTheme"] | null;
  styleProfile: StyleProfile;
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  generationNumber: number | null;
  scenePlan: ScenePlan | null;
  scenePlannerUsed: boolean;
  scenePlanFromCache: boolean;
};
export type ScenePlannerInput = Pick<ImagePromptInput,
  "reference" | "verseText" | "prevVerse" | "nextVerse" | "chapterTheme" | "styleProfile">;

export function buildScenePlannerPrompt({ reference, verseText, prevVerse, nextVerse, chapterTheme, styleProfile }: ScenePlannerInput) {
  return `You are a scene planner for biblical illustrations. Return ONLY valid JSON.

Rules:
- Single scene only (no collage, no split panels).
- Biblical-era setting, no modern artifacts.
- Do not include any text or written elements.
- Keep it visually depictable, concise, and grounded in the verse.
- Use short phrases (no full sentences).
- Describe an immersive in-world scene, not an artwork object, poster, mural, or gallery presentation.
- Favor environmental backgrounds over blank white, cream, or beige backdrops.

Return JSON with keys:
primarySubject, action, setting, secondaryElements, mood, timeOfDay, composition

Inputs:
Reference: ${reference}
Verse: "${clipText(verseText, SCENE_PLANNER_VERSE_MAX_CHARS)}"
${prevVerse ? `Previous: "${clipText(prevVerse.text, SCENE_PLANNER_VERSE_MAX_CHARS)}"` : ""}
${nextVerse ? `Next: "${clipText(nextVerse.text, SCENE_PLANNER_VERSE_MAX_CHARS)}"` : ""}
${chapterTheme ? `Theme setting: ${chapterTheme.setting}` : "Theme setting: none"}
${chapterTheme ? `Theme elements: ${chapterTheme.elements}` : "Theme elements: none"}
Style profile: ${styleProfile.label} (${styleProfile.rendering})`;
}

export function buildImagePrompt({
  verseId, translationId, reference, verseText, prevVerse, nextVerse,
  chapterTheme, styleProfile, aspectRatio, resolution, generationNumber,
  scenePlan, scenePlannerUsed, scenePlanFromCache,
}: ImagePromptInput) {
  const aspectRatioLabel = aspectRatio === "21:9"
    ? "ULTRA-WIDE CINEMATIC"
    : aspectRatio === "3:2"
      ? "CLASSIC WIDE"
      : "WIDESCREEN";
  const aspectRatioInstruction = `Aspect ratio: ${aspectRatio} (${aspectRatioLabel} landscape).`;

  /**
   * Get ordinal suffix for a number (1st, 2nd, 3rd, 4th, etc.)
   */
  function getOrdinalSuffix(n: number): string {
    const j = n % 10;
    const k = n % 100;
    if (j === 1 && k !== 11) return "st";
    if (j === 2 && k !== 12) return "nd";
    if (j === 3 && k !== 13) return "rd";
    return "th";
  }

  // Add generation diversity for non-first images
  let generationNote = "";
  if (generationNumber && generationNumber > 1) {
    generationNote = `\n\nVariation note: ${generationNumber}${getOrdinalSuffix(generationNumber)} generation for this verse. Keep the same canonical scene, but vary composition and camera feel.`;
  }

  const prevHint = toContinuityHint(prevVerse);
  const nextHint = toContinuityHint(nextVerse);

  const includeNarrativeContext = Boolean(prevHint || nextHint);
  const narrativeContext = includeNarrativeContext
    ? [
      "",
      "",
      "NARRATIVE CONTINUITY:",
      ...(prevHint ? [`- Previous: ${prevHint}`] : []),
      ...(nextHint ? [`- Next: ${nextHint}`] : []),
      "Keep continuity cues only; focus composition on the current verse moment.",
    ].join("\n")
    : "";

  const promptInputs = {
    reference,
    aspectRatio,
    styleProfileId: styleProfile.id,
    ...(scenePlan ? { scenePlan } : {}),
    ...(generationNumber ? { generationNumber } : {}),
    ...(prevVerse ? { prevVerse: { ...prevVerse, text: clipText(prevVerse.text, CONTINUITY_HINT_MAX_CHARS) } } : {}),
    ...(nextVerse ? { nextVerse: { ...nextVerse, text: clipText(nextVerse.text, CONTINUITY_HINT_MAX_CHARS) } } : {}),
  };

  const priorityRules = `PRIORITY RULES:
1) No text or symbols anywhere (letters, numbers, signage, labels, logos, watermarks, inscriptions).
2) Full-bleed immersive scene only (no frame, border, canvas-on-wall, poster, mockup, visible paper, matting, or blank backdrop).
3) Single unified scene only (no split panels, collage, or multi-scene layout).`;

  const globalNegatives = `GLOBAL NEGATIVES:
- No modern artifacts or technology (vehicles, screens, guns, electric fixtures, modern buildings, modern clothing).
- No anachronistic materials (plastic, neon, LEDs).
- No blank white, cream, or beige background; no gallery wall, studio sweep, paper backdrop, or empty negative-space presentation.
- No distorted anatomy (extra limbs/fingers, malformed hands/feet, warped faces).`;

  const scenePresentation = `SCENE PRESENTATION:
- Depict the moment directly, as if the viewer is present inside the biblical scene.
- The image itself is the scene, not a photo of a painting, fresco, mural, manuscript, print, or gallery installation.
- Extend scenery, sky, cloud, darkness, architecture, foliage, or atmosphere all the way to the edges.
- Background must be environmental and in-world, never a blank white/cream/beige backdrop or studio sweep.`;

  const scenePlanBlock = scenePlan ? formatScenePlan(scenePlan) : "";
  const styleSummary = [
    `STYLE PROFILE: ${styleProfile.label}`,
    `Rendering: ${styleProfile.rendering}`,
    styleProfile.palette ? `Palette: ${styleProfile.palette}` : "",
    styleProfile.lighting ? `Lighting: ${styleProfile.lighting}` : "",
    styleProfile.materials ? `Materials/Texture: ${styleProfile.materials}` : "",
    styleProfile.composition ? `Composition: ${styleProfile.composition}` : "",
    "",
    "STYLE NEGATIVES:",
    styleProfile.negative,
  ]
    .filter(Boolean)
    .join("\n");

  const buildPrompt = (options: {
    includeNarrative: boolean;
    includeGenerationNote: boolean;
    includeFullStyleDetails: boolean;
  }): string => {
    const styleBlock = options.includeFullStyleDetails
      ? styleSummary
      : `STYLE PROFILE: ${styleProfile.label}
Rendering: ${styleProfile.rendering}

STYLE NEGATIVES:
${styleProfile.negative}`;

    const chapterThemeBlock = chapterTheme
      ? `CHAPTER THEME:
Setting: ${chapterTheme.setting}
Visual elements: ${chapterTheme.elements}
Color palette: ${chapterTheme.palette}
Style: ${chapterTheme.style}

`
      : "";

    const generationBlock = options.includeGenerationNote ? generationNote : "";
    const continuityBlock = options.includeNarrative ? narrativeContext : "";

    return `${priorityRules}

SCENE:
Render a single, cohesive biblical-era scene for ${reference}: "${clipText(verseText, 900)}"${scenePlanBlock}${continuityBlock}${generationBlock}

${scenePresentation}

${chapterThemeBlock}${styleBlock}

${globalNegatives}

${aspectRatioInstruction}`;
  };

  let includeNarrative = includeNarrativeContext;
  let includeGeneration = Boolean(generationNote);
  let includeFullStyle = true;
  let prompt = buildPrompt({
    includeNarrative,
    includeGenerationNote: includeGeneration,
    includeFullStyleDetails: includeFullStyle,
  });

  if (prompt.length > PROMPT_MAX_CHARS && includeGeneration) {
    includeGeneration = false;
    prompt = buildPrompt({
      includeNarrative,
      includeGenerationNote: includeGeneration,
      includeFullStyleDetails: includeFullStyle,
    });
  }

  if (prompt.length > PROMPT_MAX_CHARS && includeFullStyle) {
    includeFullStyle = false;
    prompt = buildPrompt({
      includeNarrative,
      includeGenerationNote: includeGeneration,
      includeFullStyleDetails: includeFullStyle,
    });
  }

  if (prompt.length > PROMPT_MAX_CHARS && includeNarrative) {
    includeNarrative = false;
    prompt = buildPrompt({
      includeNarrative,
      includeGenerationNote: includeGeneration,
      includeFullStyleDetails: includeFullStyle,
    });
  }

  if (prompt.length > PROMPT_MAX_CHARS) {
    prompt = prompt.slice(0, PROMPT_MAX_CHARS).trimEnd();
  }

  const promptPacket: PromptPacket = {
    verseId,
    translationId,
    reference,
    currentVerse: clipText(verseText, 350),
    styleProfileId: styleProfile.id,
    aspectRatio,
    resolution,
    ...(chapterTheme ? { chapterTheme } : {}),
    ...((prevHint || nextHint) ? { continuity: { ...(prevHint ? { previous: prevHint } : {}), ...(nextHint ? { next: nextHint } : {}) } } : {}),
    ...(scenePlan ? { scenePlan } : {}),
    flags: {
      scenePlannerUsed,
      scenePlanFromCache,
      narrativeContextIncluded: includeNarrative,
      generationNoteIncluded: includeGeneration,
    },
    budget: {
      maxChars: PROMPT_MAX_CHARS,
      finalChars: prompt.length,
    },
  };

  return { prompt, promptPacket, promptInputs };
}

/** Includes full canonical text, even portions clipped out of the planner prompt. */
export function scenePlanInputFingerprint(input: ScenePlannerInput): string {
  const neighbor = (verse: ScenePlannerInput["prevVerse"]) => verse
    ? [verse.number, verse.text, verse.reference ?? null] : null;
  const style = input.styleProfile;
  const theme = input.chapterTheme;
  return createHash("sha256").update(JSON.stringify([
    "scene-input-v1", input.reference, input.verseText,
    neighbor(input.prevVerse), neighbor(input.nextVerse),
    theme ? [theme.setting, theme.palette, theme.elements, theme.style] : null,
    [style.id, style.label, style.rendering, style.palette ?? null, style.lighting ?? null,
      style.materials ?? null, style.composition ?? null, style.negative],
    buildScenePlannerPrompt(input),
  ])).digest("hex");
}
