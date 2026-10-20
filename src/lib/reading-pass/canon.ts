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
import type { WorkReader } from "../work-input";
import type { WorkBrief, CanonHint } from "../work-preparation";
import type { MergedEntry, MergedSection } from "./merge";
import { parseModelJson, type TextModel } from "./model";

const text = z.string();
export const canonOutputSchema = z.object({
  kind: z.enum(["character", "location", "object"]),
  has_form: z.boolean(),
  appearance_from_text: text,
  stages: z.array(z.object({
    id: text, label: text, when: text, text, source: z.enum(["text", "tradition", "invention", "mixed"]),
    quotes: z.array(z.object({ unit: text, quote: text }).strict()),
  }).strict()),
  section_stages: z.array(z.object({ section: text, stage: text }).strict()),
}).strict();
export type CanonOutput = z.infer<typeof canonOutputSchema>;

export const CANON_SYSTEM = `You write CANON ENTRIES for an illustrated edition of a work of literature. A canon entry fixes the identity of one character, location or object so that independently generated images agree with each other. Return only JSON matching the schema.

Rules:
- The work's text is binding: anything it says about appearance must be in the entry.
- Where the text is silent, follow the work's own illustrative tradition if one exists (the way the work itself has been drawn and painted), never film or television adaptations; otherwise invent a look that fits the era and the work brief. Never give anyone the likeness of a real actor or public figure. Never contradict the text.
- Each stage's \`text\` is one prompt-ready paragraph of at most 500 characters, starting with the name and a colon.
  - character (people, beings, animals, groups): age range; build; skin; hair and beard; facial notes; one signature outfit (the one worn most often) and its colours; signature props the figure carries alone. For a group, describe a typical member.
  - location: terrain; architecture; vegetation; landmarks. No people.
  - object: form; material; colour.
- Fix only identity. Leave out poses, expressions, actions, weather, time of day, other people (attendants, companions, crowds) and anything that compares the figure with someone else or depends on another person.
- STAGES: almost every entry has exactly ONE stage. A character gets another stage only when the text itself says they have aged from child to adult or adult to elder across the work; a location only when the text says it was built, destroyed or rebuilt. Different scenes, days, rooms, moods or events are NOT stages. At most three. Objects always have exactly one stage. Each stage is a complete entry on its own.
- Obey the work brief's depiction rules. If a rule forbids giving this entry a body or face, set has_form to false and write only the permitted showing (light, cloud, fire, a voice, an effect); otherwise has_form is true.
- \`quotes\`: short passages (under 120 characters, copied exactly) the stage relied on, each with the id of the unit it comes from. Only quote units you were given; give none if nothing in the text describes appearance.
- \`section_stages\`: for every story section listed, the id of the stage present in it. With one stage, every section uses it.
- \`source\`: text, tradition, invention, or mixed. \`appearance_from_text\`: one sentence saying what the text fixes and what you supplied.`;

export const CANON_TEXT_CAP = 500;
const CANON_TEXT_TOLERANCE = 560;
const MAX_STAGES = { character: 3, location: 3, object: 1 } as const;
const MENTION_CAP_CHARS = 14_000;

export type CanonStage = { id: string; label: string; when: string; text: string; source: string; quotes: Array<{ unit: string; quote: string }> };
export type CanonEntryResult = {
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

export function canonUserPrompt(options: {
  work: WorkReader; entry: MergedEntry; brief: WorkBrief; sections: MergedSection[]; sectionEras: Record<string, string>; hints: CanonHint[];
}): { user: string; sectionIds: string[] } {
  const { work, entry, brief } = options;
  const onStage = options.sections.filter((s) => entry.kind === "location" ? s.setting.includes(entry.id) : s.onStage.some((o) => o.id === entry.id));
  const eraIds = new Set(onStage.map((s) => options.sectionEras[s.firstUnitId]).filter(Boolean));
  const eras = brief.eras.filter((e) => eraIds.has(e.id));
  const units = mentionUnits(work, entry);
  const hints = options.hints.filter((h) => h.entryId === entry.id);
  const user = `WORK: ${work.work.title} (${work.work.author})
TONE: ${brief.tone}
DEPICTION RULES:
${brief.depictionRules.map((r) => `- ${r.text}${r.styleIds ? ` [styles: ${r.styleIds.join(", ")}]` : ""}`).join("\n") || "- none"}
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

UNITS OF THE TEXT THAT NAME THIS ENTRY (unit id in brackets; quote only from these):
${units.map((u) => `[${u.id}] ${u.text.replace(/\s+/g, " ").trim()}`).join("\n") || "(none found)"}`;
  return { user, sectionIds: onStage.map((s) => s.firstUnitId) };
}

/** Apply the code rules to a drafted entry: quote checks, stage caps, assignment validity. */
export function checkCanon(work: WorkReader, entry: MergedEntry, output: CanonOutput, sectionIds: string[]): Omit<CanonEntryResult, "attempts"> {
  const problems: string[] = [];
  let stages = output.stages.map((s) => ({ ...s }));
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
    if (!overCap.length || attempt === 2) return { ...last, attempts: attempt };
    feedback = `\n\nThe previous answer was rejected: ${overCap.join("; ")}. Shorten every stage text to at most ${CANON_TEXT_CAP} characters and return the corrected answer.`;
  }
  if (last) return { ...last, attempts: 2 };
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
