/** Fixed case order and the actual merged preparation/rendering in one cold memory store per case. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { FORMLESS_PLAN_PROMPT_VERSION, MOMENT_CAST_PROMPT_VERSION, prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { PLAN_REVIEW_PROMPT_VERSION } from "../../../src/lib/engine/plan-review";
import { SITUATION_FIELDS } from "../../../src/lib/engine/situation";
import { buildRenderingPacket, GENERIC_PROMPT_VERSION, type SelectedCanon } from "../../../src/lib/engine/prompt";
import { momentContext, readWorkInputs } from "../../../src/lib/engine/work-inputs";
import type { TextModel } from "../../../src/lib/reading-pass/model";
import { hash, json, randomFrom, root, sharedSources } from "./common.mjs";

export const plan = json("plan.json");
assert.equal(MOMENT_CAST_PROMPT_VERSION, plan.pipeline.momentCast);
assert.equal(FORMLESS_PLAN_PROMPT_VERSION, plan.pipeline.formlessPlan);
assert.equal(PLAN_REVIEW_PROMPT_VERSION, plan.pipeline.review);
assert.equal(GENERIC_PROMPT_VERSION, plan.pipeline.rendering);
for (const file of sharedSources) {
  assert.equal(hash(execFileSync("git", ["show", `${plan.candidateCommit}:${file}`], { cwd: root })), hash(fs.readFileSync(path.join(root, file))), `Immutable candidate changed: ${file}`);
}
const fresh = json("sample-set.json"), retainedSet = json(plan.sampling.retainedFixture);
export type Sample = { id: string; stratum: "retained" | "fresh"; momentId: string; sectionId: string; keys: string[]; records: Record<string, AnalysisRecord>; status: { workVersion: string; briefVersion: string } };
export const samples: Sample[] = [
  ...plan.sampling.retained.map((id: string) => {
    const s = retainedSet.samples.find((x: { id: string }) => x.id === id); assert.ok(s, `Missing retained fixture ${id}`);
    return { ...s, stratum: "retained", records: retainedSet.records, status: retainedSet.status };
  }),
  ...fresh.samples.map((s: Sample) => ({ ...s, records: fresh.records, status: fresh.status })),
];
assert.equal(samples.filter((s) => s.stratum === "fresh").length, plan.sampling.fresh);
assert.equal(samples.filter((s) => s.stratum === "retained").length, plan.sampling.retained.length);
assert.equal(new Set(samples.map((s) => s.momentId)).size, samples.length);
export type Operation = { id: string; kind: "pipeline"; sample: string; stratum: "retained" | "fresh" };
const ordered = [...samples], random = randomFrom(plan.sampling.orderSeed);
for (let i = ordered.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ordered[i], ordered[j]] = [ordered[j], ordered[i]]; }
export const operations: Operation[] = ordered.map((s) => ({ id: s.id, kind: "pipeline", sample: s.id, stratum: s.stratum }));
export const inputs = await readWorkInputs("bible-web", root);
for (const s of [fresh, retainedSet]) { assert.equal(inputs.workVersion, s.status.workVersion); assert.equal(inputs.briefVersion, s.status.briefVersion); }
export function fixture(id: string) {
  const sample = samples.find((s) => s.id === id); assert.ok(sample);
  const records: AnalysisRecord[] = structuredClone(sample.keys.map((key) => sample.records[key]));
  assert.ok(records.every((r) => r && r.kind !== "look" && r.kind !== "plan"));
  const moment = records.find((r) => r.kind === "moment")!, section = records.find((r) => r.kind === "section")!;
  const context = momentContext(inputs.work, { id: sample.momentId, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) },
    { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  return { sample, records, context, section };
}
export async function perform(op: Operation, model: TextModel) {
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
  try { prepared = await prepareMoment({ workId: "bible-web", momentId: f.sample.momentId, store, model, brief: inputs.brief, briefVersion: inputs.briefVersion, context: f.context, holder: op.id }); }
  catch (e) { error = String(e); }
  const stored = writes.find((r) => r.kind === "plan"), look = writes.find((r) => r.kind === "look");
  const conditions = stored?.payload.situation;
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
      const result = buildRenderingPacket({
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
