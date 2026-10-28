/** Unblinds the scored replies and counts passes per contract and moment. No network or model calls. */
import assert from "node:assert/strict";
import { json, save } from "./inspect.mjs";

type Flags = { U: boolean; X: boolean; I: boolean; F: boolean; N: boolean };
const blockers = ["U", "X", "I", "F"] as const;
const plan = json("plan.json"), blind = json("blind-replies.json"), key = json("blind-key.json").key;
const operator = json("scores-operator.json"), subagent = json("scores-subagent.json"), adjudication = json("adjudication.json");
// Both scorers finished, and every disagreement was settled, before the key was read here.
for (const name of ["scores-operator.json", "scores-subagent.json", "adjudication.json"]) assert.ok(Date.parse(json(name).at) < Date.now());
assert.ok(Date.parse(adjudication.at) >= Math.max(Date.parse(operator.at), Date.parse(subagent.at)));
const byId = (scores: { scores: Array<{ blindId: string; flags: Flags }> }) => new Map(scores.scores.map((s) => [s.blindId, s.flags]));
const op = byId(operator), sa = byId(subagent), settled = new Map<string, { flags: Flags; rationale: string }>(adjudication.decisions.map((d: { blindId: string; flags: Flags; rationale: string }) => [d.blindId, d]));
const scorable = blind.replies.filter((r: { scene: unknown }) => r.scene).map((r: { blindId: string }) => r.blindId);
let agreed = 0, blockerAgreed = 0, noteAgreed = 0;
const finalFlags = new Map<string, Flags>();
for (const id of scorable) {
  const a = op.get(id)!, b = sa.get(id)!; assert.ok(a && b, `missing score for ${id}`);
  // Notes never block a pass, but any differing flag, note included, needs a recorded decision.
  const blockersSame = blockers.every((f) => a[f] === b[f]), noteSame = a.N === b.N, same = blockersSame && noteSame;
  if (blockersSame) blockerAgreed++;
  if (noteSame) noteAgreed++;
  if (same) { agreed++; assert.ok(!settled.has(id) || [...blockers, "N" as const].every((f) => settled.get(id)!.flags[f] === a[f])); finalFlags.set(id, a); }
  else { assert.ok(settled.has(id), `disagreement ${id} needs adjudication`); finalFlags.set(id, settled.get(id)!.flags); }
}
const cells: Record<string, Record<string, { taken: number; stored: number; refused: number; invalid: number; clean: number; pass: number; flags: Record<string, number> }>> = {};
for (const k of key) {
  const cell = ((cells[k.contract] ??= {})[k.unit] ??= { taken: 0, stored: 0, refused: 0, invalid: 0, clean: 0, pass: 0, flags: { U: 0, X: 0, I: 0, F: 0, N: 0 } });
  cell.taken++;
  if (k.outcome === "stored") cell.stored++; else if (k.outcome === "refused") cell.refused++; else cell.invalid++;
  const flags = finalFlags.get(k.blindId);
  if (flags) { for (const f of Object.keys(cell.flags)) if (flags[f as keyof Flags]) cell.flags[f]++; }
  const clean = !!flags && blockers.every((f) => !flags[f]);
  if (clean) cell.clean++;
  if (clean && k.outcome === "stored") cell.pass++;
}
const totals = Object.fromEntries(Object.entries(cells).map(([c, m]) => [c, Object.values(m).reduce((t, x) => ({ taken: t.taken + x.taken, pass: t.pass + x.pass }), { taken: 0, pass: 0 })]));
const per = plan.samples.perCell;
const everyMoment = (c: string, test: (pass: number) => boolean) => plan.samples.moments.every((u: string) => test(cells[c][u].pass));
const verdict = ["v3", "v4"].some((c) => everyMoment(c, (p) => p >= 4)) ? "converging"
  : plan.samples.moments.some((u: string) => ["v3", "v4"].every((c) => cells[c][u].pass <= 2)) ? "notConverging" : "mixed";
save("tally.json", { at: new Date().toISOString(), perCell: per, scorerAgreement: { scope: "all flags, including notes", scorable: scorable.length, agreed, blockerAgreed, noteAgreed, noteDisagreed: scorable.length - noteAgreed, adjudicated: scorable.length - agreed }, cells, totals, verdict, interpretation: plan.interpretation[verdict] });
console.log(JSON.stringify({ agreed, blockerAgreed, noteAgreed, scorable: scorable.length, totals, verdict }));
for (const c of ["v3", "v4"]) for (const u of plan.samples.moments) console.log(c, u, JSON.stringify(cells[c][u]));
