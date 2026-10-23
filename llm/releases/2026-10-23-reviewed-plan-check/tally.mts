/** Unblinds the scored samples and compares passes with the v3/v4 baselines. No network or model calls. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { dir, json, save } from "./inspect.mjs";

type Flags = { U: boolean; X: boolean; I: boolean; F: boolean; N: boolean };
const blockers = ["U", "X", "I", "F"] as const;
const plan = json("plan.json"), blind = json("blind-replies.json"), key = json("blind-key.json").key;
const operator = json("scores-operator.json"), subagent = json("scores-subagent.json"), adjudication = json("adjudication.json");
assert.ok(Date.parse(adjudication.at) >= Math.max(Date.parse(operator.at), Date.parse(subagent.at)));
const byId = (scores: { scores: Array<{ blindId: string; flags: Flags }> }) => new Map(scores.scores.map((s) => [s.blindId, s.flags]));
const op = byId(operator), sa = byId(subagent), settled = new Map<string, Flags>(adjudication.decisions.map((d: { blindId: string; flags: Flags }) => [d.blindId, d.flags]));
let agreed = 0, blockerAgreed = 0, noteAgreed = 0;
const finalFlags = new Map<string, Flags>();
for (const { blindId } of blind.replies) {
  const a = op.get(blindId)!, b = sa.get(blindId)!; assert.ok(a && b, `missing score for ${blindId}`);
  const blockersSame = blockers.every((f) => a[f] === b[f]), noteSame = a.N === b.N;
  if (blockersSame) blockerAgreed++; if (noteSame) noteAgreed++;
  if (blockersSame && noteSame) { agreed++; finalFlags.set(blindId, a); } else { assert.ok(settled.has(blindId), `disagreement ${blindId} needs adjudication`); finalFlags.set(blindId, settled.get(blindId)!); }
}
const samples = new Map(fs.readFileSync(path.join(dir, "samples.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line)).map((s) => [s.id, s]));
const cells: Record<string, { taken: number; stored: number; refused: number; invalid: number; replanned: number; pass: number; cleanButRefused: number; defectStored: number; correctRefusal: number; flags: Record<string, number> }> = {};
for (const k of key) {
  const sample = samples.get(k.sample)!, flags = finalFlags.get(k.blindId)!;
  const cell = (cells[k.unit] ??= { taken: 0, stored: 0, refused: 0, invalid: 0, replanned: 0, pass: 0, cleanButRefused: 0, defectStored: 0, correctRefusal: 0, flags: { U: 0, X: 0, I: 0, F: 0, N: 0 } });
  cell.taken++;
  const stored = k.outcome === "stored", clean = blockers.every((f) => !flags[f]);
  if (stored) cell.stored++; else if (k.outcome === "refused") cell.refused++; else cell.invalid++;
  if (sample.spendOutcomes.filter((o: string) => o === "ok" || o === "unavailable").length > 1 || k.rounds === 2) cell.replanned++;
  for (const f of Object.keys(cell.flags)) if (flags[f as keyof Flags]) cell.flags[f]++;
  if (stored && clean) cell.pass++;
  if (!stored && clean) cell.cleanButRefused++;
  if (stored && !clean) cell.defectStored++;
  if (!stored && !clean) cell.correctRefusal++;
}
const total = plan.samples.moments.reduce((t: number, u: string) => t + cells[u].pass, 0);
const verdict = plan.samples.moments.every((u: string) => cells[u].pass >= 4) ? "converging" : plan.samples.moments.some((u: string) => cells[u].pass <= 2) ? "notConverging" : "mixed";
const comparison = Object.fromEntries(plan.samples.moments.map((u: string) => [u, { reviewed: cells[u].pass, v3: plan.baselines.perMoment[u].v3, v4: plan.baselines.perMoment[u].v4 }]));
save("tally.json", { at: new Date().toISOString(), scorerAgreement: { scope: "all flags, including notes", scorable: blind.replies.length, agreed, blockerAgreed, noteAgreed, adjudicated: blind.replies.length - agreed }, cells, total: { pass: total, taken: key.length }, baselines: plan.baselines, comparison, verdict, interpretation: plan.interpretation[verdict] });
console.log(JSON.stringify({ total, verdict, comparison }));
for (const u of plan.samples.moments) console.log(u, JSON.stringify(cells[u]));
