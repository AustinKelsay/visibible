/** Fixed paired order, real v9/v7 and v10/v8 preparation and exact-version memory stores. */
import assert from "node:assert/strict";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { SITUATION_FIELDS } from "../../../src/lib/engine/situation";
import { buildRenderingPacket, type SelectedCanon } from "../../../src/lib/engine/prompt";
import { reviewPlan } from "../../../src/lib/engine/plan-review";
import { momentContext, readWorkInputs } from "../../../src/lib/engine/work-inputs";
import type { TextModel } from "../../../src/lib/reading-pass/model";
import { prepareBaseline, reviewBaseline, renderBaseline } from "./baseline.mjs";
import { json, randomFrom, root } from "./common.mjs";

export const plan = json("plan.json"), set = json(plan.sampling.fixtures);
export { cases } from "./controls.mjs";
import { cases } from "./controls.mjs";
export type Sample = { id: string; stratum: "retained" | "fresh"; momentId: string; sectionId: string; keys: string[] };
export type Operation = { id: string; kind: "review" | "pipeline"; sample: string; arm: "baseline" | "candidate"; stratum: "retained" | "fresh" | "control" };
export const samples: Sample[] = plan.sampling.retained.map((id: string) => {
  const sample = set.samples.find((s: Sample) => s.id === id); assert.ok(sample, `Missing fixture ${id}`);
  return { ...sample, stratum: "retained" };
});
assert.equal(new Set(samples.map((s) => s.id)).size, 5);
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
assert.equal(inputs.workVersion, set.status.workVersion);
assert.equal(inputs.briefVersion, set.status.briefVersion);
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
      const record = { ...structuredClone(args), version: contentVersion(args.payload), source: "generated" } as AnalysisRecord;
      const index = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId);
      if (index < 0) records.push(record); else records[index] = record;
      writes.push(record); return { version: record.version };
    },
  };
  let error: string | null = null;
  let prepared: Awaited<ReturnType<typeof prepareMoment>> | undefined;
  try { prepared = await (op.arm === "baseline" ? prepareBaseline : prepareMoment)({ workId: "bible-web", momentId: f.sample.momentId, store, model, brief: inputs.brief, briefVersion: inputs.briefVersion, context: f.context, holder: op.id }); }
  catch (e) { error = String(e); }
  const stored = writes.find((r) => r.kind === "plan"), look = writes.find((r) => r.kind === "look");
  const conditions = op.arm === "candidate" ? stored?.payload.situation : look?.payload;
  const renderedConditions = conditions ? Object.fromEntries(SITUATION_FIELDS.map((field) => [field, (conditions as Record<string, unknown>)[field]])) : null;
  const packets: Array<{ styleId: string; ok: boolean; prompt?: string; error?: string }> = [];
  if (prepared && stored && look) {
    const canon: SelectedCanon[] = prepared.present.map((present) => {
      const entry = records.find((r) => r.kind === "entry" && r.recordId === present.entryId)!;
      const payload = entry.payload as unknown as { entryKind: SelectedCanon["kind"]; name: string; hasForm?: boolean; stages: Array<{ id: string; text: string }> };
      const stage = payload.stages.find((s) => s.id === present.stageId)!;
      return { ...present, kind: payload.entryKind, name: payload.name, text: stage.text, hasForm: payload.hasForm !== false };
    });
    for (const [styleId, style] of Object.entries(inputs.styles)) {
      const result = (op.arm === "baseline" ? renderBaseline : buildRenderingPacket)({
        work: { id: "bible-web", title: inputs.work.work.title },
        moment: { id: f.sample.momentId, sectionId: f.sample.sectionId, reference: f.context.moment.reference, text: f.context.moment.text },
        neighbors: { previous: f.context.previous?.text, next: f.context.next?.text },
        brief: inputs.brief, briefVersion: inputs.briefVersion, eraId: prepared.era ?? inputs.brief.eras[0].id,
        style: style.style, styleVersion: style.version, look: { version: prepared.look.version, ...prepared.look.payload },
        situation: prepared.situation, plan: { version: prepared.plan.version, ...prepared.plan.payload }, canon,
        variationNumber: 1, aspectRatio: "16:9",
      });
      packets.push(result.ok ? { styleId, ok: true, prompt: result.prompt } : { styleId, ok: false, error: result.error });
    }
  }
  const renderable = packets.length === 3 && packets.every((p) => p.ok);
  return { outcome: stored && renderable ? "stored" : "refused", error, spendOutcomes: outcomes,
    stored: stored && renderable ? { version: stored.version, payload: stored.payload } : null,
    rejectedStored: stored && !renderable ? { version: stored.version, payload: stored.payload } : null,
    look: look?.payload ?? null, renderedConditions, packets };
}
