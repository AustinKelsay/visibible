/**
 * Random-verse samples of the shipped planning pipeline. Production was read once (sample-set);
 * every derived record goes to a per-sample in-memory store and is discarded.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { MOMENT_CAST_PROMPT_VERSION, prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { PLAN_REVIEW_MAX_TOKENS, PLAN_REVIEW_PROMPT_VERSION, PLAN_REVIEW_REASONING } from "../../../src/lib/engine/plan-review";
import { READING_PASS_MODEL, estimateRequestCostUsd } from "../../../src/lib/reading-pass/model";
import { dir, root, json, save, hash, sources } from "./common.mjs";
import { evaluationModel, plain } from "./model.mjs";

type Sample = { index: number; verse: string; momentId: string; sectionId: string; book: string; keys: string[] };
const [command] = process.argv.slice(2);
assert.ok(command === "dry-run" || (command === "run" && process.argv.includes("--execute")));
const plan = json("plan.json"), set = json("sample-set.json"), inputs = await readWorkInputs("bible-web", root);
assert.deepEqual(sources(), set.sources); assert.ok(Date.now() - Date.parse(set.at) < 60 * 60_000, "sample set must be under an hour old");
assert.equal(MOMENT_CAST_PROMPT_VERSION, plan.pipeline.planPromptVersion); assert.equal(PLAN_REVIEW_PROMPT_VERSION, plan.pipeline.reviewPromptVersion);
const samples: Sample[] = set.samples;
assert.equal(samples.length, plan.sampling.target);

function memoryStore(sample: Sample) {
  const records: AnalysisRecord[] = structuredClone(sample.keys.map((k) => set.records[k] as AnalysisRecord));
  const writes: AnalysisRecord[] = [], spend: Array<{ kind: string; outcome: string; costUsd: number | null }> = [];
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
    claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (entry) => { spend.push(entry); },
    putDerivedRecord: async (args) => {
      const record = { ...structuredClone(args), version: contentVersion(args.payload) } as AnalysisRecord;
      const index = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId);
      if (index < 0) records.push(record); else records[index] = record;
      writes.push(record); return { version: record.version };
    },
  };
  return { store, writes, spend };
}
const contextFor = (sample: Sample) => {
  const moment = set.records[`moment:${sample.momentId}`].payload, section = set.records[`section:${sample.sectionId}`].payload;
  return momentContext(inputs.work, { id: sample.momentId, firstUnit: moment.firstUnit, lastUnit: moment.lastUnit }, { firstUnit: section.firstUnit, lastUnit: section.lastUnit });
};
const options = (sample: Sample, store: PreparationStore) => ({ workId: "bible-web", momentId: sample.momentId, store, brief: inputs.brief, briefVersion: inputs.briefVersion, context: contextFor(sample), holder: `random-verse-${sample.index}` });
const checkRequest = (request: { schemaName: string; maxTokens: number; reasoningEffort?: string; label: string }, sample: Sample) => {
  if (request.schemaName === "section_look") { assert.equal(request.maxTokens, 900); assert.equal(request.reasoningEffort, undefined); assert.ok(request.label.startsWith(`look:${sample.sectionId}:`)); }
  else if (request.schemaName === "scene_plan") { assert.equal(request.maxTokens, 2400); assert.equal(request.reasoningEffort, undefined); assert.ok(request.label.startsWith(`plan:${sample.momentId}:`)); }
  else { assert.equal(request.schemaName, "plan_review", "only look, plan and review requests are expected"); assert.equal(request.maxTokens, PLAN_REVIEW_MAX_TOKENS); assert.equal(request.reasoningEffort, PLAN_REVIEW_REASONING); assert.ok(request.label.startsWith(`review:${sample.momentId}:`)); }
};
const id = (s: Sample) => `s${String(s.index).padStart(3, "0")}`;

if (command === "dry-run") {
  // Capture each sample's first request (a look, or a plan where the look is stored); no paid call.
  const first: Record<string, { schemaName: string; sha256: string; estimatedUsd: number }> = {};
  for (const s of samples) {
    const { store, writes } = memoryStore(s);
    let request: ReturnType<typeof plain> | undefined;
    await assert.rejects(prepareMoment({ ...options(s, store), model: { id: READING_PASS_MODEL, complete: async (r) => { checkRequest(r, s); request ??= plain(r); throw Error("dry-run capture"); } } }),
      (error) => String(error).endsWith("dry-run capture"));
    assert.equal(writes.length, 0); assert.ok(request);
    first[id(s)] = { schemaName: request.schemaName, sha256: hash(JSON.stringify(request)), estimatedUsd: estimateRequestCostUsd(request) };
  }
  save("dry-run.json", { at: new Date().toISOString(), first, paidCalls: 0, productionMutations: 0 });
  console.log(JSON.stringify({ dryRun: true, samples: samples.length, firstLook: Object.values(first).filter((f) => f.schemaName === "section_look").length, firstRequestEstimateUsd: Object.values(first).reduce((n, f) => n + f.estimatedUsd, 0) }));
} else {
  const dry = json("dry-run.json");
  for (const name of ["run-started.json", "samples.ndjson", "ledger.json"]) assert.ok(!fs.existsSync(path.join(dir, name)), `${name} exists; this run already started`);
  save("run-started.json", { at: new Date().toISOString(), retryPolicy: plan.retryPolicy });
  const { ledger, forSample } = evaluationModel({ at: new Date().toISOString(), balanceUsd: set.balanceUsd, pricing: set.pricing });
  let unexpected: string | null = null;
  for (const s of samples) {
    if (ledger.blocked || unexpected) break;
    // Stop cleanly before a sample whose worst case could pass the cap (look, two plans and two reviews).
    if (ledger.measuredUsd + 5 * plan.evaluation.reservePerCallUsd > plan.evaluation.capUsd) break;
    const { store, writes, spend } = memoryStore(s);
    const model = forSample(id(s), (request, isFirst) => {
      try { checkRequest(request, s); if (isFirst) assert.equal(hash(JSON.stringify(plain(request))), dry.first[id(s)].sha256); }
      catch (error) { unexpected = `${id(s)}: ${String(error).slice(0, 200)}`; throw error; }
    });
    const startedAt = Date.now(), callsBefore = ledger.calls.length;
    let outcome: string, error: string | null = null;
    try { await prepareMoment({ ...options(s, store), model }); outcome = "stored"; }
    catch (e) { error = String(e); outcome = unexpected ? "stopped" : ledger.blocked ? "blocked" : spend.some((x) => ["unavailable", "review problems", "review invalid"].includes(x.outcome)) ? "refused" : "invalid"; }
    const stored = writes.find((w) => w.kind === "plan") ?? null;
    fs.appendFileSync(path.join(dir, "samples.ndjson"), JSON.stringify({ id: id(s), index: s.index, verse: s.verse, momentId: s.momentId, book: s.book, at: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
      calls: ledger.calls.length - callsBefore, lookPrepared: writes.some((w) => w.kind === "look"), outcome, error, spendOutcomes: spend.map((x) => `${x.kind}:${x.outcome}`), stored: stored ? { version: stored.version, payload: stored.payload } : null }) + "\n");
    console.log(JSON.stringify({ id: id(s), outcome, calls: ledger.calls.length - callsBefore, measuredUsd: Number(ledger.measuredUsd.toFixed(6)) }));
  }
  const taken = fs.existsSync(path.join(dir, "samples.ndjson")) ? fs.readFileSync(path.join(dir, "samples.ndjson"), "utf8").trim().split("\n").length : 0;
  save("run-finished.json", { at: new Date().toISOString(), samplesTaken: taken, ledgerBlocked: ledger.blocked, unexpectedRequest: unexpected, measuredUsd: ledger.measuredUsd, productionMutations: 0 });
}
