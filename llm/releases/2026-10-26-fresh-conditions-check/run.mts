/** Funding-gated execution. All preflight checks precede credentials, markers and billable calls. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { READING_PASS_MODEL, type TextModelRequest } from "../../../src/lib/reading-pass/model";
import { dir, root, environment, frozen, hash, json, plain, save } from "./common.mjs";
import { evaluationModel, funding } from "./model.mjs";
import { operations, perform, plan } from "./scenarios.mjs";

assert.equal(process.argv[2], "--execute");
const grant = funding(), dry = json("dry-run.json");
assert.deepEqual(frozen(), dry.sources); assert.deepEqual(operations, dry.operations);
for (const name of ["run-started.json", "frozen-commit.json", "ledger.json", "inputs.ndjson", "provider.ndjson", "results.ndjson"]) assert.ok(!fs.existsSync(path.join(dir, name)), `One-shot artifact exists: ${name}`);
assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit frozen inputs before calls");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
for (const [file, sha] of Object.entries(dry.sources)) {
  if (file !== "works/bible-web/work.json") assert.equal(hash(execFileSync("git", ["show", `${commit}:${file}`], { cwd: root })), sha, `Absent from pre-call commit: ${file}`);
}
for (const name of ["dry-run.json", "funding.json"]) assert.deepEqual(JSON.parse(execFileSync("git", ["show", `${commit}:${path.relative(root, path.join(dir, name))}`], { cwd: root, encoding: "utf8" })), json(name));
const env = environment();
const modelsResponse = await fetch("https://openrouter.ai/api/v1/models"); assert.ok(modelsResponse.ok);
const pricing = (await modelsResponse.json()).data.find((m: { id: string }) => m.id === READING_PASS_MODEL);
assert.ok(pricing && Number(pricing.pricing.prompt) === 0.1e-6 && Number(pricing.pricing.completion) === 0.5e-6);
const creditsResponse = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${env.key}` } }); assert.ok(creditsResponse.ok);
const credits = await creditsResponse.json();
const snapshot = { at: new Date().toISOString(), pricing, balanceUsd: credits.data.total_credits - credits.data.total_usage };
assert.ok(snapshot.balanceUsd > grant.operationCapUsd);
save("frozen-commit.json", { at: new Date().toISOString(), commit, grant });
save("run-started.json", { ...snapshot, at: new Date().toISOString(), sources: frozen() });
const { ledger, forSample } = evaluationModel(snapshot);
let stopped: string | null = null, completed = 0;
for (const op of operations) {
  if (ledger.blocked || ledger.uncertainUsd || stopped) break;
  if (ledger.measuredUsd + plan.evaluation.reservePerCallUsd > grant.operationCapUsd) { stopped = "Headroom limit"; break; }
  const callsBefore = ledger.calls.length;
  const model = forSample(op.id, (r: TextModelRequest, first: boolean) => {
    try {
      assert.ok(["section_look", "scene_plan", "plan_review"].includes(r.schemaName));
      assert.equal(r.maxTokens, r.schemaName === "plan_review" ? 4000 : r.schemaName === "scene_plan" ? 2400 : 900);
      assert.equal(r.reasoningEffort ?? "none", r.schemaName === "plan_review" ? "low" : "none");
      if (first) assert.equal(hash(JSON.stringify(plain(r))), dry.first[op.id].sha256);
      if (r.schemaName === "scene_plan") assert.ok(r.user.includes("SECTION LOOK GUIDE"));
    } catch (e) { stopped = String(e); throw e; }
  });
  const started = Date.now(), result = await perform(op, model);
  fs.appendFileSync(path.join(dir, "results.ndjson"), JSON.stringify({ ...op, calls: ledger.calls.length - callsBefore, elapsedMs: Date.now() - started, result }) + "\n");
  completed++;
  console.log(JSON.stringify({ id: op.id, calls: ledger.calls.length - callsBefore, measuredUsd: ledger.measuredUsd, outcome: result.outcome, error: result.error?.slice(0, 160) ?? null }));
  // A bounded unavailable review fails this case; safe unrelated cases continue.
}
save("run-finished.json", { at: new Date().toISOString(), operationsCompleted: completed, operationsPlanned: operations.length, stopped, blocked: ledger.blocked, measuredUsd: ledger.measuredUsd, uncertainUsd: ledger.uncertainUsd, productionMutations: 0, images: 0 });
