/** Final immutable-artifact audit; semantic scoring is explicitly an operator judgment. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dir, hash, json, root } from "./common.mjs";

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
for (const [name, sha] of Object.entries(json("sha256.json"))) {
  const file = path.resolve(dir, name);
  assert.ok(file.startsWith(root + path.sep));
  assert.equal(hash(fs.readFileSync(file)), sha, name);
}
const freeze = json("frozen-commit.json"), dry = json("dry-run.json");
assert.ok(Date.parse(freeze.committedAt) <= Date.parse(freeze.startedAt));
for (const name of Object.keys(dry.sources).filter((n) => n.startsWith("src/") || n.startsWith("convex/"))) {
  assert.equal(hash(execFileSync("git", ["show", `${freeze.sha}:${name}`], { cwd: root })), dry.sources[name]);
}
await import("./verify.mjs");
const tally = json("tally.json"), finished = json("run-finished.json"), budget = json("budget.json");
assert.equal(finished.operationsCompleted, 53);
assert.equal(finished.stopped, null);
assert.equal(tally.calls, 115);
assert.equal(tally.reviewGate, true);
assert.equal(tally.scoring.pipelineGate, false);
assert.equal(tally.scoring.acceptable, 10);
assert.equal(tally.scoring.flawedStored, 2);
assert.equal(json("operator-scores.json").scores.filter((s: { problems: Array<{ confidence: string }> }) => s.problems.some((p) => p.confidence === "ambiguous")).length, 2);
assert.equal(budget.operationMeasuredUsd, tally.measuredUsd);
assert.ok(Math.abs(budget.evaluation.remainingUsd - 0.0332644) < 1e-10);
const visual = [json("visual-normal-dry-run.json"), json("visual-control-dry-run.json")];
assert.equal(visual.reduce((n, v) => n + v.plannedCalls, 0), 32);
assert.equal(visual.reduce((n, v) => n + v.doneCalls, 0), 0);
assert.ok(Math.abs(visual.reduce((n, v) => n + v.estimatedUsd, 0) - 1.632) < 1e-10);
const refusals = json("refusals.json");
assert.equal(refusals.rows.length, 9);
assert.equal(refusals.selectionEvidenceDisagreement, 4);
console.log(JSON.stringify({ artifactAudit: true, uncertainStores: 2, textGate: "failed", images: 0, productionMutations: 0 }));
