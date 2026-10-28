/** Offline replay of every retained random-verse sample, plus draw, blind-packet, tally and cap checks. No network or writes. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { dir, root, json, hash, sources, mulberry32, bookOf } from "./common.mjs";
import { plain } from "./model.mjs";

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
const manifest = json("sha256.json");
for (const [file, digest] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
const plan = json("plan.json"), set = json("sample-set.json"), dry = json("dry-run.json"), inputs = await readWorkInputs("bible-web", root);
assert.deepEqual(sources(), set.sources);
for (const [file, digest] of Object.entries(set.sources)) if (file !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${plan.pipeline.commit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })), digest, file);

// The draw is reproducible from the seed: in this generation every verse is its own moment.
assert.equal(set.momentCount, inputs.work.units.length);
const random = mulberry32(plan.sampling.seed), seen = new Set<string>(), redraw: string[] = [];
let draws = 0;
while (redraw.length < plan.sampling.target) { draws++; const unit = inputs.work.units[Math.floor(random() * inputs.work.units.length)]; if (seen.has(unit.id)) continue; seen.add(unit.id); redraw.push(unit.id); }
assert.equal(draws, set.draws); assert.deepEqual(set.samples.map((s: { verse: string }) => s.verse), redraw);
for (const s of set.samples) { assert.equal(s.momentId, s.verse); assert.equal(s.book, bookOf(s.verse)); assert.equal(set.records[`moment:${s.momentId}`].payload.firstUnit, s.verse); }

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
assert.ok(Date.parse(json("scores-a.json").at) < Date.parse(tally.at) && Date.parse(json("scores-b.json").at) < Date.parse(tally.at));
assert.equal(tally.samplesTaken, samples.length);
console.log(JSON.stringify({ hashes: Object.keys(manifest).length, samplesReplayed: samples.length, providerReplies: traces.length, measuredUsd: measured, blindReplies: blind.replies.length, accepted: tally.overall.accepted, networkCalls: 0, productionMutations: 0 }));
