/**
 * Draft the work brief from the divisions' drafts (#169, spec #165 §2): tone, depiction rules,
 * eras with section assignments, and an ordered style set proposed from the existing library
 * with reasons. The draft is converted to the brief file contract, reviewed for single-entry
 * details (routed to canon hints) and validated; validation failures are reported, never hidden.
 */
import type { DivisionReading } from "./division";
import type { MergedEntry, MergedSection } from "./merge";
import { BRIEF_SYSTEM, briefOutputSchema, type BriefOutput } from "./prompts";
import { parseModelJson, type TextModel } from "./model";
import { reviewDraftBrief, validateWorkBrief, SHARED_STYLES, type StyleLibrary, type WorkBrief, type CanonHint } from "../work-preparation";

export type BriefDraft = {
  brief: WorkBrief;
  /** Why each offered style was proposed, in order. */
  styleReasons: Array<{ styleId: string; reason: string }>;
  /** Era id per section id (first unit id). */
  sectionEras: Record<string, string>;
  canonHints: CanonHint[];
  scopeIssues: ReturnType<typeof reviewDraftBrief>["scopeIssues"];
  validationErrors: string[];
  assignmentProblems: string[];
  raw: BriefOutput;
};

function slug(name: string) {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "era";
}

export function briefUserPrompt(options: { workTitle: string; workAuthor: string; readings: DivisionReading[]; sections: MergedSection[]; library: StyleLibrary }): string {
  const lines = [`Work: ${options.workTitle} (${options.workAuthor})`, "", "## Division drafts"];
  for (const r of options.readings) {
    lines.push(`### ${r.label}`);
    lines.push(JSON.stringify(r.brief));
  }
  lines.push("", "## Story sections, in order (id | division | title)");
  for (const s of options.sections) lines.push(`${s.firstUnitId} | ${s.divisionId} | ${s.title}`);
  lines.push("", "## Art style library (id | label | description)");
  for (const style of options.library.styles) lines.push(`${style.id} | ${style.label} | ${style.description}`);
  return lines.join("\n");
}

export async function draftBrief(options: {
  workId: string;
  workTitle: string;
  workAuthor: string;
  readings: DivisionReading[];
  sections: MergedSection[];
  entries: MergedEntry[];
  model: TextModel;
  library?: StyleLibrary;
  beforeCall?: (request: { system: string; user: string; expectedCompletionTokens: number }) => Promise<void>;
}): Promise<BriefDraft> {
  const library = options.library ?? SHARED_STYLES;
  const user = briefUserPrompt({ ...options, library });
  const expectedCompletionTokens = 3000 + 20 * options.sections.length;
  await options.beforeCall?.({ system: BRIEF_SYSTEM, user, expectedCompletionTokens });
  const result = await options.model.complete({ label: "brief", system: BRIEF_SYSTEM, user, schemaName: "work_brief", schema: briefOutputSchema, maxTokens: 20000, expectedCompletionTokens });
  const parsed = parseModelJson(briefOutputSchema, result.content);
  if ("error" in parsed) throw new Error(`Brief draft failed: ${parsed.error}`);
  const raw = parsed.value;

  const eras = raw.eras.map((era) => ({ id: slug(era.name), label: era.name, people: era.people, dress: era.dress, buildingsAndObjects: era.buildings_and_objects, technology: era.technology }));
  const eraIdByName = new Map(raw.eras.map((era, i) => [era.name, eras[i].id]));
  const order = options.sections.map((s) => s.firstUnitId);
  const position = new Map(order.map((id, i) => [id, i]));
  const sectionEras: Record<string, string> = {};
  const assignmentProblems: string[] = [];
  for (const run of raw.assignments) {
    const lo = position.get(run.first_section);
    const hi = position.get(run.last_section);
    const eraId = eraIdByName.get(run.era) ?? eras.find((e) => e.id === slug(run.era))?.id;
    if (lo === undefined || hi === undefined) { assignmentProblems.push(`unknown section id in run ${run.first_section}..${run.last_section}`); continue; }
    if (!eraId) { assignmentProblems.push(`unknown era "${run.era}" in run ${run.first_section}..${run.last_section}`); continue; }
    if (hi < lo) { assignmentProblems.push(`run out of order ${run.first_section}..${run.last_section}`); continue; }
    for (let i = lo; i <= hi; i++) {
      if (sectionEras[order[i]] && sectionEras[order[i]] !== eraId) assignmentProblems.push(`${order[i]} assigned to two eras`);
      sectionEras[order[i]] = eraId;
    }
  }
  const unassigned = order.filter((id) => !sectionEras[id]);
  if (!eras.length) {
    assignmentProblems.push("the draft named no eras; sections are unassigned");
  } else if (unassigned.length) {
    // Fill gaps from the nearest assigned neighbour so every section has an era; record it.
    assignmentProblems.push(`${unassigned.length} sections had no era and took their neighbour's`);
    let last = eras[0].id;
    for (const id of order) {
      if (sectionEras[id]) last = sectionEras[id];
      else sectionEras[id] = last;
    }
  }

  const known = new Set(library.styles.map((s) => s.id));
  const styleReasons = raw.style_set.filter((s) => known.has(s.style_id)).map((s) => ({ styleId: s.style_id, reason: s.reason }));
  const seen = new Set<string>();
  const styleIds = styleReasons.map((s) => s.styleId).filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  const proposed = {
    schemaVersion: 1 as const, workId: options.workId, tone: raw.tone,
    depictionRules: raw.depiction_rules.map((text) => ({ text })),
    eras, styleIds: styleIds.length ? styleIds : [library.styles[0].id],
  };
  const validationErrors: string[] = [];
  let brief: WorkBrief = proposed;
  try {
    brief = validateWorkBrief(proposed, library);
  } catch (error) {
    validationErrors.push(error instanceof Error ? error.message : String(error));
  }
  let canonHints: CanonHint[] = [];
  let scopeIssues: BriefDraft["scopeIssues"] = [];
  if (!validationErrors.length) {
    const review = reviewDraftBrief(brief, options.entries.map((e) => ({ id: e.id, kind: e.kind, names: [e.name, ...e.aliases] })), options.sections.map((s) => s.title), library);
    canonHints = review.canonHints;
    scopeIssues = review.scopeIssues;
    if (review.brief) brief = review.brief;
  }
  return { brief, styleReasons, sectionEras, canonHints, scopeIssues, validationErrors, assignmentProblems, raw };
}
