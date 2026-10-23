/** Offline replay of all 20 retained pipeline samples, plus blind-packet, tally and cap checks. No network or writes. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { dir, root, json, hash, sources, units, row } from "./inspect.mjs";
import { plain } from "./model.mjs";

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
const manifest = json("sha256.json");
for (const [file, digest] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
const plan = json("plan.json"), snapshot = json("snapshot.json"), dry = json("dry-run.json");
assert.deepEqual(sources(), snapshot.sources);
for (const [file, digest] of Object.entries(snapshot.sources)) if (file !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${plan.pipeline.commit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })), digest, file);
const lines = (name: string) => fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const samples = lines("samples.ndjson"), traces = lines("provider.ndjson"), inputLog = lines("inputs.ndjson"), ledger = json("ledger.json");
assert.equal(samples.length, plan.samples.total); assert.deepEqual(samples.map((s) => s.id), dry.order.map((o: { id: string }) => o.id));
assert.ok(Date.parse(dry.at) < Date.parse(json("run-started.json").at));
assert.equal(ledger.blocked, null); assert.equal(ledger.uncertainUsd, 0); assert.equal(ledger.calls.length, traces.length);
const measured = traces.reduce((sum, t) => sum + t.measuredUsageUsd, 0);
assert.equal(measured, ledger.measuredUsd); assert.ok(measured <= plan.evaluation.capUsd); assert.ok(traces.length <= plan.evaluation.maximumCalls);
for (let i = 0; i < traces.length; i++) {
  assert.equal(inputLog[i].sample, traces[i].phase); assert.ok(Date.parse(inputLog[i].at) <= Date.parse(traces[i].startedAt));
  assert.ok(inputLog[i].maximumCompletionEstimatedUsd < plan.evaluation.reservePerCallUsd); assert.equal(traces[i].request.temperature, undefined);
  const review = traces[i].request.response_format.json_schema.name === "plan_review";
  assert.deepEqual(traces[i].request.reasoning, { effort: review ? "low" : "none" }); assert.equal(traces[i].request.max_tokens, review ? 4000 : 2400);
}

// Replay every sample through this commit's prepareMoment over a fresh in-memory store.
const inputs = await readWorkInputs("bible-web", root);
let cursor = 0;
const model = createOpenRouterTextModel({ apiKey: "offline", fetch: async (url, init) => {
  const trace = traces[cursor++]; assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  assert.deepEqual(JSON.parse(String(init.body)), trace.request); assert.equal(trace.status, 200);
  return new Response(JSON.stringify(trace.response), { status: 200, headers: { "content-type": "application/json" } });
} });
for (const sample of samples) {
  const records: AnalysisRecord[] = structuredClone(snapshot.records.flatMap((r: { kind: string; record: AnalysisRecord | null }) => r.record && r.kind !== "plan" ? [r.record] : []));
  const writes: AnalysisRecord[] = [], spend: Array<{ outcome: string }> = [];
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
    claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (entry) => { spend.push(entry); },
    putDerivedRecord: async (args) => { const record = { ...structuredClone(args), version: contentVersion(args.payload) } as AnalysisRecord; records.push(record); writes.push(record); return { version: record.version }; },
  };
  const moment = row(snapshot, "moment", sample.unit)!, section = row(snapshot, "section", String(moment.payload.sectionId))!;
  const context = momentContext(inputs.work, { id: sample.unit, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) }, { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  const first = cursor;
  const tracked = { id: model.id, complete: async (request: Parameters<typeof model.complete>[0]) => {
    if (cursor === first) assert.deepEqual(plain(request), dry.requests[sample.unit]);
    assert.equal(traces[cursor].phase, sample.id); return model.complete(request);
  } };
  const args = { workId: "bible-web", momentId: sample.unit, store, model: tracked, brief: inputs.brief, briefVersion: inputs.briefVersion, context };
  if (sample.outcome === "stored") await prepareMoment(args); else await assert.rejects(prepareMoment(args), (error) => String(error) === sample.error);
  assert.equal(cursor - first, sample.calls); assert.deepEqual(spend.map((s) => s.outcome), sample.spendOutcomes);
  const stored = writes.find((w) => w.kind === "plan") ?? null;
  assert.deepEqual(stored ? { version: stored.version, payload: stored.payload } : null, sample.stored);
  assert.equal(writes.length, sample.stored ? 1 : 0);
}
assert.equal(cursor, traces.length);
assert.ok(units.every((u) => samples.filter((s) => s.unit === u).length === plan.samples.perMoment));

// Blind packet carries each sample's rendering-bound text and nothing that reveals the outcome.
const blind = json("blind-replies.json"), key = json("blind-key.json").key, tally = json("tally.json");
assert.equal(blind.replies.length, samples.length); assert.equal(key.length, samples.length);
for (const k of key) {
  const sample = samples.find((s) => s.id === k.sample)!, reply = blind.replies.find((r: { blindId: string }) => r.blindId === k.blindId);
  assert.equal(k.outcome, sample.outcome); assert.equal(reply.moment, sample.unit);
  const text = JSON.stringify(reply);
  for (const leak of ["focusQuote", "singleInstant", "momentQuote", "\"review\"", "rounds", "REJECTED", "unselected_figure", "outside_instant"]) assert.ok(!text.includes(leak), leak);
  if (sample.stored) {
    assert.deepEqual(reply.scene, sample.stored.payload.plan); assert.deepEqual(reply.present, sample.stored.payload.entries.map((e: { entryId: string }) => e.entryId));
  } else {
    const content = JSON.parse(traces.filter((t) => t.phase === sample.id && t.request.response_format.json_schema.name === "scene_plan").at(-1).response.choices[0].message.content);
    assert.deepEqual(reply.present, content.present); for (const [field, value] of Object.entries(reply.scene)) assert.equal(value, content[field]);
  }
}
const blockers = ["U", "X", "I", "F"] as const;
const scoreOf = (name: string) => new Map(json(name).scores.map((s: { blindId: string; flags: Record<string, boolean> }) => [s.blindId, s.flags]));
const op = scoreOf("scores-operator.json"), sa = scoreOf("scores-subagent.json");
assert.ok(Date.parse(json("scores-operator.json").at) < Date.parse(tally.at) && Date.parse(json("scores-subagent.json").at) < Date.parse(tally.at));
const passes: Record<string, number> = {};
let agreed = 0;
for (const k of key) {
  const a = op.get(k.blindId) as Record<string, boolean>, b = sa.get(k.blindId) as Record<string, boolean>;
  const same = [...blockers, "N"].every((f) => a[f] === b[f]); if (same) agreed++;
  assert.ok(same || json("adjudication.json").decisions.some((d: { blindId: string }) => d.blindId === k.blindId));
  passes[k.unit] = (passes[k.unit] ?? 0) + (k.outcome === "stored" && blockers.every((f) => !a[f]) ? 1 : 0);
}
assert.equal(tally.scorerAgreement.agreed, agreed);
for (const u of units) assert.equal(tally.cells[u].pass, passes[u] ?? 0, u);
assert.equal(tally.total.pass, Object.values(passes).reduce((n, p) => n + p, 0));
console.log(JSON.stringify({ hashes: Object.keys(manifest).length, samplesReplayed: samples.length, providerReplies: traces.length, measuredUsd: measured, scorerAgreement: agreed, passes, verdict: tally.verdict, networkCalls: 0, productionMutations: 0 }));
