/** After unblinding: Fresco's shown-image results against the per-style bar, by fault and case. Offline. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dir, json, root, save } from "./common.mjs";

const committed = (name: string) => JSON.parse(execFileSync("git", ["show", `HEAD:${path.relative(root, path.join(dir, name))}`], { cwd: root, encoding: "utf8" }));
assert.deepEqual(committed("operator-scores.json"), json("operator-scores.json"), "Commit adjudicated scores before unblinding");
type Score = { id: string; noFormFigure: string; edges: string; text: string; extraFigures: string; coherence: string; matchesScene: string; overall: string };
const scores = json("operator-scores.json").scores as Score[];
const key = json("blind-key.json") as Record<string, { key: string; attempt: number; shown: boolean }>;
const read = (name: string) => fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const rows = read("results.ndjson");
const labelled = scores.map((s) => ({ ...s, ...key[s.id], style: key[s.id].key.split("/")[1], case: key[s.id].key.split("/")[0] }));
const faults = (s: Score) => [s.noFormFigure === "yes" && "noFormFigure", s.edges === "margin" && "margin", s.edges === "frame" && "frame", s.text === "yes" && "lettering",
  s.extraFigures === "yes" && "extraFigures", s.coherence === "no" && "incoherent", s.matchesScene !== "yes" && `scene ${s.matchesScene}`].filter(Boolean) as string[];
const result: Record<string, unknown> = {};
for (const style of json("plan.json").styles as string[]) {
  const shown = labelled.filter((s) => s.shown && s.style === style), first = labelled.filter((s) => s.attempt === 1 && s.style === style);
  const byFault: Record<string, number> = {}; for (const s of shown.filter((x) => x.overall !== "acceptable")) for (const f of faults(s)) byFault[f] = (byFault[f] ?? 0) + 1;
  result[style] = { shown: shown.length, acceptable: shown.filter((s) => s.overall === "acceptable").length, firstAttemptAcceptable: first.filter((s) => s.overall === "acceptable").length,
    retries: rows.filter((r) => r.outcome === "image" && r.style === style && r.attempts.length === 2).length, faultsInFlawedShown: byFault,
    perCase: Object.fromEntries(shown.map((s) => [s.case, s.overall === "acceptable" ? "ok" : faults(s).join("+") || s.overall])) };
}
save("summary.json", result);
console.log(JSON.stringify(result, null, 1));
