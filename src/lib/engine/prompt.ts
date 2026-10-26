/**
 * The generic rendering packet (#173, spec #165 §3, §5, §6): one prompt per image built from the
 * engine rules, the work brief's prompt form for the moment's era, the selected canon, the
 * owner look constraints when given, the style-neutral scene plan, the art style's rendering and the captions of up
 * to three reference images. A subject without form is described by its effects, never named, and its scene omits
 * the source text. Precedence, strongest first: engine rules, brief content and depiction rules, canon identity,
 * style rendering, scene plan. The prompt is capped at 12,000
 * characters; nothing required is ever trimmed, and an over-budget result is rejected before
 * any paid call. Legacy Bible wording lives only in image-prompts.ts and never reaches this path.
 */
import { SITUATION_FIELDS, type Situation } from "./situation";
import type { ArtStyle, WorkBrief } from "../work-preparation";
import { COMMON_CONTENT_FLOOR } from "../work-preparation";

/** Structure and wording of the generic prompt; data (brief, style, canon, look, plan) carry their own versions. */
export const GENERIC_PROMPT_VERSION = "2026-10-27-generic-v10";
/** Prompt text is cheap next to the image itself (12,000 characters is about $0.001); the cap only guards runaway input. */
export const GENERIC_PROMPT_MAX_CHARS = 12000;
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
  /** Owner look constraints, rendered verbatim when supplied. Generated plans carry their own setting and time (generic-v10). */
  situation?: Situation | null;
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

// Short, general rules: every word here is repeated in every image prompt.
export const ENGINE_RULES = [
  "No text or symbols anywhere: no letters, numbers, signage, logos, signatures or inscriptions.",
  "One scene painted to every edge of the frame: no panels, collage, border, frame, margin, visible paper or blank backdrop, and never a photographed painting or mockup.",
  "Nothing from outside the moment's era.",
  "Natural anatomy: no extra or malformed limbs, hands or faces.",
  `${COMMON_CONTENT_FLOOR.prohibited.join(" and ").toLowerCase()} are never shown; ${COMMON_CONTENT_FLOOR.permitted.join(" and ").toLowerCase()} may be, treated seriously.`,
  "No likeness of any real actor, performer or public figure.",
  "Show the SELECTED CHARACTERS with their canon. Anyone else appears only as an unnamed figure the scene plan describes.",
  "A subject without form appears only through its permitted effects, never as a figure, and only when it is selected.",
];
export const CONTENT_OWNERSHIP = "The text decides who is in the scene; canon decides how they look; the scene plan decides this moment's place, time, light, clothing and action. Owner look constraints, when given, are binding.";
export const PRECEDENCE_LINE = `If instructions conflict, follow these rules, then the work brief, then canon, then the art style, then the scene plan. ${CONTENT_OWNERSHIP}`;

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

/**
 * Up to three references in the agreed order: style reference, main character, location, second character. No-form entries never contribute.
 * Every style may have a style reference, Classical included: in the 26 October image check, images sent with one showed
 * neither white margins nor a figure for a no-form subject.
 */
export function selectReferences(canon: SelectedCanon[], available: AvailableReference[], styleId: string): SelectedReference[] {
  const picked: AvailableReference[] = [];
  const style = available.find((r) => r.kind === "styleReference" && r.styleId === styleId);
  if (style) picked.push(style);
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

/** Drop a leading "Name:" label from canon text so a no-form subject is described, never named. */
function unlabelled(text: string) {
  return text.replace(/^[^:\n]{1,80}:\s*/, "");
}
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildRenderingPacket(input: RenderingInput): RenderingResult {
  const { brief, style } = input;
  const owner = input.situation ?? null;
  if (owner && SITUATION_FIELDS.some((field) => typeof owner[field] !== "string")) return { ok: false, error: "Owner look constraints are malformed.", finalChars: 0 };
  let references = selectReferences(input.canon, input.references ?? [], style.id);
  const formed = input.canon.filter((c) => c.hasForm);
  const formless = input.canon.filter((c) => !c.hasForm);
  const names = formed.map((c) => c.name);
  // Image models draw a named deity, or a quoted bodily metaphor, as a figure. When a subject without form is present,
  // it is never named in the prompt and the source text and neighbours are left out; the plan describes its effects.
  const presence = formless.length > 0;
  const formlessNames = formless.flatMap((c) => [c.name, c.text.match(/^([^:\n]{1,80}):/)?.[1]?.trim()].filter((n): n is string => Boolean(n && n.length > 2)));
  // Whole words only, so "Spirit" never rewrites "spiritual".
  const nameless = (text: string) => formlessNames.reduce((t, name) => t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu"), "the presence"), text);
  const plan = Object.fromEntries(Object.entries(input.plan).map(([key, value]) => [key, key === "version" ? value : nameless(value)])) as RenderingInput["plan"];
  const selectedCharacters = `SELECTED CHARACTERS: ${formed.filter((c) => c.kind === "character").map((c) => c.name).join("; ") || "(none with fixed canon; show only figures the scene plan describes, or none)"}`;
  const formlessBlock = presence
    ? ["PRESENCE SHOWN ONLY AS EFFECTS (binding; it is not a person):",
      ...formless.map((c) => `- ${nameless(unlabelled(c.text))}`),
      "Show it only as light, cloud, fire or radiance where the scene plan places it. No figure, face, hands, robe, hair or seated shape, even made of light."].join("\n")
    : "";
  const canonBlock = formed.length
    ? ["CANON (fixed identity of the figures, places and things present; the scene plan decides pose, expression and action):",
      ...formed.map((c) => `- ${c.text}`),
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
  const ownerBlock = owner
    ? `OWNER LOOK CONSTRAINTS (binding, verbatim):\nPlace: ${owner.place}\nTime of day: ${owner.timeOfDay}\nWeather: ${owner.weather}\nLight: ${owner.light}\nClothing: ${owner.clothing}`
    : "";
  const prev = input.neighbors?.previous ? clip(input.neighbors.previous, NEIGHBOR_HINT_MAX_CHARS) : null;
  const next = input.neighbors?.next ? clip(input.neighbors.next, NEIGHBOR_HINT_MAX_CHARS) : null;
  const neighborBlock = !presence && (prev || next)
    ? ["NARRATIVE CONTINUITY (cues only; compose the current moment):", ...(prev ? [`- Before: ${prev}`] : []), ...(next ? [`- After: ${next}`] : [])].join("\n")
    : "";
  const variationBlock = input.variationNumber && input.variationNumber > 1
    ? `Variation note: this is image ${input.variationNumber} of this moment. Keep the same canonical scene, but vary composition and camera feel.`
    : "";
  const aspect = { "16:9": "WIDESCREEN", "21:9": "ULTRA-WIDE CINEMATIC", "3:2": "CLASSIC WIDE" }[input.aspectRatio];

  const assemble = (flags: RenderingPacket["flags"]) => [
    `PRIORITY RULES:\n${ENGINE_RULES.map((rule, i) => `${i + 1}) ${rule}`).join("\n")}\n${PRECEDENCE_LINE}`,
    presence ? `SCENE: one moment of ${input.work.title}, described by the scene plan below.` : `SCENE: one moment of ${input.work.title}, ${input.moment.reference}: "${clip(input.moment.text, MOMENT_TEXT_MAX_CHARS)}"`,
    // In a scene with a presence, the brief's own rules name it too ("God the Father has no human face…").
    presence ? nameless(briefBlock(brief, input.eraId, style.id)) : briefBlock(brief, input.eraId, style.id),
    selectedCharacters,
    formlessBlock,
    canonBlock,
    ownerBlock,
    planBlock,
    flags.styleDetailIncluded ? `${styleMain}\n${styleDetail}` : styleMain,
    referenceBlock(),
    flags.neighborsIncluded ? neighborBlock : "",
    flags.variationIncluded ? variationBlock : "",
    `SCENE PRESENTATION:\n- Depict the moment directly, as if the viewer is present inside the scene.\n- Extend scenery, sky, darkness, architecture or atmosphere all the way to the edges and corners.\nAspect ratio: ${input.aspectRatio} (${aspect} landscape).`,
  ].filter(Boolean).join("\n\n");

  // Canon, the plan and owner constraints are required content and are never trimmed.
  // lookDetailIncluded stays in stored packet flags for compatibility; it is always true.
  const flags: RenderingPacket["flags"] = { variationIncluded: Boolean(variationBlock), neighborsIncluded: Boolean(neighborBlock), styleDetailIncluded: true, lookDetailIncluded: true };
  let prompt = assemble(flags);
  for (const flag of ["variationIncluded", "neighborsIncluded", "styleDetailIncluded"] as const) {
    if (prompt.length <= GENERIC_PROMPT_MAX_CHARS) break;
    if (!flags[flag]) continue;
    flags[flag] = false;
    prompt = assemble(flags);
  }
  if (prompt.length > GENERIC_PROMPT_MAX_CHARS) {
    return { ok: false, error: `Rendering prompt is ${prompt.length} characters after every allowed trim; the cap is ${GENERIC_PROMPT_MAX_CHARS}. Shorten the brief, canon, plan or owner constraints.`, finalChars: prompt.length };
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
