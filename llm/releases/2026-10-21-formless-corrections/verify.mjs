/** Offline verification only: no keys, network, provider requests or mutations. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
const dir = fileURLToPath(new URL("./", import.meta.url));
const root = path.resolve(dir, "../../..");
const bytes = (file) => readFile(path.join(dir, file));
const json = async (file) => JSON.parse(file.endsWith(".gz") ? gunzipSync(await bytes(file)).toString() : (await bytes(file)).toString());
const hash = (value) => createHash("sha256").update(value).digest("hex");
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const list = async (folder = "") => (await Promise.all((await readdir(path.join(dir, folder), {withFileTypes:true})).map(async (entry) => {
  const name = path.join(folder, entry.name);
  return entry.isDirectory() ? list(name) : [name];
}))).flat();
const hashes = await json("sha256.json");
assert.deepEqual(Object.keys(hashes).sort(), (await list()).filter(f => f !== "sha256.json").sort());
for (const [file, expected] of Object.entries(hashes)) assert.equal(hash(await bytes(file)), expected, file);
const plan = await json("plan.json");
const before = await json("before.json");
const corrections = await json("correction-plan.json");
const proof = await json("correction-proof.json");
const readback = await json("correction-readback.json");
const preflight = await json("preflight.json");
const postflight = await json("postflight.json.gz");
const previous = JSON.parse(await readFile(path.join(root,"llm/releases/2026-10-20-engine-funded-evaluation/summary.json"),"utf8"));
const summary = await json("summary.json");
assert.equal(plan.publicActivation, false);
assert.equal(before.publicMode, "disabled");
assert.equal(plan.caseIds.length, 8);
assert.equal(plan.maximumImageCalls, 72);
assert.equal(plan.repeats, 3);
assert.deepEqual(plan.styles, ["classical", "watercolor", "icon"]);
close(plan.evaluationMeasuredBeforeUsd, previous.budgets.evaluationMeasuredUsd);
close(plan.evaluationUncertaintyBeforeUsd, previous.budgets.evaluationUncertaintyUsd);
close(plan.maximumEvaluationWithSubcapAndPriorUncertaintyUsd, plan.evaluationMeasuredBeforeUsd + plan.evaluationUncertaintyBeforeUsd + plan.subcapUsd);
assert.ok(plan.maximumEvaluationWithSubcapAndPriorUncertaintyUsd <= 16);
for (const [file, expected] of Object.entries(plan.sourceFiles)) assert.equal(hash(await readFile(path.join(root, file))), expected, file);
assert.equal(preflight.paidCalls, 0);
assert.equal(preflight.actualMutations, 0);
assert.equal(preflight.packets.length, 54);
assert.equal(preflight.failures.length, 18);
assert.ok(preflight.failures.every(f => ["2-kings-2-23-bears","daniel-7-9-ancient-of-days"].includes(f.caseId) && f.reason === "preparation"));
assert.equal(postflight.paidCalls, 0);
assert.equal(postflight.actualMutations, 0);
assert.deepEqual(postflight.failures, []);
assert.equal(postflight.packets.length, 72);
assert.equal(corrections.corrections.length, 2);
assert.equal(proof.planSha256, hash(JSON.stringify(corrections)));
for (const operation of corrections.corrections) {
  const row = readback.rows.find(r => r.kind === operation.kind && r.recordId === operation.recordId);
  assert.ok(row);
  assert.equal(row.record.source, "owner");
  assert.deepEqual(row.record.payload, operation.payload);
  assert.notEqual(row.version, operation.expectedVersion);
  assert.ok(row.history.some(h => h.version === operation.expectedVersion));
}
assert.ok(corrections.corrections[0].payload.stages[0].text.includes("a bald head"));
assert.ok(corrections.corrections[0].payload.stages[0].quotes.some(q => q.unit === "2-kings-2-23" && q.quote.includes("baldy")));
assert.ok(corrections.corrections[1].payload.clothing.includes("no body, hair or garments"));
const work = JSON.parse(await readFile(path.join(root,"works/bible-web/work.json"),"utf8"));
for (const source of corrections.sources) {
  const [,book,chapter,verse] = source.unit.match(/^(.*)-(\d+)-(\d+)$/);
  const unit = work.divisions.find(b => b.key === book).divisions.find(c => c.key === chapter).units.find(v => v.number === Number(verse));
  assert.equal(source.quote, unit.text);
}
const state = await json("state.json.gz");
const samples = Object.values(state.samples);
const traceText = gunzipSync(await bytes("provider.ndjson.gz")).toString();
const trace = traceText.trim().split("\n").map(JSON.parse);
const images = trace.filter(r => r.kind === "image");
const preparation = trace.filter(r => r.kind === "preparation");
const execution = await json("execution.json");
assert.equal(samples.length, 72);
const danielPreparation = preparation.find(r=>r.request.messages.some(m=>typeof m.content==="string" && m.content.includes("MOMENT (Daniel 7:9)")));
assert.ok(danielPreparation);
const danielPlan = JSON.parse(danielPreparation.response.choices[0].message.content);
assert.deepEqual(danielPlan.present,["daniel_prophet_of_babylon"]);
assert.ok(danielPlan.primarySubject.includes("formless divine presence"));
assert.equal(samples.filter(s=>s.prompt.includes("FORMLESS SUBJECTS")).length,summary.formlessContractCoverage.blockPresent);
assert.equal(samples.filter(s=>s.caseId==="daniel-7-9-ancient-of-days" && !s.prompt.includes("FORMLESS SUBJECTS")).length,summary.formlessContractCoverage.plannerOmitted);
assert.equal(images.length, 72);
assert.ok(preparation.length <= plan.maximumPreparationCalls);
assert.equal(execution.imageCalls, images.length);
assert.equal(execution.textCalls, preparation.length);
assert.equal(execution.uncertainUsd, 0);
assert.equal(state.run, plan.run);
assert.equal(state.stopped, undefined);
assert.equal(new Set(trace.map(r => r.response.id)).size, trace.length);
let measured = 0;
for (const row of trace) {
  const image = row.kind === "image";
  assert.equal(row.status, 200);
  assert.equal(typeof row.measuredUsageUsd, "number");
  assert.ok(!row.uncertainUsage);
  assert.equal(row.request.model, image ? plan.imageModel : plan.textModel);
  close(row.measuredUsageUsd, row.response.usage.cost);
  assert.ok(measured + (image ? plan.imageReserveUsd : plan.preparationReserveUsd) <= plan.subcapUsd);
  measured += row.measuredUsageUsd;
}
assert.ok(!traceText.includes('"user_id"'));
assert.ok(!traceText.includes('data:image/'));
assert.ok(measured <= plan.subcapUsd);
close(measured, state.spentUsd);
close(measured, execution.chargedUsd);
close(measured, summary.newMeasuredUsd);
close(samples.reduce((sum,s) => sum+s.imageCostUsd+(s.preparationCostUsd ?? 0)+s.plannerCostUsd,0), measured);
assert.equal(samples.reduce((sum,s) => sum+(s.preparationCalls ?? 0),0), preparation.length);
const fullHashes = await json("full-resolution-output-sha256.json");
const byId = new Map(samples.map(s => [s.providerRequestId,s]));
for (const row of images) {
  const sample = byId.get(row.response.id);
  assert.ok(sample);
  assert.equal(sample.status,"completed");
  assert.equal(sample.packet.promptVersion, plan.promptVersion);
  assert.equal(sample.promptChars, sample.prompt.length);
  assert.ok(sample.prompt.length <= 8000);
  assert.equal(sample.usageMissing,false);
  assert.equal(sample.preparationUsageMissing,false);
  const content = row.request.messages[0].content;
  const text = typeof content === "string" ? content : content[0].text;
  assert.equal(text,sample.prompt);
  const references = typeof content === "string" ? [] : content.slice(1);
  assert.equal(references.length,sample.packet.references.length);
  assert.ok(references.every(r => r.image_url.url.omittedImageData && r.image_url.url.bytes > 0));
  close(sample.imageCostUsd,row.measuredUsageUsd);
  const full = fullHashes[sample.output];
  const output = row.response.choices[0].message.images[0].image_url.url;
  assert.equal(full.sha256,output.sha256);
  assert.equal(full.bytes,output.bytes);
  assert.equal(hash(await bytes(sample.output)),full.sha256);
  const after = postflight.packets.find(p => p.caseId === sample.caseId && p.styleId === sample.settings.style && p.n === sample.n);
  assert.equal(hash(sample.prompt),after.promptSha256);
  assert.deepEqual(sample.packet,after.packet);
  if (["genesis-1-3-light","isaiah-6-2-seraphim","revelation-4-6-living-creatures"].includes(sample.caseId)) {
    assert.ok(sample.prompt.includes("FORMLESS SUBJECTS"));
    assert.ok(sample.prompt.includes("even faceless or made of light"));
    assert.ok(after.formless.length > 0);
  }
  if (sample.caseId === "daniel-7-9-ancient-of-days") {
    // Retained failed candidate: the regenerated plan omitted the no-form entry from present.
    assert.ok(!sample.prompt.includes("FORMLESS SUBJECTS"));
    assert.ok(!sample.packet.canon.some(c=>c.entryId==="the_ancient_of_days"));
    assert.deepEqual(after.formless,[]);
    assert.ok(sample.prompt.includes("formless divine presence"));
    assert.ok(sample.prompt.includes("no body, hair or garments"));
  }
  if (sample.caseId === "2-kings-2-23-bears") {
    assert.ok(sample.prompt.includes("a bald head"));
    assert.ok(!sample.prompt.includes("short dark hair"));
  }
}
assert.equal(Object.keys(fullHashes).length,72);
for (const sample of samples.filter(s => s.caseId === "2-kings-2-23-bears")) assert.equal(sample.packet.canon.find(c => c.entryId === "elisha_son_of_shaphat").version, readback.rows.find(r => r.kind === "entry").version);
for (const sample of samples.filter(s => s.caseId === "daniel-7-9-ancient-of-days")) assert.equal(sample.packet.lookVersion, readback.rows.find(r => r.kind === "look").version);
assert.equal(plan.unchangedControlPromptParity.length,18);
for (const parity of plan.unchangedControlPromptParity) assert.equal(hash(state.samples[parity.key].prompt),parity.sha256);
const reviews = await json("image-reviews.json");
const scores = await json("scores.json");
assert.deepEqual(reviews.images.map(r=>r.output).sort(),samples.map(s=>s.output).sort());
assert.equal(reviews.images.length,72);
assert.equal(scores.rows.length,24);
assert.equal(reviews.images.filter(r=>r.fullResolutionInspected).length,summary.fullResolutionInspected);
for (const [field,expected] of [["formlessDepictionVerdict",summary.formlessDepiction],["paperMarginVerdict",summary.watercolorMargins],["baldnessVerdict",summary.baldness]]) {
  const actual = {};
  for (const row of reviews.images.filter(r=>r[field])) actual[row[field]] = (actual[row[field]] ?? 0) + 1;
  for (const [verdict,count] of Object.entries(expected)) assert.equal(actual[verdict] ?? 0,count);
  assert.equal(Object.values(actual).reduce((sum,count)=>sum+count,0),Object.values(expected).reduce((sum,count)=>sum+count,0));
}
const blockPresentReviews = reviews.images.filter(r => samples.find(s => s.output === r.output).prompt.includes("FORMLESS SUBJECTS"));
assert.equal(blockPresentReviews.length, summary.formlessContractCoverage.blockPresent);
for (const [verdict, count] of Object.entries(summary.blockPresentDepiction)) {
  assert.equal(blockPresentReviews.filter(r => r.formlessDepictionVerdict === verdict).length, count);
}
assert.equal(Object.values(summary.blockPresentDepiction).reduce((sum, count) => sum + count, 0), blockPresentReviews.length);
for (const style of plan.styles) for (const [verdict,count] of Object.entries(summary.caseVerdicts[style])) assert.equal(scores.rows.filter(r=>r.arm===`generic:${style}` && r.verdict===verdict).length,count);
for (const row of scores.rows) {
  assert.ok(["pass","accepted limitation","fail"].includes(row.verdict));
  assert.deepEqual(row.outputs.toSorted(), samples.filter(s=>s.caseId===row.caseId && s.arm===row.arm).map(s=>s.output).toSorted());
  assert.ok(["relevance","identity","continuity","style","artifacts"].every(d=>[0,1,2].includes(row[d])));
}
const report = await json("report.json.gz");
const raw = await json("report.raw.json.gz");
assert.deepEqual({...report,reproducibility:raw.reproducibility},raw);
assert.equal(report.reproducibility.promptVersion,plan.promptVersion);
close(summary.budgets.evaluationMeasuredUsd,plan.evaluationMeasuredBeforeUsd+measured);
close(summary.budgets.evaluationUncertaintyUsd,plan.evaluationUncertaintyBeforeUsd);
close(summary.budgets.evaluationRemainingUsd,16-summary.budgets.evaluationMeasuredUsd-summary.budgets.evaluationUncertaintyUsd);
for (const bucket of ["preparationMeasuredUsd","preparationUncertaintyUsd","smokeMeasuredUsd"]) close(summary.budgets[bucket],previous.budgets[bucket]);
assert.equal(summary.publicActivation,false);
assert.equal(summary.humanAccepted,false);
const executed = gunzipSync(await bytes("run.executed.mts.gz")).toString();
assert.equal(executed.replace('/^data:([^;]+);base64,(.*)$/s','/^data:([^;]+);base64,([\\s\\S]*)$/'),(await bytes("run.mts")).toString());
console.log(`Verified ${Object.keys(hashes).length} artifact hashes, 72 source images, ${trace.length} provider responses, owner correction lineage, unchanged controls and separate budgets. Human acceptance is pending.`);
