/** Exercise both real pipelines offline, capture exact first requests, and estimate a bounded proposal. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { FORMLESS_PLAN_PROMPT_VERSION, MOMENT_CAST_PROMPT_VERSION } from "../../../src/lib/engine/preparation";
import { PLAN_REVIEW_PROMPT_VERSION } from "../../../src/lib/engine/plan-review";
import { READING_PASS_MODEL, type TextModelRequest } from "../../../src/lib/reading-pass/model";
import { baselineCommit, baselineHashes } from "./baseline.mjs";
import { dir, frozen, hash, json, plain, save } from "./common.mjs";
import { operations, perform, fixture, plan } from "./scenarios.mjs";

assert.ok(process.argv[2] === "capture" || process.argv[2] === "verify");
globalThis.fetch = async () => { throw Error("Offline dry run forbids network"); };
assert.equal(MOMENT_CAST_PROMPT_VERSION, plan.pipeline.momentCast);
assert.equal(FORMLESS_PLAN_PROMPT_VERSION, plan.pipeline.formlessPlan);
assert.equal(PLAN_REVIEW_PROMPT_VERSION, plan.pipeline.candidateReview);
const first: Record<string, { sha256: string; schemaName: string }> = {};
const estimates: Array<{ id: string; firstPassUsd: number; withOneReplanUsd: number; maximumCompletionFirstPassUsd: number }> = [];
const promptPrice = Number(json("sample-set.json").pricing.pricing.prompt), completionPrice = Number(json("sample-set.json").pricing.pricing.completion);
let maximumCallEstimateUsd = 0;
for (const op of operations) {
  const requests: TextModelRequest[] = [];
  const result = await perform(op, { id: READING_PASS_MODEL, complete: async (r) => {
    const p = plain(r); requests.push(r);
    first[op.id] ??= { sha256: hash(JSON.stringify(p)), schemaName: r.schemaName };
    let reply: unknown = { problems: [] };
    if (op.kind === "pipeline") {
      const f = fixture(op.sample);
      reply = r.schemaName === "section_look" ? { place: "an open space", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "plain clothing" }
        : r.schemaName === "plan_review" ? { problems: [] } : {
          grounding: { focusQuote: f.context.moment.text.split(/\s+/).slice(0, 12).join(" "), instant: "A subject remains still in an open space.", singleInstant: true },
          selectedCast: [], consideredCast: [], missingCast: [], primarySubject: "A subject", action: "remains still", setting: "an open space", secondaryElements: "", mood: "quiet", timeOfDay: "day", composition: "one view",
        };
      if (r.schemaName === "scene_plan") assert.equal(r.user.includes("SECTION LOOK ("), false);
    }
    return { content: JSON.stringify(reply), model: READING_PASS_MODEL, providerRequestId: null, finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }, elapsedMs: 0 };
  } });
  assert.equal(requests.length, op.kind === "pipeline" ? 3 : 1);
  if ("outcome" in result) assert.equal(result.outcome, "stored", `${op.id}: ${result.error}`);
  const costs = requests.map((r) => {
    assert.equal(r.maxTokens, r.schemaName === "section_look" ? 900 : r.schemaName === "scene_plan" ? 2400 : 4000);
    assert.equal(r.reasoningEffort ?? "none", r.schemaName === "plan_review" ? "low" : "none");
    // Include output schema, plus room for actual generated look/fields/selected IDs, unlike the production estimator.
    const f = op.kind === "pipeline" ? fixture(op.sample) : null;
    const canonChars = f && op.arm === "candidate" ? f.records.filter((entry) => entry.kind === "entry").reduce((n, entry) => n + JSON.stringify(entry.payload).length, 0) : 0;
    const generatedInputChars = r.schemaName === "plan_review" && f ? 6100 + canonChars : 0;
    const promptUsd = (r.system.length + r.user.length + JSON.stringify(plain(r).schema).length + generatedInputChars) / 2.7 * promptPrice;
    const expected = promptUsd + r.expectedCompletionTokens * completionPrice;
    const maximum = promptUsd + r.maxTokens * completionPrice;
    maximumCallEstimateUsd = Math.max(maximumCallEstimateUsd, maximum);
    return { expected, maximum };
  });
  estimates.push({ id: op.id, firstPassUsd: costs.reduce((n, c) => n + c.expected, 0),
    withOneReplanUsd: costs.reduce((n, c) => n + c.expected, 0) + (op.kind === "pipeline" ? costs[1].expected + costs[2].expected : 0),
    maximumCompletionFirstPassUsd: costs.reduce((n, c) => n + c.maximum, 0) });
}
assert.equal(operations.length, 92);
assert.ok(maximumCallEstimateUsd < plan.evaluation.reservePerCallUsd);
const data = { baselineCommit, baselineHashes, sources: frozen(), operations, first, estimates,
  costEstimate: { firstPassUsd: estimates.reduce((n, c) => n + c.firstPassUsd, 0), oneReplanEveryPipelineUsd: estimates.reduce((n, c) => n + c.withOneReplanUsd, 0),
    maximumCompletionFirstPassUsd: estimates.reduce((n, c) => n + c.maximumCompletionFirstPassUsd, 0), maximumCallEstimateUsd,
    method: "Offline scripted mechanics only; source-specific requests, current catalog prices, output-schema characters and generous generated-input padding at 2.7 characters/token. Expected production completion tokens; second scenario adds one full plan/review round to every pipeline. These are estimates, not token or total cost guarantees; malformed retries and stochastic lengths can exhaust the cap before completion." },
  paidCalls: 0, productionMutations: 0 };
if (process.argv[2] === "capture") {
  assert.ok(!fs.existsSync(path.join(dir, "run-started.json")));
  save("dry-run.json", { at: new Date().toISOString(), ...data });
} else { const recorded = json("dry-run.json"); delete recorded.at; assert.deepEqual(data, recorded); }
console.log(JSON.stringify({ offline: true, operations: operations.length, ...data.costEstimate, paidCalls: 0, productionMutations: 0 }));
