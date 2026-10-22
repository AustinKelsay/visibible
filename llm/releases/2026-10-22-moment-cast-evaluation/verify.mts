/** Offline audit of the first valid, failed reply. No credentials, network or live writes. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { prepareMoment, MOMENT_CAST_PROMPT_VERSION, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { buildRenderingPacket } from "../../../src/lib/engine/prompt";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { createOpenRouterTextModel, estimateRequestCostUsd } from "../../../src/lib/reading-pass/model";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { dir, root, json, hash, sources, row } from "./run.mjs";

globalThis.fetch = async () => { throw Error("Offline verification forbids network"); };
const manifest = json("sha256.json");
for (const [file, digest] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
const plan = json("plan.json"), before = json("before.json"), after = json("after-9.json");
const scene = json("scene-9.json"), review = json("review-9.json"), summary = json("summary.json"), preflight = json("preflight.json");
assert.deepEqual(sources(), before.sources); assert.deepEqual(after.sources, before.sources);
for (const [file, digest] of Object.entries(before.sources)) {
  if (file !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${plan.baseCommit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })), digest);
}
for (const [file, digest] of Object.entries(preflight.operationSources)) assert.equal(hash(fs.readFileSync(path.join(dir, file))), digest);
assert.ok(Date.parse(preflight.at) < Date.parse(json("started-9.json").at));
const prior = JSON.parse(fs.readFileSync(path.join(root, "llm/releases/2026-10-22-formless-look-evaluation/after-10.json"), "utf8"));
assert.deepEqual(before.records, prior.records); assert.deepEqual(before.spend, prior.spend);
for (const snapshot of [before, after]) {
  assert.ok(snapshot.status.ready && snapshot.status.activeGeneration === 1);
  assert.deepEqual(snapshot.environment, { mode: "disabled", ownerSessionConfigured: false, convexUrl: "https://api.visibible.com" });
  assert.ok(snapshot.catalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
}
for (const r of before.records) if (!(r.kind === "plan" && r.recordId === "daniel-7-9")) assert.deepEqual(row(after, r.kind, r.recordId), r.record);
const traces = fs.readFileSync(path.join(dir, "provider.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
assert.equal(traces.length, 1); const trace = traces[0];
assert.equal(trace.label, "scene_plan"); assert.equal(trace.status, 200);
const input = json("input-9-1.json"), dry = json("dry-run-9.json");
assert.deepEqual(input.request, dry.request); assert.equal(dry.paidCalls, 0); assert.equal(dry.productionMutations, 0);
assert.equal(input.estimatedUsd, estimateRequestCostUsd(input.request));
assert.ok(input.maximumCompletionEstimatedUsd < plan.preparation.reservePerCallUsd);
assert.ok(Date.parse(dry.at) < Date.parse(trace.startedAt)); assert.ok(Date.parse(input.at) <= Date.parse(trace.startedAt));
let calls = 0;
const model = createOpenRouterTextModel({ apiKey: "offline", fetch: async (url, init) => {
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions"); assert.equal(++calls, 1);
  assert.deepEqual(JSON.parse(String(init.body)), trace.request);
  return new Response(JSON.stringify(trace.response), { status: 200, headers: { "content-type": "application/json" } });
} });
const records: AnalysisRecord[] = structuredClone(before.records.flatMap((r: { record: AnalysisRecord | null }) => r.record ? [r.record] : []));
const writes: AnalysisRecord[] = [], spends: Array<{ costUsd: number | null; outcome: string }> = [];
const store: PreparationStore = {
  getActiveRecord: async (kind, recordId) => structuredClone(records.find((r) => r.kind === kind && r.recordId === recordId) ?? null),
  claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (entry) => { spends.push(entry); },
  putDerivedRecord: async (args) => {
    const record = { ...structuredClone(args), version: contentVersion(args.payload) };
    records[records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId)] = record;
    writes.push(record); return { version: record.version };
  },
};
const inputs = await readWorkInputs("bible-web", root), moment = row(before, "moment", "daniel-7-9")!, section = row(before, "section", "daniel-7-9")!;
const context = momentContext(inputs.work, { id: moment.recordId, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) }, { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
assert.deepEqual(context, scene.context);
const options = { workId: "bible-web", momentId: moment.recordId, store, model, brief: inputs.brief, briefVersion: inputs.briefVersion, context };
assert.deepEqual(await prepareMoment(options), scene.result); assert.equal((await prepareMoment(options)).calls, 0);
assert.equal(calls, 1); assert.equal(writes.length, 1); assert.equal(writes[0].kind, "plan");
const live = row(after, "plan", "daniel-7-9")!;
assert.deepEqual(writes[0].payload, live.payload); assert.deepEqual(writes[0].inputs, live.inputs); assert.equal(writes[0].version, live.version);
assert.ok(live.inputs.some((i) => i.recordId === "scene_plan_moment_cast" && i.version === MOMENT_CAST_PROMPT_VERSION));
assert.equal(scene.result.look.version, row(before, "look", "daniel-7-9")!.version);
const history = after.histories.find((r: { kind: string; recordId: string }) => r.kind === "plan" && r.recordId === "daniel-7-9").history;
assert.ok(history.some((r: { version: string; status: string }) => r.version === row(before, "plan", "daniel-7-9")!.version && r.status === "superseded"));
const packets = json("packets.json"); assert.equal(packets.packets.length, 3); assert.equal(packets.paidCalls, 0); assert.equal(packets.productionMutations, 0);
for (const p of packets.packets) {
  assert.equal(p.unitId, "daniel-7-9"); assert.equal(p.prepared.calls, 0); assert.equal(p.prepared.plan.version, live.version);
  assert.ok(p.canon.some((c: { entryId: string }) => c.entryId === "daniel_prophet_of_babylon"));
  assert.ok(p.canon.some((c: { entryId: string }) => c.entryId === "ministering_assembly_in_daniels_vision"));
  const ancient = p.canon.find((c: { entryId: string }) => c.entryId === "the_ancient_of_days"); assert.equal(ancient.hasForm, false);
  assert.ok(p.prompt.includes(ancient.text)); assert.ok(!p.references.some((r: { entryId?: string }) => r.entryId === ancient.entryId));
  const rebuilt = buildRenderingPacket({ work: { id: "bible-web", title: inputs.work.work.title }, moment: { ...context.moment, sectionId: section.recordId }, neighbors: { previous: context.previous?.text ?? null, next: context.next?.text ?? null }, brief: inputs.brief, briefVersion: inputs.briefVersion, eraId: scene.result.era, style: inputs.styles[p.styleId].style, styleVersion: inputs.styles[p.styleId].version, look: { ...scene.result.look.payload, version: scene.result.look.version }, plan: { ...scene.result.plan.payload, version: scene.result.plan.version }, canon: p.canon, references: p.references, variationNumber: null, aspectRatio: "16:9" });
  assert.ok(rebuilt.ok); assert.equal(rebuilt.prompt, p.prompt); assert.deepEqual(rebuilt.packet, p.packet);
  assert.deepEqual(p.sentReferences.map((r: { storageId: string }) => r.storageId), p.references.map((r: { storageId: string }) => r.storageId));
}
const ledger = json("preparation-ledger.json"), measured = extractOpenRouterUsageUsd(trace.response)!;
assert.equal(measured, trace.measuredUsageUsd); assert.equal(measured, ledger.measuredUsd); assert.equal(ledger.uncertainUsd, 0); assert.equal(ledger.blocked, null);
assert.equal(spends.length, 1); assert.equal(spends[0].outcome, "ok"); assert.equal(spends[0].costUsd, measured);
assert.equal(after.spend.calls - before.spend.calls, 1); assert.ok(Math.abs(after.spend.costUsd - before.spend.costUsd - measured) < 1e-12);
assert.equal(before.balanceUsd, after.balanceUsd); // Immediate account query had not yet settled.
assert.ok(Math.abs(before.balanceUsd - json("settled-balance.json").balanceUsd - measured) < 1e-9);
assert.equal(review.artifactSha256, hash(fs.readFileSync(path.join(dir, "scene-9.json"))));
assert.equal(review.verdict, "hold-for-moment-presence"); assert.equal(review.decision.nextTextCheckAllowed, false);
assert.ok(!fs.existsSync(path.join(dir, "started-10.json"))); assert.ok(!fs.existsSync(path.join(dir, "scene-10.json")));
assert.equal(summary.preparation.measuredUsd, Number((plan.preparation.measuredBeforeUsd + measured).toFixed(10)));
assert.equal(summary.preparation.remainingAfterReserveUsd, Number((43 - summary.preparation.measuredUsd - .03).toFixed(10)));
assert.equal(summary.imageCalls, 0); assert.equal(summary.semanticRetries, 0); assert.equal(summary.wholeTextAccepted, false); assert.equal(summary.publicActivation, false);
const rehearsal = JSON.parse(gunzipSync(fs.readFileSync(path.join(dir, "rehearsal.json.gz"))).toString());
assert.equal(rehearsal.success, true); assert.equal(rehearsal.numTotalTests, 146); assert.equal(rehearsal.numFailedTests, 0);
console.log(JSON.stringify({ hashes: Object.keys(manifest).length, ordinaryTextCallsReplayed: calls, normalDerivedWrites: writes.length, cachedCalls: 0, packets: 3, measuredUsd: measured, verdict: review.verdict, rehearsalTests: rehearsal.numTotalTests, networkCalls: 0, productionMutations: 0 }));
