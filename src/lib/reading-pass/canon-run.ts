/**
 * The owner-run canon step (#170): draft canon for every on-stage entry of a completed reading
 * pass against the approved brief, finalize section-cast stage assignments, and stage the whole
 * analysis (entries with stages, sections, moments) as a new candidate generation read against
 * that brief's content version. With `activate`, the candidate is activated so the work becomes
 * ready; owner versions in the previously active generation are carried forward by the store.
 * Resumable and budgeted like the reading pass: drafted entries are kept in the state and never
 * redrafted unless asked. Nothing here runs on a reader's image request.
 */
import { createWorkReader } from "../work-input";
import type { WorkBrief, CanonHint } from "../work-preparation";
import { BudgetExceededError, estimateRequestCostUsd, type TextModel, type TextModelRequest, type TextModelResult } from "./model";
import type { AnalysisRecordInput, AnalysisStore } from "./store";
import { draftCanonEntry, entriesNeedingCanon, type CanonEntryResult } from "./canon";
import type { ReadingPassState, SpendLedgerEntry } from "./run";

export type CanonState = {
  schemaVersion: 1;
  workId: string;
  workVersion: string;
  briefVersion: string;
  entries: Record<string, CanonEntryResult>;
  ledger: SpendLedgerEntry[];
  staged: { generation: number; records: number; activated: boolean } | null;
};

export function emptyCanonState(workId: string, workVersion: string, briefVersion: string): CanonState {
  return { schemaVersion: 1, workId, workVersion, briefVersion, entries: {}, ledger: [], staged: null };
}

function canonSpent(state: CanonState) {
  return state.ledger.reduce((n, e) => n + (e.costUsd ?? 0), 0);
}

/** Budget-checked model that also reserves the estimates of calls in flight, so parallel drafting cannot overshoot. */
function budgeted(model: TextModel, state: CanonState, budgetUsd: number, onChange: () => Promise<void>): TextModel {
  let reserved = 0;
  return {
    id: model.id,
    async complete(request: TextModelRequest): Promise<TextModelResult> {
      const estimate = estimateRequestCostUsd(request);
      const spent = canonSpent(state);
      if (spent + reserved + estimate > budgetUsd) throw new BudgetExceededError(spent + reserved, estimate, budgetUsd);
      reserved += estimate;
      try {
        const result = await model.complete(request);
        state.ledger.push({ label: request.label, model: result.model, costUsd: result.usage.costUsd, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, elapsedMs: result.elapsedMs, at: new Date().toISOString() });
        await onChange();
        return result;
      } finally {
        reserved -= estimate;
      }
    },
  };
}

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  let failure: unknown = null;
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length && !failure) {
      try { await worker(queue.shift()!); } catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
}

export async function runCanon(options: {
  workFile: unknown;
  workVersion: string;
  brief: WorkBrief;
  briefVersion: string;
  reading: ReadingPassState;
  hints: CanonHint[];
  model: TextModel;
  store: AnalysisStore | null;
  state: CanonState;
  saveState: (state: CanonState) => Promise<void>;
  budgetUsd: number;
  activate?: boolean;
  redraft?: string[];
  parallel?: number;
  log?: (line: string) => void;
}): Promise<CanonState> {
  const work = createWorkReader(options.workFile);
  const { state, reading } = options;
  const log = options.log ?? (() => {});
  if (!reading.merge || !reading.brief) throw new Error("The reading pass has not finished (merge and brief are needed)");
  if (reading.workVersion !== options.workVersion) throw new Error(`The reading pass was run against work version ${reading.workVersion}, not ${options.workVersion}`);
  if (state.briefVersion !== options.briefVersion) throw new Error(`The canon state was drafted against brief ${state.briefVersion}; the brief is now ${options.briefVersion}. Start a new run.`);
  const save = () => options.saveState(state);
  const model = budgeted(options.model, state, options.budgetUsd, save);
  if (options.redraft?.length) {
    // Redrafted canon must reach the store: forget the staged generation so a fresh candidate is
    // staged below. An already active generation stays active until the new one activates.
    for (const id of options.redraft) delete state.entries[id];
    state.staged = null;
  }

  const needed = entriesNeedingCanon(reading.merge.entries, reading.merge.sections);
  const todo = needed.filter((e) => !state.entries[e.id]);
  log(`${needed.length} entries need canon, ${todo.length} to draft`);
  await pool(todo, options.parallel ?? 6, async (entry) => {
    const result = await draftCanonEntry({ work, entry, brief: options.brief, sections: reading.merge!.sections, sectionEras: reading.brief!.sectionEras, hints: options.hints, model });
    state.entries[entry.id] = result;
    await save();
    log(`  ${entry.id}: ${result.stages.length} stage(s)${result.hasForm ? "" : ", no form"}${result.problems.length ? `; ${result.problems.join("; ")}` : ""}`);
  });
  const records = canonRecords(reading, state);
  if (options.store && !state.staged) {
    log(`staging ${records.length} records as a candidate generation against brief ${options.briefVersion.slice(0, 12)}`);
    await options.store.registerWork({ workId: work.work.id, workVersion: options.workVersion, briefVersion: options.briefVersion });
    const { generation } = await options.store.stageGeneration({ workId: work.work.id, workVersion: options.workVersion, briefVersion: options.briefVersion, note: "reading pass with canon" });
    await options.store.putRecords({ workId: work.work.id, generation, records });
    for (const entry of Object.values(state.entries)) {
      for (const problem of entry.problems) {
        await options.store.noteAttention({ workId: work.work.id, reason: problem.includes("quote") ? "quote_check_failed" : "canon_check", kind: "entry", recordId: entry.entryId, generation, detail: problem });
      }
    }
    state.staged = { generation, records: records.length, activated: false };
    await save();
  }
  if (options.store && options.activate && state.staged && !state.staged.activated) {
    const result = await options.store.activateGeneration({ workId: work.work.id, generation: state.staged.generation });
    state.staged.activated = true;
    await save();
    log(`activated generation ${state.staged.generation}; owner versions carried: ${result.carriedOwnerVersions.length}, unmatched: ${result.unmatchedOwnerVersions.length}`);
  }
  return state;
}

/** Every analysis record with canon applied: entries with stages, sections with final stage assignments, moments. */
export function canonRecords(reading: ReadingPassState, state: CanonState): AnalysisRecordInput[] {
  const merge = reading.merge!;
  const brief = reading.brief!;
  const records: AnalysisRecordInput[] = [];
  for (const e of merge.entries) {
    const canon = state.entries[e.id];
    records.push({ kind: "entry", recordId: e.id, payload: {
      kind: "entry", name: e.name, entryKind: e.kind, aliases: e.aliases, note: e.note, members: e.members,
      ...(canon ? { hasForm: canon.hasForm } : {}),
      stages: canon ? canon.stages.map((s) => ({ id: s.id, label: s.label, text: s.text, quotes: s.quotes })) : [],
    } });
  }
  const stageFor = (entryId: string, sectionId: string) => state.entries[entryId]?.sectionStages[sectionId] ?? state.entries[entryId]?.stages[0]?.id ?? "main";
  for (const s of merge.sections) {
    records.push({ kind: "section", recordId: s.firstUnitId, payload: {
      kind: "section", title: s.title, firstUnit: s.firstUnitId, lastUnit: s.lastUnitId, era: brief.sectionEras[s.firstUnitId],
      cast: [...s.onStage.map((o) => ({ entryId: o.id, stageId: stageFor(o.id, s.firstUnitId), named: o.named })), ...s.setting.map((id) => ({ entryId: id, stageId: stageFor(id, s.firstUnitId) }))],
      mentionedOnly: s.mentionedOnly,
    } });
  }
  for (const moments of Object.values(reading.moments)) {
    for (const m of moments) records.push({ kind: "moment", recordId: m.firstUnitId, payload: { kind: "moment", sectionId: m.sectionId, firstUnit: m.firstUnitId, lastUnit: m.lastUnitId } });
  }
  return records;
}
