/**
 * The generic rendering packet (#173, spec #165 §3, §5, §6): one prompt per image built from the
 * engine rules, the work brief's prompt form for the moment's era, the selected canon, the
 * owner look constraints when given, the style-neutral scene plan, the art style's rendering and the captions of up
 * to three reference images, ranked so the plan's main figures get the sheet slots (ADR 0009). A subject without form
 * is described by its effects, never named, and its scene omits the source text. Precedence, strongest first: engine rules, brief content and depiction rules, canon identity,
 * style rendering, scene plan. The prompt is capped at 12,000
 * characters; nothing required is ever trimmed, and an over-budget result is rejected before
 * any paid call.
 */
import { SITUATION_FIELDS, type Situation } from "./situation";
import type { ArtStyle, WorkBrief } from "../work-preparation";
import { COMMON_CONTENT_FLOOR } from "../work-preparation";
import { effectsWordingFor, readDepictionProfile, symbolWordingFor, type DepictionMode, type DepictionProfile } from "./depiction";

/** Structure, wording and reference choice of the generic prompt; data (brief, style, canon, look, plan) carry their own versions. v15 ranks sheet slots (ADR 0009). */
export const GENERIC_PROMPT_VERSION = "2026-10-29-generic-v15";
/** Prompt text is cheap next to the image itself (12,000 characters is about $0.001); the cap only guards runaway input. */
export const GENERIC_PROMPT_MAX_CHARS = 12000;
export const MAX_REFERENCE_IMAGES = 3;
const MOMENT_TEXT_MAX_CHARS = 1200;
const NEIGHBOR_HINT_MAX_CHARS = 220;

/** `hasForm` is false only for `effects` entries; `depiction` tells a `symbol` entry (drawn only as its canon's non-human form) from `form`. */
export type SelectedCanon = { entryId: string; stageId: string; kind: "character" | "location" | "object"; name: string; text: string; hasForm: boolean; depiction?: DepictionMode; version: string };
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
  /** Owner look constraints, rendered verbatim when supplied. Generated plans carry their own setting and time (since generic-v10). */
  situation?: Situation | null;
  plan: { version: string; primarySubject: string; action: string; setting: string; secondaryElements: string; mood: string; timeOfDay: string; composition: string };
  /** The entries the plan marked present, with the stage the section assigns them. */
  canon: SelectedCanon[];
  references?: AvailableReference[];
  /** Evaluation control: remove only the selected style reference, preserving sheets and trim decisions. */
  omitStyleReference?: boolean;
  variationNumber?: number | null;
  aspectRatio: "16:9" | "21:9" | "3:2";
  /** The work's own wording for the rules and for subjects without form (ADR 0010); read from the checkout when omitted. */
  depiction?: DepictionProfile;
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
  /** The work's depiction profile the prompt was built from; absent on packets made before profiles. */
  depictionVersion: string;
  canon: Array<{ entryId: string; stageId: string; version: string }>;
  references: Array<{ kind: AvailableReference["kind"]; id: string; storageId: string; version: string; caption: string }>;
  flags: { variationIncluded: boolean; neighborsIncluded: boolean; styleDetailIncluded: boolean; lookDetailIncluded: boolean; omitStyleReference?: true };
  budget: { maxChars: number; finalChars: number };
};

export type RenderingResult =
  | { ok: true; prompt: string; references: SelectedReference[]; packet: RenderingPacket }
  | { ok: false; error: string; finalChars: number };

/** "a, b and c", or with another final conjunction. */
const listed = (items: readonly string[], last = "and") => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${last} ${items[items.length - 1]}`;

/**
 * Short, general rules: every word here is repeated in every image prompt. The work names where its writing
 * appears, any serious subjects beyond the engine's floor, and its rule for subjects without form (ADR 0010).
 */
export function engineRules(depiction: DepictionProfile): string[] {
  return [
    `No text or symbols anywhere: no letters, numbers, signage, logos or inscriptions, no writing on ${depiction.writingSurfaces}, and no artist's signature or initials in a corner.`,
    "One scene painted to every edge of the frame: no panels, collage, border, frame, margin, visible paper or blank backdrop, and never a photographed painting or mockup.",
    "Nothing from outside the moment's era.",
    "Natural anatomy: no extra or malformed limbs, hands or faces.",
    `${COMMON_CONTENT_FLOOR.prohibited.join(" and ").toLowerCase()} are never shown; serious depictions of ${listed([...COMMON_CONTENT_FLOOR.seriousSubjects, ...depiction.seriousSubjects])} and ${COMMON_CONTENT_FLOOR.permitted.join(" and ").toLowerCase()} may be, treated seriously.`,
    "No likeness of any real actor, performer or public figure.",
    "Show the SELECTED CHARACTERS with their canon. Anyone else appears only as an unnamed figure the scene plan describes.",
    ...(depiction.modes.effects ? [depiction.modes.effects.renderRule] : []),
  ];
}
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
 * The words a plan may call an entry by: its name, the name up to a comma, bracket or slash, its canon label, and the
 * capitalised words those begin with ("Simon Peter" gives "Peter"). Words after a lowercase one qualify the name rather
 * than name the entry, so "The men with Saul" never answers to "Saul".
 */
function entryNames(entry: SelectedCanon) {
  const head = entry.name.split(/[,(/]/)[0].trim();
  const label = entry.text.match(/^([^:\n]{1,80}):/)?.[1]?.trim() ?? "";
  const leading = (name: string) => { const words = name.split(/\s+/); const end = words.findIndex((word) => !/^\p{Lu}/u.test(word)); return end < 0 ? words : words.slice(0, end); };
  const words = [head, label].flatMap(leading).filter((word) => word.length >= 4);
  return [...new Set([entry.name, head, label, ...words].filter((name) => name.length > 2))];
}
const names = (text: string, entry: SelectedCanon) =>
  entryNames(entry).some((name) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "iu").test(text));

/**
 * Sheet candidates in the order their slots are filled (ADR 0009): the best character, the best place, then the other
 * characters, places and objects. Within a kind, the entries the plan's primary subject names come first, then those its
 * action names, then plan order. No-form and symbol entries never have a sheet.
 */
export function rankSheetCandidates(canon: SelectedCanon[], plan?: { primarySubject: string; action: string } | null): SelectedCanon[] {
  const eligible = canon.filter((c) => c.hasForm && c.depiction !== "symbol");
  const weight = (c: SelectedCanon) => !plan ? 0 : names(plan.primarySubject, c) ? 2 : names(plan.action, c) ? 1 : 0;
  const ranked = (kind: SelectedCanon["kind"]) => eligible.map((c, index) => ({ c, index, weight: weight(c) })).filter((x) => x.c.kind === kind)
    .sort((a, b) => b.weight - a.weight || a.index - b.index).map((x) => x.c);
  const [characters, locations, objects] = [ranked("character"), ranked("location"), ranked("object")];
  return [...characters.slice(0, 1), ...locations.slice(0, 1), ...characters.slice(1), ...locations.slice(1), ...objects];
}

/**
 * Up to three references: the style reference, then the sheets of the ranked candidates that have one, so a candidate
 * without a sheet passes its slot to the next. Every style may have a style reference, Classical included: in the
 * 26 October image check, images sent with one showed neither white margins nor a figure for a no-form subject.
 */
export function selectReferences(canon: SelectedCanon[], available: AvailableReference[], styleId: string, plan?: { primarySubject: string; action: string } | null): SelectedReference[] {
  const picked: AvailableReference[] = [];
  const style = available.find((r) => r.kind === "styleReference" && r.styleId === styleId);
  if (style) picked.push(style);
  const sheetFor = (entry: SelectedCanon) => available.find((r) => r.kind === "sheet" && r.entryId === entry.entryId && r.stageId === entry.stageId);
  for (const entry of rankSheetCandidates(canon, plan)) {
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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildRenderingPacket(input: RenderingInput): RenderingResult {
  const { brief, style } = input;
  const depiction = input.depiction ?? readDepictionProfile(input.work.id);
  if (depiction.workId !== input.work.id) return { ok: false, error: `The depiction profile of ${depiction.workId} was given for ${input.work.id}.`, finalChars: 0 };
  const owner = input.situation ?? null;
  if (owner && SITUATION_FIELDS.some((field) => typeof owner[field] !== "string")) return { ok: false, error: "Owner look constraints are malformed.", finalChars: 0 };
  let references = selectReferences(input.canon, input.references ?? [], style.id, input.plan);
  const formed = input.canon.filter((c) => c.hasForm);
  const formless = input.canon.filter((c) => !c.hasForm);
  const names = formed.map((c) => c.name);
  // Image models draw a named deity, a quoted bodily metaphor, or a described veiled glow as a figure. When a subject
  // without form is present it is never named or described: the source text, neighbours and its canon are left out,
  // and only the plan's plain effects stand for it, in the work's own wording. A work with no such wording refuses.
  const presence = formless.length > 0;
  const symbols = input.canon.filter((c) => c.depiction === "symbol");
  let effects, symbol;
  try {
    effects = presence ? effectsWordingFor(depiction, formless.map((c) => c.entryId)) : null;
    symbol = symbols.length ? symbolWordingFor(depiction, symbols.map((c) => c.entryId)) : null;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), finalChars: 0 };
  }
  // A name such as "God / Yahweh, the Father and God of Israel" is also matched by its parts ("God", "Yahweh"), longest first.
  const nameParts = (name: string) => name.split(/\s*\/\s*/).flatMap((part) => [part, part.split(",")[0]]);
  const formlessNames = [...new Set(formless.flatMap((c) => [c.name, ...nameParts(c.name), c.text.match(/^([^:\n]{1,80}):/)?.[1] ?? ""])
    .map((n) => n.trim()).filter((n) => n.length > 2))].sort((x, y) => y.length - x.length);
  // Whole words only, so "Spirit" never rewrites "spiritual".
  const nameless = (text: string) => formlessNames.reduce((t, name) => t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu"), effects?.alias ?? name), text);
  // Callers may pass extra plan keys (such as a stored payload's `present` list); only scene text is rewritten.
  const plan = Object.fromEntries(Object.entries(input.plan).map(([key, value]) => [key, key === "version" || typeof value !== "string" ? value : nameless(value)])) as RenderingInput["plan"];
  // A symbol entry is never a person, so it is not among the selected characters; its canon still describes its form.
  const selectedCharacters = `SELECTED CHARACTERS: ${formed.filter((c) => c.kind === "character" && c.depiction !== "symbol").map((c) => c.name).join("; ") || "(none with fixed canon; show only figures the scene plan describes, or none)"}`;
  const formlessBlock = effects?.renderBlock ?? "";
  const symbolBlock = symbol ? `${symbol.renderBlock} ${symbols.map((c) => c.name).join("; ")}.` : "";
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
    `PRIORITY RULES:\n${engineRules(depiction).map((rule, i) => `${i + 1}) ${rule}`).join("\n")}\n${PRECEDENCE_LINE}`,
    presence ? `SCENE: one moment of ${input.work.title}, described by the scene plan below.` : `SCENE: one moment of ${input.work.title}, ${input.moment.reference}: "${clip(input.moment.text, MOMENT_TEXT_MAX_CHARS)}"`,
    // In a scene with a presence, the brief's own rules name it too ("God the Father has no human face…").
    presence ? nameless(briefBlock(brief, input.eraId, style.id)) : briefBlock(brief, input.eraId, style.id),
    selectedCharacters,
    formlessBlock,
    symbolBlock,
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
    references = selectReferences(input.canon, references.filter((r) => r.kind !== "styleReference"), style.id, input.plan);
    prompt = assemble(flags);
  }
  return {
    ok: true, prompt, references,
    packet: {
      promptVersion: GENERIC_PROMPT_VERSION, workId: input.work.id, momentId: input.moment.id, sectionId: input.moment.sectionId, eraId: input.eraId,
      styleId: style.id, styleVersion: input.styleVersion, briefVersion: input.briefVersion, lookVersion: input.look.version, planVersion: plan.version, depictionVersion: depiction.version,
      canon: input.canon.map((c) => ({ entryId: c.entryId, stageId: c.stageId, version: c.version })),
      references: references.map((r) => ({ kind: r.kind, id: r.kind === "sheet" ? `${r.entryId}:${r.stageId}` : r.styleId, storageId: r.storageId, version: r.version, caption: r.caption })),
      flags: { ...flags, ...(input.omitStyleReference ? { omitStyleReference: true as const } : {}) }, budget: { maxChars: GENERIC_PROMPT_MAX_CHARS, finalChars: prompt.length },
    },
  };
}
