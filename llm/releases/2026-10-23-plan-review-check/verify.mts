/** Offline replay of every retained checker reply across the three arms, with cap and score checks. No network. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { planReviewSystem, planReviewUser, reviewPlan, type ReviewInput } from "../../../src/lib/engine/plan-review";
import { dir, root, json, rate, hash, row } from "./common.mjs";
import { readDepictionProfile } from "../../../src/lib/engine/depiction";
// The Bible's depiction profile reproduces the wording these runs used (ADR 0010).
const depiction = readDepictionProfile("bible-web");
const PLAN_REVIEW_SYSTEM = planReviewSystem(depiction);

globalThis.fetch = async () => { throw Error("Offline audit forbids network"); };
const manifest = json("sha256.json");
for (const [file, digest] of Object.entries(manifest)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, file);
const plan = json("plan.json"), snapshot = rate("snapshot.json"), blind = rate("blind-replies.json");
const truth = new Map(rate("scores-operator.json").scores.map((s: { blindId: string; flags: Record<string, boolean> }) => [s.blindId, s.flags]));
const inputs = await readWorkInputs("bible-web", root);
const rules = inputs.brief.depictionRules.map((r) => `- ${r.text}`).join("\n") || "- none";
const reviewInput = (reply: { moment: string; present: string[]; scene: ReviewInput["fields"] }): ReviewInput => {
  const moment = row(snapshot, "moment", reply.moment)!, section = row(snapshot, "section", String(moment.payload.sectionId))!;
  const context = momentContext(inputs.work, { id: reply.moment, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) }, { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  const cast = (section.payload.cast as Array<{ entryId: string }>).map(({ entryId }) => ({ entryId, name: String(row(snapshot, "entry", entryId)!.payload.name), hasForm: row(snapshot, "entry", entryId)!.payload.hasForm !== false }));
  return { rules, depiction, context, sectionTitle: String(section.payload.title), cast, present: reply.present, fields: reply.scene };
};
const lines = (file: string) => fs.readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
const kinds: Record<string, string> = { unselected_figure: "U", outside_instant: "X", not_one_instant: "I", embodied_formless: "F" };
let measuredTotal = 0;
for (const [arm, config] of Object.entries(plan.arms) as Array<[string, { outputDir: string; systemText?: string; reasoningEffort: string; maxTokens: number; evaluationCapUsd?: number }]>) {
  const out = path.join(dir, config.outputDir);
  const system = config.systemText ? fs.readFileSync(path.join(dir, config.systemText), "utf8") : PLAN_REVIEW_SYSTEM;
  const traces = lines(path.join(out, "provider.ndjson")), reviews = lines(path.join(out, "reviews.ndjson")), ledger = JSON.parse(fs.readFileSync(path.join(out, "ledger.json"), "utf8"));
  const dry = JSON.parse(fs.readFileSync(path.join(out, "dry-run.json"), "utf8"));
  assert.equal(dry.systemSha256, hash(system)); assert.equal(reviews.length, 40); assert.equal(ledger.blocked, null); assert.equal(ledger.uncertainUsd, 0);
  const measured = traces.reduce((sum, t) => sum + t.measuredUsageUsd, 0);
  assert.equal(measured, ledger.measuredUsd); assert.ok(measured <= (config.evaluationCapUsd ?? plan.evaluation.capUsd)); measuredTotal += measured;
  let cursor = 0;
  for (const [i, r] of reviews.entries()) {
    const reply = blind.replies[i]; assert.equal(r.blindId, reply.blindId);
    const input = reviewInput(reply); assert.equal(hash(planReviewUser(input)), dry.requests[i].userSha256);
    const replay = await reviewPlan({ id: "offline", complete: async (request) => {
      const trace = traces[cursor++]; assert.equal(trace.phase, r.blindId);
      assert.deepEqual(trace.request.messages, [{ role: "system", content: system }, { role: "user", content: request.user }]);
      assert.deepEqual(trace.request.reasoning, { effort: config.reasoningEffort }); assert.equal(trace.request.max_tokens, config.maxTokens);
      return { content: trace.response.choices[0].message.content, model: trace.response.model, providerRequestId: null, finishReason: "stop",
        usage: { promptTokens: trace.response.usage.prompt_tokens, completionTokens: trace.response.usage.completion_tokens, costUsd: trace.measuredUsageUsd }, elapsedMs: 0 };
    } }, async () => {}, reply.moment, input, { maxTokens: config.maxTokens, reasoningEffort: config.reasoningEffort as "none" | "low" });
    assert.deepEqual(replay, r.result);
  }
  assert.equal(cursor, traces.length);
  // Recount the score from the agreed blind flags.
  const results = JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8"));
  let caught = 0, defective = 0, falseAlarms = 0, unavailable = 0;
  for (const r of reviews) {
    const t = truth.get(r.blindId) as Record<string, boolean>, bad = ["U", "X", "I", "F"].some((k) => t[k]);
    if ("unavailable" in r.result) { unavailable++; continue; }
    const reported = r.result.problems.map((p: { kind: string }) => kinds[p.kind]);
    if (bad) { defective++; if (reported.length) caught++; } else if (reported.length) falseAlarms++;
  }
  assert.deepEqual([results.counts.caught, results.counts.defective, results.counts.falseAlarms, results.counts.unavailable], [caught, defective, falseAlarms, unavailable]);
  assert.equal(results.decision, caught >= 13 && falseAlarms <= 3 && unavailable <= 2 ? "wire" : "do not wire");
  console.log(JSON.stringify({ arm, replayed: reviews.length, providerReplies: traces.length, measuredUsd: measured, caught, defective, falseAlarms, unavailable, decision: results.decision }));
}
assert.equal(json("haiku-low-v2/results.json").decision, "wire");
console.log(JSON.stringify({ hashes: Object.keys(manifest).length, measuredTotalUsd: measuredTotal, networkCalls: 0, productionMutations: 0 }));
