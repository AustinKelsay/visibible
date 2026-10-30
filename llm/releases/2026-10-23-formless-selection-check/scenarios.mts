/** Fixed retained cases, production preparation, and an in-memory-only analysis store. */
import fs from "node:fs";
import path from "node:path";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { PLAN_SCENE_FIELDS, reviewPlan, type ReviewInput } from "../../../src/lib/engine/plan-review";
import { momentContext, readWorkInputs } from "../../../src/lib/engine/work-inputs";
import type { TextModel } from "../../../src/lib/reading-pass/model";
import { dir, json, root } from "./common.mjs";

export const plan = json("plan.json");
export const baselineDir = path.resolve(dir, plan.baseline);
export const set = JSON.parse(fs.readFileSync(path.join(baselineDir, "sample-set.json"), "utf8"));
const rows = fs.readFileSync(path.join(baselineDir, "samples.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
export const inputs = await readWorkInputs("bible-web", root);
export const god = "god_yahweh_the_father_and_god_of_israel";
export type Operation = { id: string; kind: "review" | "pipeline"; sample: string; arm: "baseline" | "candidate"; repeat: number; defect: boolean };
export const operations: Operation[] = [];
for (let repeat = 1; repeat <= plan.cases.repeats; repeat++) {
  for (const sample of plan.cases.defects) for (const arm of ["baseline", "candidate"] as const) operations.push({ id: `review-${sample}-${arm}-${repeat}`, kind: "review", sample, arm, repeat, defect: true });
  for (const sample of plan.cases.ordinaryLightControls) operations.push({ id: `review-${sample}-candidate-${repeat}`, kind: "review", sample, arm: "candidate", repeat, defect: false });
}
for (let repeat = 1; repeat <= plan.cases.repeats; repeat++) for (const sample of [...plan.cases.defects, ...plan.cases.ordinaryLightControls].sort()) {
  operations.push({ id: `pipeline-${sample}-${repeat}`, kind: "pipeline", sample, arm: "candidate", repeat, defect: plan.cases.defects.includes(sample) });
}
export function fixture(id: string) {
  const row = rows.find((r) => r.id === id);
  const sample = set.samples.find((s: { index: number }) => s.index === row.index);
  const records: AnalysisRecord[] = structuredClone(sample.keys.map((k: string) => set.records[k]));
  const moment = records.find((r) => r.kind === "moment")!, section = records.find((r) => r.kind === "section")!;
  const context = momentContext(inputs.work, { id: sample.momentId, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) },
    { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  const cast = (section.payload.cast as Array<{ entryId: string }>).map(({ entryId }) => {
    const entry = records.find((r) => r.kind === "entry" && r.recordId === entryId)!;
    return { entryId, name: String(entry.payload.name), hasForm: entry.payload.hasForm !== false };
  });
  const review: ReviewInput = { rules: inputs.brief.depictionRules.map((r) => `- ${r.text}`).join("\n") || "- none", depiction: inputs.depiction, context,
    sectionTitle: String(section.payload.title), cast, present: row.stored.payload.entries.map((e: { entryId: string }) => e.entryId),
    fields: Object.fromEntries(PLAN_SCENE_FIELDS.map((f) => [f, row.stored.payload.plan[f]])) as ReviewInput["fields"] };
  return { row, sample, records, context, review };
}

export async function perform(op: Operation, model: TextModel) {
  const f = fixture(op.sample);
  if (op.kind === "review") {
    const chosen = op.arm === "candidate" ? model : { id: model.id, complete: (request: Parameters<TextModel["complete"]>[0]) => model.complete({ ...request, system: fs.readFileSync(path.join(dir, "baseline-review-system.txt"), "utf8") }) };
    return reviewPlan(chosen, async () => {}, op.id, f.review);
  }
  const records = f.records, writes: AnalysisRecord[] = [], outcomes: string[] = [];
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
    claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (entry) => { outcomes.push(`${entry.kind}:${entry.outcome}`); },
    putDerivedRecord: async (args) => {
      const record = { ...structuredClone(args), version: contentVersion(args.payload) } as AnalysisRecord;
      const index = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId);
      if (index < 0) records.push(record); else records[index] = record;
      writes.push(record); return { version: record.version };
    },
  };
  let error: string | null = null;
  try { await prepareMoment({ workId: "bible-web", momentId: f.sample.momentId, store, model, brief: inputs.brief, briefVersion: inputs.briefVersion, context: f.context, holder: op.id }); }
  catch (e) { error = String(e); }
  const stored = writes.find((r) => r.kind === "plan");
  return { outcome: stored ? "stored" : "refused", error, spendOutcomes: outcomes, stored: stored ? { version: stored.version, payload: stored.payload } : null };
}
