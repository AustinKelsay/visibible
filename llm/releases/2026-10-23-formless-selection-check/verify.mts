/** Offline replay: refuses all network and reproduces every result, request hash and measured cost. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { dir, hash, json, root } from "./common.mjs";
import { plain } from "./model.mjs";
import { god, operations, perform, plan } from "./scenarios.mjs";

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
const dry = json("dry-run.json"), started = json("run-started.json"), finished = json("run-finished.json"), ledger = json("ledger.json");
assert.deepEqual(dry.sources, started.sources);
for (const [name, sha] of Object.entries(dry.sources)) {
  const file = name.startsWith("src/") || name.startsWith("convex/") || name.startsWith("works/") ? path.join(root, name) : path.join(dir, name);
  assert.equal(hash(fs.readFileSync(file)), sha, `Changed frozen input: ${name}`);
}
const lines = (name: string) => fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const replies = lines("provider.ndjson"), inputs = lines("inputs.ndjson"), results = lines("results.ndjson");
assert.equal(replies.length, ledger.calls.length); assert.equal(replies.length, inputs.length);
assert.equal(finished.operationsCompleted, results.length);
assert.equal(finished.operationsPlanned, operations.length);
assert.equal(finished.productionMutations, 0); assert.equal(finished.images, 0);
assert.equal(finished.blocked, null); assert.equal(finished.stopped, null);
assert.equal(ledger.uncertainUsd, 0); assert.equal(ledger.blocked, null);
assert.equal(finished.uncertainUsd, 0);
let at = 0, measuredUsd = 0;
for (let index = 0; index < results.length; index++) {
  const row = results[index], op = operations[index], before = at;
  for (const [key, value] of Object.entries(op)) assert.equal(row[key], value);
  const result = await perform(op, { id: READING_PASS_MODEL, complete: async (request) => {
    const reply = replies[at], input = inputs[at], call = ledger.calls[at]; at++;
    assert.ok(reply && input && call, "Unexpected replay request");
    assert.equal(reply.phase, op.id); assert.equal(input.sample, op.id); assert.equal(call.phase, op.id);
    assert.equal(hash(JSON.stringify(plain(request))), input.requestSha256);
    if (at === before + 1) assert.equal(input.requestSha256, dry.first[op.id].sha256);
    assert.equal(reply.status, 200); assert.equal(call.status, "200");
    assert.equal(reply.request.model, READING_PASS_MODEL);
    assert.deepEqual(reply.request.provider, { require_parameters: true, order: ["anthropic"], allow_fallbacks: false });
    assert.deepEqual(reply.request.messages, [{ role: "system", content: request.system }, { role: "user", content: request.user }]);
    assert.deepEqual(reply.request.response_format, { type: "json_schema", json_schema: { name: request.schemaName, strict: true, schema: plain(request).schema } });
    assert.equal(reply.request.max_tokens, request.maxTokens);
    assert.deepEqual(reply.request.reasoning, { effort: request.reasoningEffort ?? "none" });
    assert.equal(reply.request.temperature, undefined);
    assert.ok(measuredUsd + plan.evaluation.reservePerCallUsd <= plan.evaluation.capUsd);
    const cost = extractOpenRouterUsageUsd(reply.response); assert.ok(cost !== null && cost >= 0);
    assert.equal(cost, reply.measuredUsageUsd); assert.equal(cost, call.measuredUsd); measuredUsd += cost;
    const response = reply.response;
    return { content: response.choices[0].message.content, model: response.model, providerRequestId: response.id, finishReason: response.choices[0].finish_reason,
      usage: { costUsd: cost, promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens }, elapsedMs: 0 };
  } });
  assert.deepEqual(result, row.result, op.id);
  assert.equal(at - before, row.calls);
}
assert.equal(at, replies.length);
assert.ok(Math.abs(measuredUsd - ledger.measuredUsd) < 1e-12);
assert.equal(finished.measuredUsd, ledger.measuredUsd);
assert.ok(plan.evaluation.measuredBeforeUsd + plan.evaluation.uncertaintyBeforeUsd + measuredUsd <= plan.evaluation.authorizedUsd);
const reviews = results.filter((r) => r.kind === "review");
const caught = (r: typeof results[number]) => r.result.problems.some((p: { kind: string; entryId: string }) => p.kind === "unselected_figure" && p.entryId === god);
const summary = { baselineCaught: reviews.filter((r) => r.defect && r.arm === "baseline" && caught(r)).length,
  candidateCaught: reviews.filter((r) => r.defect && r.arm === "candidate" && caught(r)).length,
  defectReviewsPerArm: reviews.filter((r) => r.defect && r.arm === "candidate").length,
  controlFalseAlarms: reviews.filter((r) => !r.defect && r.result.problems.some((p: { kind: string; entryId: string }) => p.entryId === god && ["unselected_figure", "outside_instant"].includes(p.kind))).length,
  controlReviews: reviews.filter((r) => !r.defect).length,
  pipelines: results.filter((r) => r.kind === "pipeline").length,
  stored: results.filter((r) => r.kind === "pipeline" && r.result.outcome === "stored").length,
  calls: replies.length, measuredUsd, remainingEvaluationUsd: plan.evaluation.authorizedUsd - plan.evaluation.measuredBeforeUsd - plan.evaluation.uncertaintyBeforeUsd - measuredUsd };
if (fs.existsSync(path.join(dir, "tally.json"))) assert.deepEqual(summary, json("tally.json"));
else fs.writeFileSync(path.join(dir, "tally.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ offlineReplay: true, ...summary }));
