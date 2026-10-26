/** Mask stored scenes before scoring; report outcomes per stratum without counting refusal as repair. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PLAN_SCENE_FIELDS } from "../../../src/lib/engine/plan-review";
import { dir, json, randomFrom, root, save } from "./common.mjs";
import { fixture, samples } from "./scenarios.mjs";

type Row = { id: string; sample: string; stratum: "fresh" | "retained"; result: { outcome: string; stored: { payload: { plan: Record<string, string>; entries: unknown[] } } | null; renderedConditions: Record<string, unknown> | null } };
export const rows = () => fs.readFileSync(path.join(dir, "results.ndjson"), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Row);
if (process.argv[2] === "packet") {
  const stored = rows().filter((r) => r.result.stored), random = randomFrom(json("plan.json").sampling.maskSeed);
  for (let i = stored.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [stored[i], stored[j]] = [stored[j], stored[i]]; }
  const key: Record<string, string> = {}, packet = stored.map((row, i) => {
    const id = `p${String(i + 1).padStart(3, "0")}`; key[id] = row.id;
    const f = fixture(row.sample), payload = row.result.stored!.payload;
    return { id, source: f.context, section: { title: f.section.payload.title, firstUnit: f.section.payload.firstUnit, lastUnit: f.section.payload.lastUnit },
      cast: (f.section.payload.cast as Array<{ entryId: string; stageId: string }>).map((member) => ({ ...member, canon: f.records.find((r) => r.kind === "entry" && r.recordId === member.entryId)!.payload })),
      selected: payload.entries, fields: Object.fromEntries(PLAN_SCENE_FIELDS.map((field) => [field, payload.plan[field]])), conditions: row.result.renderedConditions };
  });
  save("blind-packet.json", { masking: "Stratum, review, grounding, versions and outcome labels omitted. Two independent model scorers plus one familiar operator; no independent human adjudication claim.", packet });
  save("blind-key.json", key);
  console.log(JSON.stringify({ storedScenes: packet.length, instructions: "Score every opaque ID independently twice, adjudicate, and commit scorer-a.json, scorer-b.json and operator-scores.json before reading blind-key.json or running the audit." }));
}
type Score = { id: string; verdict: "acceptable" | "flawed" | "uncertain"; reason: string; lookContradiction: boolean; defects: Array<{ quote: string; reason: string }> };
function wilson(k: number, n: number) {
  if (!n) return [0, 1];
  const z = 1.95996398454, p = k / n, denominator = 1 + z * z / n;
  const middle = (p + z * z / (2 * n)) / denominator, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return [middle - half, middle + half];
}
const committed = (name: string) => JSON.parse(execFileSync("git", ["show", `HEAD:${path.relative(root, path.join(dir, name))}`], { cwd: root, encoding: "utf8" }));
export function scoreSummary() {
  if (!fs.existsSync(path.join(dir, "operator-scores.json"))) return null;
  for (const name of ["operator-scores.json", "scorer-a.json", "scorer-b.json", "blind-packet.json"]) assert.deepEqual(committed(name), json(name), "Commit masked scores before unblinding");
  const data = json("operator-scores.json"), key = json("blind-key.json"), recorded = rows();
  assert.equal(data.scoredBeforeUnblinding, true); assert.ok(data.scorer);
  const check = (scores: Score[]) => {
    assert.deepEqual(scores.map((s) => s.id).sort(), Object.keys(key).sort());
    for (const s of scores) {
      assert.ok(["acceptable", "flawed", "uncertain"].includes(s.verdict)); assert.equal(typeof s.lookContradiction, "boolean"); assert.ok(s.reason.trim());
      const row = recorded.find((r) => r.id === key[s.id])!;
      const prose = [...Object.values(row.result.stored!.payload.plan), ...Object.values(row.result.renderedConditions ?? {})].filter((v) => typeof v === "string") as string[];
      for (const d of s.defects) { assert.ok(d.quote && d.reason); assert.ok(prose.some((v) => v.includes(d.quote)), `${s.id}: defect quote not in scene prose`); }
      if (s.verdict === "acceptable") { assert.equal(s.defects.length, 0); assert.equal(s.lookContradiction, false); }
      if (s.verdict === "flawed") assert.ok(s.defects.length > 0);
    }
    return scores;
  };
  const scores = check(data.scores), a = check(json("scorer-a.json").scores), b = check(json("scorer-b.json").scores);
  assert.deepEqual(Object.values(key).sort(), recorded.filter((r) => r.result.stored).map((r) => r.id).sort());
  const verdict = (list: Score[], id: string) => list.find((s) => key[s.id] === id)?.verdict;
  const strata = (["fresh", "retained"] as const).map((stratum) => {
    const ids = samples.filter((s) => s.stratum === stratum).map((s) => s.id), acceptable = ids.filter((id) => verdict(scores, id) === "acceptable").length;
    return { stratum, planned: ids.length, complete: ids.filter((id) => recorded.some((r) => r.id === id)).length, acceptable,
      flawed: ids.filter((id) => verdict(scores, id) === "flawed").length, uncertain: ids.filter((id) => verdict(scores, id) === "uncertain").length,
      refused: ids.filter((id) => recorded.some((r) => r.id === id && r.result.outcome === "refused")).length,
      lookContradictions: ids.filter((id) => scores.find((s) => key[s.id] === id)?.lookContradiction).length, acceptableRateWilson95: wilson(acceptable, ids.length) };
  });
  const agreement = Object.keys(key).filter((id) => a.find((s) => s.id === id)!.verdict === b.find((s) => s.id === id)!.verdict).length;
  const independent = { scorerA: a.filter((s) => s.verdict === "acceptable").length, scorerB: b.filter((s) => s.verdict === "acceptable").length,
    bothAcceptable: Object.keys(key).filter((id) => a.find((s) => s.id === id)!.verdict === "acceptable" && b.find((s) => s.id === id)!.verdict === "acceptable").length,
    verdictAgreement: agreement, scored: Object.keys(key).length };
  const [fresh, retained] = strata;
  const pass = recorded.length === 30 && strata.every((s) => s.complete === s.planned) && fresh.acceptable >= 22 && retained.acceptable === 7 && strata.every((s) => s.flawed === 0 && s.uncertain === 0);
  return { strata, independent, pass, limitation: "Thirty cases; wide intervals. Model scorers and one familiar operator are not human adjudication. Refusals and incomplete cases are retained." };
}
