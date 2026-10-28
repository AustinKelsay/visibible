/**
 * Repeated in-memory plan samples for the v3 and v4 contracts. Production is read once (the
 * snapshot); every derived write goes to a per-sample in-memory store and is discarded.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import type { AnalysisRecord, PreparationStore } from "../../../src/lib/engine/preparation";
import { READING_PASS_MODEL, estimateRequestCostUsd } from "../../../src/lib/reading-pass/model";
import { dir, root, json, save, sources, units, row, codeRoot, contractSources } from "./inspect.mjs";
import { evaluationModel, plain } from "./model.mjs";

type Prep = typeof import("../../../src/lib/engine/preparation");
type Snapshot = { at: string; balanceUsd: number; pricing: { pricing: { completion: string } }; sources: Record<string, string>; contractSources: Record<string, Record<string, string>>; records: Array<{ kind: string; recordId: string; record: AnalysisRecord | null }> };
const contracts = ["v3", "v4"] as const;
const load = async (contract: string): Promise<Prep> => import(pathToFileURL(path.join(codeRoot(contract), "src/lib/engine/preparation.ts")).href);

const [command, phase] = process.argv.slice(2);
assert.ok(command === "dry-run" || (command === "run" && process.argv.includes("--execute")));
assert.match(phase, /^[a-z0-9-]+$/);
const plan = json("plan.json"), snapshot: Snapshot = json(`${phase}.json`), inputs = await readWorkInputs("bible-web", root);
assert.deepEqual(sources(), snapshot.sources);
for (const contract of contracts) assert.deepEqual(contractSources(contract), snapshot.contractSources[contract]);
assert.ok(Date.now() - Date.parse(snapshot.at) < 30 * 60_000);
const modules = { v3: await load("v3"), v4: await load("v4") };
for (const contract of contracts) assert.equal(modules[contract].MOMENT_CAST_PROMPT_VERSION, plan.contracts[contract].promptVersion);

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
    putDerivedRecord: async (args) => {
      const record = { ...structuredClone(args), version: contentVersion(args.payload) } as AnalysisRecord;
      records.push(record); writes.push(record); return { version: record.version };
    },
  };
  return { store, writes, spend };
}
const options = (unit: string, store: PreparationStore) => ({ workId: "bible-web", momentId: unit, store, brief: inputs.brief, briefVersion: inputs.briefVersion, context: contextFor(unit), holder: `grounding-rate-${unit}` });
// Round r takes every moment in order; v3 goes first in odd rounds and v4 first in even rounds.
const order = Array.from({ length: plan.samples.perCell }, (_, i) => i + 1).flatMap((round) => plan.samples.moments.flatMap((unit: string) =>
  (round % 2 ? ["v3", "v4"] : ["v4", "v3"]).map((contract) => ({ id: `${contract}-${unit}-r${round}`, contract, unit, round }))));
assert.equal(order.length, plan.samples.total); assert.deepEqual(plan.samples.moments, units);

if (command === "dry-run") {
  const requests: Record<string, ReturnType<typeof plain>> = {};
  for (const contract of contracts) for (const unit of units) {
    const { store, writes } = memoryStore();
    let request: ReturnType<typeof plain> | undefined, attempts = 0;
    await assert.rejects(modules[contract].prepareMoment({ ...options(unit, store), model: { id: READING_PASS_MODEL, complete: async (r) => {
      attempts++; if (request) assert.deepEqual(plain(r), request); else request = plain(r); throw Error("dry-run capture");
    } } }), (error) => String(error).endsWith("dry-run capture"));
    assert.equal(attempts, 2); assert.equal(writes.length, 0); assert.ok(request);
    assert.equal(request.schemaName, "scene_plan", "Only a plan request is expected");
    requests[`${contract}:${unit}`] = request;
  }
  // The contracts differ only in their planner instructions and schema, never in the moment input.
  for (const unit of units) assert.equal(requests[`v3:${unit}`].user, requests[`v4:${unit}`].user);
  save(`dry-run.json`, { at: new Date().toISOString(), snapshot: phase, order, requests, estimatedUsd: Object.fromEntries(Object.entries(requests).map(([k, r]) => [k, estimateRequestCostUsd(r)])), paidCalls: 0, productionMutations: 0 });
  console.log(JSON.stringify({ dryRun: true, requests: Object.keys(requests).length, samples: order.length, estimatedTotalUsd: order.reduce((sum, s) => sum + estimateRequestCostUsd(requests[`${s.contract}:${s.unit}`]), 0) }));
} else {
  const dry = json("dry-run.json"); assert.equal(dry.snapshot, phase); assert.deepEqual(dry.order, order);
  save("run-started.json", { at: new Date().toISOString(), snapshot: phase, retryPolicy: plan.retryPolicy });
  const { ledger, forSample } = evaluationModel(snapshot);
  for (const sample of order) {
    if (ledger.blocked) break;
    const { store, writes, spend } = memoryStore();
    const model = forSample(sample.id, (request, first) => {
      assert.equal(request.schemaName, "scene_plan"); assert.equal(request.maxTokens, 2400);
      assert.ok(request.label.startsWith(`plan:${sample.unit}:`));
      if (first) assert.deepEqual(plain(request), dry.requests[`${sample.contract}:${sample.unit}`]);
    });
    const startedAt = Date.now(), callsBefore = ledger.calls.length;
    let outcome: string, error: string | null = null;
    try { await modules[sample.contract as "v3" | "v4"].prepareMoment({ ...options(sample.unit, store), model }); outcome = "stored"; }
    catch (e) { error = String(e); outcome = spend.some((s) => s.outcome === "unavailable") ? "refused" : ledger.blocked ? "blocked" : "invalid"; }
    const stored = writes.find((w) => w.kind === "plan") ?? null;
    fs.appendFileSync(path.join(dir, "samples.ndjson"), JSON.stringify({ ...sample, at: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
      calls: ledger.calls.length - callsBefore, outcome, error, spendOutcomes: spend.map((s) => s.outcome), stored: stored ? { version: stored.version, payload: stored.payload } : null }) + "\n");
    console.log(JSON.stringify({ id: sample.id, outcome, error: error?.slice(0, 120) ?? null, measuredUsd: ledger.measuredUsd }));
  }
  save("run-finished.json", { at: new Date().toISOString(), samplesTaken: fs.readFileSync(path.join(dir, "samples.ndjson"), "utf8").trim().split("\n").length, ledgerBlocked: ledger.blocked, measuredUsd: ledger.measuredUsd, productionMutations: 0 });
}
