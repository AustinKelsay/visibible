/**
 * Canon drafting (#170, spec #165 §4): one Haiku 5.5 call per entry that stands on stage in any
 * section, after the reading pass and the brief. Text is binding, then the work's own
 * illustrative tradition, then invention within the era; no film, television, actor or
 * public-figure likeness. Each stage is a complete description of about 500 characters with the
 * quotes it relied on, verified against the exact unit text and kept for audit only. Characters
 * and locations get at most three stages, objects one; section casts are assigned to existing
 * stages. Entries whose depiction rules forbid a body are marked has_form: false so sheets skip
 * them while their constrained canon stays.
 */
import { z } from "zod";
import type { ReferenceUnit, WorkReader } from "../work-input";
import type { WorkBrief, CanonHint } from "../work-preparation";
import type { MergedEntry, MergedSection } from "./merge";
import { parseModelJson, type TextModel } from "./model";

const text = z.string();
const stageFields = {
  id: text, label: text, when: text, source: z.enum(["text", "tradition", "invention", "mixed"]),
  quotes: z.array(z.object({ unit: text, quote: text }).strict()),
};
/** Positive effects only; free prose stays in appearance_from_text and supporting quotes. */
const showingSchema = z.union([
  z.object({
    effect: z.enum(["light", "radiance", "cloud", "mist", "fire"]),
    colour: z.enum(["unspecified", "white", "gold", "silver", "red", "orange", "yellow", "green", "blue", "violet", "black", "multicoloured"]),
    brightness: z.enum(["unspecified", "faint", "soft", "bright", "brilliant"]),
  }).strict(),
  z.object({ effect: z.enum(["wind", "voice", "unseen presence"]) }).strict(),
]);
type Showing = z.infer<typeof showingSchema>;
export const canonOutputSchema = z.object({
  kind: z.enum(["character", "location", "object"]),
  has_form: z.boolean(),
  appearance_from_text: text,
  stages: z.array(z.union([
    z.object({ ...stageFields, text }).strict(),
    z.object({ ...stageFields, showing: z.array(showingSchema).min(1).max(5) }).strict(),
  ])),
  section_stages: z.array(z.object({ section: text, stage: text }).strict()),
}).strict().superRefine((output, context) => {
  output.stages.forEach((stage, index) => {
    if (output.has_form !== ("text" in stage)) {
      context.addIssue({ code: "custom", path: ["stages", index], message: output.has_form
        ? "has_form true requires stage text, not showing"
        : "has_form false requires structured showing, not stage text" });
    }
  });
});
export type CanonOutput = z.infer<typeof canonOutputSchema>;

/** Wording of new canon drafts; saved entries are reused until explicitly redrafted. */
export const CANON_PROMPT_VERSION = "2026-10-22-canon-showing-v3";

export const CANON_SYSTEM = `You write CANON ENTRIES for an illustrated edition of a work of literature. A canon entry fixes the identity of one character, location or object so that independently generated images agree with each other. Return only JSON matching the schema.

Rules:
- Depiction rules govern the rendered appearance, including when the source uses bodily imagery. Apply only the brief's unconditional rules to this shared canon; style-specific rules belong to final rendering. If an unconditional rule forbids giving this entry a body or face, set has_form to false; otherwise has_form is true.
- Within those depiction limits, the work's text is binding: preserve what it fixes about appearance. Where the text is silent, follow the work's own illustrative tradition if one exists (the way the work itself has been drawn and painted), never film or television adaptations; otherwise invent a look that fits the era and the work brief. Never give anyone the likeness of a real actor or public figure.
- When has_form is true, each stage returns \`text\`: one prompt-ready paragraph of at most 500 characters, starting with the name and a colon. Do not return \`showing\` for these stages.
- The appearance fields below apply only when has_form is true:
  - character (people, beings, animals, groups): age range; build; skin; hair and beard; facial notes; one signature outfit (the one worn most often) and its colours; signature props the figure carries alone. For a group, describe a typical member.
  - location: terrain; architecture; vegetation; landmarks. No people.
  - object: form; material; colour.
- When has_form is false, each stage returns \`showing\` INSTEAD OF \`text\`: one to five positive effects selected from the schema. Code builds the prompt-ready description from these selections; there is no free-prose stage field. Select only effects permitted by the unconditional brief and supported by this entry's constrained interpretation. Visual effects (light, radiance, cloud, mist, fire) take a literal colour and brightness, or "unspecified"; wind, voice and unseen presence take only an effect. Never invent an effect just to use the vocabulary. For example, white source imagery may become {"effect":"radiance","colour":"white","brightness":"brilliant"} when permitted. Render source metaphors as permitted qualities, not physical anatomy, clothing, pose or material cues. Do not repeat prohibited features as denials, similes or substitute shapes. Keep the exact source wording in supporting quotes for audit; \`appearance_from_text\` may explain the source imagery and its constrained interpretation.
- Fix only identity. Leave out poses, expressions, actions, weather, time of day, other people (attendants, companions, crowds) and anything that compares the figure with someone else or depends on another person.
- STAGES: almost every entry has exactly ONE stage. A character gets another stage only when the text itself says they have aged from child to adult or adult to elder across the work; a location only when the text says it was built, destroyed or rebuilt. Different scenes, days, rooms, moods or events are NOT stages. At most three. Objects always have exactly one stage. Each stage is a complete entry on its own.
- \`quotes\`: short passages (under 120 characters, copied exactly) the stage relied on, each with the id of the unit it comes from. Only quote units you were given; give none if nothing in the text describes appearance.
- \`section_stages\`: for every story section listed, the id of the stage present in it. With one stage, every section uses it.
- \`source\`: text, tradition, invention, or mixed. \`appearance_from_text\`: one sentence saying what the text fixes and what you supplied.`;

export const CANON_TEXT_CAP = 500;
const CANON_TEXT_TOLERANCE = 560;
const MAX_STAGES = { character: 3, location: 3, object: 1 } as const;
const MENTION_CAP_CHARS = 14_000;

export type CanonStage = { id: string; label: string; when: string; text: string; source: string; quotes: Array<{ unit: string; quote: string }>; showing?: Showing[] };
export type CanonEntryResult = {
  /** Absent on historical drafts; never infer the current version for saved results. */
  promptVersion?: string;
  entryId: string;
  kind: MergedEntry["kind"];
  hasForm: boolean;
  appearanceFromText: string;
  stages: CanonStage[];
  /** Stage id per section id the entry is on stage in. */
  sectionStages: Record<string, string>;
  problems: string[];
  attempts: number;
};

export function normalizeQuote(value: string): string {
  return value.normalize("NFKC").replace(/[‘’“”"']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function showingText(name: string, showing: Showing[]): string {
  return `${name}: ${showing.map((part) => "colour" in part
    ? [part.brightness, part.colour, part.effect].filter((word) => word !== "unspecified").join(" ")
    : part.effect).join("; ")}.`;
}

/** Units in the entry's divisions whose text names the entry or an alias, spread evenly under a size cap. */
export function mentionUnits(work: WorkReader, entry: MergedEntry, capChars = MENTION_CAP_CHARS) {
  const divisions = new Set(entry.members.map((m) => m.split(":")[0]));
  const forms = [entry.name, ...entry.aliases].map((f) => f.trim()).filter((f) => f.length > 2);
  if (!forms.length) return [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`, "iu");
  const hits = work.units.filter((u) => divisions.has(u.rootDivisionId) && pattern.test(u.text));
  const total = hits.reduce((n, u) => n + u.text.length, 0);
  if (total <= capChars) return hits;
  const step = total / capChars;
  const kept: typeof hits = [];
  let next = 0;
  hits.forEach((u, i) => {
    if (i >= next) { kept.push(u); next += step; }
  });
  return kept;
}

/** Visit the ends, then bisect the remaining intervals so a capped selection spans the work. */
function* spreadUnits(units: readonly ReferenceUnit[]) {
  if (!units.length) return;
  yield units[0];
  if (units.length > 1) yield units[units.length - 1];
  const ranges = [[1, units.length - 2]];
  for (let i = 0; i < ranges.length; i++) {
    const [first, last] = ranges[i];
    if (first > last) continue;
    const middle = Math.floor((first + last) / 2);
    yield units[middle];
    ranges.push([first, middle - 1], [middle + 1, last]);
  }
}

const sourceLine = (unit: ReferenceUnit) => `[${unit.id}] ${unit.text.replace(/\s+/g, " ").trim()}`;

/** Whole source units, alternating on-stage context and name matches under one formatted-text cap. */
export function canonSourceUnits(work: WorkReader, entry: MergedEntry, sections: MergedSection[], capChars = MENTION_CAP_CHARS): ReferenceUnit[] {
  const context = new Map<string, ReferenceUnit>();
  for (const section of sections) {
    if (!(entry.kind === "location" ? section.setting.includes(entry.id) : section.onStage.some((o) => o.id === entry.id))) continue;
    const first = work.getUnit(section.firstUnitId), last = work.getUnit(section.lastUnitId);
    if (first.position > last.position || first.rootDivisionId !== section.divisionId || last.rootDivisionId !== section.divisionId) {
      throw new Error(`Invalid canon source section: ${section.firstUnitId}–${section.lastUnitId}`);
    }
    for (const unit of work.units.slice(first.position, last.position + 1)) context.set(unit.id, unit);
  }
  const lanes = [spreadUnits([...context.values()].sort((a, b) => a.position - b.position)), spreadUnits(mentionUnits(work, entry, Infinity))];
  const selected = new Map<string, ReferenceUnit>();
  let used = 0;
  let pending = true;
  while (pending) {
    pending = false;
    for (const lane of lanes) {
      const next = lane.next();
      if (next.done) continue;
      pending = true;
      const unit = next.value;
      const cost = sourceLine(unit).length + (selected.size ? 1 : 0);
      if (!selected.has(unit.id) && used + cost <= capChars) {
        selected.set(unit.id, unit);
        used += cost;
      }
    }
  }
  return [...selected.values()].sort((a, b) => a.position - b.position);
}

export function canonUserPrompt(options: {
  work: WorkReader; entry: MergedEntry; brief: WorkBrief; sections: MergedSection[]; sectionEras: Record<string, string>; hints: CanonHint[];
}): { user: string; sectionIds: string[] } {
  const { work, entry, brief } = options;
  const onStage = options.sections.filter((s) => entry.kind === "location" ? s.setting.includes(entry.id) : s.onStage.some((o) => o.id === entry.id));
  const eraIds = new Set(onStage.map((s) => options.sectionEras[s.firstUnitId]).filter(Boolean));
  const eras = brief.eras.filter((e) => eraIds.has(e.id));
  const units = canonSourceUnits(work, entry, onStage);
  const hints = options.hints.filter((h) => h.entryId === entry.id && !h.styleIds);
  const user = `WORK: ${work.work.title} (${work.work.author})
TONE: ${brief.tone}
DEPICTION RULES (unconditional; style-specific rules are reserved for final rendering):
${brief.depictionRules.filter((r) => !r.styleIds).map((r) => `- ${r.text}`).join("\n") || "- none"}
ERAS THIS ENTRY APPEARS IN:
${(eras.length ? eras : brief.eras.slice(0, 1)).map((e) => `- ${e.label}: people: ${e.people} Dress: ${e.dress} Buildings and objects: ${e.buildingsAndObjects}`).join("\n")}
HINTS FROM THE OWNER'S BRIEF REVIEW (lines moved out of the brief because they concern this entry alone; use them):
${hints.map((h) => `- ${h.text}`).join("\n") || "- none"}

ENTRY
id: ${entry.id}
kind: ${entry.kind}${entry.readingKind !== entry.kind ? ` (${entry.readingKind})` : ""}
name: ${entry.name}
aliases: ${entry.aliases.join(", ") || "(none)"}
reading-pass note: ${entry.note}
on stage in ${onStage.length} story sections (id: title):
${onStage.slice(0, 40).map((s) => `- ${s.firstUnitId}: ${s.title}`).join("\n")}${onStage.length > 40 ? `\n- … and ${onStage.length - 40} more` : ""}

SELECTED SOURCE UNITS (name matches and on-stage section context; unit id in brackets; quote only from these):
Context may describe other subjects. Attribute appearance only to this entry when supported by the passage; section membership alone does not identify who a description belongs to. Whole units are sampled under a 14,000-character source limit; omitted passages are not evidence of absence.
${units.map(sourceLine).join("\n") || "(no whole source unit fits the selection limit)"}`;
  return { user, sectionIds: onStage.map((s) => s.firstUnitId) };
}

/** Apply the code rules to a drafted entry: quote checks, stage caps, assignment validity. */
export function checkCanon(work: WorkReader, entry: MergedEntry, output: CanonOutput, sectionIds: string[]): Omit<CanonEntryResult, "attempts"> {
  // Enforce the representation even for direct callers; old saved canon never passes here.
  output = canonOutputSchema.parse(output);
  const problems: string[] = [];
  let stages: CanonStage[] = output.stages.map((s) => ({ ...s, text: "text" in s ? s.text : showingText(entry.name, s.showing) }));
  const cap = MAX_STAGES[entry.kind];
  if (stages.length === 0) problems.push("no stages drafted");
  if (stages.length > cap) {
    problems.push(`${stages.length} stages drafted, kept ${cap}`);
    stages = stages.slice(0, cap);
  }
  const ids = new Set<string>();
  for (const stage of stages) {
    if (ids.has(stage.id)) problems.push(`duplicate stage id ${stage.id}`);
    ids.add(stage.id);
    if (stage.text.length > CANON_TEXT_TOLERANCE) problems.push(`stage ${stage.id} is ${stage.text.length} characters (cap ${CANON_TEXT_CAP})`);
    stage.quotes = stage.quotes.filter((q) => {
      let unit;
      try { unit = work.getUnit(q.unit); } catch { problems.push(`stage ${stage.id}: quote cites unknown unit ${q.unit}`); return false; }
      if (!normalizeQuote(unit.text).includes(normalizeQuote(q.quote))) { problems.push(`stage ${stage.id}: quote not found in ${q.unit}: "${q.quote.slice(0, 60)}"`); return false; }
      return true;
    });
  }
  const sectionStages: Record<string, string> = {};
  const fallback = stages[0]?.id;
  for (const sectionId of sectionIds) {
    const assigned = output.section_stages.find((a) => a.section === sectionId)?.stage;
    if (assigned && ids.has(assigned)) sectionStages[sectionId] = assigned;
    else {
      if (assigned) problems.push(`section ${sectionId} assigned to unknown stage ${assigned}`);
      if (fallback) sectionStages[sectionId] = fallback;
    }
  }
  return { entryId: entry.id, kind: output.kind === entry.kind ? entry.kind : entry.kind, hasForm: output.has_form, appearanceFromText: output.appearance_from_text, stages, sectionStages, problems };
}

export async function draftCanonEntry(options: {
  work: WorkReader; entry: MergedEntry; brief: WorkBrief; sections: MergedSection[]; sectionEras: Record<string, string>; hints: CanonHint[]; model: TextModel;
}): Promise<CanonEntryResult> {
  const { user, sectionIds } = canonUserPrompt(options);
  let feedback = "";
  let last: Omit<CanonEntryResult, "attempts"> | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await options.model.complete({ label: `canon:${options.entry.id}:${attempt}`, system: CANON_SYSTEM, user: user + feedback, schemaName: "canon_entry", schema: canonOutputSchema, maxTokens: 4000, expectedCompletionTokens: 1200 });
    const parsed = parseModelJson(canonOutputSchema, result.content);
    if ("error" in parsed) { feedback = `\n\nThe previous answer was not valid JSON for the schema (${parsed.error}). Return a corrected answer.`; continue; }
    last = checkCanon(options.work, options.entry, parsed.value, sectionIds);
    const overCap = last.problems.filter((p) => p.includes("characters (cap"));
    if (!overCap.length || attempt === 2) return { ...last, promptVersion: CANON_PROMPT_VERSION, attempts: attempt };
    feedback = `\n\nThe previous answer was rejected: ${overCap.join("; ")}. Shorten every stage text to at most ${CANON_TEXT_CAP} characters and return the corrected answer.`;
  }
  if (last) return { ...last, promptVersion: CANON_PROMPT_VERSION, attempts: 2 };
  throw new Error(`Canon for ${options.entry.id} could not be drafted`);
}

/** Entries that stand on stage (or are a setting) in at least one section; mentioned-only entries get none. */
export function entriesNeedingCanon(entries: MergedEntry[], sections: MergedSection[]): MergedEntry[] {
  const onStage = new Set<string>();
  for (const s of sections) {
    for (const o of s.onStage) onStage.add(o.id);
    for (const id of s.setting) onStage.add(id);
  }
  return entries.filter((e) => onStage.has(e.id));
}
