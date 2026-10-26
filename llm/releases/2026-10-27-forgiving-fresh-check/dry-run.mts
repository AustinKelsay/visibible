/** Exercise the real pipeline offline, capture exact first requests, and estimate the bounded run. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { READING_PASS_MODEL, type TextModelRequest } from "../../../src/lib/reading-pass/model";
import { dir, frozen, hash, json, plain, save } from "./common.mjs";
import { operations, perform, fixture, plan } from "./scenarios.mjs";

assert.ok(process.argv[2] === "capture" || process.argv[2] === "verify");
globalThis.fetch = async () => { throw Error("Offline dry run forbids network"); };
const first: Record<string, { sha256: string; schemaName: string }> = {};
const estimates: Array<{ id: string; firstPassUsd: number; withOneReplanUsd: number; maximumCompletionFirstPassUsd: number }> = [];
const promptPrice = Number(json("pricing.json").pricing.pricing.prompt), completionPrice = Number(json("pricing.json").pricing.pricing.completion);
let maximumCallEstimateUsd = 0;
for (const op of operations) {
  const requests: TextModelRequest[] = [], f = fixture(op.sample);
  const result = await perform(op, { id: READING_PASS_MODEL, complete: async (r) => {
    requests.push(r);
    first[op.id] ??= { sha256: hash(JSON.stringify(plain(r))), schemaName: r.schemaName };
    const situation = { place: "an open space", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "plain clothing" };
    const reply = r.schemaName === "section_look" ? situation : r.schemaName === "plan_review" ? { problems: [] } : {
      focusQuote: f.context.moment.text.split(/\s+/).slice(0, 12).join(" "), instant: "A subject remains still in an open space.",
      selectedCast: [], primarySubject: "A subject", action: "remains still", setting: "an open space", secondaryElements: "", mood: "quiet", timeOfDay: "day", composition: "one view", situation,
    };
    if (r.schemaName === "scene_plan") assert.ok(r.user.includes("SECTION LOOK GUIDE"));
    return { content: JSON.stringify(reply), model: READING_PASS_MODEL, providerRequestId: null, finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }, elapsedMs: 0 };
  } });
  assert.equal(requests.length, 3);
  assert.equal(result.outcome, "stored", `${op.id}: ${result.error}`);
  const canonChars = f.records.filter((entry) => entry.kind === "entry").reduce((n, entry) => n + JSON.stringify(entry.payload).length, 0);
  const costs = requests.map((r) => {
    assert.equal(r.maxTokens, r.schemaName === "section_look" ? 900 : r.schemaName === "scene_plan" ? 2400 : 4000);
    assert.equal(r.reasoningEffort ?? "none", r.schemaName === "plan_review" ? "low" : "none");
    // Include the output schema and room for the generated look, fields and selections the scripted replies leave out.
    const generatedInputChars = r.schemaName === "plan_review" ? 7100 + canonChars : r.schemaName === "scene_plan" ? 2000 : 0;
    const promptUsd = (r.system.length + r.user.length + JSON.stringify(plain(r).schema).length + generatedInputChars) / 2.7 * promptPrice;
    const maximum = promptUsd + r.maxTokens * completionPrice;
    maximumCallEstimateUsd = Math.max(maximumCallEstimateUsd, maximum);
    return { expected: promptUsd + r.expectedCompletionTokens * completionPrice, maximum };
  });
  estimates.push({ id: op.id, firstPassUsd: costs.reduce((n, c) => n + c.expected, 0), withOneReplanUsd: costs.reduce((n, c) => n + c.expected, 0) + costs[1].expected + costs[2].expected,
    maximumCompletionFirstPassUsd: costs.reduce((n, c) => n + c.maximum, 0) });
}
assert.equal(operations.length, 30);
assert.ok(maximumCallEstimateUsd < plan.evaluation.reservePerCallUsd);
const data = { sources: frozen(), operations, first, estimates,
  costEstimate: { firstPassUsd: estimates.reduce((n, c) => n + c.firstPassUsd, 0), oneReplanEveryCaseUsd: estimates.reduce((n, c) => n + c.withOneReplanUsd, 0),
    maximumCompletionFirstPassUsd: estimates.reduce((n, c) => n + c.maximumCompletionFirstPassUsd, 0), maximumCallEstimateUsd,
    method: "Offline scripted mechanics; source-specific requests, captured catalog prices, output-schema characters and generous generated-input padding at 2.7 characters/token. Expected production completion tokens; the second scenario adds one full plan/review round to every case. Estimates, not guarantees; long or malformed replies can exhaust the cap before completion." },
  paidCalls: 0, productionMutations: 0 };
if (process.argv[2] === "capture") {
  assert.ok(!fs.existsSync(path.join(dir, "run-started.json")));
  save("dry-run.json", { at: new Date().toISOString(), ...data });
} else { const recorded = json("dry-run.json"); delete recorded.at; assert.deepEqual(data, recorded); }
console.log(JSON.stringify({ offline: true, operations: operations.length, ...data.costEstimate, paidCalls: 0, productionMutations: 0 }));
