/** Supplements the frozen replay with operator-score bookkeeping and the final artifact manifest. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import "./verify.mjs";
import { dir, hash, json, root } from "./common.mjs";
import { fixture } from "./scenarios.mjs";

for (const [name, sha] of Object.entries(json("sha256.json").files)) assert.equal(hash(fs.readFileSync(path.join(root, name))), sha, name);
const results = fs.readFileSync(path.join(dir, "results.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line)).filter((r) => r.kind === "pipeline");
const scores = json("operator-scores.json");
assert.equal(scores.rows.length, results.length);
assert.equal(new Set(scores.rows.map((s: { id: string }) => s.id)).size, results.length);
const summary = { pipelines: results.length, stored: 0, refused: 0, unselectedNoFormStored: 0, unsupportedNoFormStored: 0, otherFlawedStored: 0, acceptableStored: 0 };
for (const result of results) {
  const score = scores.rows.find((s: { id: string }) => s.id === result.id);
  assert.ok(score && typeof score.notes === "string" && score.notes.trim());
  assert.equal(score.stored, result.result.outcome === "stored");
  assert.ok(Array.isArray(score.otherFlaws) && Array.isArray(score.planQuotes));
  if (!score.stored) {
    summary.refused++; assert.equal(score.noFormCanonGap, null); assert.equal(score.unsupportedNoForm, null);
    assert.equal(score.otherFlaws.length, 0); assert.equal(score.planQuotes.length, 0); continue;
  }
  summary.stored++;
  assert.equal(typeof score.noFormCanonGap, "boolean"); assert.equal(typeof score.unsupportedNoForm, "boolean");
  const text = Object.values(result.result.stored.payload.plan).join("\n");
  for (const quote of score.planQuotes) assert.ok(typeof quote === "string" && quote.trim() && text.includes(quote), `${score.id}: quote absent from scene fields`);
  if (score.noFormCanonGap || score.unsupportedNoForm || score.otherFlaws.length) assert.ok(score.planQuotes.length);
  if (score.sourceQuote) assert.ok(fixture(result.sample).context.moment.text.includes(score.sourceQuote));
  if (score.noFormCanonGap) summary.unselectedNoFormStored++;
  if (score.unsupportedNoForm) summary.unsupportedNoFormStored++;
  if (score.otherFlaws.length) summary.otherFlawedStored++;
  if (!score.noFormCanonGap && !score.unsupportedNoForm && !score.otherFlaws.length) summary.acceptableStored++;
}
assert.deepEqual(summary, scores.summary);
const tally = json("tally.json");
assert.equal(scores.reviewGatePassed, tally.candidateCaught === 12 && tally.controlFalseAlarms === 0 && tally.controlReviews === 9);
assert.equal(scores.fullPipelineGatePassed, summary.acceptableStored === 21);
console.log(JSON.stringify({ scoreBookkeeping: true, operatorScoringIsNotBlind: true, ...summary, reviewGatePassed: scores.reviewGatePassed, fullPipelineGatePassed: scores.fullPipelineGatePassed }));
