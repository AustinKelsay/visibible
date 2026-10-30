/** Runs the plan-review checker once per retained blind reply; no production read or write. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { PLAN_REVIEW_PROMPT_VERSION, planReviewSystem, planReviewUser, reviewPlan, type ReviewInput } from "../../../src/lib/engine/plan-review";
import { READING_PASS_MODEL, estimateRequestCostUsd } from "../../../src/lib/reading-pass/model";
import { root, json, rate, saveOut, readOut, out, environment, row, hash, armConfig } from "./common.mjs";
import { evaluationModel } from "./model.mjs";
import { readDepictionProfile } from "../../../src/lib/engine/depiction";
// The Bible's depiction profile reproduces the wording these runs used (ADR 0009).
const depiction = readDepictionProfile("bible-web");
const PLAN_REVIEW_SYSTEM = planReviewSystem(depiction);

const [command] = process.argv.slice(2);
assert.ok(command === "dry-run" || (command === "run" && process.argv.includes("--execute")));
const plan = json("plan.json"), snapshot = rate("snapshot.json"), blind = rate("blind-replies.json");
assert.equal(PLAN_REVIEW_PROMPT_VERSION, plan.arms[process.env.REVIEW_ARM ?? "haiku-none"].promptVersion ?? plan.checker.promptVersion);
const inputs = await readWorkInputs("bible-web", root);
assert.equal(inputs.workVersion, snapshot.status.workVersion); assert.equal(inputs.briefVersion, snapshot.status.briefVersion);
const rules = inputs.brief.depictionRules.map((r) => `- ${r.text}`).join("\n") || "- none";

/** The same rendering-bound text the blind scorers judged, with the planner's own moment context. */
function reviewInput(reply: { moment: string; present: string[]; scene: ReviewInput["fields"] }): ReviewInput {
  const moment = row(snapshot, "moment", reply.moment)!, section = row(snapshot, "section", String(moment.payload.sectionId))!;
  const context = momentContext(inputs.work, { id: reply.moment, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) }, { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  const cast = (section.payload.cast as Array<{ entryId: string }>).map(({ entryId }) => {
    const entry = row(snapshot, "entry", entryId)!;
    return { entryId, name: String(entry.payload.name), hasForm: entry.payload.hasForm !== false };
  });
  return { rules, depiction, context, sectionTitle: String(section.payload.title), cast, present: reply.present, fields: reply.scene };
}

if (command === "dry-run") {
  const requests = blind.replies.map((r: { blindId: string; moment: string; present: string[]; scene: ReviewInput["fields"] }) => {
    const user = planReviewUser(reviewInput(r));
    return { blindId: r.blindId, userSha256: hash(user), estimatedUsd: estimateRequestCostUsd({ system: PLAN_REVIEW_SYSTEM, user, expectedCompletionTokens: armConfig().reasoningEffort === "none" ? 200 : 1300 }) };
  });
  const pricing = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data.find((m: { id: string }) => m.id === READING_PASS_MODEL);
  assert.ok(pricing && Number(pricing.pricing.prompt) === 0.1e-6 && Number(pricing.pricing.completion) === 0.5e-6);
  const credits = await (await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${environment().key}` } })).json();
  saveOut("dry-run.json", { at: new Date().toISOString(), balanceUsd: credits.data.total_credits - credits.data.total_usage, pricing, systemSha256: hash(PLAN_REVIEW_SYSTEM), requests, paidCalls: 0 });
  console.log(JSON.stringify({ dryRun: true, reviews: requests.length, estimatedTotalUsd: requests.reduce((s: number, r: { estimatedUsd: number }) => s + r.estimatedUsd, 0) }));
} else {
  const dry = readOut("dry-run.json");
  assert.equal(dry.systemSha256, hash(PLAN_REVIEW_SYSTEM));
  saveOut("run-started.json", { at: new Date().toISOString(), retryPolicy: plan.retryPolicy });
  const { ledger, forSample } = evaluationModel({ at: dry.at, balanceUsd: dry.balanceUsd, pricing: dry.pricing });
  for (const [i, reply] of blind.replies.entries()) {
    if (ledger.blocked) break;
    const input = reviewInput(reply);
    assert.equal(hash(planReviewUser(input)), dry.requests[i].userSha256);
    const spend: Array<{ outcome: string }> = [];
    const model = forSample(reply.blindId, (request) => { assert.equal(request.schemaName, "plan_review"); assert.equal(request.system, PLAN_REVIEW_SYSTEM); assert.equal(request.maxTokens, armConfig().maxTokens); });
    const startedAt = Date.now();
    // Each arm sends its own reasoning on the request, matching the bodies it originally sent.
    const result = await reviewPlan(model, async (entry) => { spend.push(entry); }, reply.moment, input, { maxTokens: armConfig().maxTokens, reasoningEffort: armConfig().reasoningEffort });
    fs.appendFileSync(path.join(out, "reviews.ndjson"), JSON.stringify({ blindId: reply.blindId, moment: reply.moment, at: new Date().toISOString(), elapsedMs: Date.now() - startedAt, spendOutcomes: spend.map((s) => s.outcome), result }) + "\n");
    console.log(JSON.stringify({ blindId: reply.blindId, outcome: "unavailable" in result ? "unavailable" : result.problems.length ? "problems" : "ok" }));
  }
  saveOut("run-finished.json", { at: new Date().toISOString(), reviews: fs.readFileSync(path.join(out, "reviews.ndjson"), "utf8").trim().split("\n").length, ledgerBlocked: ledger.blocked, measuredUsd: ledger.measuredUsd, productionMutations: 0 });
}
