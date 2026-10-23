/** Offline replay of every retained v3 reply, with deployment, accounting and packet checks. No network or writes. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { buildRenderingPacket } from "../../../src/lib/engine/prompt";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { dir, root, json, hash, sources, row } from "./inspect.mjs";

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
const manifest = json("sha256.json");
for (const [file, digest] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
const plan = json("plan.json"), before = json("before-deploy.json"), afterDeploy = json("after-deploy.json"), final = json("final.json");
assert.deepEqual(sources(), before.sources); assert.deepEqual(final.sources, before.sources);
for (const [file, digest] of Object.entries(before.sources)) if (file !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${plan.baseCommit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })), digest, file);
assert.ok(execFileSync(process.execPath, ["--import", "tsx", "scripts/works/import.mts", "--check"], { cwd: root, encoding: "utf8" }).includes(`bible-web: 31102 units; work sha256 ${before.sources["works/bible-web/work.json"]}`));

// The backend-only deploy changed no record, spend, status or catalog.
const deployment = json("deployment.json");
assert.equal(deployment.sourceCommit, plan.baseCommit); assert.equal(deployment.frontend.changed, false); assert.equal(deployment.dryRun.indexesDeleted, false);
for (const key of ["sources", "status", "records", "spend"]) assert.deepEqual(afterDeploy[key], before[key], key);
assert.deepEqual(afterDeploy.catalog.artStyles, before.catalog.artStyles);
assert.ok(Date.parse(deployment.deployFinishedAt) <= Date.parse(json("pre-luke-10-33.json").at));

// Replay each retained provider reply through the real adapter and preparation path over in-memory records.
const traces = fs.readFileSync(path.join(dir, "provider.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
let cursor = 0;
const model = createOpenRouterTextModel({ apiKey: "offline", fetch: async (url, init) => {
  const trace = traces[cursor++]; assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  assert.deepEqual(JSON.parse(String(init.body)), trace.request); assert.equal(trace.status, 200);
  return new Response(JSON.stringify(trace.response), { status: 200, headers: { "content-type": "application/json" } });
} });
const inputs = await readWorkInputs("bible-web", root);
const records: AnalysisRecord[] = structuredClone(before.records.flatMap((r: { record: AnalysisRecord | null }) => r.record ? [r.record] : []));
const writes: AnalysisRecord[] = [], spend: Array<{ costUsd: number | null; outcome: string }> = [];
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
const attempted: string[] = [];
for (const unit of plan.textOrder) {
  if (!fs.existsSync(path.join(dir, `started-${unit}.json`))) { assert.ok(!fs.existsSync(path.join(dir, `scene-${unit}.json`))); continue; }
  const scene = json(`scene-${unit}.json`), dry = json(`dry-run-${unit}.json`), snapshot = json(`${dry.snapshot}.json`);
  assert.ok(Date.parse(snapshot.at) <= Date.parse(dry.at) && Date.parse(dry.at) <= Date.parse(json(`started-${unit}.json`).at));
  assert.deepEqual(dry.context, scene.context); assert.equal(dry.paidCalls, 0);
  const args = { workId: "bible-web", momentId: unit, store, model, brief: inputs.brief, briefVersion: inputs.briefVersion, context: scene.context };
  const firstCall = cursor;
  if (scene.error) await assert.rejects(prepareMoment(args), (error) => String(error) === scene.error.message);
  else {
    const replay = await prepareMoment(args); assert.deepEqual(replay, scene.result);
    const stored = records.find((r) => r.kind === "plan" && r.recordId === unit)!;
    assert.deepEqual(stored.payload, scene.stored.payload); assert.equal(stored.version, scene.stored.version);
    const providerCalls: number = cursor, writeCount: number = writes.length;
    assert.equal((await prepareMoment(args)).calls, 0); assert.equal(cursor, providerCalls); assert.equal(writes.length, writeCount);
  }
  assert.deepEqual(json(`input-${firstCall + 1}.json`).request, dry.request);
  attempted.push(unit);
}
assert.equal(cursor, traces.length); assert.equal(writes.length, 2);
assert.deepEqual(writes.map((w) => `${w.kind}:${w.recordId}`), json("summary.json").changedRecords);
for (const r of final.records) {
  const replay = records.find((record) => record.kind === r.kind && record.recordId === r.recordId) ?? null;
  assert.deepEqual(replay?.payload ?? null, r.record?.payload ?? null); assert.deepEqual(replay?.inputs ?? null, r.record?.inputs ?? null); assert.equal(replay?.version ?? null, r.record?.version ?? null);
}
for (const unit of ["luke-10-33", "daniel-7-9"]) assert.ok((row(final, "plan", unit)!.inputs as unknown as Array<{ recordId: string; version: string }>).some((i) => i.recordId === "scene_plan_moment_cast" && i.version === "2026-10-22-moment-cast-v3"));
for (const unit of ["luke-10-34", "daniel-7-10"]) assert.deepEqual(row(final, "plan", unit), row(before, "plan", unit));
for (const kind of ["look", "section", "entry", "moment"]) for (const r of before.records.filter((r: { kind: string }) => r.kind === kind)) assert.deepEqual(row(final, kind, r.recordId), r.record);

// Gating and one-shot policy.
const summary = json("summary.json");
assert.deepEqual(attempted, summary.attempted);
for (const [first, next] of [["luke-10-33", "luke-10-34"], ["daniel-7-9", "daniel-7-10"]]) {
  const review = json(`review-${first}.json`);
  assert.equal(review.artifactSha256, hash(fs.readFileSync(path.join(dir, `scene-${first}.json`))));
  assert.ok(Date.parse(review.at) < (fs.existsSync(path.join(dir, `started-${next}.json`)) ? Date.parse(json(`started-${next}.json`).at) : Infinity));
  assert.equal(attempted.includes(next), review.verdict === "accept-for-next-text-check");
}
assert.ok(Date.parse(json("review-luke-10-33.json").at) < Date.parse(json("started-daniel-7-9.json").at));
// The later re-inspection holds 7:9 without rewriting the review that gated 7:10.
const addendum = json("review-daniel-7-9-addendum.json");
assert.equal(addendum.reviewSha256, hash(fs.readFileSync(path.join(dir, "review-daniel-7-9.json"))));
assert.equal(addendum.artifactSha256, hash(fs.readFileSync(path.join(dir, "scene-daniel-7-9.json"))));
assert.ok(Date.parse(addendum.at) > Date.parse(json("scene-daniel-7-10.json").at));
assert.equal(addendum.originalVerdict, json("review-daniel-7-9.json").verdict);
assert.equal(json("summary.json").outcomes["daniel-7-9"].revisedVerdict, addendum.revisedVerdict);

// Separate allowances, ledger and account arithmetic.
const ledger = json("ledger.json");
assert.equal(ledger.calls.length, traces.length); assert.equal(ledger.uncertainUsd, 0); assert.equal(ledger.blocked, null);
const measured = traces.reduce((sum, trace) => sum + trace.measuredUsageUsd, 0);
assert.equal(measured, ledger.measuredUsd); assert.ok(measured <= plan.preparation.capUsd); assert.ok(traces.length <= plan.preparation.maximumCalls);
for (let i = 0; i < traces.length; i++) {
  const input = json(`input-${i + 1}.json`), trace = traces[i];
  assert.ok(Date.parse(input.at) <= Date.parse(trace.startedAt)); assert.ok(input.maximumCompletionEstimatedUsd < plan.preparation.reservePerCallUsd);
  assert.equal(ledger.calls[i].measuredUsd, trace.measuredUsageUsd); assert.equal(trace.request.max_tokens, 2400);
}
assert.deepEqual(spend.map((s) => s.outcome), ["ok", "ok", "unavailable"]);
const derivedCost = spend.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
assert.equal(final.spend.calls - before.spend.calls, spend.length); assert.ok(Math.abs(final.spend.costUsd - before.spend.costUsd - derivedCost) < 1e-12);
assert.equal(summary.preparation.measuredUsd, Number((plan.preparation.measuredBeforeUsd + measured).toFixed(10)));
assert.equal(summary.preparation.remainingAfterReserveUsd, Number((43 - summary.preparation.measuredUsd - .03).toFixed(10)));
assert.equal(summary.evaluation.measuredUsd, plan.evaluation.measuredBeforeUsd); assert.equal(summary.smoke.measuredUsd, plan.smoke.measuredBeforeUsd);
assert.ok(Math.abs(before.balanceUsd - final.balanceUsd - measured) < 1e-10); assert.equal(summary.accountBalance.matchesReturnedUsage, true);

// Read-only packets: stored plans reach rendering unchanged; grounding audit never enters the prompt.
const packets = json("packets.json"); assert.equal(packets.paidCalls, 0); assert.equal(packets.productionMutations, 0); assert.equal(packets.imagesGenerated, 0);
assert.equal(packets.packets.length, 6);
for (const p of packets.packets) {
  const scene = json(`scene-${p.unitId}.json`);
  assert.equal(p.prepared.calls, 0); assert.deepEqual(p.prepared.plan, scene.result.plan); assert.deepEqual(p.context, scene.context);
  for (const key of ["focusQuote", "singleInstant", "participation", "momentQuote", "contextQuote"]) assert.ok(!p.prompt.includes(key), key);
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
}
assert.ok(final.catalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
assert.equal(final.environment.mode, "disabled"); assert.equal(final.environment.ownerSessionConfigured, false);
assert.equal(summary.imageCalls, 0); assert.equal(summary.semanticRetries, 0); assert.equal(summary.publicActivation, false); assert.equal(summary.humanAccepted, false);
console.log(JSON.stringify({ hashes: Object.keys(manifest).length, attempted, repliesReplayed: traces.length, writes: writes.length, measuredUsd: measured, packets: packets.packets.length, networkCalls: 0, productionMutations: 0 }));
