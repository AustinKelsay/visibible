/** Offline replay of the one-shot diagnostic, including any local budget refusals. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { dir, hash, json, root, save } from "./common.mjs";
import { plain } from "./model.mjs";
import { cases, operations, perform, plan } from "./scenarios.mjs";

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
const dry = json("dry-run.json"), started = json("run-started.json"), finished = json("run-finished.json"), ledger = json("ledger.json");
assert.deepEqual(dry.sources, started.sources);
const freeze = json("frozen-commit.json");
assert.ok(Date.parse(freeze.at) <= Date.parse(started.at));
assert.deepEqual(JSON.parse(execFileSync("git", ["show", `${freeze.commit}:${path.relative(root, path.join(dir, "dry-run.json"))}`], { cwd: root, encoding: "utf8" })), dry);
for (const [name, sha] of Object.entries(dry.sources)) {
  const relative = name.startsWith("src/") || name.startsWith("convex/") || name.startsWith("works/") ? name : path.relative(root, path.join(dir, name));
  assert.equal(hash(fs.readFileSync(path.join(root, relative))), sha, `Changed frozen input: ${name}`);
  // This generated import is deliberately ignored; its hash is pinned by the committed manifest.
  if (relative !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${freeze.commit}:${relative}`], { cwd: root })), sha, `Absent from pre-call commit: ${name}`);
}
const lines = (name: string) => fs.existsSync(path.join(dir, name)) ? fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").filter(Boolean).map((s) => JSON.parse(s)) : [];
const replies = lines("provider.ndjson"), inputs = lines("inputs.ndjson"), results = lines("results.ndjson");
assert.equal(replies.length, ledger.calls.length);
assert.equal(finished.operationsCompleted, results.length);
assert.equal(finished.operationsPlanned, operations.length);
assert.equal(finished.productionMutations, 0); assert.equal(finished.images, 0);
assert.equal(ledger.uncertainUsd, 0); assert.equal(finished.uncertainUsd, 0);
assert.equal(finished.blocked, ledger.blocked);
assert.ok(ledger.blocked === null || ledger.blocked === "Evaluation cap/headroom exhausted");
assert.ok(finished.stopped === null || finished.stopped === "Headroom limit" || finished.stopped === "Review unavailable");
let requestAt = 0, replyAt = 0, measuredUsd = 0;
for (let index = 0; index < results.length; index++) {
  const row = results[index], op = operations[index], before = replyAt, beforeRequest = requestAt;
  for (const [key, value] of Object.entries(op)) assert.equal(row[key], value);
  const result = await perform(op, { id: READING_PASS_MODEL, complete: async (request) => {
    const input = inputs[requestAt++]; assert.ok(input, "Unexpected replay request");
    assert.equal(input.sample, op.id); assert.equal(input.label, request.label);
    assert.equal(hash(JSON.stringify(plain(request))), input.requestSha256);
    if (requestAt === beforeRequest + 1) assert.equal(input.requestSha256, dry.first[op.id].sha256);
    if (input.blocked) {
      assert.equal(input.blocked, "Evaluation cap/headroom exhausted");
      assert.ok(measuredUsd + plan.evaluation.reservePerCallUsd > plan.evaluation.capUsd || replyAt >= plan.evaluation.maximumCalls);
      throw Error(`Evaluation stopped: ${input.blocked}`);
    }
    const reply = replies[replyAt], call = ledger.calls[replyAt++]; assert.ok(reply && call);
    assert.equal(reply.phase, op.id); assert.equal(call.phase, op.id);
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
  assert.equal(replyAt - before, row.calls);
}
assert.equal(requestAt, inputs.length); assert.equal(replyAt, replies.length);
assert.ok(Math.abs(measuredUsd - ledger.measuredUsd) < 1e-12);
assert.equal(finished.measuredUsd, ledger.measuredUsd);
assert.ok(plan.evaluation.measuredBeforeUsd + plan.evaluation.uncertaintyBeforeUsd + measuredUsd <= plan.evaluation.authorizedUsd);
const reviews = results.filter((r) => r.kind === "review").map((r) => {
  const c = cases.find((c) => c.id === r.id)!;
  const missing = c.required.filter((required) => !r.result.problems?.some((p: { kind: string; entryId: string }) => p.kind === required.kind && p.entryId === required.entryId));
  return { id: r.id, pass: !r.result.unavailable && (c.required.length ? missing.length === 0 : r.result.problems.length === 0), missing, problems: r.result.problems ?? null };
});
const pipelines = results.filter((r) => r.kind === "pipeline");
let scoring: unknown = null;
if (fs.existsSync(path.join(dir, "operator-scores.json"))) {
  const scores = json("operator-scores.json").scores;
  assert.deepEqual(scores.map((s: { id: string }) => s.id).sort(), pipelines.map((r) => r.id).sort());
  for (const s of scores) {
    const row = pipelines.find((r) => r.id === s.id)!;
    assert.equal(s.stored, row.result.outcome === "stored");
    assert.equal(s.acceptable, s.stored && s.problems.length === 0);
    for (const problem of s.problems) for (const quote of problem.planQuotes) assert.ok(Object.values(row.result.stored.payload.plan).some((v) => typeof v === "string" && v.includes(quote)), `Score quote absent: ${s.id}: ${quote}`);
  }
  const acceptable = scores.filter((s: { acceptable: boolean }) => s.acceptable).length;
  scoring = { acceptable, flawedOrUncertainStored: scores.filter((s: { stored: boolean; acceptable: boolean }) => s.stored && !s.acceptable).length,
    refused: scores.filter((s: { stored: boolean }) => !s.stored).length, pass: pipelines.length === 2 && acceptable === 2 };
}
const summary = { operations: results.length, calls: replies.length, reviews, scoring, measuredUsd,
  reviewGate: reviews.length === 6 && reviews.every((r) => r.pass), remainingEvaluationUsd: plan.evaluation.authorizedUsd - plan.evaluation.measuredBeforeUsd - plan.evaluation.uncertaintyBeforeUsd - measuredUsd };
if (fs.existsSync(path.join(dir, "tally.json"))) assert.deepEqual(summary, json("tally.json"));
else save("tally.json", summary);
console.log(JSON.stringify({ offlineReplay: true, ...summary }));
if (fs.existsSync(path.join(dir, "sha256.json"))) for (const [name, sha] of Object.entries(json("sha256.json"))) {
  const file = path.resolve(dir, name); assert.ok(file.startsWith(root + path.sep)); assert.equal(hash(fs.readFileSync(file)), sha, name);
}
