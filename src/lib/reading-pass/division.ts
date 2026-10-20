/**
 * One reading-pass call per root division (a Bible book or a Holmes story), validated and
 * retried within bounds (#169): an empty result is retried with a coarser section target, and
 * invalid ranges (missing units, overlaps, inverted or out-of-order ranges, unknown ids) are
 * retried with the problems listed. Every attempt is kept as evidence.
 */
import type { ReferenceUnit, WorkReader } from "../work-input";
import { DIVISION_SYSTEM, divisionOutputSchema, granularityInstruction, type DivisionOutput } from "./prompts";
import { BudgetExceededError, parseModelJson, type TextModel, type TextModelResult } from "./model";

export const DEFAULT_UNITS_PER_SECTION = 18;
export const MAX_DIVISION_ATTEMPTS = 3;
const COARSER_FACTOR = 1.5;

export type DivisionAttempt = {
  attempt: number;
  unitsPerSection: number;
  feedback: string | null;
  result: TextModelResult | null;
  error: string | null;
  problems: string[];
};

export type DivisionSection = {
  firstUnitId: string;
  lastUnitId: string;
  title: string;
  setting: string[];
  onStage: Array<{ id: string; named: boolean }>;
  mentionedOnly: string[];
};

export type DivisionReading = {
  divisionId: string;
  label: string;
  unitCount: number;
  characters: DivisionOutput["characters"];
  locations: DivisionOutput["locations"];
  sections: DivisionSection[];
  brief: DivisionOutput["brief"];
  attempts: DivisionAttempt[];
};

export function rootDivisions(work: WorkReader) {
  const groups = new Map<string, ReferenceUnit[]>();
  for (const unit of work.units) {
    const list = groups.get(unit.rootDivisionId) ?? [];
    list.push(unit);
    groups.set(unit.rootDivisionId, list);
  }
  return [...groups.entries()].map(([id, units]) => ({
    id, units, label: work.work.divisions.find((d) => d.key === id)?.label ?? id,
  }));
}

/** The short id a unit carries inside its division's prompt: its id without the division prefix. */
export function localUnitId(unit: ReferenceUnit): string {
  return unit.id.slice(unit.rootDivisionId.length + 1);
}

export function divisionText(units: readonly ReferenceUnit[]): string {
  const lines: string[] = [];
  let lastDivision: string | null = null;
  for (const unit of units) {
    if (unit.divisionId !== lastDivision && units[0].divisionId !== unit.divisionId) {
      lines.push(`## ${unit.divisionId.slice(unit.rootDivisionId.length + 1)}`);
    } else if (unit.divisionId !== lastDivision && lastDivision === null && units.some((u) => u.divisionId !== unit.divisionId)) {
      lines.push(`## ${unit.divisionId.slice(unit.rootDivisionId.length + 1)}`);
    }
    lastDivision = unit.divisionId;
    lines.push(`[${localUnitId(unit)}] ${unit.text.replace(/\s+/g, " ").trim()}`);
  }
  return lines.join("\n");
}

export function divisionUserPrompt(work: WorkReader, division: { label: string; units: readonly ReferenceUnit[] }, feedback: string | null, previous: DivisionOutput | null = null): string {
  const unitLevel = work.work.levels[work.work.levels.length - 1];
  const base = `Work: ${work.work.title} (${work.work.author})\nDivision: ${division.label}\nUnits are ${unitLevel.toLowerCase()}s; ids are in square brackets.\n\n${divisionText(division.units)}`;
  if (!feedback) return base;
  return `${base}\n\nA previous answer was rejected for these problems:\n${feedback}` +
    (previous ? `\n\nPrevious complete answer:\n${JSON.stringify(previous)}` : "") +
    `\n\nReturn the FULL corrected JSON object, not a patch or only the sections listed above. Preserve valid cast entries and sections. ` +
    `Every unit from ${localUnitId(division.units[0])} through ${localUnitId(division.units[division.units.length - 1])} must still be covered. ` +
    "For an unknown cast id, use an existing entry only when it is the same individual or place, or define the missing entry from the supplied text. Never use undefined placeholder ids.";
}

function normalizeId(raw: string): string {
  return raw.trim().replace(/^\[|\]$/g, "").replace(/:/g, "-");
}

/** Validate the model's sections against the division's units: coverage, order, no overlaps. */
export function validateSections(output: DivisionOutput, units: readonly ReferenceUnit[]): { sections: DivisionSection[]; problems: string[] } {
  const problems: string[] = [];
  const byLocal = new Map(units.map((u, i) => [localUnitId(u), i]));
  const characterIds = new Set(output.characters.map((c) => c.id));
  const locationIds = new Set(output.locations.map((l) => l.id));
  const sections: DivisionSection[] = [];
  let next = 0;
  for (const [index, section] of output.sections.entries()) {
    const start = byLocal.get(normalizeId(section.start));
    const end = byLocal.get(normalizeId(section.end));
    if (start === undefined || end === undefined) {
      problems.push(`section ${index + 1} ("${section.title}") uses unknown unit ids ${section.start}..${section.end}`);
      continue;
    }
    if (end < start) problems.push(`section ${index + 1} ("${section.title}") is inverted: ${section.start} after ${section.end}`);
    if (start < next) problems.push(`section ${index + 1} ("${section.title}") overlaps or is out of order: it starts at ${section.start} but units up to ${localUnitId(units[next - 1])} are already covered`);
    if (start > next) problems.push(`units ${localUnitId(units[next])} to ${localUnitId(units[start - 1])} belong to no section`);
    next = Math.max(next, end + 1);
    for (const id of section.setting) if (!locationIds.has(id)) problems.push(`section ${index + 1} names unknown location id ${id}`);
    for (const field of ["on_stage", "mentioned_only"] as const) {
      for (const id of section[field]) {
        if (characterIds.has(id)) continue;
        problems.push(locationIds.has(id)
          ? `section ${index + 1} ${field} contains location id ${id}; only characters belong in ${field}. Omit places that are only mentioned; setting names only where the action happens.`
          : `section ${index + 1} names unknown character id ${id}`);
      }
    }
    const text = units.slice(start, end + 1).map((u) => u.text).join(" ");
    sections.push({
      firstUnitId: units[start].id, lastUnitId: units[Math.max(start, end)].id, title: section.title, setting: section.setting,
      onStage: section.on_stage.map((id) => ({ id, named: isNamedIn(text, output.characters.find((c) => c.id === id)) })),
      mentionedOnly: section.mentioned_only,
    });
  }
  if (output.sections.length > 0 && next < units.length) problems.push(`units ${localUnitId(units[next])} to ${localUnitId(units[units.length - 1])} belong to no section`);
  return { sections, problems };
}

const TITLE_WORDS = /^(the|a|an|king|queen|prophet|priest|mr|mrs|miss|dr|lord|lady|sir)\s+/i;

/** Whether a section's text names the character by any proper form, decided in code, not by the model. */
export function isNamedIn(text: string, character: { name: string; aliases: string[] } | undefined): boolean {
  if (!character) return false;
  const haystack = ` ${text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const forms = new Set<string>();
  for (const form of [character.name, ...character.aliases]) {
    const base = form.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!base) continue;
    forms.add(base);
    const stripped = base.replace(TITLE_WORDS, "").trim();
    if (stripped && /^\p{Lu}/u.test(form.replace(TITLE_WORDS, "").trim())) forms.add(stripped);
  }
  return [...forms].some((form) => form.length > 2 && haystack.includes(` ${form} `));
}

export async function readDivision(options: {
  work: WorkReader;
  division: { id: string; label: string; units: readonly ReferenceUnit[] };
  model: TextModel;
  unitsPerSection?: number;
  maxAttempts?: number;
  /** Called before each attempt; throwing stops the read (used for the spend budget). */
  beforeCall?: (request: { system: string; user: string; expectedCompletionTokens: number }) => Promise<void>;
}): Promise<DivisionReading> {
  const { work, division, model } = options;
  const attempts: DivisionAttempt[] = [];
  let unitsPerSection = options.unitsPerSection ?? DEFAULT_UNITS_PER_SECTION;
  let feedback: string | null = null;
  let previous: DivisionOutput | null = null;
  const maxAttempts = options.maxAttempts ?? MAX_DIVISION_ATTEMPTS;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const system = DIVISION_SYSTEM.replace("{granularity}", granularityInstruction(division.units.length, unitsPerSection));
    const user = divisionUserPrompt(work, division, feedback, previous);
    const expectedCompletionTokens = 12 * division.units.length + 2000;
    await options.beforeCall?.({ system, user, expectedCompletionTokens });
    const record: DivisionAttempt = { attempt, unitsPerSection, feedback, result: null, error: null, problems: [] };
    attempts.push(record);
    let result: TextModelResult;
    try {
      result = await model.complete({ label: `read:${division.id}:${attempt}`, system, user, schemaName: "reading_pass", schema: divisionOutputSchema, maxTokens: 60000, expectedCompletionTokens });
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        attempts.pop(); // the call never happened
        throw error;
      }
      record.error = error instanceof Error ? error.message : String(error);
      feedback = null;
      continue;
    }
    record.result = result;
    const parsed = parseModelJson(divisionOutputSchema, result.content);
    if ("error" in parsed) {
      record.error = parsed.error;
      feedback = `The answer was not valid JSON for the schema (${parsed.error}).`;
      continue;
    }
    if (parsed.value.sections.length === 0) {
      record.problems = ["no sections returned"];
      unitsPerSection = Math.ceil(unitsPerSection * COARSER_FACTOR);
      feedback = previous ? "No sections were returned. Repair the previous complete answer instead of omitting the division." : null;
      continue;
    }
    previous = parsed.value;
    const { sections, problems } = validateSections(parsed.value, division.units);
    record.problems = problems;
    if (problems.length === 0) {
      return { divisionId: division.id, label: division.label, unitCount: division.units.length, characters: parsed.value.characters,
        locations: parsed.value.locations, sections, brief: parsed.value.brief, attempts };
    }
    feedback = problems.map((p) => `- ${p}`).join("\n");
  }
  throw new DivisionReadError(division.id, attempts);
}

export class DivisionReadError extends Error {
  constructor(public readonly divisionId: string, public readonly attempts: DivisionAttempt[]) {
    super(`Division ${divisionId} could not be read in ${attempts.length} attempts: ${attempts.map((a) => a.error ?? a.problems.join("; ") ?? "?").join(" | ")}`);
  }
}
