/**
 * Fresh in-memory samples of the reviewed planning pipeline. Production is read once (the
 * snapshot); every derived write goes to a per-sample in-memory store and is discarded.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { MOMENT_CAST_PROMPT_VERSION, prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { PLAN_REVIEW_MAX_TOKENS, PLAN_REVIEW_PROMPT_VERSION, PLAN_REVIEW_REASONING } from "../../../src/lib/engine/plan-review";
import { READING_PASS_MODEL, estimateRequestCostUsd } from "../../../src/lib/reading-pass/model";
import { dir, root, json, save, sources, units, row } from "./inspect.mjs";
import { evaluationModel, plain } from "./model.mjs";

type Snapshot = { at: string; balanceUsd: number; pricing: { pricing: { completion: string } }; sources: Record<string, string>; records: Array<{ kind: string; recordId: string; record: AnalysisRecord | null }> };
const [command, phase] = process.argv.slice(2);
assert.ok(command === "dry-run" || (command === "run" && process.argv.includes("--execute")));
assert.match(phase, /^[a-z0-9-]+$/);
const plan = json("plan.json"), snapshot: Snapshot = json(`${phase}.json`), inputs = await readWorkInputs("bible-web", root);
assert.deepEqual(sources(), snapshot.sources); assert.ok(Date.now() - Date.parse(snapshot.at) < 30 * 60_000);
assert.equal(MOMENT_CAST_PROMPT_VERSION, plan.pipeline.planPromptVersion); assert.equal(PLAN_REVIEW_PROMPT_VERSION, plan.pipeline.reviewPromptVersion);
assert.deepEqual(plan.samples.moments, units);

const contextFor = (unit: string) => {
  const moment = row(snapshot, "moment", unit)!, section = row(snapshot, "section", String(moment.payload.sectionId))!;
  return momentContext(inputs.work, { id: unit, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) }, { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
};
/** Production records without any plan, so each sample prepares one fresh plan and reuses the stored look. */
function memoryStore() {
  const records: AnalysisRecord[] = structuredClone(snapshot.records.flatMap((r) => r.record && r.kind !== "plan" ? [r.record] : []));
  const writes: AnalysisRecord[] = [], spend: Array<{ kind: string; outcome: string; costUsd: number | null }> = [];
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
    claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (entry) => { spend.push(entry); },
    putDerivedRecord: async (args) => { const record = { ...structuredClone(args), version: contentVersion(args.payload) } as AnalysisRecord; records.push(record); writes.push(record); return { version: record.version }; },
  };
  return { store, writes, spend };
}
const options = (unit: string, store: PreparationStore) => ({ workId: "bible-web", momentId: unit, store, brief: inputs.brief, briefVersion: inputs.briefVersion, context: contextFor(unit), holder: `reviewed-plan-${unit}` });
const order = Array.from({ length: plan.samples.perMoment }, (_, i) => i + 1).flatMap((round) => units.map((unit) => ({ id: `${unit}-r${round}`, unit, round })));
assert.equal(order.length, plan.samples.total);
const checkRequest = (request: { schemaName: string; maxTokens: number; reasoningEffort?: string; label: string }, unit: string) => {
  if (request.schemaName === "scene_plan") { assert.equal(request.maxTokens, 2400); assert.equal(request.reasoningEffort, undefined); assert.ok(request.label.startsWith(`plan:${unit}:`)); }
  else { assert.equal(request.schemaName, "plan_review", "Only plan and review requests are expected"); assert.equal(request.maxTokens, PLAN_REVIEW_MAX_TOKENS); assert.equal(request.reasoningEffort, PLAN_REVIEW_REASONING); assert.ok(request.label.startsWith(`review:${unit}:`)); }
};

if (command === "dry-run") {
  // Capture each moment's first plan request; no paid call. The review request depends on the reply and is checked live.
  const requests: Record<string, ReturnType<typeof plain>> = {};
  for (const unit of units) {
    const { store, writes } = memoryStore();
    let request: ReturnType<typeof plain> | undefined;
    await assert.rejects(prepareMoment({ ...options(unit, store), model: { id: READING_PASS_MODEL, complete: async (r) => { checkRequest(r, unit); request ??= plain(r); throw Error("dry-run capture"); } } }),
      (error) => String(error).endsWith("dry-run capture"));
    assert.equal(writes.length, 0); assert.ok(request); assert.equal(request.schemaName, "scene_plan");
    requests[unit] = request;
  }
  save("dry-run.json", { at: new Date().toISOString(), snapshot: phase, order, requests, estimatedPlanUsd: Object.fromEntries(units.map((u) => [u, estimateRequestCostUsd(requests[u])])), paidCalls: 0, productionMutations: 0 });
  console.log(JSON.stringify({ dryRun: true, samples: order.length, estimatedFirstPlanTotalUsd: order.reduce((s, o) => s + estimateRequestCostUsd(requests[o.unit]), 0) }));
} else {
  const dry = json("dry-run.json"); assert.equal(dry.snapshot, phase); assert.deepEqual(dry.order, order);
  // One-shot: an interrupted run is retained as evidence, never resumed by appending samples.
  for (const name of ["run-started.json", "samples.ndjson", "ledger.json"]) assert.ok(!fs.existsSync(path.join(dir, name)), `${name} exists; this run already started`);
  save("run-started.json", { at: new Date().toISOString(), snapshot: phase, retryPolicy: plan.retryPolicy });
  const { ledger, forSample } = evaluationModel(snapshot);
  // An unexpected request (for example a look) stops the whole run after its sample is recorded.
  let unexpected: string | null = null;
  for (const sample of order) {
    if (ledger.blocked || unexpected) break;
    const { store, writes, spend } = memoryStore();
    const model = forSample(sample.id, (request, first) => {
      try { checkRequest(request, sample.unit); if (first) assert.deepEqual(plain(request), dry.requests[sample.unit]); }
      catch (error) { unexpected = `${sample.id}: ${String(error).slice(0, 200)}`; throw error; }
    });
    const startedAt = Date.now(), callsBefore = ledger.calls.length;
    let outcome: string, error: string | null = null;
    try { await prepareMoment({ ...options(sample.unit, store), model }); outcome = "stored"; }
    catch (e) { error = String(e); outcome = unexpected ? "stopped" : ledger.blocked ? "blocked" : spend.some((s) => s.outcome === "unavailable" || s.outcome === "review problems" || s.outcome === "review invalid") ? "refused" : "invalid"; }
    const stored = writes.find((w) => w.kind === "plan") ?? null;
    fs.appendFileSync(path.join(dir, "samples.ndjson"), JSON.stringify({ ...sample, at: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
      calls: ledger.calls.length - callsBefore, outcome, error, spendOutcomes: spend.map((s) => s.outcome), stored: stored ? { version: stored.version, payload: stored.payload } : null }) + "\n");
    console.log(JSON.stringify({ id: sample.id, outcome, calls: ledger.calls.length - callsBefore, measuredUsd: ledger.measuredUsd }));
  }
  save("run-finished.json", { at: new Date().toISOString(), samplesTaken: fs.readFileSync(path.join(dir, "samples.ndjson"), "utf8").trim().split("\n").length, ledgerBlocked: ledger.blocked, unexpectedRequest: unexpected, measuredUsd: ledger.measuredUsd, productionMutations: 0 });
}
