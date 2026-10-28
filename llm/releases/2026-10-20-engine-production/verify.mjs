import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const dir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(dir, "../../..");
const bytes = (path) => readFileSync(join(dir, path));
const json = (path) => JSON.parse(path.endsWith(".gz") ? gunzipSync(bytes(path)) : bytes(path));
const sum = (values) => values.reduce((total, value) => total + value, 0);
const equalUsd = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((item) => {
    const full = join(path, item.name);
    return item.isDirectory() ? files(full) : [full];
  });
}

const hashes = json("sha256.json");
const actualFiles = files(dir).map((file) => relative(dir, file)).filter((file) => file !== "sha256.json").sort();
assert.deepEqual(Object.keys(hashes).sort(), actualFiles);
for (const [path, hash] of Object.entries(hashes)) {
  assert.equal(createHash("sha256").update(bytes(path)).digest("hex"), hash, path);
  if (/\.json(?:\.gz)?$/.test(path)) json(path);
  if (path.endsWith(".ndjson.gz")) {
    for (const line of gunzipSync(bytes(path)).toString().trim().split("\n")) JSON.parse(line);
  }
}

const workPath = join(repo, "works/bible-web/work.json");
assert.ok(existsSync(workPath), "Run npm run works:import first (offline; no model calls).");
const work = JSON.parse(readFileSync(workPath));
const units = new Map();
function visit(divisions, prefix = []) {
  for (const division of divisions) {
    const path = [...prefix, division.key];
    for (const unit of division.units ?? []) {
      const id = [...path, unit.number].join("-");
      assert.ok(!units.has(id), `Duplicate imported unit ${id}`);
      units.set(id, { text: unit.text, book: path[0], order: units.size });
    }
    visit(division.divisions ?? [], path);
  }
}
visit(work.divisions);
assert.equal(units.size, 31102);
const reading = json("bible-reading.json.gz");
assert.equal(createHash("sha256").update(readFileSync(workPath)).digest("hex"), reading.workVersion);
const canon = json("bible-canon-generated.json.gz");
const entries = json("bible-effective-entries.json.gz");
const sections = json("bible-effective-sections.json.gz");
assert.equal(entries.length, 1569);
assert.equal(sections.length, 2790);
const sectionMap = new Map(sections.map((section) => [section.recordId, section]));
const momentIds = new Set();
for (const moment of Object.values(reading.moments).flat()) {
  assert.equal(moment.firstUnitId, moment.lastUnitId);
  assert.ok(!momentIds.has(moment.firstUnitId));
  momentIds.add(moment.firstUnitId);
  const unit = units.get(moment.firstUnitId);
  const section = sectionMap.get(moment.sectionId)?.payload;
  assert.ok(unit && section, moment.firstUnitId);
  const first = units.get(section.firstUnit);
  const last = units.get(section.lastUnit);
  assert.equal(unit.book, first?.book);
  assert.equal(unit.book, last?.book);
  assert.ok(first.order <= unit.order && unit.order <= last.order, moment.firstUnitId);
}
assert.deepEqual([...momentIds].sort(), [...units.keys()].sort());
const corrections = json("bible-owner-corrections.json");
const applied = json("bible-owner-corrections-proof.json");
const followup = json("bible-owner-followup.json");
const followupApplied = json("bible-owner-followup-proof.json");
const samaria = json("bible-samaria-followup.json");
const samariaApplied = json("bible-samaria-followup-proof.json");
assert.equal(corrections.corrections.length, 165);
assert.equal(applied.results.length, 165);
assert.equal(followup.corrections.length, 10);
assert.equal(followupApplied.results.length, 10);
assert.equal(samaria.corrections.length, 3);
assert.equal(samariaApplied.results.length, 3);
for (const [plan, proof] of [[corrections, applied], [followup, followupApplied], [samaria, samariaApplied]]) {
  assert.equal(createHash("sha256").update(JSON.stringify(plan)).digest("hex"), proof.planSha256);
  for (const source of plan.sources) assert.equal(units.get(source.unit)?.text, source.quote);
}
const effective = new Map([...entries, ...sections].map((record) => [`${record.kind}:${record.recordId}`, record]));
const latest = new Map([...corrections.corrections, ...followup.corrections, ...samaria.corrections].map((correction) => [`${correction.kind}:${correction.recordId}`, correction]));
for (const correction of latest.values()) {
  const record = effective.get(`${correction.kind}:${correction.recordId}`);
  assert.equal(record.source, "owner");
  assert.deepEqual(record.payload, correction.payload);
  const result = [...samariaApplied.results, ...followupApplied.results, ...applied.results].find((result) => result.kind === record.kind && result.recordId === record.recordId);
  assert.equal(record.version, result?.version);
}
const beforeSections = new Map(json("bible-effective-sections.before-followup.json.gz").map((record) => [record.recordId, record]));
for (const correction of followup.corrections) {
  assert.deepEqual(beforeSections.get(correction.recordId)?.payload, correction.before);
  assert.equal(beforeSections.get(correction.recordId)?.version, correction.beforeVersion);
}
const beforeSamariaEntries = new Map(json("bible-effective-entries.before-samaria.json.gz").map((record) => [record.recordId, record]));
for (const correction of samaria.corrections) {
  const before = (correction.kind === "entry" ? beforeSamariaEntries : beforeSections).get(correction.recordId);
  assert.deepEqual(before?.payload, correction.before);
  assert.equal(before?.version, correction.beforeVersion);
}
const expectedMembers = new Set(Object.entries(reading.readings).flatMap(([book, result]) => [
  ...result.characters.map((entry) => `${book}:character:${entry.id}`),
  ...result.locations.map((entry) => `${book}:location:${entry.id}`),
]));
const memberOwners = new Map();
for (const entry of entries) {
  for (const member of entry.payload.members) {
    assert.ok(!memberOwners.has(member), `Duplicate source member ${member}`);
    memberOwners.set(member, entry.recordId);
  }
}
assert.equal(memberOwners.size, 2362);
assert.deepEqual([...memberOwners.keys()].sort(), [...expectedMembers].sort());
assert.equal(memberOwners.get("ezra:location:samaria"), "samaria_city");
assert.equal(memberOwners.get("acts:location:samaria"), "samaria_city");
assert.equal(memberOwners.get("luke:location:samaria"), "samaria_region");
assert.ok(sectionMap.get("ezra-4-1").payload.cast.some((cast) => cast.entryId === "samaria_city" && cast.stageId === "samaria_hill_city"));
const live = json("bible-live-audit.json");
assert.equal(live.status.ready, true);
assert.equal(live.allIdsPresent, true);
assert.deepEqual(live.problems, []);
assert.equal(live.godHasForm, false);
assert.equal(live.ownerCorrectionOperations, 178);
assert.equal(live.ownerCorrections, 168);
assert.ok(bytes("README.md").toString().includes(reading.workVersion));

const states = ["classical", "watercolor", "icon"].map((style) => json(`candidate/${style}/state.json.gz`));
const samples = states.flatMap((state) => Object.values(state.samples));
assert.equal(samples.length, 324);
assert.equal(new Set(samples.map((sample) => `${sample.caseId}/${sample.arm}/${sample.n}`)).size, 324);
assert.equal(samples.filter((sample) => sample.status === "completed").length, 54);
const failures = samples.filter((sample) => sample.status === "failed");
assert.equal(failures.length, 270);
assert.ok(failures.every((sample) => sample.stage === "image" && sample.error.includes("OpenRouter 402") && sample.imageCostUsd === 0));
assert.ok(samples.every((sample) => sample.prompt && sample.packet.promptVersion === "2026-10-20-generic-v2"));
const seedKeys = states.flatMap((state) => Object.entries(state.samples).filter(([, sample]) => sample.work === "holmes-adventures").map(([key]) => key));
assert.equal(seedKeys.length, 27);
assert.equal(new Set(seedKeys).size, 27);
const comparison = json("candidate/comparison.json").rows;
assert.equal(comparison.length, 108);
assert.equal(new Set(comparison.map((row) => `${row.caseId}/${row.style}`)).size, 108);
assert.ok(comparison.every((row) => ["classical", "watercolor", "icon"].includes(row.style)));
for (const style of ["classical", "watercolor", "icon"]) {
  for (const row of json(`candidate/${style}/scores.json`).rows) {
    assert.ok(row.completion !== "inconclusive" || row.verdict === null || row.verdict === "fail");
  }
  const raw = json(`candidate/${style}/report.raw.json`);
  const derived = json(`candidate/${style}/report.json`);
  assert.equal(derived.reproducibility.promptVersion, "2026-10-20-generic-v2");
  derived.reproducibility.promptVersion = derived.derivation.rawRunHeaderPromptVersion;
  delete derived.derivation;
  assert.deepEqual(derived, raw);
}
assert.equal(json("candidate/reproducibility.json").actualPromptVersion, samples[0].packet.promptVersion);
const correctedPlan = json("owner-check-plan.corrected.json");
assert.deepEqual(correctedPlan.cold.map((row) => `${row.unitId}/${row.style}`).sort(), correctedPlan.warm.map((row) => `${row.unitId}/${row.style}`).sort());
assert.equal(new Set(correctedPlan.warm.map((row) => `${row.unitId}/${row.style}`)).size, 10);

const accounting = json("owner-accounting.json");
assert.equal(accounting.credits, 90);
assert.equal(accounting.history.length, 11);
assert.equal(sum(accounting.history.map((entry) => entry.delta)), accounting.credits);
assert.equal(accounting.images.length, 2);
for (const image of accounting.images) {
  assert.equal(image.saved.verseText, units.get(image.saved.verseId)?.text);
  assert.equal(image.saved.translationId, "web");
  assert.equal(image.saved.requestTranslationId, "kjv");
  assert.equal(image.saved.engine, "generic");
  assert.equal(image.saved.provenance.analysisGeneration, 1);
}
const generationIds = new Set(accounting.history.filter((entry) => entry.generationId).map((entry) => entry.generationId));
assert.equal(generationIds.size, 4);
assert.equal(accounting.history.filter((entry) => entry.reason === "generation").length, 2);
for (const id of generationIds) {
  const ledger = accounting.history.filter((entry) => entry.generationId === id);
  assert.equal(ledger.filter((entry) => entry.reason === "reservation").length, 1);
  assert.equal(ledger.filter((entry) => entry.reason === "refund").length, 1);
  assert.equal(sum(ledger.filter((entry) => entry.reason !== "generation").map((entry) => entry.delta)), 0);
  assert.ok(sum(ledger.map((entry) => entry.delta)) === 0 || sum(ledger.map((entry) => entry.delta)) === -5);
}
const smoke = json("owner-browser.json").state;
const budget = json("budget-summary.json");
const historical = resolve(dir, "../2026-10-20-engine-evaluation");
const previousEval = sum(["baseline", "holmes", "watercolor-trial"].map((run) => JSON.parse(readFileSync(join(historical, run, "state.json"))).spentUsd));
equalUsd(previousEval + sum(states.map((state) => state.spentUsd)), budget.measuredUsd.allEvaluation);
const evalPreparation = sum(samples.map((sample) => sample.preparationCostUsd ?? 0));
equalUsd(evalPreparation, budget.evaluationPartsUsd.scenePreparationIncludedInV2);
const prepLedgers = [reading, canon, json("holmes-reading.json.gz"), json("holmes-canon-generated.json.gz")];
const prepTotal = sum(prepLedgers.map((state) => sum(state.ledger.map((entry) => entry.costUsd)))) + json("bible-references.json").spentUsd + json("holmes-references.json").spentUsd + accounting.preparation.costUsd - evalPreparation;
equalUsd(prepTotal, budget.measuredUsd.preparation);
equalUsd(sum(smoke.rows.map((row) => row.response.openRouterUsageUsd ?? 0)), budget.measuredUsd.ownerSmoke);
for (const bucket of Object.keys(budget.authorizedUsd)) {
  equalUsd(budget.authorizedUsd[bucket] - budget.measuredUsd[bucket] - budget.uncertaintyAllowancesUsd[bucket], budget.remainingAfterAllowancesUsd[bucket]);
  assert.ok(budget.remainingAfterAllowancesUsd[bucket] >= 0);
}
assert.equal(json("owner-bulk-complete.json").job.engine, "generic");
assert.equal(json("owner-bulk-complete.json").job.totalCreditsUsed, 10);
assert.equal(json("replay-disabled.json").replay.sameImage, true);
assert.equal(json("replay-disabled.json").replay.status, 200);
assert.equal(json("disabled-configuration.json").mode, "disabled");
assert.equal(json("disabled-configuration.json").ownerSessionConfigured, false);
assert.equal(json("disabled-deployment-final.json").readyState, "READY");
assert.equal(json("disabled-alias-final.json").id, json("disabled-deployment-final.json").id);
for (const models of [json("disabled-public-models.json").models, json("replay-csrf-rejected.json").models]) {
  assert.ok(models.artStyles.filter((style) => style.id !== "classical").every((style) => !style.available));
}
console.log(`Verified ${actualFiles.length} artifact hashes; all 31,102 moment IDs/spans and 2,362 source cast placements; 178 corrections across 168 records; 54 completed/270 failed candidate samples; explicit comparison styles and inconclusive scores; two settled images, two refunds, replay and disabled admission; all three budget buckets.`);
