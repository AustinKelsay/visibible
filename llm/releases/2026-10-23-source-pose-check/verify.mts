/** Offline replay: refuses all network and reproduces every result, request hash and measured cost. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { dir, hash, json, root } from "./common.mjs";
import { plain } from "./model.mjs";
import { cases, operations, perform, plan } from "./scenarios.mjs";

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
assert.equal(finished.blocked, null);
assert.ok(finished.stopped === null || finished.stopped === "Candidate direct-review gate failed; pipeline not started" || finished.stopped === "Headroom limit");
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
const tallyArm = (arm: string) => {
  const rows = reviews.filter((r) => r.arm === arm);
  const defects = rows.filter((r) => r.defect), controls = rows.filter((r) => !r.defect);
  return { defects: defects.length, allTargetsCaught: defects.filter((r) => cases.find((c) => c.id === r.sample)!.targets.every((t) => r.result.problems?.some((p: { kind: string; entryId: string }) => p.kind === t.kind && p.entryId === t.entryId))).length,
    controls: controls.length, controlFalseAlarms: controls.filter((r) => r.result.problems?.length > 0).length,
    unavailable: rows.filter((r) => "unavailable" in r.result).length };
};
const candidate = tallyArm("candidate"), baseline = tallyArm("baseline");
const reviewGate = candidate.defects === 6 && candidate.allTargetsCaught === 6 && candidate.controls === 10 && candidate.controlFalseAlarms === 0 && candidate.unavailable === 0;
if (fs.existsSync(path.join(dir, "review-gate.json"))) assert.equal(json("review-gate.json").passed, reviewGate);
const pipelines = results.filter((r) => r.kind === "pipeline");
let scoring: unknown = null;
if (fs.existsSync(path.join(dir, "operator-scores.json"))) {
  const scores = json("operator-scores.json").scores;
  assert.deepEqual(scores.map((s: { id: string }) => s.id).sort(), pipelines.map((r) => r.id).sort());
  for (const s of scores) {
    const row = pipelines.find((r) => r.id === s.id)!;
    assert.equal(s.stored, row.result.outcome === "stored");
    assert.equal(s.acceptable, s.stored && s.problems.length === 0);
    const fields = row.result.stored?.payload.plan;
    for (const problem of s.problems) for (const quote of problem.planQuotes) {
      assert.ok(fields && Object.values(fields).some((v) => typeof v === "string" && v.includes(quote)), `Score quote absent: ${s.id}: ${quote}`);
    }
  }
  const acceptable = scores.filter((s: { acceptable: boolean }) => s.acceptable).length;
  const flawedStored = scores.filter((s: { stored: boolean; acceptable: boolean }) => s.stored && !s.acceptable).length;
  scoring = { acceptable, flawedStored, refused: scores.filter((s: { stored: boolean }) => !s.stored).length, pipelineGate: pipelines.length === 21 && acceptable >= 15 && flawedStored === 0 };
}
const summary = { baseline, candidate, reviewGate, pipelines: pipelines.length, stored: pipelines.filter((r) => r.result.outcome === "stored").length, scoring,
  calls: replies.length, measuredUsd, remainingEvaluationUsd: plan.evaluation.authorizedUsd - plan.evaluation.measuredBeforeUsd - plan.evaluation.uncertaintyBeforeUsd - measuredUsd };
if (fs.existsSync(path.join(dir, "tally.json"))) assert.deepEqual(summary, json("tally.json"));
else fs.writeFileSync(path.join(dir, "tally.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ offlineReplay: true, ...summary }));
