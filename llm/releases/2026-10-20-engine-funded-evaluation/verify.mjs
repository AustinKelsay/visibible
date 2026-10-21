/** Offline evidence, lineage and accounting verification; no model or deployment calls. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = fileURLToPath(new URL("./", import.meta.url));
const root = path.resolve(dir, "../../..");
const bytes = (file) => readFile(path.join(dir, file));
const text = async (file) => (await bytes(file)).toString();
const json = async (file) => JSON.parse(file.endsWith(".gz") ? gunzipSync(await bytes(file)).toString() : await text(file));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const traces = async (file) => gunzipSync(await bytes(file)).toString().trim().split("\n").map(JSON.parse);
const list = async (folder = "") => (await Promise.all((await readdir(path.join(dir, folder), { withFileTypes: true })).map(async (entry) => {
  const file = path.join(folder, entry.name);
  return entry.isDirectory() ? list(file) : [file];
}))).flat();
const hashes = await json("sha256.json");
assert.deepEqual(Object.keys(hashes).sort(), (await list()).filter((f) => f !== "sha256.json").sort());
for (const [file, expected] of Object.entries(hashes)) assert.equal(hash(await bytes(file)), expected, file);

const source = JSON.parse(await readFile(path.join(root, "llm/releases/2026-10-20-watercolor-edge-check/summary.json"), "utf8"));
const summary = await json("summary.json");
const plan = await json("matrix-resume-plan.json");
const originalPlan = JSON.parse(await readFile(path.join(root, "llm/releases/2026-10-20-engine-production/candidate-budget-plan.json"), "utf8"));
const cases = await json("cases.json");
assert.equal(cases.cases.length, 36);
assert.equal(hash(await bytes("cases.json")), hash(await readFile(path.join(root, "llm/releases/2026-10-20-engine-production/candidate/cases.json"))));
close(plan.evaluationMeasuredBeforeUsd, source.evaluationMeasuredUsd + summary.trial.measuredUsd);
assert.ok(plan.maximumEvaluationAfterBothCapsAndUncertaintyUsd <= source.evaluationAuthorizedUsd);
assert.equal(plan.publicActivation, false);
const preflight = await json("matrix-preflight.json.gz");
assert.equal(preflight.paidCalls, 0);
assert.equal(preflight.actualMutations, 0);
assert.equal(preflight.packets.length, 210);
assert.equal(preflight.failures.length, 6);
assert.ok(preflight.failures.every((f) => f.caseId === "2-kings-2-23-bears" && f.reason === "preparation"));

let measuredNewUsd = 0;
const fullResolution = await json("full-resolution-output-sha256.json");
assert.equal(Object.keys(fullResolution).length, 225);
const models = new Set();
for (const style of ["watercolor-trial", "classical", "icon"]) {
  const state = await json(`${style}/state.json.gz`);
  const rows = await traces(`${style}/provider.ndjson.gz`);
  const samples = Object.values(state.samples);
  const imageRows = rows.filter((r) => r.request.modalities?.includes("image"));
  const preparationRows = rows.filter((r) => !r.request.modalities?.includes("image"));
  const scored = await json(`${style}/scores.json`);
  const reviews = await json(`${style}/image-reviews.json`);
  const dryManifest = await json(`${style}/manifest.dry-run.json`);
  assert.deepEqual(reviews.images.map((r) => r.output).sort(), samples.map((s) => s.output).sort());
  for (const sample of samples) {
    const recorded = fullResolution[`${style}/${sample.output}`];
    assert.equal(recorded.providerRequestId, sample.providerRequestId);
    assert.equal(recorded.run, state.run);
    assert.ok(recorded.bytes > 0);
  }
  assert.ok(rows.every((r) => r.status === 200 && r.measuredUsageUsd !== null && !r.uncertainUsage));
  assert.equal(state.stopped, undefined);
  assert.ok(samples.every((s) => s.status === "completed" && s.packet.promptVersion === "2026-10-20-generic-v2"));
  close(samples.reduce((sum, s) => sum + s.imageCostUsd + s.plannerCostUsd + (s.preparationCostUsd ?? 0) + (s.priorCostUsd ?? 0) + (s.priorPreparationCostUsd ?? 0), 0), state.spentUsd);
  const raw = await json(`${style}/report.raw.json${style === "watercolor-trial" ? "" : ".gz"}`);
  const derived = await json(`${style}/report.json${style === "watercolor-trial" ? "" : ".gz"}`);
  close(raw.spentUsd, state.spentUsd);
  const { reproducibility: rawVersion, ...rawMeasurements } = raw;
  const { reproducibility: derivedVersion, ...derivedMeasurements } = derived;
  assert.deepEqual(rawMeasurements, derivedMeasurements);
  assert.equal(rawVersion.promptVersion, "2026-09-08-canonical");
  assert.equal(derivedVersion.promptVersion, "2026-10-20-generic-v2");
  const sampleById = new Map(samples.map((s) => [s.providerRequestId, s]));
  assert.equal(new Set(rows.map((r) => r.response.id)).size, rows.length);
  for (const row of rows) {
    models.add(row.response.model);
    close(row.response.usage.cost, row.measuredUsageUsd);
    assert.equal(row.request.model, row.request.modalities?.includes("image") ? "google/gemini-3.1-flash-lite-image" : "anthropic/claude-haiku-5.5");
    assert.ok(!JSON.stringify(row).includes('"user_id"'));
  }
  for (const row of imageRows) {
    const sample = sampleById.get(row.response.id);
    assert.ok(sample, row.response.id);
    close(sample.imageCostUsd, row.measuredUsageUsd);
    const content = row.request.messages[0].content;
    const prompt = typeof content === "string" ? content : content[0].text;
    assert.equal(prompt, sample.prompt);
    const references = typeof content === "string" ? [] : content.slice(1);
    assert.equal(references.length, sample.packet.references.length);
    assert.ok(references.every((r) => r.image_url.url.omittedImageData && r.image_url.url.bytes > 0 && /^[a-f0-9]{64}$/.test(r.image_url.url.sha256)));
    const output = row.response.choices[0].message.images[0].image_url.url;
    assert.equal(output.omittedImageData, true);
    const recorded = fullResolution[`${style}/${sample.output}`];
    assert.equal(recorded.sha256, output.sha256);
    assert.equal(recorded.bytes, output.bytes);
  }
  const measured = rows.reduce((sum, r) => sum + r.measuredUsageUsd, 0);
  const recordedSummary = summary.runs[style];
  close(recordedSummary.newMeasuredUsd, measured);
  close(recordedSummary.cumulativeRunMeasuredUsd, state.spentUsd);
  close(recordedSummary.newPreparationMeasuredUsd, preparationRows.reduce((sum, r) => sum + r.measuredUsageUsd, 0));
  assert.equal(recordedSummary.newImageCalls, imageRows.length);
  assert.equal(recordedSummary.newPreparationCalls, preparationRows.length);
  for (const verdict of ["pass", "accepted limitation", "fail"]) assert.equal(recordedSummary.scoreVerdicts[verdict], scored.rows.filter((r) => r.verdict === verdict).length);
  for (const row of scored.rows) {
    assert.ok(["pass", "accepted limitation", "fail"].includes(row.verdict));
    assert.deepEqual([...row.outputs].sort(), samples.filter((s) => s.caseId === row.caseId).map((s) => s.output).sort());
    assert.ok(["relevance", "identity", "continuity", "style", "artifacts"].every((d) => [0, 1, 2].includes(row[d])));
  }
  measuredNewUsd += measured;
  if (style === "watercolor-trial") {
    assert.deepEqual(dryManifest, await json(`${style}/manifest.before.json`));
    assert.equal(dryManifest.doneCalls, 0);
    assert.equal(dryManifest.plannedCalls, 9);
    assert.equal(dryManifest.withinBudget, dryManifest.estimatedUsd <= dryManifest.budgetUsd);
    assert.equal(samples.length, 9);
    assert.equal(imageRows.length, 9);
    assert.equal(preparationRows.length, 0);
    close(measured, state.spentUsd);
    assert.ok(measured <= 0.35);
    const version = hash(await bytes(`${style}/style.json`));
    assert.ok(samples.every((s) => s.packet.styleVersion === version && s.preparationCalls === 0 && !s.packet.references.some((r) => r.kind === "styleReference")));
    for (const s of samples) assert.equal(hash(await bytes(`${style}/${s.output}`)), fullResolution[`${style}/${s.output}`].sha256);
    assert.equal(reviews.images.length, 9);
    assert.equal(reviews.images.filter((r) => r.marginVerdict === "fail").length, 8);
    assert.equal(reviews.images.filter((r) => r.marginVerdict === "review").length, 1);
    assert.ok((await json(`${style}/scores.json`)).rows.every((r) => r.verdict === "fail"));
  } else {
    const originalStylePlan = originalPlan.styles.find((r) => r.style === style);
    assert.deepEqual(dryManifest, await json(`${style}/manifest.before.json.gz`));
    assert.equal(dryManifest.doneCalls, 9);
    assert.equal(dryManifest.plannedCalls, 99);
    assert.equal(dryManifest.withinBudget, originalStylePlan.seedSpendUsd + dryManifest.estimatedUsd <= dryManifest.budgetUsd);
    const before = await json(`${style}/state.before.json.gz`);
    const resume = preflight.resumes.find((r) => r.styleId === style);
    close(resume.cumulativeCapUsd, originalPlan.styles.find((r) => r.style === style).commandRunCapUsd);
    close(resume.previousSpentUsd, before.spentUsd);
    assert.equal(hash(gunzipSync(await bytes(`${style}/state.before.json.gz`))), resume.stateSha256);
    assert.deepEqual(resume.mismatches, []);
    assert.equal(samples.length, 108);
    assert.equal(imageRows.length, resume.newSamples);
    assert.ok(preparationRows.length <= 2);
    for (const [key, sample] of Object.entries(before.samples)) if (sample.status === "completed") assert.deepEqual(state.samples[key], sample, key);
    close(state.spentUsd - before.spentUsd, measured);
    assert.ok(state.spentUsd <= resume.cumulativeCapUsd);
    assert.deepEqual(scored.rows.map((r) => r.caseId).sort(), cases.cases.map((c) => c.id).sort());
    for (const caseId of ["daniel-7-9-ancient-of-days", "isaiah-6-2-seraphim", "2-kings-2-23-bears"]) assert.equal(scored.rows.find((r) => r.caseId === caseId).verdict, "fail");
    for (const exhibit of (await list(`${style}/exhibits`))) {
      const name = path.basename(exhibit, ".jpg");
      const repeat = Number(name.slice(name.lastIndexOf("-") + 1));
      const caseId = name.slice(0, name.lastIndexOf("-"));
      const sample = samples.find((s) => s.caseId === caseId && s.n === repeat);
      assert.ok(sample, exhibit);
      assert.equal(hash(await bytes(exhibit)), fullResolution[`${style}/${sample.output}`].sha256);
      assert.equal(reviews.images.find((r) => r.output === sample.output).fullResolutionInspected, true);
    }
  }
}
close(summary.newMeasuredUsd, measuredNewUsd);
close(summary.budgets.evaluationMeasuredUsd, source.evaluationMeasuredUsd + measuredNewUsd);
close(summary.budgets.evaluationUncertaintyUsd, source.evaluationUncertaintyUsd);
close(summary.budgets.evaluationRemainingUsd, 16 - summary.budgets.evaluationMeasuredUsd - summary.budgets.evaluationUncertaintyUsd);
close(summary.budgets.preparationMeasuredUsd, source.preparationMeasuredUsd);
close(summary.budgets.smokeMeasuredUsd, source.smokeMeasuredUsd);
assert.ok(summary.budgets.evaluationRemainingUsd >= 0);
assert.equal(summary.publicReleaseDecision, "retain baseline; disabled; Watercolor correction failed and human gates remain pending");
assert.equal(models.size, 2);
console.log(`Verified ${Object.keys(hashes).length} artifact hashes, nine rejected-trial images, 182 resumed images, exact retained-sample lineage, provider usage and the separate budget buckets.`);
