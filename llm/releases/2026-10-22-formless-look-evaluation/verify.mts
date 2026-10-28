/** Offline evidence audit. Never reads credentials, contacts services or mutates live analysis. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { prepareMoment, FORMLESS_LOOK_PROMPT_VERSION, FORMLESS_PLAN_PROMPT_VERSION, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { buildRenderingPacket } from "../../../src/lib/engine/prompt";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { createOpenRouterTextModel, estimateRequestCostUsd, READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { dir, root, json, hash, sources, row } from "./run.mjs";

globalThis.fetch = async () => { throw Error("Offline verification forbids network"); };
const manifest = json("sha256.json");
for (const [file, digest] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
const plan = json("plan.json"), before = json("before.json"), after9 = json("after-9.json"), after10 = json("after-10.json");
const preflight = json("preflight.json");
for (const [file, digest] of Object.entries(preflight.operationSources)) assert.equal(hash(fs.readFileSync(path.join(dir, file))), digest);
assert.equal(preflight.baseCommit, plan.baseCommit);
assert.ok(Date.parse(preflight.at) < Date.parse(json("started-9.json").at));
const sourceInputs = { ...before.sources, ...Object.fromEntries(Object.entries(manifest).filter(([file]) => file.startsWith("scripts/works/") || file.startsWith("works/sources/") || file === "src/lib/work-input.ts" || file === "src/data/bible-structure.ts")) };
for (const [file, digest] of Object.entries(sourceInputs)) if (file !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${plan.baseCommit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })), digest, `Reviewed commit: ${file}`);
const importCheck = execFileSync(process.execPath, ["--import", "tsx", "scripts/works/import.mts", "--check"], { cwd: root, encoding: "utf8" });
assert.ok(importCheck.includes(`bible-web: 31102 units; work sha256 ${before.sources["works/bible-web/work.json"]}`));
assert.deepEqual(sources(), before.sources); assert.deepEqual(after9.sources, before.sources); assert.deepEqual(after10.sources, before.sources);
const prior = JSON.parse(fs.readFileSync(path.join(root, "llm/releases/2026-10-22-daniel-cast-repair/after-9.json"), "utf8"));
assert.deepEqual(before.records, prior.records); assert.deepEqual(before.spend, prior.spend);
for (const snapshot of [before, after9, after10]) {
  assert.ok(snapshot.status.ready && snapshot.status.activeGeneration === 1);
  assert.deepEqual(snapshot.environment, { mode: "disabled", ownerSessionConfigured: false, convexUrl: "https://api.visibible.com" });
  assert.ok(snapshot.catalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
  assert.equal(Number(snapshot.pricing.pricing.prompt), 0.1e-6); assert.equal(Number(snapshot.pricing.pricing.completion), 0.5e-6);
}
for (const [from, to, changed] of [[before, after9, ["look:daniel-7-9", "plan:daniel-7-9"]], [after9, after10, ["plan:daniel-7-10"]]] as const) {
  const changedKeys = new Set<string>(changed);
  for (const r of from.records) if (!changedKeys.has(`${r.kind}:${r.recordId}`)) assert.deepEqual(row(to, r.kind, r.recordId), r.record);
}
for (const kind of ["look", "plan"]) {
  const old = row(before, kind, "daniel-7-9")!;
  const history = after9.histories.find((r: { kind: string; recordId: string }) => r.kind === kind && r.recordId === "daniel-7-9").history;
  assert.ok(history.some((r: { version: string; status: string }) => r.version === old.version && r.status === "superseded"));
}
const look = row(after10, "look", "daniel-7-9")!;
assert.ok(look.inputs.some((i) => i.kind === "prompt" && i.recordId === "section_look_formless_presence" && i.version === FORMLESS_LOOK_PROMPT_VERSION));
assert.ok(!row(before, "look", "daniel-7-9")!.inputs.some((i) => i.kind === "prompt"));
assert.notEqual(look.version, row(before, "look", "daniel-7-9")!.version);

const traces = fs.readFileSync(path.join(dir, "provider.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
assert.equal(traces.length, 3); assert.deepEqual(traces.map((r) => r.label), ["section_look", "scene_plan", "scene_plan"]);
let call = 0;
const model = createOpenRouterTextModel({ apiKey: "offline", fetch: async (url, init) => {
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions"); const trace = traces[call++];
  assert.deepEqual(JSON.parse(String(init.body)), trace.request); assert.equal(trace.status, 200);
  assert.equal(trace.measuredUsageUsd, extractOpenRouterUsageUsd(trace.response));
  assert.equal(trace.request.model, READING_PASS_MODEL);
  return new Response(JSON.stringify(trace.response), { status: 200, headers: { "content-type": "application/json" } });
} });
const records: AnalysisRecord[] = structuredClone(before.records.flatMap((r: { record: AnalysisRecord | null }) => r.record ? [r.record] : []));
const writes: AnalysisRecord[] = [], spends: Array<{ costUsd: number | null; outcome: string }> = [];
const store: PreparationStore = {
  getActiveRecord: async (kind, recordId) => structuredClone(records.find((r) => r.kind === kind && r.recordId === recordId) ?? null),
  claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (entry) => { spends.push(entry); },
  putDerivedRecord: async (args) => {
    const record = { ...structuredClone(args), version: contentVersion(args.payload) };
    const index = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId);
    if (index < 0) records.push(record); else records[index] = record;
    writes.push(record); return { version: record.version };
  },
};
const inputs = await readWorkInputs("bible-web", root), section = row(before, "section", "daniel-7-9")!;
const prepared = new Map<string, Awaited<ReturnType<typeof prepareMoment>>>();
for (const number of ["9", "10"]) {
  const id = `daniel-7-${number}`, scene = json(`scene-${number}.json`), moment = row(before, "moment", id)!;
  const context = momentContext(inputs.work, { id, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) }, { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  assert.deepEqual(context, scene.context);
  const options = { workId: "bible-web", momentId: id, store, model, brief: inputs.brief, briefVersion: inputs.briefVersion, context };
  const result = await prepareMoment(options); assert.deepEqual(result, scene.result);
  prepared.set(id, result);
  assert.equal((await prepareMoment(options)).calls, 0);
  const review = json(`review-${number}.json`);
  assert.equal(review.artifactSha256, hash(fs.readFileSync(path.join(dir, `scene-${number}.json`))));
  assert.equal(review.humanAccepted, false); assert.equal(review.publicActivation, false);
  const current = row(after10, "plan", id)!;
  assert.ok(current.inputs.some((i) => i.kind === "prompt" && i.version === FORMLESS_PLAN_PROMPT_VERSION));
  assert.ok(current.inputs.some((i) => i.kind === "look" && i.version === look.version));
}
assert.equal(json("review-9.json").verdict, "accept-for-next-text-check");
assert.ok(Date.parse(json("review-9.json").at) < Date.parse(json("started-10.json").at));
assert.equal(json("review-10.json").verdict, "pass-narrow-text-hold-for-visual-evidence");
const followup = json("review-followup.json");
assert.equal(followup.verdict, "hold-for-moment-selection");
assert.equal(followup.decision.wholeTextAccepted, false);
assert.equal(followup.historicalExecution.nextMomentWasRun, true);
assert.ok(Date.parse(followup.at) > Date.parse(json("scene-10.json").at));
for (const [file, digest] of Object.entries(followup.historicalReviewHashes)) assert.equal(hash(fs.readFileSync(path.join(dir, file))), digest);
assert.equal(call, 3); assert.deepEqual(writes.map((r) => r.kind), ["look", "plan", "plan"]);
assert.ok(spends.every((s) => s.outcome === "ok"));
for (const write of writes) {
  const live = row(after10, write.kind, write.recordId)!;
  assert.deepEqual(write.payload, live.payload); assert.deepEqual(write.inputs, live.inputs); assert.equal(write.version, live.version);
}
for (let i = 0; i < traces.length; i++) {
  const number = i < 2 ? "9" : "10", input = json(`input-${number}-${i + 1}.json`);
  assert.ok(Date.parse(input.at) <= Date.parse(traces[i].startedAt));
  assert.equal(input.estimatedUsd, estimateRequestCostUsd(input.request));
  assert.ok(input.maximumCompletionEstimatedUsd < plan.preparation.reservePerCallUsd);
  assert.ok(input.request.user.includes("effect names for placement: radiance, fire, cloud, light"));
  if (i !== 1) {
    const dry = json(`dry-run-${number}.json`); assert.deepEqual(dry.request, input.request);
    assert.ok(Date.parse(dry.at) < Date.parse(traces[i].startedAt));
    assert.equal(dry.paidCalls, 0); assert.equal(dry.productionMutations, 0);
  }
}
const packets = json("packets.json"); assert.equal(packets.packets.length, 6); assert.equal(packets.paidCalls, 0); assert.equal(packets.productionMutations, 0);
const ancient = row(before, "entry", "the_ancient_of_days")!;
const ancientText = (ancient.payload.stages as Array<{ text: string }>)[0].text;
for (const p of packets.packets) {
  const replay = prepared.get(p.unitId)!; assert.ok(replay.era);
  assert.equal(p.prepared.calls, 0); assert.equal(p.prepared.look.version, replay.look.version); assert.equal(p.prepared.plan.version, replay.plan.version);
  assert.ok(p.canon.some((c: { text: string; hasForm: boolean }) => c.text === ancientText && c.hasForm === false));
  assert.ok(p.canon.some((c: { entryId: string }) => c.entryId === "ministering_assembly_in_daniels_vision"));
  assert.ok(!p.references.some((r: { kind: string; entryId?: string }) => r.kind === "sheet" && r.entryId === ancient.recordId));
  assert.ok(!p.prompt.includes("effect names for placement")); assert.ok(p.prompt.includes(ancientText));
  if (p.unitId.endsWith("-10")) {
    assert.ok(!p.canon.some((c: { entryId: string }) => c.entryId === "daniel_prophet_of_babylon"));
    // Canon omission is not rendered absence: the unchanged shared look still names him.
    assert.ok(p.prompt.includes(json("scene-9.json").result.look.payload.clothing));
    assert.ok(p.prompt.includes("Daniel in his ordinary tunic and cloak"));
  }
  const built = buildRenderingPacket({ work: { id: "bible-web", title: inputs.work.work.title },
    moment: { id: p.unitId, sectionId: "daniel-7-9", reference: p.context.moment.reference, text: p.context.moment.text },
    neighbors: { previous: p.context.previous?.text ?? null, next: p.context.next?.text ?? null }, brief: inputs.brief, briefVersion: inputs.briefVersion,
    eraId: replay.era, style: inputs.styles[p.styleId].style, styleVersion: inputs.styles[p.styleId].version, look: { ...replay.look.payload, version: replay.look.version },
    plan: { ...replay.plan.payload, version: replay.plan.version }, canon: p.canon, references: p.references, variationNumber: null, aspectRatio: "16:9" });
  assert.ok(built.ok); assert.equal(built.prompt, p.prompt); assert.deepEqual(built.packet, p.packet);
  assert.deepEqual(p.sentReferences.map((r: { storageId: string }) => r.storageId), p.references.map((r: { storageId: string }) => r.storageId));
}
const ledger = json("preparation-ledger.json"), summary = json("summary.json");
const measured = traces.reduce((sum, r) => sum + r.measuredUsageUsd, 0);
assert.equal(measured, ledger.measuredUsd); assert.equal(ledger.uncertainUsd, 0); assert.equal(ledger.blocked, null);
assert.equal(spends.reduce((sum, r) => sum + (r.costUsd ?? 0), 0), measured);
assert.equal(after10.spend.calls - before.spend.calls, 3); assert.ok(Math.abs(after10.spend.costUsd - before.spend.costUsd - measured) < 1e-12);
assert.ok(Math.abs(before.balanceUsd - after10.balanceUsd - measured) < 1e-9);
assert.ok(measured <= plan.preparation.capUsd); assert.ok(traces.length <= plan.preparation.maximumCalls);
assert.equal(summary.preparation.measuredUsd, Number((plan.preparation.measuredBeforeUsd + measured).toFixed(10)));
assert.equal(summary.preparation.remainingAfterReserveUsd, Number((43 - summary.preparation.measuredUsd - .03).toFixed(10)));
assert.equal(summary.evaluation.measuredUsd, plan.evaluation.measuredBeforeUsd); assert.equal(summary.smoke.measuredUsd, plan.smoke.measuredUsd);
assert.equal(summary.publicActivation, false); assert.equal(summary.imageCalls, 0); assert.equal(summary.semanticRetries, 0);
assert.equal(summary.verdict, followup.verdict); assert.equal(summary.wholeTextAccepted, false);
console.log(JSON.stringify({ hashes: Object.keys(manifest).length, ordinaryTextCallsReplayed: call, normalDerivedWrites: writes.length, cachedCalls: 0, packets: 6, measuredUsd: measured, verdict: summary.verdict, networkCalls: 0, productionMutations: 0 }));
