/** Offline audit and ordinary-path replay. Never reads credentials, contacts services or executes corrections. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { buildRenderingPacket } from "../../../src/lib/engine/prompt";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { createOpenRouterTextModel, READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { canonShowingSchema, compileCanonShowing } from "../../../src/lib/canon-showing";
import { dir, root, json, hash, sources, row } from "./run.mjs";

globalThis.fetch = async () => { throw Error("Offline verification forbids network"); };
const manifest = json("sha256.json");
for (const [file, digest] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
const plan = json("plan.json"), before = json("before.json"), corrected = json("corrected.json"), after = json("after-9.json");
// The work JSON is generated offline during build from checked, committed source assets.
const committedInputs = { ...before.sources, ...Object.fromEntries(Object.entries(manifest).filter(([file]) => file.startsWith("scripts/works/") || file.startsWith("works/sources/") || file === "src/lib/work-input.ts" || file === "src/data/bible-structure.ts")) };
for (const [file, digest] of Object.entries(committedInputs)) if (file !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${plan.baseCommit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })), digest, `Deployed commit: ${file}`);
const importCheck = execFileSync(process.execPath, ["--import", "tsx", "scripts/works/import.mts", "--check"], { cwd: root, encoding: "utf8" });
assert.ok(importCheck.includes(`bible-web: 31102 units; work sha256 ${before.sources["works/bible-web/work.json"]}`));
assert.deepEqual(before.sources, sources()); assert.deepEqual(corrected.sources, before.sources); assert.deepEqual(after.sources, before.sources);
assert.deepEqual(json("predeployment-records.json").records, before.records);
assert.deepEqual(json("predeployment-records.json").status, before.status);
const section = row(corrected, "section", "daniel-7-9")!;
const oldSection = row(before, "section", "daniel-7-9")!;
const addition = JSON.parse(fs.readFileSync(path.join(root, "llm/releases/2026-10-22-daniel-cast-correction/addition.json"), "utf8"));
const expectedSection: AnalysisRecord["payload"] = { ...oldSection.payload, cast: [...oldSection.payload.cast as unknown[], { entryId: addition.entryId, stageId: addition.stageId, named: false }] };
assert.deepEqual(section.payload, expectedSection);
assert.equal(section.source, "owner"); assert.equal(section.version, contentVersion(section.payload));
assert.equal(row(before, "entry", addition.entryId), null);
const group = row(corrected, "entry", addition.entryId)!;
assert.deepEqual(group.payload, addition.entry); assert.equal(group.source, "owner");
assert.equal(group.version, json("addition-result.json").result.entryVersion);
assert.deepEqual(group, json("addition-result.json").readBack);
assert.deepEqual(section, json("addition-result.json").section);
const canon = row(corrected, "entry", "the_ancient_of_days")!;
assert.equal(canon.source, "owner"); assert.deepEqual(canon.payload, json("canon-correction-input.json").payload);
assert.equal(canon.version, contentVersion(canon.payload)); assert.deepEqual(canon, json("canon-correction-result.json").readBack);
const oldCanon = row(before, "entry", "the_ancient_of_days")!;
assert.deepEqual({ ...canon.payload, stages: oldCanon.payload.stages }, oldCanon.payload);
const candidateFile = path.join(root, "llm/releases/2026-10-22-daniel-effects-v5/canon.json");
assert.equal(json("canon-correction-input.json").candidateArtifactSha256, hash(fs.readFileSync(candidateFile)));
const candidate = JSON.parse(fs.readFileSync(candidateFile, "utf8")).result.stages[0];
const stage = (canon.payload.stages as Array<{ id: string; text: string; showing: unknown; quotes: Array<{ unit: string; quote: string }> }>)[0];
assert.equal(stage.id, "ancient-of-days-light"); assert.equal(compileCanonShowing(String(canon.payload.name), canonShowingSchema.parse(stage.showing)), stage.text);
assert.deepEqual({ ...stage, id: candidate.id }, { id: candidate.id, label: candidate.label, text: candidate.text, quotes: candidate.quotes, showing: candidate.showing });
const inputs = await readWorkInputs("bible-web", root);
for (const s of [...addition.entry.stages, stage]) for (const q of s.quotes) assert.ok(inputs.work.getUnit(q.unit).text.includes(q.quote));
for (const r of before.records) if (!["section:daniel-7-9", "entry:the_ancient_of_days", `entry:${addition.entryId}`].includes(`${r.kind}:${r.recordId}`)) assert.deepEqual(row(corrected, r.kind, r.recordId), r.record);
assert.deepEqual(corrected.spend, before.spend);
for (const r of corrected.records) if (!["look:daniel-7-9", "plan:daniel-7-9"].includes(`${r.kind}:${r.recordId}`)) assert.deepEqual(row(after, r.kind, r.recordId), r.record);
assert.equal(row(after, "plan", "daniel-7-10"), null);
assert.ok(!fs.existsSync(path.join(dir, "started-10.json")));
for (const kind of ["entry", "section", "look", "plan"]) {
  const id = kind === "entry" ? "the_ancient_of_days" : "daniel-7-9";
  const prior = row(before, kind, id)!;
  const history = after.histories.find((r: { kind: string; recordId: string }) => r.kind === kind && r.recordId === id).history;
  assert.ok(history.some((r: { version: string; status: string }) => r.version === prior.version && r.status === "superseded"));
}

const traces = fs.readFileSync(path.join(dir, "provider.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
assert.equal(traces.length, 2); assert.deepEqual(traces.map((r) => r.request.response_format.json_schema.name), ["section_look", "scene_plan"]);
let call = 0;
const model = createOpenRouterTextModel({ apiKey: "offline", fetch: async (url, init) => {
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions"); const trace = traces[call++];
  assert.deepEqual(JSON.parse(String(init.body)), trace.request); assert.equal(trace.status, 200);
  return new Response(JSON.stringify(trace.response), { status: 200, headers: { "content-type": "application/json" } });
} });
const records: AnalysisRecord[] = structuredClone(corrected.records.flatMap((r: { record: AnalysisRecord | null }) => r.record ? [r.record] : []));
const writes: AnalysisRecord[] = [], spends: Array<{ costUsd: number | null }> = [];
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
const moment = row(corrected, "moment", "daniel-7-9")!;
const context = momentContext(inputs.work, { id: moment.recordId, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) }, { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
const options = { workId: "bible-web", momentId: moment.recordId, store, model, brief: inputs.brief, briefVersion: inputs.briefVersion, context };
const replay = await prepareMoment(options);
assert.ok(replay.era);
assert.deepEqual(replay, json("scene-9.json").result); assert.equal(call, 2);
assert.deepEqual(writes.map((r) => r.kind), ["look", "plan"]);
for (const write of writes) {
  const live = row(after, write.kind, write.recordId)!;
  assert.deepEqual(write.payload, live.payload); assert.deepEqual(write.inputs, live.inputs); assert.equal(write.version, live.version);
}
const cached = await prepareMoment(options); assert.equal(cached.calls, 0); assert.equal(call, 2); assert.equal(writes.length, 2);
const dry = json("dry-run-9.json"), lookInput = json("input-9-1.json"), planInput = json("input-9-2.json");
assert.deepEqual(dry.request, lookInput.request); assert.ok(Date.parse(dry.at) < Date.parse(traces[0].startedAt));
for (let i = 0; i < 2; i++) {
  const input = i === 0 ? lookInput : planInput;
  assert.ok(Date.parse(input.at) <= Date.parse(traces[i].startedAt));
  assert.ok(input.maximumCompletionEstimatedUsd < plan.preparation.reservePerCallUsd);
  assert.equal(traces[i].request.model, READING_PASS_MODEL);
}
assert.ok(planInput.request.user.includes("effect names for placement: radiance, fire, cloud, light"));
assert.ok(!planInput.request.user.includes(stage.text));
const packets = json("packets.json"); assert.equal(packets.paidCalls, 0); assert.equal(packets.productionMutations, 0);
assert.equal(packets.packets.length, 3);
for (const p of packets.packets) {
  assert.equal(p.prepared.calls, 0); assert.equal(p.prepared.look.version, replay.look.version); assert.equal(p.prepared.plan.version, replay.plan.version);
  assert.ok(p.canon.some((c: { entryId: string }) => c.entryId === addition.entryId));
  assert.ok(p.canon.some((c: { text: string; hasForm: boolean }) => c.text === stage.text && c.hasForm === false));
  const packet = p.packet;
  const built = buildRenderingPacket({ work: { id: "bible-web", title: inputs.work.work.title },
    moment: { id: "daniel-7-9", sectionId: "daniel-7-9", reference: p.context.moment.reference, text: p.context.moment.text },
    neighbors: { previous: p.context.previous?.text ?? null, next: p.context.next?.text ?? null }, brief: inputs.brief, briefVersion: inputs.briefVersion,
    eraId: replay.era, style: inputs.styles[p.styleId].style, styleVersion: inputs.styles[p.styleId].version, look: { ...replay.look.payload, version: replay.look.version },
    plan: { ...replay.plan.payload, version: replay.plan.version }, canon: p.canon, references: p.references, variationNumber: null, aspectRatio: "16:9" });
  assert.ok(built.ok); assert.equal(built.prompt, p.prompt); assert.deepEqual(built.packet, packet);
  assert.deepEqual(p.sentReferences.map((r: { storageId: string }) => r.storageId), p.references.map((r: { storageId: string }) => r.storageId));
}
const ledger = json("preparation-ledger.json"), summary = json("summary.json");
const measured = traces.reduce((sum, r) => sum + r.measuredUsageUsd, 0);
assert.equal(measured, ledger.measuredUsd); assert.equal(ledger.uncertainUsd, 0); assert.equal(ledger.blocked, null);
assert.equal(spends.reduce((sum, r) => sum + (r.costUsd ?? 0), 0), measured);
assert.equal(after.spend.calls - before.spend.calls, 2); assert.ok(Math.abs(after.spend.costUsd - before.spend.costUsd - measured) < 1e-12);
assert.equal(summary.preparation.measuredUsd, Number((plan.preparation.measuredBeforeUsd + measured).toFixed(10)));
assert.equal(summary.preparation.remainingAfterReserveUsd, Number((43 - summary.preparation.measuredUsd - .03).toFixed(10)));
assert.equal(summary.evaluation.measuredUsd, plan.evaluation.measuredBeforeUsd); assert.equal(summary.smoke.measuredUsd, plan.smoke.measuredUsd);
const review = json("review-9.json"); assert.equal(review.verdict, "hold-for-formless-section-look");
assert.equal(review.artifactSha256, hash(fs.readFileSync(path.join(dir, "scene-9.json"))));
assert.equal(review.findings[0].exact, replay.look.payload.clothing);
assert.equal(summary.publicActivation, false); assert.equal(summary.imageCalls, 0); assert.equal(summary.semanticRetries, 0);
assert.ok(after.catalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
assert.equal(json("deployment.json").staged.commit, plan.baseCommit);
const compatibility = json("compatibility.json"); assert.equal(compatibility.imageRecordsEqual, true);
assert.ok(compatibility.savedImages.some((r: { id: string; translationId: string; artStyle: string }) => r.id === "kh7fwecgw3a9430s6ha8zra37x8gnwac" && r.translationId === "web" && r.artStyle === "icon"));
console.log(JSON.stringify({ hashes: Object.keys(manifest).length, ordinaryTextCallsReplayed: call, normalDerivedWrites: writes.length, cachedCalls: cached.calls, packets: 3, measuredUsd: measured, verdict: review.verdict, networkCalls: 0, productionMutations: 0 }));
