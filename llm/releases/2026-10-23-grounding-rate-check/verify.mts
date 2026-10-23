/** Offline replay of all 40 retained samples through each contract's own code, plus blind-packet and tally checks. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import type { AnalysisRecord, PreparationStore } from "../../../src/lib/engine/preparation";
import { dir, root, json, hash, sources, units, row, codeRoot, contractSources, contractFiles } from "./inspect.mjs";
import { plain } from "./model.mjs";

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
const manifest = json("sha256.json");
for (const [file, digest] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
const plan = json("plan.json"), snapshot = json("snapshot.json"), dry = json("dry-run.json");
assert.deepEqual(sources(), snapshot.sources);
const show = (commit: string, file: string) => execFileSync("git", ["show", `${commit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
for (const [file, digest] of Object.entries(snapshot.sources)) if (file !== "works/bible-web/work.json") assert.equal(hash(show(plan.contracts.v4.commit, file)), digest, file);
for (const contract of ["v3", "v4"]) {
  assert.deepEqual(contractSources(contract), snapshot.contractSources[contract]);
  for (const file of contractFiles) assert.equal(hash(show(plan.contracts[contract].commit, file)), snapshot.contractSources[contract][file], `${contract} ${file}`);
}
const lines = (name: string) => fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const samples = lines("samples.ndjson"), traces = lines("provider.ndjson"), inputLog = lines("inputs.ndjson");
const ledger = json("ledger.json"), started = json("run-started.json"), finished = json("run-finished.json");
assert.ok(Date.parse(dry.at) < Date.parse(started.at) && Date.parse(started.at) - Date.parse(snapshot.at) < 30 * 60_000);
assert.equal(samples.length, plan.samples.total); assert.equal(finished.samplesTaken, plan.samples.total);
assert.deepEqual(samples.map((s) => s.id), dry.order.map((o: { id: string }) => o.id));
assert.equal(ledger.blocked, null); assert.equal(ledger.uncertainUsd, 0); assert.equal(ledger.calls.length, traces.length);
const measured = traces.reduce((sum, t) => sum + t.measuredUsageUsd, 0);
assert.equal(measured, ledger.measuredUsd); assert.ok(measured <= plan.evaluation.capUsd); assert.ok(traces.length <= plan.evaluation.maximumCalls);
for (let i = 0; i < traces.length; i++) {
  assert.equal(ledger.calls[i].measuredUsd, traces[i].measuredUsageUsd); assert.equal(inputLog[i].sample, traces[i].phase);
  assert.ok(Date.parse(inputLog[i].at) <= Date.parse(traces[i].startedAt)); assert.ok(inputLog[i].maximumCompletionEstimatedUsd < plan.evaluation.reservePerCallUsd);
  assert.equal(traces[i].request.temperature, undefined);
}

// Replay each sample through its own contract's prepareMoment over a fresh in-memory store.
const inputs = await readWorkInputs("bible-web", root);
const modules = { v3: await import(pathToFileURL(path.join(codeRoot("v3"), "src/lib/engine/preparation.ts")).href), v4: await import(pathToFileURL(path.join(codeRoot("v4"), "src/lib/engine/preparation.ts")).href) };
for (const contract of ["v3", "v4"] as const) assert.equal(modules[contract].MOMENT_CAST_PROMPT_VERSION, plan.contracts[contract].promptVersion);
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
    if (cursor === first) assert.deepEqual(plain(request), dry.requests[`${sample.contract}:${sample.unit}`]);
    assert.equal(traces[cursor].phase, sample.id); return model.complete(request);
  } };
  const args = { workId: "bible-web", momentId: sample.unit, store, model: tracked, brief: inputs.brief, briefVersion: inputs.briefVersion, context };
  if (sample.outcome === "stored") await modules[sample.contract as "v3" | "v4"].prepareMoment(args);
  else await assert.rejects(modules[sample.contract as "v3" | "v4"].prepareMoment(args), (error) => String(error) === sample.error);
  assert.equal(cursor - first, sample.calls); assert.deepEqual(spend.map((s) => s.outcome), sample.spendOutcomes);
  const stored = writes.find((w) => w.kind === "plan") ?? null;
  assert.deepEqual(stored ? { version: stored.version, payload: stored.payload } : null, sample.stored);
  assert.equal(writes.length, sample.stored ? 1 : 0); // Looks and every other record were reused, never remade.
}
assert.equal(cursor, traces.length);
assert.ok(units.every((u) => ["v3", "v4"].every((c) => samples.filter((s) => s.unit === u && s.contract === c).length === plan.samples.perCell)));

// The blind packet carries exactly each sample's rendering-bound text, and the tally recounts from scores and key.
const blind = json("blind-replies.json"), key = json("blind-key.json").key, tally = json("tally.json");
assert.equal(blind.replies.length, samples.length); assert.equal(key.length, samples.length);
assert.ok(Date.parse(json("scores-operator.json").at) < Date.parse(tally.at) && Date.parse(json("scores-subagent.json").at) < Date.parse(tally.at));
for (const k of key) {
  const sample = samples.find((s) => s.id === k.sample)!, reply = blind.replies.find((r: { blindId: string }) => r.blindId === k.blindId);
  assert.equal(k.contract, sample.contract); assert.equal(k.outcome, sample.outcome); assert.equal(reply.moment, sample.unit);
  const text = JSON.stringify(reply);
  for (const leak of ["focusQuote", "singleInstant", "momentQuote", "contextQuote", "moment-cast", "\"v3\"", "\"v4\""]) assert.ok(!text.includes(leak), leak);
  if (sample.stored) {
    assert.deepEqual(reply.scene, sample.stored.payload.plan);
    assert.deepEqual(reply.present, sample.stored.payload.entries.map((e: { entryId: string }) => e.entryId));
  } else {
    const content = JSON.parse(traces.filter((t) => t.phase === sample.id).at(-1).response.choices[0].message.content);
    assert.deepEqual(reply.present, content.present);
    for (const [field, value] of Object.entries(reply.scene)) assert.equal(value, content[field]);
  }
}
const blockers = ["U", "X", "I", "F"] as const;
const scoreOf = (name: string) => new Map(json(name).scores.map((s: { blindId: string; flags: Record<string, boolean> }) => [s.blindId, s.flags]));
const op = scoreOf("scores-operator.json"), sa = scoreOf("scores-subagent.json");
const adjudicated = new Map(json("adjudication.json").decisions.map((d: { blindId: string; flags: Record<string, boolean> }) => [d.blindId, d.flags]));
let agreed = 0;
const counts: Record<string, Record<string, number>> = {};
for (const k of key) {
  const a = op.get(k.blindId) as Record<string, boolean>, b = sa.get(k.blindId) as Record<string, boolean>;
  const same = blockers.every((f) => a[f] === b[f]); if (same) agreed++;
  const flags = (same ? a : adjudicated.get(k.blindId)) as Record<string, boolean>; assert.ok(flags);
  const pass = k.outcome === "stored" && blockers.every((f) => !flags[f]);
  (counts[k.contract] ??= {})[k.unit] = (counts[k.contract][k.unit] ?? 0) + (pass ? 1 : 0);
}
assert.equal(tally.scorerAgreement.agreed, agreed);
for (const c of ["v3", "v4"]) for (const u of units) assert.equal(tally.cells[c][u].pass, counts[c][u] ?? 0, `${c} ${u}`);
console.log(JSON.stringify({ hashes: Object.keys(manifest).length, samplesReplayed: samples.length, providerReplies: traces.length, measuredUsd: measured, scorerAgreement: agreed, passes: counts, networkCalls: 0, productionMutations: 0 }));
