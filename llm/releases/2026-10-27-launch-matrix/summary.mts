/** After unblinding: the launch bar on shown images, first-attempt quality, retries, and the check's agreement on first attempts. Offline. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dir, json, root, save } from "./common.mjs";

const committed = (name: string) => JSON.parse(execFileSync("git", ["show", `HEAD:${path.relative(root, path.join(dir, name))}`], { cwd: root, encoding: "utf8" }));
assert.deepEqual(committed("operator-scores.json"), json("operator-scores.json"), "Commit adjudicated scores before unblinding");
const scores = json("operator-scores.json").scores as Array<{ id: string; noFormFigure: string; edges: string; text: string; overall: string; extraFigures: string; coherence: string }>;
const key = json("blind-key.json") as Record<string, { key: string; attempt: number; shown: boolean }>;
const rows = fs.readFileSync(path.join(dir, "results.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const byKey = new Map(rows.filter((r) => r.outcome === "image").map((r) => [r.key, r]));
const selectsNoForm = (caseId: string) => { const r = rows.find((x) => x.case === caseId && x.prepared); return r ? r.prepared.present.some((p: { entryId: string }) => json("snapshot.json").records[`entry:${p.entryId}`]?.payload.hasForm === false) : false; };
const labelled = scores.map((s) => ({ ...s, ...key[s.id], style: key[s.id].key.split("/")[1], case: key[s.id].key.split("/")[0] }));
const summarize = (list: typeof labelled) => {
  const by = (style?: string) => { const x = style ? list.filter((s) => s.style === style) : list; return { images: x.length, acceptable: x.filter((s) => s.overall === "acceptable").length, rate: x.length ? x.filter((s) => s.overall === "acceptable").length / x.length : null }; };
  const noForm = list.filter((s) => selectsNoForm(s.case));
  const watercolor = list.filter((s) => s.style === "watercolor");
  return { overall: by(), classical: by("classical"), watercolor: by("watercolor"), icon: by("icon"),
    noFormFigure: { images: noForm.length, figures: noForm.filter((s) => s.noFormFigure === "yes").length, anyCaseFigures: list.filter((s) => s.noFormFigure === "yes").length },
    watercolorMargins: { images: watercolor.length, margins: watercolor.filter((s) => s.edges === "margin").length },
    frames: list.filter((s) => s.edges === "frame").length, lettering: list.filter((s) => s.text === "yes").length, extraFigures: list.filter((s) => s.extraFigures === "yes").length, incoherent: list.filter((s) => s.coherence === "no").length };
};
const shown = summarize(labelled.filter((s) => s.shown)), first = summarize(labelled.filter((s) => s.attempt === 1));
const bar = { overall: (shown.overall.rate ?? 0) >= 0.75, perStyle: ["classical", "watercolor", "icon"].every((st) => (shown[st as "classical" | "watercolor" | "icon"].rate ?? 0) >= 0.65),
  noFormFigure: shown.noFormFigure.figures <= shown.noFormFigure.images / 20, watercolorMargins: shown.watercolorMargins.margins <= shown.watercolorMargins.images / 10 };
// Check agreement on first attempts: new labels for the check, which never saw them.
const agreement = (() => {
  const firsts = labelled.filter((s) => s.attempt === 1).map((s) => ({ s, check: byKey.get(s.key)!.attempts[0].check as { faults: string[] } | null }));
  const rate = (label: (s: typeof labelled[number]) => boolean, fault: string[]) => { const known = firsts.filter((f) => f.check); const pos = known.filter((f) => label(f.s)), neg = known.filter((f) => !label(f.s));
    return { positives: pos.length, caught: pos.filter((f) => f.check!.faults.some((x) => fault.includes(x))).length, negatives: neg.length, falseAlarms: neg.filter((f) => f.check!.faults.some((x) => fault.includes(x))).length }; };
  return { unchecked: firsts.filter((f) => !f.check).length, figure: rate((s) => s.noFormFigure === "yes", ["figure"]), border: rate((s) => s.edges !== "full", ["edge", "frame"]), lettering: rate((s) => s.text === "yes", ["lettering"]),
    retriedAcceptable: firsts.filter((f) => f.s.overall === "acceptable" && f.check && f.check.faults.length).length, acceptableFirsts: firsts.filter((f) => f.s.overall === "acceptable").length };
})();
const samples = rows.filter((r) => r.outcome === "image");
const latency = samples.map((r) => r.elapsedMs).sort((x, y) => x - y);
const result = { shown, firstAttempt: first, bar, passes: Object.values(bar).every(Boolean), retries: samples.filter((r) => r.attempts.length === 2).length, retryShown: samples.filter((r) => r.chosen === 2).length, samples: samples.length,
  refused: rows.filter((r) => r.outcome === "refused").map((r) => r.key), failed: rows.filter((r) => r.outcome === "failed" || r.outcome === "error").map((r) => r.key), checkAgreementOnFirstAttempts: agreement,
  latencyMs: { median: latency[Math.floor(latency.length / 2)], p90: latency[Math.floor(latency.length * 0.9)], note: "Harness sample time including preparation on each case's first style; three cases ran concurrently." } };
save("summary.json", result);
console.log(JSON.stringify(result, null, 1));
