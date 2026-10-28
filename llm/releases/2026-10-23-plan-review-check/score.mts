/** Scores one checker arm against the agreed blind flags. No network or model calls. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { dir, json, rate } from "./common.mjs";

const arm = process.argv[2] ?? "haiku-none";
const out = arm === "haiku-none" ? dir : path.join(dir, arm);
const plan = json("plan.json"), truth = new Map(rate("scores-operator.json").scores.map((s: { blindId: string; flags: Record<string, boolean> }) => [s.blindId, s.flags]));
const kinds: Record<string, string> = { unselected_figure: "U", outside_instant: "X", not_one_instant: "I", embodied_formless: "F" };
const reviews = fs.readFileSync(path.join(out, "reviews.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
assert.equal(reviews.length, 40);
const counts = { defective: 0, caught: 0, missed: 0, clean: 0, falseAlarms: 0, unavailable: 0, unavailableDefective: 0 };
const perKind: Record<string, { agree: number; missed: number; extra: number }> = Object.fromEntries(["U", "X", "I", "F"].map((k) => [k, { agree: 0, missed: 0, extra: 0 }]));
for (const r of reviews) {
  const t = truth.get(r.blindId) as Record<string, boolean>; assert.ok(t);
  const defective = ["U", "X", "I", "F"].some((k) => t[k]);
  if ("unavailable" in r.result) { counts.unavailable++; if (defective) counts.unavailableDefective++; continue; }
  const reported = new Set(r.result.problems.map((p: { kind: string }) => kinds[p.kind]));
  if (defective) { counts.defective++; if (reported.size) counts.caught++; else counts.missed++; }
  else { counts.clean++; if (reported.size) counts.falseAlarms++; }
  for (const k of ["U", "X", "I", "F"]) {
    if (t[k] && reported.has(k)) perKind[k].agree++; else if (t[k]) perKind[k].missed++; else if (reported.has(k)) perKind[k].extra++;
  }
}
const met = { recall: counts.caught >= 13, falseAlarms: counts.falseAlarms <= 3, unavailable: counts.unavailable <= 2 };
const result = { at: new Date().toISOString(), arm, counts, perKind, targetsMet: met, decision: Object.values(met).every(Boolean) ? "wire" : "do not wire", note: "Unavailable reviews are excluded from recall and false-alarm counts and reported separately." };
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(result));
void plan;
