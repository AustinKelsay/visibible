/** Fixed paired order, real v9/v5 and v9/v6 preparation and exact-version memory stores. */
import assert from "node:assert/strict";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { reviewPlan } from "../../../src/lib/engine/plan-review";
import { momentContext, readWorkInputs } from "../../../src/lib/engine/work-inputs";
import type { TextModel } from "../../../src/lib/reading-pass/model";
import { prepareBaseline, reviewBaseline } from "./baseline.mjs";
import { json, randomFrom, root } from "./common.mjs";

export const plan = json("plan.json"), set = json("sample-set.json");
export { cases } from "./controls.mjs";
import { cases } from "./controls.mjs";
export type Sample = { id: string; stratum: "retained" | "fresh"; momentId: string; sectionId: string; keys: string[] };
export type Operation = { id: string; kind: "review" | "pipeline"; sample: string; arm: "baseline" | "candidate"; stratum: "retained" | "fresh" | "control" };
export const samples: Sample[] = set.samples;
assert.equal(samples.filter((s) => s.stratum === "fresh").length, plan.sampling.fresh);
assert.equal(samples.filter((s) => s.stratum === "retained").length, plan.sampling.retained.length);
const pairs = [...samples], random = randomFrom(plan.sampling.orderSeed);
for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
export const operations: Operation[] = [];
for (const [i, c] of cases.entries()) for (const arm of (i % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) as Array<"baseline" | "candidate">) {
  operations.push({ id: `${c.id}-${arm}`, kind: "review", sample: c.id, arm, stratum: "control" });
}
for (const [i, sample] of pairs.entries()) for (const arm of (i % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) as Array<"baseline" | "candidate">) {
  operations.push({ id: `${sample.id}-${arm}`, kind: "pipeline", sample: sample.id, arm, stratum: sample.stratum });
}
export const inputs = await readWorkInputs("bible-web", root);
export function fixture(id: string) {
  const sample = samples.find((s) => s.id === id); assert.ok(sample);
  const records: AnalysisRecord[] = structuredClone(sample.keys.map((key) => set.records[key]));
  assert.ok(records.every((r) => r.kind !== "look" && r.kind !== "plan"));
  const moment = records.find((r) => r.kind === "moment")!, section = records.find((r) => r.kind === "section")!;
  const context = momentContext(inputs.work, { id: sample.momentId, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) },
    { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  return { sample, records, context, section };
}
export async function perform(op: Operation, model: TextModel) {
  if (op.kind === "review") return (op.arm === "baseline" ? reviewBaseline : reviewPlan)(model, async () => {}, op.id, cases.find((c) => c.id === op.sample)!.input);
  const f = fixture(op.sample), records = f.records, writes: AnalysisRecord[] = [], outcomes: string[] = [];
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
  try { await (op.arm === "baseline" ? prepareBaseline : prepareMoment)({ workId: "bible-web", momentId: f.sample.momentId, store, model, brief: inputs.brief, briefVersion: inputs.briefVersion, context: f.context, holder: op.id }); }
  catch (e) { error = String(e); }
  const stored = writes.find((r) => r.kind === "plan"), look = writes.find((r) => r.kind === "look");
  return { outcome: stored ? "stored" : "refused", error, spendOutcomes: outcomes, stored: stored ? { version: stored.version, payload: stored.payload } : null, look: look?.payload ?? null };
}
