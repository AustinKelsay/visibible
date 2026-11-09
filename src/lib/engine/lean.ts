/**
 * The lean rendering candidate: one image prompt built straight from the source text, with no section look, scene
 * plan, plan review or finished-image check. The image model reads the moment itself and decides the instant and
 * composition; the engine only supplies what the model cannot know: the work brief, the fixed canon of the section's
 * cast, their reference sheets and the art style. No model chooses the cast: every section member is offered, those
 * the moment or a neighbouring verse names first, and the image model draws whom the moment involves. Subjects without form keep their work's wording (ADR 0010):
 * their names are replaced in every text the prompt carries, and the effects rule is added.
 *
 * Evaluation candidate only: the request path still uses `assemble.ts`.
 */
import { applicableRules, briefBlock, engineRules } from "./prompt";
import { depictionModeOf, effectsWordingFor, symbolWordingFor, type DepictionMode, type DepictionProfile } from "./depiction";
import type { ArtStyle, WorkBrief } from "../work-preparation";

export const LEAN_PROMPT_VERSION = "2026-11-09-lean-v6";
/** Sheets beside the style reference; Nano Banana 2.1 takes many more, but each extra sheet risks an extra figure. */
export const LEAN_MAX_SHEETS = 4;
export const LEAN_PROMPT_MAX_CHARS = 12000;
const MOMENT_TEXT_MAX_CHARS = 1600;
const NEIGHBOR_MAX_CHARS = 400;

/** One section cast member with the canon stage the section assigns it. */
export type LeanCastMember = {
  entryId: string; stageId: string; kind: "character" | "location" | "object"; name: string; aliases: string[];
  text: string; depiction: DepictionMode; version: string;
};
export type LeanReference =
  | { kind: "styleReference"; styleId: string; storageId: string; version: string }
  | { kind: "sheet"; entryId: string; stageId: string; storageId: string; version: string };
export type LeanSelectedReference = LeanReference & { caption: string; index: number };

export type LeanInput = {
  work: { id: string; title: string };
  moment: { id: string; sectionId: string; reference: string; text: string };
  neighbors?: { previous?: string | null; next?: string | null };
  brief: WorkBrief;
  eraId: string;
  style: ArtStyle;
  /** The whole section cast; selection happens here. */
  cast: LeanCastMember[];
  references: LeanReference[];
  depiction: DepictionProfile;
  aspectRatio: "16:9" | "21:9" | "3:2";
};

export type LeanResult =
  | { ok: true; prompt: string; present: LeanRanked[]; references: LeanSelectedReference[]; packet: { promptVersion: string; finalChars: number; present: string[]; references: string[] } }
  | { ok: false; error: string };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clip = (text: string, max: number) => { const flat = text.replace(/\s+/g, " ").trim(); return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`; };
const wordPattern = (name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu");

/**
 * The words a text may call an entry by: its name, the name up to a comma, bracket or slash, each slash part, its
 * aliases, its canon label, and the capitalised leading words of those ("Simon Peter" gives "Peter"). Short words
 * and lowercase-led words are dropped, so "The men with Saul" never answers to "The".
 */
export function leanNames(member: Pick<LeanCastMember, "name" | "aliases" | "text">): string[] {
  const parts = member.name.split(/\s*\/\s*/).flatMap((part) => [part, part.split(/[,(]/)[0]]).flatMap((p) => [p.trim(), p.trim().replace(/^the\s+/i, "")]);
  const label = member.text.match(/^([^:\n]{1,80}):/)?.[1]?.trim() ?? "";
  const leading = (name: string) => { const words = name.replace(/^the\s+/i, "").split(/\s+/); const end = words.findIndex((w) => !/^\p{Lu}/u.test(w)); return end < 0 ? words : words.slice(0, end); };
  const words = [...parts, label].flatMap(leading).filter((w) => w.length >= 4);
  const aliases = member.aliases.flatMap((a) => [a, a.replace(/^the\s+/i, "")]);
  return [...new Set([member.name, ...parts, label, ...aliases, ...words].map((n) => n.trim()).filter((n) => n.length > 2))].sort((a, b) => b.length - a.length);
}

const mentions = (text: string | null | undefined, member: LeanCastMember) =>
  !text ? 0 : leanNames(member).reduce((n, name) => n + (text.match(wordPattern(name))?.length ?? 0), 0);

/** How often the moment, the verse before and the verse after name each member. */
export type LeanRanked = LeanCastMember & { named: { here: number; before: number; after: number } };

/**
 * The whole section cast, ranked: named in the moment first (most mentions first), then in the previous verse, then in
 * the next, then in section order. Nobody is dropped: a pronoun ("they crucified him") names no one, so the image
 * model reads the passage's cast and decides who the moment shows.
 */
export function rankLeanCast(cast: readonly LeanCastMember[], moment: string, neighbors?: { previous?: string | null; next?: string | null }): LeanRanked[] {
  return cast.map((member, index) => ({ member, index, named: { here: mentions(moment, member), before: mentions(neighbors?.previous, member), after: mentions(neighbors?.next, member) } }))
    .sort((a, b) => b.named.here - a.named.here || b.named.before - a.named.before || b.named.after - a.named.after || a.index - b.index)
    .map((x) => ({ ...x.member, named: x.named }));
}
const isNamed = (m: LeanRanked) => m.named.here + m.named.before + m.named.after > 0;

/** The canon's own label ("Jesus" for "Jesus Christ, the Son of God and Lord"), else the name up to a comma. */
const shortName = (m: Pick<LeanCastMember, "name" | "text">) => m.text.match(/^([^:\n]{1,60}):/)?.[1]?.trim() || m.name.split(/[,(/]/)[0].trim();

/** The style reference first, then the sheets of present form entries: characters, then places, then objects. */
export function selectLeanReferences(present: readonly LeanCastMember[], available: readonly LeanReference[], styleId: string): LeanSelectedReference[] {
  const picked: LeanReference[] = [];
  const style = available.find((r) => r.kind === "styleReference" && r.styleId === styleId);
  if (style) picked.push(style);
  // Ranked order, except that the best place gets the second slot (ADR 0009): a scene needs its main figure and its place.
  const sheetOf = (m: LeanCastMember) => available.find((r) => r.kind === "sheet" && r.entryId === m.entryId && r.stageId === m.stageId);
  const drawable = present.filter((m) => m.depiction === "form" && sheetOf(m));
  const firstCharacter = drawable.find((m) => m.kind === "character");
  const firstPlace = drawable.find((m) => m.kind === "location");
  const ordered = [...new Set([firstCharacter, firstPlace, ...drawable].filter((m): m is LeanCastMember => Boolean(m)))];
  for (const member of ordered) {
    if (picked.length - (style ? 1 : 0) >= LEAN_MAX_SHEETS) break;
    picked.push(sheetOf(member)!);
  }
  return picked.map((reference, index) => {
    const n = `Image ${index + 1}`;
    if (reference.kind === "styleReference") return { ...reference, index, caption: `${n}: art-style reference. Copy only its rendering technique, palette and texture; ignore its subject and layout.` };
    const member = present.find((m) => m.entryId === reference.entryId)!;
    const name = shortName(member);
    const views = member.kind === "character" ? "one figure in several views" : "views of one place or thing";
    return { ...reference, index, caption: `${n}: ${name}'s reference sheet (${views}). Keep ${name}'s identity exactly; do not copy its poses, layout or plain background.` };
  });
}

export function buildLeanRendering(input: LeanInput): LeanResult {
  const { brief, style, depiction } = input;
  if (depiction.workId !== input.work.id) return { ok: false, error: `The depiction profile of ${depiction.workId} was given for ${input.work.id}.` };
  const present = rankLeanCast(input.cast, input.moment.text, input.neighbors);
  const formless = present.filter((m) => m.depiction === "effects");
  const symbols = present.filter((m) => m.depiction === "symbol");
  const formed = present.filter((m) => m.depiction === "form");
  let effects, symbol;
  try {
    effects = formless.length ? effectsWordingFor(depiction, formless.map((m) => m.entryId)) : null;
    symbol = symbols.length ? symbolWordingFor(depiction, symbols.map((m) => m.entryId)) : null;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  // Every subject without form in the section is renamed, mentioned or not, so no text the model reads names it.
  const unseen = input.cast.filter((m) => m.depiction === "effects").flatMap(leanNames).sort((a, b) => b.length - a.length);
  const alias = depiction.modes.effects?.alias;
  const nameless = (text: string) => alias ? unseen.reduce((t, name) => t.replace(wordPattern(name), alias), text) : text;
  // Canon and captions of other entries can name it too ("Yahweh's house in Jerusalem"), so they are renamed as well.
  const references = selectLeanReferences(present, input.references, style.id).map((r) => ({ ...r, caption: nameless(r.caption) }));
  const prev = input.neighbors?.previous ? nameless(clip(input.neighbors.previous, NEIGHBOR_MAX_CHARS)) : null;
  const next = input.neighbors?.next ? nameless(clip(input.neighbors.next, NEIGHBOR_MAX_CHARS)) : null;
  // The engine's rules, with the planner's cast rule replaced by the text's own.
  // The work's effects rule is worded for a scene plan; here the moment stands in its place.
  const unplanned = (text: string) => text.replace(/Only when it is selected may the (.+?) in the scene plan stand for it/u, "Only the $1 the moment names may stand for it")
    .replace(/the scene plan names/gu, "the moment names").replace(/in the scene plan/gu, "in the moment");
  const rules = engineRules(depiction).filter((rule) => !rule.startsWith("Show the SELECTED CHARACTERS")).map(unplanned);
  rules.push("A character you draw from CANON keeps exactly that look. Anyone else the moment needs appears as an unnamed figure with an ordinary, different face.");
  const canonBlock = (title: string, members: LeanRanked[]) => members.length ? [title, ...members.map((m) => `- ${nameless(m.text)}`)].join("\n") : "";
  // The passage's places get their own block: a verse seldom names where it happens, and a place filed with the cast the
  // moment may leave out is redrawn from scratch in every image.
  const places = formed.filter((m) => m.kind === "location");
  const cast = [...formed.filter((m) => m.kind !== "location"), ...symbols];
  const aspect = { "16:9": "widescreen", "21:9": "ultra-wide", "3:2": "classic wide" }[input.aspectRatio];
  const brief_ = briefBlock(brief, input.eraId, style.id).replace("it outranks the style, the look and the plan", "it outranks the style");
  const prompt = [
    `Paint one illustration of a single moment from ${input.work.title}.`,
    `RULES (they outrank everything below):\n${rules.map((rule, i) => `${i + 1}) ${rule}`).join("\n")}`,
    `MOMENT (${input.moment.reference}): "${nameless(clip(input.moment.text, MOMENT_TEXT_MAX_CHARS))}"`,
    prev || next ? ["CONTEXT (for understanding only; paint the moment above):", ...(prev ? [`- Before: ${prev}`] : []), ...(next ? [`- After: ${next}`] : [])].join("\n") : "",
    "HOW TO READ IT: choose the single instant that best shows what happens in the moment and paint that, as if the viewer stands inside the scene. When someone speaks, show the speaker and listeners where they are; never paint the content of the speech as a separate scene or as figures beside them. Figures of speech and comparisons are not literal objects. Infer time, light, weather and any place not given under SETTING from the text and context.",
    alias ? nameless(brief_) : brief_,
    effects ? unplanned(effects.renderBlock) : "",
    // The text itself may give the presence a seat, clothes, hair or hands; the planner used to keep those words out.
    alias && formless.some(isNamed) ? `IMAGERY, NOT FORM (binding): wherever the text calls something "${alias}", it has no body. Words that give it a seat, clothing, hair, face, hands, feet or a figure are imagery: paint none of them, not even as light or cloud in that shape. Show the place, the people who witness it, and the light, fire, cloud or wind spread through the place; any throne, seat or chariot stays empty.` : "",
    symbol ? `${symbol.renderBlock} ${symbols.map((m) => nameless(m.name)).join("; ")}.` : "",
    canonBlock(`SETTING (where this passage happens; set the moment here and keep the place's fixed features, unless the moment is plainly somewhere else${places.length > 1 ? "; of several places, use the one the moment is in" : ""}):`, places),
    canonBlock("CANON, NAMED HERE (fixed look; the moment decides pose, expression, clothing changes and action):", cast.filter(isNamed)),
    canonBlock("CANON, ELSEWHERE IN THIS PASSAGE (draw one only when the moment involves them, for example as \"he\" or \"they\"; otherwise leave them out):", cast.filter((m) => !isNamed(m))),
    `ART STYLE: ${style.label}\nRendering: ${style.rendering}\nPalette: ${style.palette}\nLighting: ${style.lighting}\nMaterials and texture: ${style.materials}\nComposition: ${style.composition}\nNegatives: ${style.negatives}`,
    references.length ? ["REFERENCE IMAGES (attached in this order; identity and rendering only, never composition):", ...references.map((r) => `- ${r.caption}`),
      "Render everything in the ART STYLE above, even where a reference is painted differently."].join("\n") : "",
    `FRAME: one continuous scene painted to every edge, ${input.aspectRatio} ${aspect} landscape.`,
  ].filter(Boolean).join("\n\n");
  if (prompt.length > LEAN_PROMPT_MAX_CHARS) return { ok: false, error: `Lean prompt is ${prompt.length} characters; the cap is ${LEAN_PROMPT_MAX_CHARS}.` };
  return {
    ok: true, prompt, present, references,
    packet: { promptVersion: LEAN_PROMPT_VERSION, finalChars: prompt.length, present: present.map((m) => `${m.entryId}:${m.stageId}`),
      references: references.map((r) => r.kind === "sheet" ? `sheet:${r.entryId}:${r.stageId}` : `style:${r.styleId}`) },
  };
}

/** A section cast member from an entry record's payload and the stage its section assigns. */
export function leanCastMember(entryId: string, stageId: string, version: string, payload: { name: string; entryKind: LeanCastMember["kind"]; aliases?: string[]; hasForm?: boolean; depiction?: string; stages: Array<{ id: string; text: string }> }): LeanCastMember | null {
  const stage = payload.stages.find((s) => s.id === stageId);
  if (!stage?.text.trim()) return null;
  return { entryId, stageId, kind: payload.entryKind, name: payload.name, aliases: payload.aliases ?? [], text: stage.text, depiction: depictionModeOf(payload), version };
}

export { applicableRules };
