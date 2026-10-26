/** Post-run, model-free summaries. Never changes the frozen protocol, first scores or paid artifacts. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { dir, json, save } from "./common.mjs";
import { cases } from "./controls.mjs";
import { invalidReview, planReviewSchema } from "../../../src/lib/engine/plan-review";

globalThis.fetch = async () => { throw Error("Post-run summary forbids network"); };
type Arm = "baseline" | "candidate";
type Verdict = "acceptable" | "flawed" | "uncertain";
type Score = { id: string; verdict: Verdict; lookContradiction: boolean };
type Row = { id: string; kind: string; arm: Arm; stratum: string; result: { outcome?: string; error?: string; stored?: unknown } };
const lines = (name: string) => fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").filter(Boolean).map((s) => JSON.parse(s));
const rows: Row[] = lines("results.ndjson"), pipeline = rows.filter((r) => r.kind === "pipeline");
const tally = json("tally.json"), plan = json("plan.json"), key: Record<string, string> = json("blind-key.json"), scores: Score[] = json("operator-scores.json").scores;
assert.equal(pipeline.length, 60); assert.equal(rows.length, 92); assert.equal(tally.uncertainUsd, 0);
const round = (value: number) => Number(value.toFixed(8));
const arms: Arm[] = ["baseline", "candidate"];
function wilson(k: number, n: number) {
  const z = 1.95996398454, p = k / n, d = 1 + z * z / n;
  const m = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [m - h, m + h];
}
function counts(values: Score[]) {
  return arms.map((arm) => {
    const all = pipeline.filter((r) => r.arm === arm), of = (r: Row) => values.find((s) => key[s.id] === r.id);
    const acceptable = all.filter((r) => of(r)?.verdict === "acceptable").length;
    return { arm, planned: all.length, stored: all.filter((r) => r.result.stored).length, acceptable,
      flawed: all.filter((r) => of(r)?.verdict === "flawed").length, uncertain: all.filter((r) => of(r)?.verdict === "uncertain").length,
      refused: all.filter((r) => r.result.outcome === "refused").length,
      freshAcceptable: all.filter((r) => r.stratum === "fresh" && of(r)?.verdict === "acceptable").length,
      retainedAcceptable: all.filter((r) => r.stratum === "retained" && of(r)?.verdict === "acceptable").length,
      lookContradictions: all.filter((r) => of(r)?.lookContradiction).length, acceptableRateWilson95: wilson(acceptable, all.length) };
  });
}
function refusal(error: string) {
  if (error.includes("rendering review: look_conflict:")) return "reported_look_conflict";
  if (error.includes("required canon unavailable:")) return "reported_missing_canon";
  if (error.includes("plan review unavailable:")) return "review_unavailable";
  if (error.includes("plan review:")) return "plan_review_rejection";
  if (error.includes("look unavailable: schema:")) return "look_schema";
  if (error.includes("successive instants")) return "grounding_rejection";
  throw Error(`Unclassified first outcome: ${error}`);
}
const refusals = arms.map((arm) => {
  const cases = pipeline.filter((r) => r.arm === arm && r.result.outcome === "refused").map((r) => ({ id: r.id, stratum: r.stratum, category: refusal(r.result.error!) }));
  const categories: Record<string, number> = {};
  for (const c of cases) categories[c.category] = (categories[c.category] ?? 0) + 1;
  return { arm, cases, categories };
});
const controls = arms.map((arm) => {
  const reviews = (tally.reviews as Array<{ arm: Arm; id: string; pass: boolean; problems: unknown[] | null; unavailable?: string }>).filter((r) => r.arm === arm);
  const positives = new Set(cases.filter((c) => c.required.length === 0).map((c) => c.id));
  const clean = reviews.filter((r) => positives.has(r.id.slice(0, -(arm.length + 1))));
  return { arm, passed: reviews.filter((r) => r.pass).length, planned: reviews.length, cleanCases: clean.length,
    cleanFalseAlarms: clean.filter((r) => r.problems && r.problems.length > 0).length, unavailable: reviews.filter((r) => r.unavailable).length,
    failed: reviews.filter((r) => !r.pass).map((r) => r.id) };
});
const first = counts(scores), alternatives: Array<{ id: string; verdicts: Verdict[] }> = json("scoring-sensitivity.json").alternatives;
const ranges = arms.map((arm) => ({ arm, acceptableMinimum: 30, acceptableMaximum: 0 }));
let combinations = 0, pipelineGatePasses = 0, differenceMinimum = 30, differenceMaximum = -30;
function enumerate(at: number, current: Score[]) {
  if (at < alternatives.length) {
    const option = alternatives[at], original = scores.find((s) => s.id === option.id)!;
    for (const verdict of [original.verdict, ...option.verdicts]) enumerate(at + 1, current.map((s) => s.id === option.id ? { ...s, verdict } : s));
    return;
  }
  combinations++;
  const c = counts(current);
  for (const [i, value] of c.entries()) { ranges[i].acceptableMinimum = Math.min(ranges[i].acceptableMinimum, value.acceptable); ranges[i].acceptableMaximum = Math.max(ranges[i].acceptableMaximum, value.acceptable); }
  const delta = c[1].acceptable - c[0].acceptable;
  differenceMinimum = Math.min(differenceMinimum, delta); differenceMaximum = Math.max(differenceMaximum, delta);
  if (c[1].freshAcceptable >= 22 && c[1].retainedAcceptable === 7 && c[1].flawed === 0 && c[1].uncertain === 0 && c[1].lookContradictions === 0
    && c[1].acceptable >= c[0].acceptable && c[1].retainedAcceptable >= c[0].retainedAcceptable && c[1].refused <= c[0].refused) pipelineGatePasses++;
}
enumerate(0, scores);
assert.equal(pipelineGatePasses, 0);
const sensitivity = { firstScoresUnchanged: true, alternativesFrozenBeforeUnblinding: true, combinations, ranges, differenceMinimum, differenceMaximum, pipelineGatePasses,
  allStoresAcceptedUpperBound: first.map((a) => ({ arm: a.arm, acceptable: a.stored,
    freshAcceptable: pipeline.filter((r) => r.arm === a.arm && r.stratum === "fresh" && r.result.stored).length,
    retainedAcceptable: pipeline.filter((r) => r.arm === a.arm && r.stratum === "retained" && r.result.stored).length })),
  limitation: "Explicit disputed readings only, not independent rescoring or a population interval. Even accepting every stored packet cannot pass availability." };
const budget = { allowance: "evaluation", increaseUsd: 0, authorizedUsd: plan.evaluation.proposedAuthorizedUsd, operationCapUsd: plan.evaluation.proposedOperationCapUsd,
  measuredBeforeUsd: plan.evaluation.measuredBeforeUsd, measuredThisRunUsd: round(tally.measuredUsd), measuredTotalUsd: round(plan.evaluation.measuredBeforeUsd + tally.measuredUsd),
  retainedUncertaintyUsd: round(plan.evaluation.uncertaintyBeforeUsd + tally.uncertainUsd), remainingUsd: round(plan.evaluation.proposedAuthorizedUsd - plan.evaluation.measuredBeforeUsd - tally.measuredUsd - plan.evaluation.uncertaintyBeforeUsd - tally.uncertainUsd),
  preparationRemainingUsd: 39.3131968, smokeRemainingUsd: 0.314205, transfersUsd: 0, grantEndedWithThisOneAttempt: true };
const analysis = { operations: rows.length, calls: tally.calls, offlineReplay: true, overall: first, controls, refusals,
  reviewGate: tally.reviewGate, pipelineGate: tally.scoring.pass, pass: tally.pass, releaseHold: true,
  limitation: "Terminal refusal categories are reported reasons, not adjudicated valid refusals. Same semantic prompts and independent look/plan draws prevent attributing semantic differences to citation handling." };
const time = cases.find((c) => c.id === "look-time")!;
const timeReplies = lines("provider.ndjson").filter((p) => p.phase === "look-time-baseline" || p.phase === "look-time-candidate");
assert.equal(timeReplies.length, 3);
for (const p of timeReplies) assert.deepEqual(p.request, timeReplies[0].request);
const citationReplay = { identicalRecordedHttpRequests: true, method: "Model-free v7 validation of the three retained time-control replies. The actual v6 unavailable outcome stays unchanged; this counterfactual is not new paid evidence or an extra control score.",
  replies: timeReplies.map((p) => {
    const parsed = planReviewSchema.parse(JSON.parse(p.response.choices[0].message.content));
    assert.equal(invalidReview(parsed.problems, time.input), null);
    return { phase: p.phase, quotes: parsed.problems.map((problem) => problem.planQuote), validUnderV7: true };
  }), paidCalls: 0, productionMutations: 0 };
for (const [name, data] of [["outcome-analysis.json", analysis], ["sensitivity-tally.json", sensitivity], ["budget.json", budget], ["citation-format-replay.json", citationReplay]] as const) {
  assert.ok(process.argv[2] === "capture" || process.argv[2] === "verify");
  if (process.argv[2] === "capture" && !fs.existsSync(path.join(dir, name))) save(name, data);
  else assert.deepEqual(json(name), data);
}
console.log(JSON.stringify({ offline: true, operations: rows.length, calls: tally.calls, overall: first, controls, sensitivity, budget }));
