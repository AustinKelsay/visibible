/**
 * The owner-run reading pass (#169): read every root division, merge the casts, draft moments
 * for prose works, draft the brief, and write a candidate analysis generation. The run is
 * resumable: completed division readings are kept in a state object the command persists, so a
 * failed or repeated command never repeats a completed paid call. A hard provider-spend budget
 * is checked before every call from the model's list prices; owner spend is recorded in the
 * state and no guest credit is ever reserved.
 *
 * The candidate it writes is not activatable: entries have no canon stages until the canon
 * slice drafts them, so readiness cannot be reached from this command alone.
 */
import { createWorkReader, type WorkReader } from "../work-input";
import { readDivision, rootDivisions, type DivisionReading, DivisionReadError } from "./division";
import { mergeCasts, type MergeResult, type SameNameHints } from "./merge";
import { readMoments, unitMoments, type MomentRange } from "./moments";
import { draftBrief, type BriefDraft } from "./brief";
import { BudgetExceededError, estimateRequestCostUsd, type TextModel, type TextModelRequest, type TextModelResult } from "./model";
import type { AnalysisRecordInput, AnalysisStore } from "./store";
import type { StyleLibrary } from "../work-preparation";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { responseSchema } from "./prompts";

export type SpendLedgerEntry = { label: string; model: string; costUsd: number | null; promptTokens: number | null; completionTokens: number | null; elapsedMs: number; at: string };

export type ReadingPassState = {
  schemaVersion: 1;
  workId: string;
  workVersion: string;
  readings: Record<string, DivisionReading>;
  failures: Record<string, { attempts: DivisionReading["attempts"]; at: string }>;
  merge: MergeResult | null;
  /** Accepted merge batches, keyed by their initial prompt identity, so interrupted merges resume free. */
  mergeResponses?: Record<string, TextModelResult>;
  /** Every paid merge answer remains audit evidence, including rejected and conflicting rulings. */
  mergeAttempts?: Array<{ key: string; result: TextModelResult }>;
  moments: Record<string, MomentRange[]>;
  brief: BriefDraft | null;
  staged: { generation: number; records: number } | null;
  ledger: SpendLedgerEntry[];
};

export type WorkHints = {
  sectionTargets?: Record<string, number>;
  sameNames?: SameNameHints;
};

export { BudgetExceededError };

export function emptyState(workId: string, workVersion: string): ReadingPassState {
  return { schemaVersion: 1, workId, workVersion, readings: {}, failures: {}, merge: null, moments: {}, brief: null, staged: null, ledger: [] };
}

export function spentUsd(state: ReadingPassState): number {
  return state.ledger.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
}

/** Wrap a model so every call is checked against the budget first and recorded in the ledger. */
function budgeted(model: TextModel, state: ReadingPassState, budgetUsd: number, onChange: () => Promise<void>): TextModel {
  return {
    id: model.id,
    async complete(request: TextModelRequest): Promise<TextModelResult> {
      const estimate = estimateRequestCostUsd(request);
      const spent = spentUsd(state);
      if (spent + estimate > budgetUsd) throw new BudgetExceededError(spent, estimate, budgetUsd);
      const result = await model.complete(request);
      state.ledger.push({ label: request.label, model: result.model, costUsd: result.usage.costUsd, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, elapsedMs: result.elapsedMs, at: new Date().toISOString() });
      await onChange();
      return result;
    },
  };
}

export type ReadingPassPlan = {
  divisions: Array<{ id: string; label: string; units: number; done: boolean; unitsPerSection: number }>;
  estimatedUsd: number;
  spentUsd: number;
  remainingCalls: number;
};

/** What a run would do and roughly cost, without any call. */
export function planReadingPass(work: WorkReader, state: ReadingPassState, options: { unitsPerSection?: number; hints?: WorkHints }): ReadingPassPlan {
  const divisions = rootDivisions(work).map((d) => {
    const target = unitsPerSectionFor(d, work, options);
    const done = Boolean(state.readings[d.id]);
    return { id: d.id, label: d.label, units: d.units.length, done, unitsPerSection: target, estimate: done ? 0 : estimateRequestCostUsd({ system: "x".repeat(4000), user: d.units.map((u) => u.text).join("\n"), expectedCompletionTokens: 12 * d.units.length + 2000 }) };
  });
  const momentCalls = work.momentMode === "reading-pass" ? divisions.filter((d) => !state.moments[d.id]).length : 0;
  const estimatedUsd = divisions.reduce((n, d) => n + d.estimate, 0) + (state.merge ? 0 : 0.05) + (state.brief ? 0 : 0.02) + momentCalls * 0.01;
  return {
    divisions: divisions.map(({ estimate, ...d }) => { void estimate; return d; }),
    estimatedUsd, spentUsd: spentUsd(state),
    remainingCalls: divisions.filter((d) => !d.done).length + (state.merge ? 0 : 1) + (state.brief ? 0 : 1) + momentCalls,
  };
}

function unitsPerSectionFor(division: { id: string; units: readonly unknown[] }, work: WorkReader, options: { unitsPerSection?: number; hints?: WorkHints }): number {
  const target = options.hints?.sectionTargets?.[division.id];
  if (target && target > 0) return Math.max(2, Math.round(division.units.length / target));
  return options.unitsPerSection ?? (work.momentMode === "unit" ? 18 : 18);
}

export async function runReadingPass(options: {
  workFile: unknown;
  workVersion: string;
  model: TextModel;
  store: AnalysisStore | null;
  state: ReadingPassState;
  saveState: (state: ReadingPassState) => Promise<void>;
  budgetUsd: number;
  hints?: WorkHints;
  unitsPerSection?: number;
  library?: StyleLibrary;
  log?: (line: string) => void;
}): Promise<ReadingPassState> {
  const work = createWorkReader(options.workFile);
  const { state } = options;
  if (state.workId !== work.work.id) throw new Error(`State is for ${state.workId}, not ${work.work.id}`);
  if (state.workVersion !== options.workVersion) throw new Error(`State was read against work version ${state.workVersion}; the file is now ${options.workVersion}. Start a new run.`);
  const log = options.log ?? (() => {});
  const save = () => options.saveState(state);
  const model = budgeted(options.model, state, options.budgetUsd, save);

  for (const division of rootDivisions(work)) {
    if (state.readings[division.id]) continue;
    const unitsPerSection = unitsPerSectionFor(division, work, options);
    log(`reading ${division.label} (${division.units.length} units, target ${unitsPerSection} per section)`);
    try {
      state.readings[division.id] = await readDivision({ work, division, model, unitsPerSection });
      delete state.failures[division.id];
    } catch (error) {
      if (error instanceof DivisionReadError) {
        state.failures[division.id] = { attempts: error.attempts, at: new Date().toISOString() };
        await save();
        log(`FAILED ${division.label}: ${error.message}`);
        continue;
      }
      await save();
      throw error;
    }
    await save();
    log(`  ${state.readings[division.id].sections.length} sections, ${state.readings[division.id].characters.length} characters, ${state.readings[division.id].locations.length} locations`);
  }
  const failed = Object.keys(state.failures);
  if (failed.length) throw new Error(`${failed.length} division(s) could not be read: ${failed.join(", ")}. Fix or retry before merging.`);

  const readings = rootDivisions(work).map((d) => state.readings[d.id]);
  if (!state.merge) {
    log("merging casts");
    const responseKey = (request: TextModelRequest) => contentVersion({ model: model.id, system: request.system, user: request.user, schemaName: request.schemaName, schema: responseSchema(request.schema), maxTokens: request.maxTokens });
    const mergeModel: TextModel = { id: model.id, async complete(request) {
      const key = responseKey(request);
      const cached = state.mergeResponses?.[key];
      if (cached) return cached;
      const result = await model.complete(request);
      (state.mergeAttempts ??= []).push({ key, result });
      await save();
      return result;
    } };
    state.merge = await mergeCasts({ workTitle: work.work.title, workAuthor: work.work.author, readings, model: mergeModel, sameNameHints: options.hints?.sameNames,
      onRuling: async (request, result) => {
        const key = responseKey(request);
        if (result) (state.mergeResponses ??= {})[key] = result;
        else delete state.mergeResponses?.[key];
        await save();
      },
    });
    await save();
    log(`  ${state.merge.entries.length} entries from ${state.merge.groups.length} groups in ${state.merge.calls} call(s)`);
  }
  const merge = state.merge;

  if (work.momentMode === "reading-pass") {
    for (const division of rootDivisions(work)) {
      if (state.moments[division.id]) continue;
      log(`moments for ${division.label}`);
      const { moments } = await readMoments({ work, division, sections: merge.sections, model });
      state.moments[division.id] = moments;
      await save();
    }
  } else {
    for (const division of rootDivisions(work)) {
      if (!state.moments[division.id]) state.moments[division.id] = unitMoments(division.units, merge.sections);
    }
    await save();
  }

  if (!state.brief) {
    log("drafting the brief");
    state.brief = await draftBrief({ workId: work.work.id, workTitle: work.work.title, workAuthor: work.work.author, readings, sections: merge.sections, entries: merge.entries, model, library: options.library });
    await save();
    log(`  ${state.brief.brief.eras.length} era(s), ${state.brief.brief.depictionRules.length} rule(s), styles ${state.brief.brief.styleIds.join(", ")}` + (state.brief.validationErrors.length ? `; validation: ${state.brief.validationErrors.join("; ")}` : ""));
  }

  if (options.store && !state.staged) {
    const records = analysisRecords(state);
    log(`staging ${records.length} records as a candidate generation`);
    const briefVersion = `draft:${state.brief.brief.eras.map((e) => e.id).join(",")}`;
    await options.store.registerWork({ workId: work.work.id, workVersion: options.workVersion });
    const { generation } = await options.store.stageGeneration({ workId: work.work.id, workVersion: options.workVersion, briefVersion, note: "reading pass; canon not yet drafted" });
    await options.store.putRecords({ workId: work.work.id, generation, records });
    state.staged = { generation, records: records.length };
    await save();
  }
  return state;
}

/** The analysis records a completed reading produces: entries without stages, sections, moments. */
export function analysisRecords(state: ReadingPassState): AnalysisRecordInput[] {
  const merge = state.merge;
  const brief = state.brief;
  if (!merge || !brief) throw new Error("Merge and brief must be complete before records are built");
  const records: AnalysisRecordInput[] = [];
  for (const e of merge.entries) {
    records.push({ kind: "entry", recordId: e.id, payload: { kind: "entry", name: e.name, entryKind: e.kind, aliases: e.aliases, note: e.note, members: e.members, stages: [] } });
  }
  for (const s of merge.sections) {
    records.push({ kind: "section", recordId: s.firstUnitId, payload: {
      kind: "section", title: s.title, firstUnit: s.firstUnitId, lastUnit: s.lastUnitId, era: brief.sectionEras[s.firstUnitId],
      // Stage assignment is canon's job; "main" is the placeholder the canon slice rewrites.
      cast: [...s.onStage.map((o) => ({ entryId: o.id, stageId: "main", named: o.named })), ...s.setting.map((id) => ({ entryId: id, stageId: "main" }))],
      mentionedOnly: s.mentionedOnly,
    } });
  }
  for (const moments of Object.values(state.moments)) {
    for (const m of moments) records.push({ kind: "moment", recordId: m.firstUnitId, payload: { kind: "moment", sectionId: m.sectionId, firstUnit: m.firstUnitId, lastUnit: m.lastUnitId } });
  }
  return records;
}
