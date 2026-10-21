/** Offline verification only: no credentials, provider calls or production mutations. */
import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { buildRenderingPacket, type AvailableReference, type SelectedCanon } from "../../../src/lib/engine/prompt";
import type { EvalSample } from "../../../src/lib/image-evals/runner";
import type { assemblePacket } from "../2026-10-21-daniel-schema-pilot/packets.mjs";

type StoredPacket = Awaited<ReturnType<typeof assemblePacket>> & { omitStyleReference: boolean };
type StoredReview = { mode: string; styleId: string; output: string; fullResolutionInspected: boolean; humanLikenessAccepted: boolean; [field: string]: unknown };

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const hash = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
const json = async (file: string) => JSON.parse(await readFile(path.join(dir, file), "utf8"));
const zippedJson = async (file: string) => JSON.parse(gunzipSync(await readFile(path.join(dir, file))).toString());
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const plan = await json("plan.json"), before = await json("before.json"), after = await json("after.json");
const execution = await json("execution.json"), summary = await json("summary.json"), reviews = await json("image-reviews.json");
assert.equal(plan.evaluationAuthorizedUsd, 16.50);
assert.equal(plan.combinedCapUsd, 0.50);
assert.equal(plan.publicActivation, false);
assert.equal(before.authorizationPending, false);
assert.deepEqual(before.records, after.records);
assert.deepEqual(before.packets, after.packets);
assert.deepEqual(before.sourceFiles, after.sourceFiles);
for (const [file, expected] of Object.entries(before.sourceFiles)) assert.equal(hash(await readFile(path.join(root, file))), expected, `Historical source mismatch: ${file}`);
for (const snapshot of [before, after]) {
  assert.equal(snapshot.paidCalls, 0);
  assert.equal(snapshot.mutations, 0);
  assert.ok(snapshot.publicCatalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
}
const trace = gunzipSync(await readFile(path.join(dir, "provider.ndjson.gz"))).toString().trim().split("\n").map((line) => JSON.parse(line));
assert.equal(trace.length, 12);
assert.equal(new Set(trace.map((r) => `${r.mode}:${r.label}`)).size, 12);
assert.equal(execution.imageCalls, 12);
assert.equal(execution.preparationCalls, 0);
assert.equal(execution.productionMutations, 0);
assert.equal(execution.uncertainUsd, 0);
assert.equal(execution.blocked, null);
assert.deepEqual(execution.paidLabels, trace.map((r) => `${r.mode}:${r.label}`));
assert.equal(reviews.images.length, 12);
assert.equal(reviews.humanAccepted, false);
const inputs = await readWorkInputs("bible-web", root);
let totalUsd = 0;
const dimensions = [];
for (const mode of ["normal", "omitted"]) {
  const state = await zippedJson(`${mode}/state.json.gz`);
  const report = await zippedJson(`${mode}/report.json.gz`);
  const dry = await json(`manifest.${mode}.json`);
  const scores = await json(`${mode}/scores.json`);
  assert.equal(state.omitStyleReference, mode === "omitted");
  assert.equal(report.reproducibility.omitStyleReference, mode === "omitted");
  assert.equal(state.run, plan.runs[mode]);
  assert.equal(dry.plannedCalls, 6);
  assert.equal(dry.doneCalls, 0);
  assert.equal(dry.withinBudget, true);
  assert.equal(dry.omitStyleReference, mode === "omitted");
  assert.ok(scores.rows.every((r: { verdict: string; continuity: unknown }) => r.verdict === "fail" && r.continuity === null));
  let runUsd = 0;
  for (const sample of Object.values(state.samples) as EvalSample[]) {
    assert.ok(sample.prompt && sample.packet && sample.quote && sample.output);
    const styleId = sample.arm.split(":")[1];
    const saved = (before.packets as StoredPacket[]).find((p) => p.omitStyleReference === (mode === "omitted") && p.styleId === styleId && p.n === sample.n);
    assert.ok(saved);
    assert.equal(sample.status, "completed");
    assert.equal(sample.preparationCalls, 0);
    assert.equal(sample.preparationCostUsd, 0);
    assert.equal(sample.usageMissing, false);
    assert.equal(sample.prepared, true);
    assert.equal(sample.prompt, saved.prompt);
    assert.deepEqual(sample.packet, saved.packet);
    const normal = (before.packets as StoredPacket[]).find((p) => !p.omitStyleReference && p.styleId === styleId && p.n === sample.n);
    assert.ok(normal);
    const references: AvailableReference[] = normal.packet.references.map((r) => ({ kind: "styleReference", styleId: r.id, storageId: r.storageId, version: r.version }));
    const style = inputs.styles[styleId];
    const built = buildRenderingPacket({
      work: { id: inputs.work.work.id, title: inputs.work.work.title },
      moment: { ...saved.context.moment, sectionId: saved.packet.sectionId },
      neighbors: { previous: saved.context.previous?.text, next: saved.context.next?.text },
      brief: inputs.brief, briefVersion: inputs.briefVersion, eraId: saved.packet.eraId,
      style: style.style, styleVersion: style.version,
      look: { version: saved.prepared.look.version, ...saved.prepared.look.payload },
      plan: { version: saved.prepared.plan.version, ...saved.prepared.plan.payload },
      canon: saved.canon as SelectedCanon[], references, omitStyleReference: mode === "omitted",
      variationNumber: sample.n > 1 ? sample.n : null, aspectRatio: "16:9",
    });
    assert.ok(built.ok);
    assert.equal(built.prompt, sample.prompt);
    assert.deepEqual(built.packet, sample.packet);
    if (mode === "omitted") assert.equal(sample.prompt, normal.prompt.replace(/\n\nREFERENCE IMAGES[\s\S]*?(?=\n\n)/, ""));
    const call = trace.find((r) => r.mode === mode && r.label === `${sample.caseId}/${sample.arm}/${sample.n}`);
    assert.ok(call);
    assert.equal(call.status, 200);
    assert.equal(call.request.model, plan.imageModel);
    assert.deepEqual(call.request.image_config, { aspect_ratio: "16:9" });
    assert.deepEqual(call.request.modalities, ["image", "text"]);
    const content = call.request.messages[0].content;
    assert.equal(typeof content === "string" ? content : content[0].text, sample.prompt);
    const attachments = typeof content === "string" ? [] : content.slice(1);
    assert.equal(attachments.length, mode === "normal" ? 1 : 0);
    assert.equal(sample.referencesSent, attachments.length);
    assert.equal(sample.quote.referenceImages, attachments.length);
    for (const [i, part] of attachments.entries()) {
      const fixture = styleId === "icon" ? "bible-icon-control.jpg" : "bible-watercolor-3.jpg";
      const bytes = await readFile(path.join(dir, "../2026-10-20-watercolor-edge-check/fixtures", fixture));
      assert.equal(part.image_url.url.sha256, hash(bytes));
      assert.equal(part.image_url.url.bytes, bytes.length);
      assert.equal(part.image_url.url.sha256, saved.references[i].sha256);
    }
    const cost = call.response.usage.cost;
    assert.equal(cost, call.measuredUsageUsd);
    near(sample.imageCostUsd, cost);
    assert.equal(sample.providerRequestId, call.response.id);
    assert.ok(totalUsd + plan.imageReserveUsd <= plan.combinedCapUsd);
    totalUsd += cost; runUsd += cost;
    const file = `${mode}/${sample.output}`;
    const bytes = await readFile(path.join(dir, file));
    const attachment = call.response.choices[0].message.images[0].image_url.url;
    assert.equal(hash(bytes), attachment.sha256);
    assert.equal(bytes.length, attachment.bytes);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, 1376); assert.equal(metadata.height, 768);
    const review = (reviews.images as StoredReview[]).find((r) => r.output === file);
    assert.ok(review?.fullResolutionInspected);
    assert.equal(review.humanLikenessAccepted, false);
    dimensions.push({ file, bytes: bytes.length, sha256: hash(bytes), width: metadata.width, height: metadata.height, measuredUsd: cost });
  }
  assert.equal(Object.keys(state.samples).length, 6);
  near(state.spentUsd, runUsd); near(report.spentUsd, runUsd);
}
near(totalUsd, execution.chargedUsd); near(totalUsd, summary.measuredUsd);
near(before.balanceUsd - after.balanceUsd, totalUsd);
near(summary.evaluation.measuredUsd, plan.evaluationMeasuredBeforeUsd + totalUsd);
near(summary.evaluation.remainingAfterReserveUsd, plan.evaluationAuthorizedUsd - plan.evaluationMeasuredBeforeUsd - totalUsd - plan.evaluationUncertaintyBeforeUsd);
assert.ok(totalUsd <= plan.combinedCapUsd);
assert.deepEqual(summary.separateBucketsUnchanged, plan.separateBucketsUnchanged);
for (const group of summary.groups) {
  const rows = (reviews.images as StoredReview[]).filter((r) => r.mode === group.mode && r.styleId === group.styleId);
  assert.equal(rows.length, 3);
  for (const verdict of ["pass", "review", "fail"]) assert.equal(group.formless[verdict], rows.filter((r) => r.formlessDepictionVerdict === verdict).length);
  for (const [key, field] of [["paperMarginFailures", "paperMarginVerdict"], ["singleSceneFailures", "singleSceneVerdict"], ["fullFrameFailures", "fullFrameVerdict"], ["eraFailures", "eraVerdict"], ["wholeCaseFailures", "wholeCaseVerdict"]]) assert.equal(group[key], rows.filter((r) => r[field] === "fail").length);
  assert.equal(group.groupVerdict, "fail");
}
assert.equal(summary.publicActivation, false); assert.equal(summary.humanAccepted, false);
assert.equal(summary.originalMatrix.completed, 236); assert.equal(summary.originalMatrix.missing, 88);
if (process.argv.includes("--write")) await writeFile(path.join(dir, "dimensions.json"), JSON.stringify(dimensions, null, 2) + "\n");
else assert.deepEqual(await json("dimensions.json"), dimensions);
const artifacts: Record<string, string> = {};
async function scan(folder: string) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (entry.name !== "sha256.json") artifacts[path.relative(dir, file)] = hash(await readFile(file));
  }
}
await scan(dir);
if (process.argv.includes("--write")) await writeFile(path.join(dir, "sha256.json"), JSON.stringify(artifacts, null, 2) + "\n");
else assert.deepEqual(await json("sha256.json"), artifacts);
console.log(`Verified ${Object.keys(artifacts).length} artifact hashes, 12 exact requests/outputs, fixed inputs, all recorded verdict counts, $${totalUsd.toFixed(8)} measured usage and unchanged production records; 0 new calls.`);
