/** Freeze with dry-run, then execute once; all billable calls pass through the persistent cap. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { FORMLESS_PLAN_PROMPT_VERSION, MOMENT_CAST_PROMPT_VERSION } from "../../../src/lib/engine/preparation";
import { PLAN_REVIEW_PROMPT_VERSION } from "../../../src/lib/engine/plan-review";
import { estimateRequestCostUsd, READING_PASS_MODEL, type TextModelRequest } from "../../../src/lib/reading-pass/model";
import { dir, environment, hash, json, save, sources } from "./common.mjs";
import { evaluationModel, plain } from "./model.mjs";
import { baselineDir, operations, perform, plan } from "./scenarios.mjs";

const [command] = process.argv.slice(2);
assert.ok(command === "dry-run" || (command === "run" && process.argv.includes("--execute")));
assert.equal(FORMLESS_PLAN_PROMPT_VERSION, plan.pipeline.formlessPlan);
assert.equal(MOMENT_CAST_PROMPT_VERSION, plan.pipeline.momentCast);
assert.equal(PLAN_REVIEW_PROMPT_VERSION, plan.pipeline.review);
const frozen = () => ({ ...sources(), ...Object.fromEntries([
  ...["common.mts", "model.mts", "scenarios.mts", "run.mts", "verify.mts", "plan.json", "baseline-review-system.txt"].map((n) => path.join(dir, n)),
  ...["sample-set.json", "samples.ndjson"].map((n) => path.join(baselineDir, n)),
].map((file) => [path.relative(dir, file), hash(fs.readFileSync(file))])) });
const check = (r: TextModelRequest) => {
  assert.ok(["section_look", "scene_plan", "plan_review"].includes(r.schemaName));
  assert.equal(r.maxTokens, r.schemaName === "plan_review" ? 4000 : r.schemaName === "scene_plan" ? 2400 : 900);
  assert.equal(r.reasoningEffort ?? "none", r.schemaName === "plan_review" ? "low" : "none");
};
if (command === "dry-run") {
  const first: Record<string, { sha256: string; estimatedUsd: number; schemaName: string }> = {};
  for (const op of operations) {
    await perform(op, { id: READING_PASS_MODEL, complete: async (r) => {
      check(r); first[op.id] ??= { sha256: hash(JSON.stringify(plain(r))), estimatedUsd: estimateRequestCostUsd(r), schemaName: r.schemaName };
      throw Error("dry-run capture");
    } });
    assert.ok(first[op.id]);
  }
  save("dry-run.json", { at: new Date().toISOString(), sources: frozen(), first, paidCalls: 0, productionMutations: 0 });
  console.log(JSON.stringify({ dryRun: true, operations: operations.length, reviews: operations.filter((o) => o.kind === "review").length, pipelines: operations.filter((o) => o.kind === "pipeline").length, paidCalls: 0 }));
} else {
  const dry = json("dry-run.json");
  assert.deepEqual(frozen(), dry.sources);
  assert.ok(!fs.existsSync(path.join(dir, "run-started.json")), "One-shot run already started");
  const env = environment();
  const modelsResponse = await fetch("https://openrouter.ai/api/v1/models"); assert.ok(modelsResponse.ok);
  const pricing = (await modelsResponse.json()).data.find((m: { id: string }) => m.id === READING_PASS_MODEL);
  assert.ok(pricing && Number(pricing.pricing.prompt) === 0.1e-6 && Number(pricing.pricing.completion) === 0.5e-6);
  const creditsResponse = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${env.key}` } }); assert.ok(creditsResponse.ok);
  const credits = await creditsResponse.json();
  const snapshot = { at: new Date().toISOString(), pricing, balanceUsd: credits.data.total_credits - credits.data.total_usage };
  save("run-started.json", { ...snapshot, sources: frozen() });
  const { ledger, forSample } = evaluationModel(snapshot);
  let stopped: string | null = null, completed = 0;
  for (const op of operations) {
    if (ledger.blocked || ledger.uncertainUsd || stopped) break;
    if (ledger.measuredUsd + plan.evaluation.stopBeforeSampleHeadroomUsd > plan.evaluation.capUsd) { stopped = "Headroom limit"; break; }
    const callsBefore = ledger.calls.length;
    const model = forSample(op.id, (r, first) => {
      try { check(r); if (first) assert.equal(hash(JSON.stringify(plain(r))), dry.first[op.id].sha256); }
      catch (e) { stopped = String(e); throw e; }
    });
    const started = Date.now(), result = await perform(op, model);
    fs.appendFileSync(path.join(dir, "results.ndjson"), JSON.stringify({ ...op, calls: ledger.calls.length - callsBefore, elapsedMs: Date.now() - started, result }) + "\n");
    completed++;
    console.log(JSON.stringify({ id: op.id, calls: ledger.calls.length - callsBefore, measuredUsd: Number(ledger.measuredUsd.toFixed(7)), result: "outcome" in result ? result.outcome : "unavailable" in result ? "unavailable" : `${result.problems.length} problems` }));
    if ("unavailable" in result || ("error" in result && result.error?.includes("plan review unavailable"))) stopped = "Review unavailable";
  }
  save("run-finished.json", { at: new Date().toISOString(), operationsCompleted: completed, operationsPlanned: operations.length, stopped, blocked: ledger.blocked, measuredUsd: ledger.measuredUsd, uncertainUsd: ledger.uncertainUsd, productionMutations: 0, images: 0 });
}
