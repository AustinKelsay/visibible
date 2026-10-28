/** Offline replay of every request/result and its charged usage before any acceptance claim. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { createOpenRouterTextModel, READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { dir, frozen, hash, json, plain, root, save } from "./common.mjs";
import { operations, perform, plan } from "./scenarios.mjs";
import { scoreSummary } from "./score.mjs";

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
const dry = json("dry-run.json"), started = json("run-started.json"), finished = json("run-finished.json"), ledger = json("ledger.json"), freeze = json("frozen-commit.json");
assert.deepEqual(frozen(), dry.sources); assert.deepEqual(dry.sources, started.sources);
assert.ok(Date.parse(freeze.at) <= Date.parse(started.at));
for (const [file, sha] of Object.entries(dry.sources)) if (file !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${freeze.commit}:${file}`], { cwd: root })), sha);
for (const name of ["dry-run.json", "funding.json"]) assert.deepEqual(JSON.parse(execFileSync("git", ["show", `${freeze.commit}:${path.relative(root, path.join(dir, name))}`], { cwd: root, encoding: "utf8" })), name === "funding.json" ? freeze.grant : dry);
const lines = (name: string) => fs.existsSync(path.join(dir, name)) ? fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").filter(Boolean).map((s) => JSON.parse(s)) : [];
const replies = lines("provider.ndjson"), inputs = lines("inputs.ndjson"), results = lines("results.ndjson");
assert.equal(replies.length, ledger.calls.length, "An interrupted in-flight call remains uncertain; do not resume");
assert.equal(finished.operationsCompleted, results.length); assert.equal(finished.operationsPlanned, operations.length);
assert.equal(finished.productionMutations, 0); assert.equal(finished.images, 0);
let requestAt = 0, replyAt = 0, measuredUsd = 0, uncertainUsd = 0;
for (let index = 0; index < results.length; index++) {
  const row = results[index], op = operations[index], before = replyAt, beforeRequest = requestAt;
  for (const [key, value] of Object.entries(op)) assert.equal(row[key], value);
  const result = await perform(op, { id: READING_PASS_MODEL, complete: async (request) => {
    const input = inputs[requestAt++]; assert.ok(input);
    assert.equal(input.sample, op.id); assert.equal(input.label, request.label);
    assert.equal(hash(JSON.stringify(plain(request))), input.requestSha256);
    if (requestAt === beforeRequest + 1) assert.equal(input.requestSha256, dry.first[op.id].sha256);
    const p = plain(request);
    const maximum = (p.system.length + p.user.length + JSON.stringify(p.schema).length) / 2.7 * Number(started.pricing.pricing.prompt) + p.maxTokens * Number(started.pricing.pricing.completion);
    assert.equal(input.maximumCompletionEstimatedUsd, maximum);
    if (input.blocked) {
      assert.equal(input.blocked, ledger.blocked);
      if (input.blocked === "Evaluation cap/headroom exhausted") assert.ok(maximum >= plan.evaluation.reservePerCallUsd || measuredUsd + plan.evaluation.reservePerCallUsd > freeze.grant.operationCapUsd || replyAt >= plan.evaluation.maximumCalls);
      throw Error(`Evaluation stopped: ${input.blocked}`);
    }
    const reply = replies[replyAt], call = ledger.calls[replyAt++]; assert.ok(reply && call);
    assert.equal(reply.phase, op.id); assert.equal(call.phase, op.id);
    assert.equal(call.status, String(reply.status));
    assert.ok(measuredUsd + plan.evaluation.reservePerCallUsd <= freeze.grant.operationCapUsd);
    const adapter = createOpenRouterTextModel({ apiKey: "offline", fetch: async (url, init) => {
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.deepEqual(JSON.parse(String(init.body)), reply.request);
      return new Response(JSON.stringify(reply.response), { status: reply.status, headers: { "Content-Type": "application/json" } });
    } });
    const cost = extractOpenRouterUsageUsd(reply.response);
    assert.equal(cost, reply.measuredUsageUsd); assert.equal(cost, call.measuredUsd);
    if (cost === null) uncertainUsd += plan.evaluation.reservePerCallUsd; else measuredUsd += cost;
    return adapter.complete(request);
  } });
  assert.deepEqual(result, row.result, op.id); assert.equal(replyAt - before, row.calls);
}
assert.equal(requestAt, inputs.length); assert.equal(replyAt, replies.length);
assert.ok(Math.abs(measuredUsd - ledger.measuredUsd) < 1e-12); assert.ok(Math.abs(uncertainUsd - ledger.uncertainUsd) < 1e-12);
assert.equal(finished.measuredUsd, ledger.measuredUsd); assert.equal(finished.uncertainUsd, ledger.uncertainUsd); assert.equal(finished.blocked, ledger.blocked);
assert.ok(plan.evaluation.measuredBeforeUsd + plan.evaluation.uncertaintyBeforeUsd + measuredUsd + uncertainUsd <= freeze.grant.authorizedUsd);
const outcomes = Object.fromEntries((["fresh", "retained"] as const).map((stratum) => [stratum, {
  stored: results.filter((r) => r.stratum === stratum && r.result.outcome === "stored").length,
  refused: results.filter((r) => r.stratum === stratum && r.result.outcome === "refused").length }]));
const scoring = scoreSummary();
const summary = { operations: results.length, calls: replies.length, measuredUsd, uncertainUsd, stopped: finished.stopped, blocked: ledger.blocked, outcomes, scoring,
  pass: results.length === 30 && !finished.stopped && !ledger.blocked && uncertainUsd === 0 && scoring?.pass === true, releaseHold: true };
if (process.argv[2] === "finalize") {
  assert.ok(scoring, "Commit masked scores before finalizing");
  if (!fs.existsSync(path.join(dir, "tally.json"))) save("tally.json", summary);
  else assert.deepEqual(summary, json("tally.json"));
}
console.log(JSON.stringify({ offlineReplay: true, ...summary }));
