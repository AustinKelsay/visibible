/** Mask stored scenes before operator scoring; report paired outcomes without counting refusal as repair. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PLAN_SCENE_FIELDS } from "../../../src/lib/engine/plan-review";
import { dir, json, randomFrom, root, save } from "./common.mjs";
import { fixture, samples } from "./scenarios.mjs";

type Row = { id: string; sample: string; kind: string; arm: string; result: { outcome?: string; stored?: { payload: { plan: Record<string, string>; entries: unknown[] } } | null; look?: Record<string, unknown> | null } };
export const rows = () => fs.readFileSync(path.join(dir, "results.ndjson"), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Row);
if (process.argv[2] === "packet") {
  const stored = rows().filter((r) => r.kind === "pipeline" && r.result.stored), random = randomFrom(2026102403);
  for (let i = stored.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [stored[i], stored[j]] = [stored[j], stored[i]]; }
  const key: Record<string, string> = {}, packet = stored.map((row, i) => {
    const id = `p${String(i + 1).padStart(3, "0")}`; key[id] = row.id;
    const f = fixture(row.sample), payload = row.result.stored!.payload;
    return { id, source: f.context, section: f.section.payload.title, cast: f.records.filter((r) => r.kind === "entry").map((r) => ({ entryId: r.recordId, canon: r.payload })),
      selected: payload.entries, fields: Object.fromEntries(PLAN_SCENE_FIELDS.map((field) => [field, payload.plan[field]])), look: row.result.look };
  });
  save("blind-packet.json", { masking: "Arm, review, grounding, versions and outcome labels omitted; single operator, familiar retained cases, no independent-adjudication claim.", packet });
  save("blind-key.json", key);
  console.log(JSON.stringify({ storedScenes: packet.length, instructions: "Read the packet, score all opaque IDs and commit operator-scores.json before reading blind-key.json or running the audit." }));
}
type Score = { id: string; verdict: "acceptable" | "flawed" | "uncertain"; reason: string; lookContradiction: boolean; defects: Array<{ quote: string; reason: string }> };
function wilson(k: number, n: number) {
  const z = 1.95996398454, p = k / n, denominator = 1 + z * z / n;
  const middle = (p + z * z / (2 * n)) / denominator, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return [middle - half, middle + half];
}
function discordanceP(a: number, b: number) {
  const n = a + b; let term = 1, sum = 1;
  if (!n) return 1;
  for (let k = 1; k <= Math.min(a, b); k++) { term *= (n - k + 1) / k; sum += term; }
  return Math.min(1, 2 * sum / 2 ** n);
}
export function scoreSummary() {
  if (!fs.existsSync(path.join(dir, "operator-scores.json"))) return null;
  const data = json("operator-scores.json"), key = json("blind-key.json"), recorded = rows().filter((r) => r.kind === "pipeline");
  for (const name of ["operator-scores.json", "blind-packet.json"]) assert.deepEqual(JSON.parse(execFileSync("git", ["show", `HEAD:${path.relative(root, path.join(dir, name))}`], { cwd: root, encoding: "utf8" })), json(name), "Commit masked scores before unblinding");
  assert.equal(data.scoredBeforeUnblinding, true); assert.ok(data.scorer);
  const scores: Score[] = data.scores;
  assert.deepEqual(scores.map((s) => s.id).sort(), Object.keys(key).sort());
  assert.deepEqual(Object.values(key).sort(), recorded.filter((r) => r.result.stored).map((r) => r.id).sort());
  for (const s of scores) {
    assert.ok(["acceptable", "flawed", "uncertain"].includes(s.verdict)); assert.equal(typeof s.lookContradiction, "boolean"); assert.ok(s.reason.trim());
    const row = recorded.find((r) => r.id === key[s.id])!;
    const prose = [...Object.values(row.result.stored!.payload.plan), ...Object.values(row.result.look ?? {})].filter((v) => typeof v === "string");
    for (const d of s.defects) { assert.ok(d.quote && d.reason); assert.ok(prose.some((v) => v.includes(d.quote))); }
    if (s.verdict === "acceptable") { assert.equal(s.defects.length, 0); assert.equal(s.lookContradiction, false); }
    if (s.verdict === "flawed") assert.ok(s.defects.length > 0);
  }
  const scoreOf = (id: string) => scores.find((s) => key[s.id] === id);
  const strata = ["fresh", "retained"] as const;
  const analysis = strata.map((stratum) => {
    const chosen = samples.filter((s) => s.stratum === stratum);
    const arms = ["baseline", "candidate"].map((arm) => {
      const ids = chosen.map((s) => `${s.id}-${arm}`), acceptable = ids.filter((id) => scoreOf(id)?.verdict === "acceptable").length;
      return { arm, planned: ids.length, complete: ids.filter((id) => recorded.some((r) => r.id === id)).length, acceptable,
        flawed: ids.filter((id) => scoreOf(id)?.verdict === "flawed").length, uncertain: ids.filter((id) => scoreOf(id)?.verdict === "uncertain").length,
        refused: ids.filter((id) => recorded.some((r) => r.id === id && r.result.outcome === "refused")).length,
        lookContradictions: ids.filter((id) => scoreOf(id)?.lookContradiction).length, acceptableRateWilson95: wilson(acceptable, ids.length) };
    });
    const table = { bothAcceptable: 0, baselineOnly: 0, candidateOnly: 0, neither: 0, incomplete: 0 };
    for (const s of chosen) {
      if (!["baseline", "candidate"].every((arm) => recorded.some((r) => r.id === `${s.id}-${arm}`))) { table.incomplete++; continue; }
      const a = scoreOf(`${s.id}-baseline`)?.verdict === "acceptable", b = scoreOf(`${s.id}-candidate`)?.verdict === "acceptable";
      table[a && b ? "bothAcceptable" : a ? "baselineOnly" : b ? "candidateOnly" : "neither"]++;
    }
    return { stratum, arms, paired: table, exactDiscordanceP: discordanceP(table.baselineOnly, table.candidateOnly) };
  });
  const all = analysis.flatMap((s) => s.arms), candidate = all.filter((a) => a.arm === "candidate"), baseline = all.filter((a) => a.arm === "baseline");
  const total = (values: typeof all, field: "acceptable" | "refused") => values.reduce((n, a) => n + a[field], 0);
  const pass = recorded.length === 60 && all.every((a) => a.complete === a.planned) && candidate.every((a) => a.flawed === 0 && a.uncertain === 0 && a.lookContradictions === 0)
    && analysis[0].arms[1].acceptable >= 22 && analysis[1].arms[1].acceptable === 7
    && total(candidate, "acceptable") > total(baseline, "acceptable") && analysis[1].arms[1].acceptable > analysis[1].arms[0].acceptable
    && total(candidate, "refused") <= total(baseline, "refused");
  return { analysis, pass, limitation: "Descriptive small paired diagnostic; refusals and incomplete pairs retained; single operator masking is not independent adjudication." };
}
