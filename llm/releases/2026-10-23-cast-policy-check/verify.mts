/** Offline replay of every paired v6 sample, plus baseline pairing, calibration, blind-packet, tally and cap checks. No network or writes. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { dir, root, json, base, hash, sources } from "./common.mjs";
import { plain } from "./model.mjs";

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
const manifest = json("sha256.json");
for (const [file, digest] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
const plan = json("plan.json"), set = json("sample-set.json"), dry = json("dry-run.json"), inputs = await readWorkInputs("bible-web", root);
assert.deepEqual(sources(), set.sources);
for (const [file, digest] of Object.entries(set.sources)) if (file !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${plan.pipeline.commit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })), digest, file);

// The same verses, in the baseline order, from records unchanged since the baseline snapshot.
const baseline = base("sample-set.json");
assert.deepEqual(set.samples.map((x: { verse: string }) => x.verse), baseline.samples.map((x: { verse: string }) => x.verse));
assert.deepEqual(set.recordsChangedSinceBaseline, []);
for (const key of Object.keys(baseline.records)) assert.deepEqual(set.records[key], baseline.records[key], key);
void inputs.work.units.length;

const lines = (name: string) => fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const samples = lines("samples.ndjson"), traces = lines("provider.ndjson"), inputLog = lines("inputs.ndjson"), ledger = json("ledger.json"), finished = json("run-finished.json");
assert.equal(finished.samplesTaken, samples.length); assert.equal(finished.unexpectedRequest, null);
assert.deepEqual(samples.map((s) => s.index), set.samples.slice(0, samples.length).map((s: { index: number }) => s.index));
assert.equal(ledger.blocked, null); assert.equal(ledger.uncertainUsd, 0); assert.equal(ledger.calls.length, traces.length);
const measured = traces.reduce((n, t) => n + t.measuredUsageUsd, 0);
assert.equal(measured, ledger.measuredUsd); assert.ok(measured <= plan.evaluation.capUsd);
for (let i = 0; i < traces.length; i++) {
  const name = traces[i].request.response_format.json_schema.name;
  assert.equal(inputLog[i].sample, traces[i].phase); assert.ok(Date.parse(inputLog[i].at) <= Date.parse(traces[i].startedAt)); assert.equal(traces[i].request.temperature, undefined);
  assert.deepEqual(traces[i].request.reasoning, { effort: name === "plan_review" ? "low" : "none" });
  assert.equal(traces[i].request.max_tokens, name === "plan_review" ? 4000 : name === "scene_plan" ? 2400 : 900);
}

// Replay every sample through this commit's prepareMoment over its own in-memory records.
let cursor = 0;
const model = createOpenRouterTextModel({ apiKey: "offline", fetch: async (url, init) => {
  const trace = traces[cursor++]; assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  assert.deepEqual(JSON.parse(String(init.body)), trace.request); assert.equal(trace.status, 200);
  return new Response(JSON.stringify(trace.response), { status: 200, headers: { "content-type": "application/json" } });
} });
for (const sample of samples) {
  const s = set.samples[sample.index - 1];
  const records: AnalysisRecord[] = structuredClone(s.keys.map((k: string) => set.records[k]));
  const writes: AnalysisRecord[] = [], spend: string[] = [];
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
    claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (e) => { spend.push(`${e.kind}:${e.outcome}`); },
    putDerivedRecord: async (args) => { const record = { ...structuredClone(args), version: contentVersion(args.payload) } as AnalysisRecord; const i = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId); if (i < 0) records.push(record); else records[i] = record; writes.push(record); return { version: record.version }; },
  };
  const moment = set.records[`moment:${s.momentId}`].payload, section = set.records[`section:${s.sectionId}`].payload;
  const context = momentContext(inputs.work, { id: s.momentId, firstUnit: moment.firstUnit, lastUnit: moment.lastUnit }, { firstUnit: section.firstUnit, lastUnit: section.lastUnit });
  const first = cursor;
  const tracked = { id: model.id, complete: async (request: Parameters<typeof model.complete>[0]) => {
    if (cursor === first) assert.equal(hash(JSON.stringify(plain(request))), dry.first[sample.id].sha256);
    assert.equal(traces[cursor].phase, sample.id); return model.complete(request);
  } };
  const args = { workId: "bible-web", momentId: s.momentId, store, model: tracked, brief: inputs.brief, briefVersion: inputs.briefVersion, context };
  if (sample.outcome === "stored") await prepareMoment(args); else await assert.rejects(prepareMoment(args), (error) => String(error) === sample.error);
  assert.equal(cursor - first, sample.calls); assert.deepEqual(spend, sample.spendOutcomes);
  const stored = writes.find((w) => w.kind === "plan") ?? null;
  assert.deepEqual(stored ? { version: stored.version, payload: stored.payload } : null, sample.stored);
  assert.equal(writes.some((w) => w.kind === "look"), sample.lookPrepared);
}
assert.equal(cursor, traces.length);

// Blind packet: every use maps to its sample, and replies carry no outcome, role or audit.
const blind = json("blind-replies.json"), key = json("blind-key.json").key, tally = json("tally.json");
for (const k of key) {
  const reply = blind.replies.find((r: { blindId: string }) => r.blindId === k.blindId); assert.ok(reply);
  const text = JSON.stringify(reply);
  // Keys, not words: scene prose may contain words such as "surrounds".
  for (const leak of ["\"focusQuote\"", "\"singleInstant\"", "\"momentQuote\"", "\"review\":", "\"rounds\":", "\"role\":", "\"outcome\":", "REJECTED", "\"final\"", "\"first\""]) assert.ok(!text.includes(leak), leak);
  for (const use of k.uses) assert.ok(samples.some((s) => s.id === use.sample && reply.moment === s.momentId));
}
for (const s of samples) if (s.stored) {
  const use = key.find((k: { uses: Array<{ sample: string; role: string }> }) => k.uses.some((u) => u.sample === s.id && u.role === "final"));
  const reply = blind.replies.find((r: { blindId: string }) => r.blindId === use.blindId);
  assert.deepEqual(reply.scene, s.stored.payload.plan); assert.deepEqual(reply.present, s.stored.payload.entries.map((e: { entryId: string }) => e.entryId));
}
// Calibration replies are exact baseline packets, drawn with the declared seed.
const baseReplies = base("blind-replies.json").replies;
for (const k of key) for (const old of k.calibration) {
  const now = blind.replies.find((r: { blindId: string }) => r.blindId === k.blindId), then = baseReplies.find((r: { blindId: string }) => r.blindId === old);
  const { blindId: _a, ...a } = now, { blindId: _b, ...b } = then; void _a; void _b; assert.deepEqual(a, b);
}
assert.equal(key.reduce((n: number, k: { calibration: string[] }) => n + k.calibration.length, 0), 40);
assert.ok(Date.parse(json("scores-a.json").at) < Date.parse(tally.at) && Date.parse(json("scores-b.json").at) < Date.parse(tally.at));
assert.equal(tally.samplesTaken, samples.length);
// Every sample has one tally row and one baseline row, and the paired counts follow from both tallies' rows.
const sampleIds = samples.map((s: { id: string }) => s.id), tallyIds = tally.rows.map((r: { id: string }) => r.id), baseIds = base("tally.json").rows.map((r: { id: string }) => r.id);
for (const ids of [sampleIds, tallyIds, baseIds]) assert.equal(new Set(ids).size, ids.length);
assert.deepEqual(tallyIds, sampleIds);
const baseRows = new Map(base("tally.json").rows.map((r: { id: string; accepted: boolean }) => [r.id, r.accepted]));
for (const id of sampleIds) assert.ok(baseRows.has(id), id);
assert.equal(tally.paired.verses, sampleIds.length);
const improved = tally.rows.filter((r: { id: string; accepted: boolean }) => baseRows.get(r.id) === false && r.accepted).length, regressed = tally.rows.filter((r: { id: string; accepted: boolean }) => baseRows.get(r.id) === true && !r.accepted).length;
assert.deepEqual([tally.paired.improved, tally.paired.regressed], [improved, regressed]);
// The whole tally, rates, causes, calibration and paired test included, recomputes from both score files and the adjudication.
execFileSync(process.execPath, [...process.execArgv, path.join(dir, "tally.mts"), "--check"], { cwd: root, stdio: "inherit" });
console.log(JSON.stringify({ hashes: Object.keys(manifest).length, samplesReplayed: samples.length, providerReplies: traces.length, measuredUsd: measured, blindReplies: blind.replies.length, accepted: tally.overall.accepted, paired: { improved, regressed }, networkCalls: 0, productionMutations: 0 }));
