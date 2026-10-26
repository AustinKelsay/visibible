/**
 * The generic rendering packet (#173, spec #165 §3, §5, §6): one prompt per image built from the
 * engine rules, the work brief's prompt form for the moment's era, the selected canon, the
 * resolved moment conditions, the style-neutral scene plan, the art style's rendering and the captions of up
 * to three reference images. Precedence, strongest first: engine rules, brief content and
 * depiction rules, canon identity, style rendering, moment plan and resolved conditions. The prompt is capped at 8,000
 * characters; nothing required is ever trimmed, and an over-budget result is rejected before
 * any paid call. Legacy Bible wording lives only in image-prompts.ts and never reaches this path.
 */
import { SITUATION_FIELDS, type Situation } from "./situation";
import type { ArtStyle, WorkBrief } from "../work-preparation";
import { COMMON_CONTENT_FLOOR } from "../work-preparation";

/** Structure and wording of the generic prompt; data (brief, style, canon, look, plan) carry their own versions. */
export const GENERIC_PROMPT_VERSION = "2026-10-26-generic-v8";
export const GENERIC_PROMPT_MAX_CHARS = 8000;
export const MAX_REFERENCE_IMAGES = 3;
const MOMENT_TEXT_MAX_CHARS = 1200;
const NEIGHBOR_HINT_MAX_CHARS = 220;

export type SelectedCanon = { entryId: string; stageId: string; kind: "character" | "location" | "object"; name: string; text: string; hasForm: boolean; version: string };
export type AvailableReference =
  | { kind: "styleReference"; styleId: string; storageId: string; version: string }
  | { kind: "sheet"; entryId: string; stageId: string; storageId: string; version: string };
export type SelectedReference = AvailableReference & { caption: string; index: number };

export type RenderingInput = {
  work: { id: string; title: string };
  moment: { id: string; sectionId: string; reference: string; text: string };
  neighbors?: { previous?: string | null; next?: string | null };
  brief: WorkBrief;
  briefVersion: string;
  eraId: string;
  style: ArtStyle;
  styleVersion: string;
  look: { version: string; place: string; timeOfDay: string; weather: string; light: string; clothing: string };
  /** Required for v8 rendering; optional in the type so historical frozen harnesses still compile. */
  situation?: Situation;
  plan: { version: string; primarySubject: string; action: string; setting: string; secondaryElements: string; mood: string; timeOfDay: string; composition: string };
  /** The entries the plan marked present, with the stage the section assigns them. */
  canon: SelectedCanon[];
  references?: AvailableReference[];
  /** Evaluation control: remove only the selected style reference, preserving sheets and trim decisions. */
  omitStyleReference?: boolean;
  variationNumber?: number | null;
  aspectRatio: "16:9" | "21:9" | "3:2";
};

export type RenderingPacket = {
  promptVersion: typeof GENERIC_PROMPT_VERSION;
  workId: string;
  momentId: string;
  sectionId: string;
  eraId: string;
  styleId: string;
  styleVersion: string;
  briefVersion: string;
  lookVersion: string;
  planVersion: string;
  canon: Array<{ entryId: string; stageId: string; version: string }>;
  references: Array<{ kind: AvailableReference["kind"]; id: string; storageId: string; version: string; caption: string }>;
  flags: { variationIncluded: boolean; neighborsIncluded: boolean; styleDetailIncluded: boolean; lookDetailIncluded: boolean; omitStyleReference?: true };
  budget: { maxChars: number; finalChars: number };
};

export type RenderingResult =
  | { ok: true; prompt: string; references: SelectedReference[]; packet: RenderingPacket }
  | { ok: false; error: string; finalChars: number };

export const ENGINE_RULES = [
  "No text or symbols anywhere (letters, numbers, signage, labels, logos, watermarks, inscriptions).",
  "One single scene filling the whole frame: no split panels, collage, frame, border, canvas-on-wall, poster, mockup, visible paper, matting or blank studio backdrop.",
  "The image is the scene itself, never a photographed painting, print, mural or gallery piece.",
  "Nothing from outside the moment's era: no later technology, clothing, materials or buildings.",
  "No distorted anatomy (extra limbs or fingers, malformed hands or feet, warped faces).",
  `${COMMON_CONTENT_FLOOR.prohibited.join(" and ").toLowerCase()} are never shown; ${COMMON_CONTENT_FLOOR.permitted.join(" and ").toLowerCase()} may be, treated seriously.`,
  "No likeness of any real actor, performer or public figure.",
  "Depict the SELECTED CHARACTERS, including groups and no-form subjects, with their canon. Other people, crowds or animals appear only where the scene plan describes them, as unnamed incidental figures without fixed appearance. Moment conditions, source narrators and neighbors do not add figures; apply situational clothing only to selected characters.",
  "No-form effects representing a subject, such as divine radiance, appear only when that subject is in SELECTED CHARACTERS and the scene plan describes its presence. Omit such effects from moment conditions when that subject is unselected or absent from the plan, even if the conditions call them light, weather or background. Ordinary sunlight, lamplight, embers and weather remain setting details.",
];
export const CONTENT_OWNERSHIP = "The source establishes the scene and participants. Selected canon fixes identity and appearance. The scene plan and resolved moment conditions own this moment's place, time, weather, light, situational clothing, action and effect placement. Original generated section looks are advisory provenance, not rendering instructions. Explicit owner look constraints stay binding verbatim. Neither conditions nor canon adds participants or events.";
export const PRECEDENCE_LINE = `If instructions conflict, follow them in this order: these rules, then the work brief, then canon identity, then the art style's rendering, then the scene plan and resolved moment conditions. ${CONTENT_OWNERSHIP}`;

function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Depiction rules that apply to this style: unconditional ones and those naming it. */
export function applicableRules(brief: WorkBrief, styleId: string) {
  return brief.depictionRules.filter((rule) => !rule.styleIds || rule.styleIds.includes(styleId)).map((rule) => rule.text);
}

export function briefBlock(brief: WorkBrief, eraId: string, styleId: string): string {
  const era = brief.eras.find((e) => e.id === eraId);
  if (!era) throw new Error(`Unknown era ${eraId}`);
  return [
    `WORK BRIEF (${brief.workId}; what may be shown; it outranks the style, the look and the plan):`,
    `Tone: ${brief.tone}`,
    ...applicableRules(brief, styleId).map((text) => `Depiction: ${text}`),
    `Era: ${era.label}`, `People: ${era.people}`, `Dress: ${era.dress}`, `Buildings and objects: ${era.buildingsAndObjects}`, `Technology: ${era.technology}`,
  ].join("\n");
}

/** Up to three references in the agreed order: style reference, main character, location, second character. No-form entries never contribute. */
export function selectReferences(canon: SelectedCanon[], available: AvailableReference[], styleId: string): SelectedReference[] {
  const picked: AvailableReference[] = [];
  if (styleId !== "classical") {
    const style = available.find((r) => r.kind === "styleReference" && r.styleId === styleId);
    if (style) picked.push(style);
  }
  const sheetFor = (entry: SelectedCanon) => available.find((r) => r.kind === "sheet" && r.entryId === entry.entryId && r.stageId === entry.stageId);
  const eligible = canon.filter((c) => c.hasForm);
  const characters = eligible.filter((c) => c.kind === "character");
  const locations = eligible.filter((c) => c.kind === "location");
  const order = [characters[0], locations[0], characters[1]].filter((c): c is SelectedCanon => Boolean(c));
  for (const entry of order) {
    const sheet = sheetFor(entry);
    if (sheet && picked.length < MAX_REFERENCE_IMAGES) picked.push(sheet);
  }
  return picked.slice(0, MAX_REFERENCE_IMAGES).map((reference, index) => {
    const n = `Image ${index + 1}`;
    if (reference.kind === "styleReference") {
      return { ...reference, index, caption: `${n}: art-style reference. Copy only its rendering technique, palette and texture; ignore its subject, landscape and layout.` };
    }
    const entry = canon.find((c) => c.entryId === reference.entryId)!;
    const views = entry.kind === "character" ? "one figure shown in three views" : "two views of the same place or thing";
    return { ...reference, index, caption: `${n}: ${entry.name}'s reference sheet (${views}). Match its identity exactly for ${entry.name} only; do not copy its poses, layout or plain grey background, and give other selected figures a different face and clothing.` };
  });
}

export function buildRenderingPacket(input: RenderingInput): RenderingResult {
  const { brief, style, plan } = input;
  const look = input.situation;
  if (!look || SITUATION_FIELDS.some((field) => typeof look[field] !== "string")) return { ok: false, error: "Reviewed moment conditions are required for rendering.", finalChars: 0 };
  let references = selectReferences(input.canon, input.references ?? [], style.id);
  const names = input.canon.filter((c) => c.hasForm).map((c) => c.name);
  const formless = input.canon.filter((c) => !c.hasForm);
  const selectedCharacters = `SELECTED CHARACTERS: ${input.canon.filter((c) => c.kind === "character").map((c) => c.name).join("; ") || "(none with fixed canon; show only figures the scene plan describes, or none)"}`;
  const formlessBlock = formless.length
    ? ["FORMLESS SUBJECTS (binding depiction constraints, including when the source uses bodily metaphors):",
      ...formless.map((c) => `- ${c.name}: represent only through the non-figurative presence allowed by its canon and the work brief. No head, face, torso, limbs, hands, human silhouette or garment-shaped body, even faceless or made of light. Do not represent this subject as a figure occupying a seat.`),
      "These constraints apply only to the named subjects; other characters retain their own canon forms."].join("\n")
    : "";
  const canonBlock = input.canon.length
    ? ["CANON (fixed identity of the figures, places and things present; the scene plan decides pose, expression and action):",
      ...input.canon.map((c) => `- ${c.text}`),
      ...(names.length ? [`- Only ${names.join(", ")} ${names.length > 1 ? "have" : "has"} this canon look; other selected people get clearly different faces, hair and clothing colours.`] : [])].join("\n")
    : "";
  const planBlock = ["SCENE PLAN (this moment's place, time and action; obey the rules, brief, canon and style):",
    `Primary subject: ${plan.primarySubject}`, `Action: ${plan.action}`, `Setting: ${plan.setting}`, `Secondary elements: ${plan.secondaryElements}`,
    `Mood: ${plan.mood}`, `Time of day: ${plan.timeOfDay}`, `Composition: ${plan.composition}`].join("\n");
  const referenceBlock = () => references.length
    ? ["REFERENCE IMAGES (attached after this text, in this order; identity and rendering only, never the composition):", ...references.map((r) => `- ${r.caption}`),
      "Render everything in the ART STYLE above, even where a reference is painted in another style."].join("\n")
    : "";
  const styleMain = `ART STYLE: ${style.label}\nRendering: ${style.rendering}\nNegatives: ${style.negatives}`;
  const styleDetail = `Palette: ${style.palette}\nLighting: ${style.lighting}\nMaterials and texture: ${style.materials}\nComposition: ${style.composition}`;
  const lookMain = `MOMENT CONDITIONS (resolved with the scene plan; binding content, shared by all styles):\nPlace: ${look.place}\nTime of day: ${look.timeOfDay}`;
  const lookDetail = `Weather: ${look.weather}\nLight: ${look.light}\nClothing: ${look.clothing}`;
  const prev = input.neighbors?.previous ? clip(input.neighbors.previous, NEIGHBOR_HINT_MAX_CHARS) : null;
  const next = input.neighbors?.next ? clip(input.neighbors.next, NEIGHBOR_HINT_MAX_CHARS) : null;
  const neighborBlock = prev || next
    ? ["NARRATIVE CONTINUITY (cues only; compose the current moment):", ...(prev ? [`- Before: ${prev}`] : []), ...(next ? [`- After: ${next}`] : [])].join("\n")
    : "";
  const variationBlock = input.variationNumber && input.variationNumber > 1
    ? `Variation note: this is image ${input.variationNumber} of this moment. Keep the same canonical scene, but vary composition and camera feel.`
    : "";
  const aspect = { "16:9": "WIDESCREEN", "21:9": "ULTRA-WIDE CINEMATIC", "3:2": "CLASSIC WIDE" }[input.aspectRatio];

  const assemble = (flags: RenderingPacket["flags"]) => [
    `PRIORITY RULES:\n${ENGINE_RULES.map((rule, i) => `${i + 1}) ${rule}`).join("\n")}\n${PRECEDENCE_LINE}`,
    `SCENE: one moment of ${input.work.title}, ${input.moment.reference}: "${clip(input.moment.text, MOMENT_TEXT_MAX_CHARS)}"`,
    briefBlock(brief, input.eraId, style.id),
    selectedCharacters,
    formlessBlock,
    canonBlock,
    `${lookMain}\n${lookDetail}`,
    planBlock,
    flags.styleDetailIncluded ? `${styleMain}\n${styleDetail}` : styleMain,
    referenceBlock(),
    flags.neighborsIncluded ? neighborBlock : "",
    flags.variationIncluded ? variationBlock : "",
    `SCENE PRESENTATION:\n- Depict the moment directly, as if the viewer is present inside the scene.\n- Extend scenery, sky, darkness, architecture or atmosphere all the way to the edges.\nAspect ratio: ${input.aspectRatio} (${aspect} landscape).`,
  ].filter(Boolean).join("\n\n");

  // Resolved conditions are reviewed content, not optional look detail. Never trim them or canon.
  // Retain lookDetailIncluded in stored packet flags for compatibility; it is always true in v8.
  const flags: RenderingPacket["flags"] = { variationIncluded: Boolean(variationBlock), neighborsIncluded: Boolean(neighborBlock), styleDetailIncluded: true, lookDetailIncluded: true };
  let prompt = assemble(flags);
  for (const flag of ["variationIncluded", "neighborsIncluded", "styleDetailIncluded"] as const) {
    if (prompt.length <= GENERIC_PROMPT_MAX_CHARS) break;
    if (!flags[flag]) continue;
    flags[flag] = false;
    prompt = assemble(flags);
  }
  if (prompt.length > GENERIC_PROMPT_MAX_CHARS) {
    return { ok: false, error: `Rendering prompt is ${prompt.length} characters after every allowed trim; the cap is ${GENERIC_PROMPT_MAX_CHARS}. Shorten the brief, canon, plan or resolved conditions.`, finalChars: prompt.length };
  }
  if (input.omitStyleReference) {
    // Select and trim the control first. Do not backfill a freed slot or restore trimmed details.
    references = selectReferences(input.canon, references.filter((r) => r.kind !== "styleReference"), style.id);
    prompt = assemble(flags);
  }
  return {
    ok: true, prompt, references,
    packet: {
      promptVersion: GENERIC_PROMPT_VERSION, workId: input.work.id, momentId: input.moment.id, sectionId: input.moment.sectionId, eraId: input.eraId,
      styleId: style.id, styleVersion: input.styleVersion, briefVersion: input.briefVersion, lookVersion: input.look.version, planVersion: plan.version,
      canon: input.canon.map((c) => ({ entryId: c.entryId, stageId: c.stageId, version: c.version })),
      references: references.map((r) => ({ kind: r.kind, id: r.kind === "sheet" ? `${r.entryId}:${r.stageId}` : r.styleId, storageId: r.storageId, version: r.version, caption: r.caption })),
      flags: { ...flags, ...(input.omitStyleReference ? { omitStyleReference: true as const } : {}) }, budget: { maxChars: GENERIC_PROMPT_MAX_CHARS, finalChars: prompt.length },
    },
  };
}
