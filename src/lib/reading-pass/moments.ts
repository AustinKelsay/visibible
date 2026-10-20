/**
 * Moments for prose works (#169, spec #165 §1): the model proposes runs of 100–400 words inside
 * each section; code checks tiling and splits anything over about 600 words at paragraph
 * boundaries. Unit-mode works (the Bible) need no call: every unit is its own moment.
 */
import type { ReferenceUnit, WorkReader } from "../work-input";
import type { MergedSection } from "./merge";
import { MOMENTS_SYSTEM, momentsOutputSchema } from "./prompts";
import { parseModelJson, type TextModel } from "./model";
import { localUnitId } from "./division";

export const MOMENT_SPLIT_WORDS = 600;
export const MAX_MOMENT_ATTEMPTS = 3;

export type MomentRange = { firstUnitId: string; lastUnitId: string; sectionId: string; summary: string | null; words: number };

function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Split a run of units into pieces under the word cap, cutting at paragraph boundaries. */
export function splitLongRun(units: readonly ReferenceUnit[], maxWords = MOMENT_SPLIT_WORDS): ReferenceUnit[][] {
  const total = units.reduce((n, u) => n + words(u.text), 0);
  if (total <= maxWords || units.length < 2) return [units.slice()];
  const pieces = Math.ceil(total / maxWords);
  const target = total / pieces;
  const out: ReferenceUnit[][] = [];
  let current: ReferenceUnit[] = [];
  let count = 0;
  for (const unit of units) {
    const w = words(unit.text);
    if (current.length && count + w > target && out.length < pieces - 1) {
      out.push(current);
      current = [];
      count = 0;
    }
    current.push(unit);
    count += w;
  }
  if (current.length) out.push(current);
  return out;
}

export function validateMoments(
  proposed: Array<{ section_start: string; start: string; end: string; summary: string }>,
  units: readonly ReferenceUnit[],
  sections: MergedSection[],
): { moments: MomentRange[]; problems: string[] } {
  const problems: string[] = [];
  const byLocal = new Map(units.map((u, i) => [localUnitId(u), i]));
  const byId = new Map(units.map((u, i) => [u.id, i]));
  const sectionAt = (i: number) => sections.find((s) => byId.get(s.firstUnitId)! <= i && i <= byId.get(s.lastUnitId)!);
  const moments: MomentRange[] = [];
  let next = 0;
  for (const [k, m] of proposed.entries()) {
    const start = byLocal.get(m.start.replace(/^\[|\]$/g, "").trim());
    const end = byLocal.get(m.end.replace(/^\[|\]$/g, "").trim());
    if (start === undefined || end === undefined) { problems.push(`moment ${k + 1} uses unknown paragraph ids ${m.start}..${m.end}`); continue; }
    if (end < start) { problems.push(`moment ${k + 1} is inverted: ${m.start} after ${m.end}`); continue; }
    if (start < next) problems.push(`moment ${k + 1} overlaps an earlier moment at ${m.start}`);
    if (start > next) problems.push(`paragraphs ${localUnitId(units[next])} to ${localUnitId(units[start - 1])} belong to no moment`);
    const section = sectionAt(start);
    if (!section || sectionAt(end)?.firstUnitId !== section.firstUnitId) problems.push(`moment ${k + 1} (${m.start}..${m.end}) crosses a section boundary`);
    next = Math.max(next, end + 1);
    if (section) {
      for (const piece of splitLongRun(units.slice(start, end + 1))) {
        moments.push({ firstUnitId: piece[0].id, lastUnitId: piece[piece.length - 1].id, sectionId: section.firstUnitId, summary: piece.length === end - start + 1 ? m.summary : null, words: piece.reduce((n, u) => n + words(u.text), 0) });
      }
    }
  }
  if (next < units.length) problems.push(`paragraphs ${localUnitId(units[next])} to ${localUnitId(units[units.length - 1])} belong to no moment`);
  return { moments, problems };
}

export async function readMoments(options: {
  work: WorkReader;
  division: { id: string; label: string; units: readonly ReferenceUnit[] };
  sections: MergedSection[];
  model: TextModel;
  maxAttempts?: number;
  beforeCall?: (request: { system: string; user: string; expectedCompletionTokens: number }) => Promise<void>;
}): Promise<{ moments: MomentRange[]; attempts: number }> {
  const { work, division } = options;
  const sections = options.sections.filter((s) => s.divisionId === division.id);
  const lines = division.units.map((u) => `[${localUnitId(u)}] (${words(u.text)}w) ${u.text.replace(/\s+/g, " ").trim()}`);
  const base = `Work: ${work.work.title} (${work.work.author})\nDivision: ${division.label}\n\n${lines.join("\n")}\n\n## Story sections\n` +
    sections.map((s) => `- section ${localUnitId(work.getUnit(s.firstUnitId))}: [${localUnitId(work.getUnit(s.firstUnitId))}] to [${localUnitId(work.getUnit(s.lastUnitId))}]: ${s.title}`).join("\n");
  let feedback: string | null = null;
  const maxAttempts = options.maxAttempts ?? MAX_MOMENT_ATTEMPTS;
  let lastProblems: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const user = feedback ? `${base}\n\nA previous answer was rejected for these problems; return a corrected answer:\n${feedback}` : base;
    const expectedCompletionTokens = 60 * Math.ceil(division.units.length / 3) + 500;
    await options.beforeCall?.({ system: MOMENTS_SYSTEM, user, expectedCompletionTokens });
    const result = await options.model.complete({ label: `moments:${division.id}:${attempt}`, system: MOMENTS_SYSTEM, user, schemaName: "moments", schema: momentsOutputSchema, maxTokens: 30000, expectedCompletionTokens });
    const parsed = parseModelJson(momentsOutputSchema, result.content);
    if ("error" in parsed) { feedback = `The answer was not valid JSON for the schema (${parsed.error}).`; lastProblems = [parsed.error]; continue; }
    const { moments, problems } = validateMoments(parsed.value.moments, division.units, sections);
    if (!problems.length) return { moments, attempts: attempt };
    lastProblems = problems;
    feedback = problems.map((p) => `- ${p}`).join("\n");
  }
  throw new Error(`Moments for ${division.id} could not be read in ${maxAttempts} attempts: ${lastProblems.join("; ")}`);
}

/** Unit-mode works: one moment per unit, no model call. */
export function unitMoments(units: readonly ReferenceUnit[], sections: MergedSection[]): MomentRange[] {
  const byId = new Map(units.map((u, i) => [u.id, i]));
  return units.map((u) => {
    const i = byId.get(u.id)!;
    const section = sections.find((s) => byId.get(s.firstUnitId)! <= i && i <= byId.get(s.lastUnitId)!);
    return { firstUnitId: u.id, lastUnitId: u.id, sectionId: section?.firstUnitId ?? u.id, summary: null, words: words(u.text) };
  });
}
