/**
 * The owner-run reference step (#172): make every missing or stale sheet and style reference
 * for a work's active analysis, within a budget, resumably. Pinned references are left alone.
 * Failures after three attempts become attention items and the engine runs without them.
 */
import type { WorkBrief, StyleLibrary } from "../work-preparation";
import { SHARED_STYLES } from "../work-preparation";
import { makeSheet, makeStyleReference, mainEra, sheetInputs, sheetSubjects, styleReferenceInputs, type ActiveEntry, type ActiveSection, type ImageMaker, type ReferenceBlobStore, type ReferenceOutcome, type VisionChecker } from "./references";
import { contentVersion } from "../../../convex/_helpers/contentVersion";

type InputRef = { kind: string; recordId: string; version: string };

export interface ReferenceStore {
  listActiveRecords(kind: "entry" | "section"): Promise<Array<{ recordId: string; version: string; payload: Record<string, unknown> }>>;
  getReference(kind: "sheet" | "styleReference", recordId: string, expectedInputs: InputRef[]): Promise<{ storageId: string; stale: boolean; pinned: boolean } | null>;
  putReference(args: { kind: "sheet" | "styleReference"; recordId: string; storageId: string; inputs: InputRef[]; verdict: string; notes: string[] }): Promise<void>;
  noteAttention(item: { reason: string; kind: string; recordId: string; detail: string }): Promise<void>;
}

export type ReferenceRunState = {
  schemaVersion: 1;
  workId: string;
  /** Keyed by kind:recordId; a done entry applies only while its input fingerprint still matches. */
  done: Record<string, { ok: boolean; attempts: number; costUsd: number; at: string; fingerprint: string }>;
  spentUsd: number;
};

export function inputFingerprint(inputs: InputRef[]) {
  return contentVersion(inputs.map((i) => [i.kind, i.recordId, i.version]));
}

export function emptyReferenceState(workId: string): ReferenceRunState {
  return { schemaVersion: 1, workId, done: {}, spentUsd: 0 };
}

export class ReferenceBudgetError extends Error {
  constructor(spent: number, budget: number) {
    super(`Reference budget of $${budget.toFixed(2)} would be exceeded (spent $${spent.toFixed(4)})`);
  }
}

export type ReferenceStatus = "fresh" | "pinned" | "stale" | "missing" | "failed";
export type ReferencePlan = { sheets: Array<{ recordId: string; name: string; kind: string; status: ReferenceStatus }>; styles: Array<{ styleId: string; status: ReferenceStatus }> };

export async function planReferences(options: { workId: string; brief: WorkBrief; store: ReferenceStore; state: ReferenceRunState; library?: StyleLibrary; styleVersions: Record<string, string> }): Promise<ReferencePlan> {
  const library = options.library ?? SHARED_STYLES;
  const entries = (await options.store.listActiveRecords("entry")).map((r) => ({ recordId: r.recordId, version: r.version, ...(r.payload as Omit<ActiveEntry, "recordId" | "version">) }));
  const sections = (await options.store.listActiveRecords("section")).map((r) => ({ recordId: r.recordId, ...(r.payload as Omit<ActiveSection, "recordId">) }));
  const classical = library.get("classical");
  const classicalVersion = options.styleVersions.classical ?? contentVersion(classical);
  const status = async (kind: "sheet" | "styleReference", recordId: string, inputs: InputRef[]): Promise<ReferenceStatus> => {
    const existing = await options.store.getReference(kind, recordId, inputs);
    if (existing?.pinned) return "pinned";
    if (existing && !existing.stale) return "fresh";
    const done = options.state.done[`${kind}:${recordId}`];
    if (done && !done.ok && done.fingerprint === inputFingerprint(inputs)) return "failed";
    return existing ? "stale" : "missing";
  };
  const sheets = [];
  for (const subject of sheetSubjects(entries, sections, options.brief)) {
    const recordId = `${subject.entryId}:${subject.stageId}`;
    sheets.push({ recordId, name: subject.name, kind: subject.kind, status: await status("sheet", recordId, sheetInputs(subject, classical, classicalVersion)) });
  }
  const era = mainEra(sections, options.brief);
  const styles = [];
  for (const styleId of options.brief.styleIds.filter((id) => id !== "classical")) {
    const style = library.get(styleId);
    styles.push({ styleId, status: await status("styleReference", styleId, styleReferenceInputs(style, options.styleVersions[styleId] ?? contentVersion(style), era)) });
  }
  return { sheets, styles };
}

export async function runReferences(options: {
  workId: string; workTitle: string; brief: WorkBrief; store: ReferenceStore; maker: ImageMaker; checker: VisionChecker; blobs: ReferenceBlobStore;
  state: ReferenceRunState; saveState: (state: ReferenceRunState) => Promise<void>; budgetUsd: number; library?: StyleLibrary; styleVersions: Record<string, string>;
  /** Make only these records ("entry:stage" or a style id), remaking them even if fresh. */
  only?: string[];
  log?: (line: string) => void;
}): Promise<ReferenceRunState> {
  const library = options.library ?? SHARED_STYLES;
  const { state, store } = options;
  const log = options.log ?? (() => {});
  const entries = (await store.listActiveRecords("entry")).map((r) => ({ recordId: r.recordId, version: r.version, ...(r.payload as Omit<ActiveEntry, "recordId" | "version">) }));
  const sections = (await store.listActiveRecords("section")).map((r) => ({ recordId: r.recordId, ...(r.payload as Omit<ActiveSection, "recordId">) }));
  const classical = library.get("classical");
  const classicalVersion = options.styleVersions.classical ?? contentVersion(classical);
  const beforeCall = async (estimateUsd: number, pendingUsd: number) => {
    if (state.spentUsd + pendingUsd + estimateUsd > options.budgetUsd) throw new ReferenceBudgetError(state.spentUsd + pendingUsd, options.budgetUsd);
  };
  const deps = { maker: options.maker, checker: options.checker, blobs: options.blobs, beforeCall };
  const settle = async (kind: "sheet" | "styleReference", recordId: string, label: string, inputs: InputRef[], outcome: ReferenceOutcome) => {
    const cost = outcome.attempts.reduce((n, a) => n + a.costUsd, 0);
    state.spentUsd += cost;
    if (outcome.ok) {
      await store.putReference({ kind, recordId, storageId: outcome.storageId, inputs, verdict: "pass", notes: outcome.notes });
      for (const note of outcome.notes) await store.noteAttention({ reason: "canon_note", kind, recordId, detail: note });
    } else if (outcome.aborted === undefined) {
      await store.noteAttention({ reason: kind === "sheet" ? "sheet_failed" : "style_reference_failed", kind, recordId, detail: outcome.attempts.map((a) => a.error ?? a.verdict?.reasons.join("; ") ?? "?").join(" | ") });
    }
    if (!outcome.ok && outcome.aborted !== undefined) {
      // A budget stop after paid attempts: keep the spend, leave the reference undone, then stop.
      await options.saveState(state);
      log(`  ${label}: stopped by the budget after ${outcome.attempts.length} paid attempt(s), $${cost.toFixed(4)}`);
      throw outcome.aborted;
    }
    state.done[`${kind}:${recordId}`] = { ok: outcome.ok, attempts: outcome.attempts.length, costUsd: cost, at: new Date().toISOString(), fingerprint: inputFingerprint(inputs) };
    await options.saveState(state);
    log(`  ${label}: ${outcome.ok ? "ok" : "FAILED"} after ${outcome.attempts.length} attempt(s), $${cost.toFixed(4)}${outcome.notes.length ? `; notes: ${outcome.notes.length}` : ""}`);
  };

  // Skip a reference when it is pinned, fresh for the current inputs, or failed for exactly these
  // inputs in this run state (so a failed reference is not paid for again until something changes).
  const skip = async (kind: "sheet" | "styleReference", recordId: string, inputs: InputRef[]) => {
    const existing = await store.getReference(kind, recordId, inputs);
    if (options.only) {
      if (!options.only.includes(recordId)) return true;
      if (existing?.pinned) throw new Error(`${kind} ${recordId} is pinned; unpin it before redoing it`);
      return false;
    }
    if (existing && (existing.pinned || !existing.stale)) return true;
    const done = state.done[`${kind}:${recordId}`];
    return Boolean(done && done.fingerprint === inputFingerprint(inputs));
  };
  for (const subject of sheetSubjects(entries, sections, options.brief)) {
    const recordId = `${subject.entryId}:${subject.stageId}`;
    const inputs = sheetInputs(subject, classical, classicalVersion);
    if (await skip("sheet", recordId, inputs)) continue;
    log(`sheet for ${subject.name} (${subject.kind}, stage ${subject.stageId})`);
    await settle("sheet", recordId, subject.name, inputs, await makeSheet({ title: options.workTitle }, subject, classical, deps));
  }
  const era = mainEra(sections, options.brief);
  for (const styleId of options.brief.styleIds.filter((id) => id !== "classical")) {
    const style = library.get(styleId);
    const inputs = styleReferenceInputs(style, options.styleVersions[styleId] ?? contentVersion(style), era);
    if (await skip("styleReference", styleId, inputs)) continue;
    log(`style reference for ${style.label} (${era.label})`);
    await settle("styleReference", styleId, style.label, inputs, await makeStyleReference(style, era, deps));
  }
  return state;
}
