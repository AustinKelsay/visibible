/** Offline retained-response replay, exact correction audit and release-accounting checks. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { draftCanonEntry } from "../../../src/lib/reading-pass/canon";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { buildRenderingPacket } from "../../../src/lib/engine/prompt";
import { dir, root, json, hash, sources } from "./inspect.mjs";
import { options } from "./canon.mjs";
import { candidate, row } from "./correction.mjs";

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
const manifest = json("sha256.json");
for (const [file, digest] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
const before = json("preflight.json"), corrected = json("corrected.json"), final = json("final.json"), plan = json("plan.json");
const validation = json("validation.json");
for (const [name, expected] of Object.entries(validation.reports) as Array<[string, { sha256: string; passed: number; failed: number; skipped: number }]>) {
  const bytes = gunzipSync(fs.readFileSync(path.join(dir, name)));
  assert.equal(hash(bytes), expected.sha256);
  const report = JSON.parse(bytes.toString("utf8"));
  assert.equal(report.numPassedTests, expected.passed); assert.equal(report.numFailedTests, expected.failed); assert.equal(report.numPendingTests, expected.skipped);
}
assert.equal(validation.finalCoverageExitCode, 0); assert.equal(validation.explicitCorrectionReplay.passed, 1);
assert.deepEqual(sources(), before.sources); assert.deepEqual(corrected.sources, before.sources); assert.deepEqual(final.sources, before.sources);
for (const [file, digest] of Object.entries(before.sources)) if (file !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${plan.baseCommit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })), digest);
assert.ok(execFileSync(process.execPath, ["--import", "tsx", "scripts/works/import.mts", "--check"], { cwd: root, encoding: "utf8" }).includes(`bible-web: 31102 units; work sha256 ${before.sources["works/bible-web/work.json"]}`));
assert.deepEqual(json("before-apply.json").records, before.records);
const proposed = await candidate(); assert.deepEqual(proposed, json("candidate.json"));
assert.deepEqual(row(corrected, "section", "luke-10-25")!.payload, proposed.finalSection);
for (const entry of proposed.entries) {
  const active = row(corrected, "entry", entry.id)!;
  assert.deepEqual(active.payload, entry.payload); assert.equal(active.version, contentVersion(entry.payload));
  assert.equal((active as AnalysisRecord & { source: string }).source, "owner");
}
for (const r of before.records) if (r.kind !== "section" || r.recordId !== "luke-10-25") {
  if (!proposed.entries.some((e) => r.kind === "entry" && r.recordId === e.id)) assert.deepEqual(row(corrected, r.kind, r.recordId), r.record);
}
assert.deepEqual(corrected.spend, before.spend);
const traces = fs.readFileSync(path.join(dir, "provider.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
let cursor = 0;
const model = createOpenRouterTextModel({ apiKey: "offline", fetch: async (url, init) => {
  const trace = traces[cursor++]; assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  assert.deepEqual(JSON.parse(String(init.body)), trace.request); assert.equal(trace.status, 200);
  return new Response(JSON.stringify(trace.response), { status: 200, headers: { "content-type": "application/json" } });
} });
const { inputs, subjects, section, sectionEras } = await options();
for (const entry of subjects) {
  const result = await draftCanonEntry({ work: inputs.work, entry, brief: inputs.brief, sections: [section], sectionEras, hints: [], model });
  assert.deepEqual(result, json(`canon-${entry.id}.json`).result);
}
assert.equal(cursor, 9);
const records: AnalysisRecord[] = structuredClone(corrected.records.flatMap((r: { record: AnalysisRecord | null }) => r.record ? [r.record] : []));
const writes: AnalysisRecord[] = [], spend: Array<{ costUsd: number | null }> = [];
const store: PreparationStore = {
  getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
  claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (entry) => { spend.push(entry); },
  putDerivedRecord: async (args) => {
    const record = { ...structuredClone(args), version: contentVersion(args.payload) };
    const index = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId);
    if (index < 0) records.push(record); else records[index] = record;
    writes.push(record); return { version: record.version };
  },
};
const attempted: string[] = [];
for (const unit of plan.textOrder) {
  if (!fs.existsSync(path.join(dir, `scene-${unit}.json`))) { assert.ok(!fs.existsSync(path.join(dir, `started-${unit}.json`))); continue; }
  const scene = json(`scene-${unit}.json`), review = json(`review-${unit}.json`);
  assert.equal(review.artifactSha256, hash(fs.readFileSync(path.join(dir, `scene-${unit}.json`))));
  const args = { workId: "bible-web", momentId: unit, store, model, brief: inputs.brief, briefVersion: inputs.briefVersion, context: scene.context };
  if (scene.error) await assert.rejects(prepareMoment(args), (error) => String(error) === scene.error.message);
  else {
    const replay = await prepareMoment(args); assert.deepEqual(replay, scene.result);
    const providerCalls: number = cursor, writeCount: number = writes.length;
    assert.equal((await prepareMoment(args)).calls, 0); assert.equal(cursor, providerCalls); assert.equal(writes.length, writeCount);
  }
  attempted.push(unit);
}
assert.equal(cursor, traces.length);
for (const r of final.records) {
  const replay = records.find((record) => record.kind === r.kind && record.recordId === r.recordId) ?? null;
  assert.deepEqual(replay?.payload ?? null, r.record?.payload ?? null); assert.deepEqual(replay?.inputs ?? null, r.record?.inputs ?? null); assert.equal(replay?.version ?? null, r.record?.version ?? null);
}
const ledger = json("ledger.json"), summary = json("summary.json");
assert.equal(ledger.calls.length, traces.length); assert.equal(ledger.uncertainUsd, 0); assert.equal(ledger.blocked, null);
const measured = traces.reduce((sum, trace) => sum + trace.measuredUsageUsd, 0);
assert.equal(measured, ledger.measuredUsd); assert.ok(measured <= plan.preparation.capUsd);
for (let i = 0; i < traces.length; i++) {
  const input = json(`input-${i + 1}.json`), trace = traces[i];
  assert.ok(Date.parse(input.at) <= Date.parse(trace.startedAt)); assert.ok(input.maximumCompletionEstimatedUsd < plan.preparation.reservePerCallUsd);
  assert.equal(ledger.calls[i].measuredUsd, trace.measuredUsageUsd);
}
const derivedCost = spend.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
assert.equal(final.spend.calls - before.spend.calls, spend.length); assert.ok(Math.abs(final.spend.costUsd - before.spend.costUsd - derivedCost) < 1e-12);
assert.equal(summary.preparation.measuredUsd, Number((plan.preparation.measuredBeforeUsd + measured).toFixed(10)));
assert.equal(summary.preparation.remainingAfterReserveUsd, Number((43 - summary.preparation.measuredUsd - .03).toFixed(10)));
assert.equal(summary.evaluation.measuredUsd, plan.evaluation.measuredBeforeUsd); assert.equal(summary.smoke.measuredUsd, plan.smoke.measuredBeforeUsd);
assert.deepEqual(attempted, summary.attempted);
assert.ok(attempted.includes("luke-10-33") && attempted.includes("daniel-7-9"));
for (const [first, next] of [["luke-10-33", "luke-10-34"], ["daniel-7-9", "daniel-7-10"]]) {
  assert.equal(attempted.includes(next), json(`review-${first}.json`).verdict === "accept-for-next-text-check");
}
const histories = json("histories.json").histories;
for (const r of before.records) if (r.record && ["entry", "section", "look", "plan"].includes(r.kind)) {
  const current = row(final, r.kind, r.recordId)!;
  const changed = JSON.stringify(current.payload) !== JSON.stringify(r.record.payload) || JSON.stringify(current.inputs) !== JSON.stringify(r.record.inputs);
  const history = histories.find((h: { kind: string; recordId: string }) => h.kind === r.kind && h.recordId === r.recordId).history;
  assert.ok(history.some((h: { version: string; status: string }) => h.version === r.record.version && h.status === (changed ? "superseded" : "current")));
}
assert.equal(histories.find((h: { kind: string; recordId: string }) => h.kind === "section" && h.recordId === "luke-10-25").history.length, 10);
const packets = json("packets.json"); assert.equal(packets.paidCalls, 0); assert.equal(packets.productionMutations, 0);
assert.equal(packets.packets.length, attempted.filter((unit) => !!json(`scene-${unit}.json`).result).length * 3);
for (const p of packets.packets) {
  const scene = json(`scene-${p.unitId}.json`);
  assert.equal(p.prepared.calls, 0); assert.deepEqual(p.prepared.plan, scene.result.plan); assert.deepEqual(p.context, scene.context);
  for (const c of p.canon) {
    const entry = row(final, "entry", c.entryId)!;
    assert.equal(c.version, entry.version);
    const stage = (entry.payload.stages as Array<{ id: string; text: string }>).find((stage) => stage.id === c.stageId)!;
    assert.equal(c.text, stage.text); assert.equal(c.hasForm, entry.payload.hasForm !== false);
  }
  assert.deepEqual(p.canon.map((c: { entryId: string }) => c.entryId), scene.result.plan.payload.present);
  const built = buildRenderingPacket({ work: { id: "bible-web", title: inputs.work.work.title },
    moment: { id: p.unitId, sectionId: p.sectionId, reference: p.context.moment.reference, text: p.context.moment.text },
    neighbors: { previous: p.context.previous?.text ?? null, next: p.context.next?.text ?? null }, brief: inputs.brief, briefVersion: inputs.briefVersion,
    eraId: p.prepared.era, style: inputs.styles[p.styleId].style, styleVersion: inputs.styles[p.styleId].version,
    look: { ...p.prepared.look.payload, version: p.prepared.look.version }, plan: { ...p.prepared.plan.payload, version: p.prepared.plan.version },
    canon: p.canon, references: p.references, variationNumber: null, aspectRatio: "16:9" });
  assert.ok(built.ok); assert.equal(built.prompt, p.prompt); assert.deepEqual(built.packet, p.packet);
  assert.deepEqual(p.sentReferences.map((r: { storageId: string }) => r.storageId), p.references.map((r: { storageId: string }) => r.storageId));
}
assert.ok(final.catalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
assert.equal(final.environment.mode, "disabled"); assert.equal(final.environment.ownerSessionConfigured, false);
const settled = json("settled.json");
assert.deepEqual(settled.records, final.records); assert.deepEqual(settled.spend, final.spend); assert.deepEqual(settled.status, final.status);
assert.ok(Math.abs(before.balanceUsd - settled.balanceUsd - measured) < 1e-10);
assert.equal(summary.accountBalance.matchesReturnedUsage, true); assert.equal(summary.accountBalance.afterUsd, settled.balanceUsd);
assert.equal(summary.imageCalls, 0); assert.equal(summary.semanticRetries, 0); assert.equal(summary.publicActivation, false); assert.equal(summary.humanAccepted, false);
console.log(JSON.stringify({ hashes: Object.keys(manifest).length, canonRepliesReplayed: 9, attempted, ordinaryTextCallsReplayed: traces.length - 9, writes: writes.length, measuredUsd: measured, networkCalls: 0, productionMutations: 0 }));
