/** Compare one run's checks with the adjudicated labels, against the predeclared criteria. Offline. */
import fs from "node:fs";
import path from "node:path";

import { dir, items } from "./common.mjs";

type Check = { figure_in_light: boolean; unpainted_edge: boolean; painted_frame: boolean; lettering: boolean };
const runName = process.argv[2];
const set = runName === "holdout" ? "holdout" : "dev";
const load = (name: string) => new Map(fs.readFileSync(path.join(dir, `results-${name}.ndjson`), "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((r) => [r.key, r]));
// v3 takes edges and frames from the direct question and figures and lettering from the describe-first one.
const combine = (edge?: Check, figure?: Check): Check | undefined => edge && figure
  ? { figure_in_light: figure.figure_in_light, lettering: figure.lettering, painted_frame: edge.painted_frame, unpainted_edge: edge.unpainted_edge } : undefined;
const checks: Map<string, Check | undefined> = runName === "dev-combined"
  ? (() => { const v1 = load("dev"), v2 = load("dev-revised"); return new Map([...v1.keys()].map((k) => [k, combine(v1.get(k)?.check, v2.get(k)?.check)])); })()
  : runName === "holdout" ? new Map([...load("holdout")].map(([k, r]) => [k, combine(r.edge, r.figure)]))
  : new Map([...load(runName)].map(([k, r]) => [k, r.check]));
const sceneCheckFaults = (c: Check) => [c.figure_in_light, c.lettering, c.painted_frame, c.unpainted_edge].filter(Boolean);
const data = items(set).map((item) => ({ item, check: checks.get(item.key) }));
const errors = data.filter((d) => !d.check).map((d) => d.item.key);
const scored = data.filter((d) => d.check);
const rate = (label: (d: typeof scored[number]) => boolean, found: (d: typeof scored[number]) => boolean) => {
  const positives = scored.filter(label), negatives = scored.filter((d) => !label(d));
  return { positives: positives.length, caught: positives.filter(found).length, recall: positives.length ? positives.filter(found).length / positives.length : null,
    negatives: negatives.length, falseAlarms: negatives.filter(found).length, falseAlarmRate: negatives.length ? negatives.filter(found).length / negatives.length : null,
    missed: positives.filter((d) => !found(d)).map((d) => d.item.key), alarms: negatives.filter(found).map((d) => d.item.key) };
};
const metrics = {
  run: runName, images: data.length, errors,
  figure: rate((d) => d.item.label.figure, (d) => d.check!.figure_in_light),
  border: rate((d) => d.item.label.edge || d.item.label.frame, (d) => d.check!.unpainted_edge || d.check!.painted_frame),
  lettering: rate((d) => d.item.label.lettering, (d) => d.check!.lettering),
  retryOnAcceptable: (() => { const ok = scored.filter((d) => d.item.label.acceptable); const r = ok.filter((d) => sceneCheckFaults(d.check!).length); return { acceptable: ok.length, wouldRetry: r.length, rate: ok.length ? r.length / ok.length : null, keys: r.map((d) => d.item.key) }; })(),
  retryOnFlawed: (() => { const bad = scored.filter((d) => !d.item.label.acceptable); const r = bad.filter((d) => sceneCheckFaults(d.check!).length); return { flawed: bad.length, wouldRetry: r.length }; })(),
};
const pass = errors.length === 0 && (metrics.figure.recall ?? 0) >= 0.8 && (metrics.figure.falseAlarmRate ?? 1) <= 0.1
  && (metrics.border.recall ?? 0) >= 0.7 && (metrics.border.falseAlarmRate ?? 1) <= 0.1
  && (metrics.lettering.recall ?? 0) >= 0.6 && (metrics.lettering.falseAlarmRate ?? 1) <= 0.1 && (metrics.retryOnAcceptable.rate ?? 1) <= 0.2;
fs.writeFileSync(path.join(dir, `metrics-${runName}.json`), JSON.stringify({ ...metrics, pass }, null, 2) + "\n");
const short = (m: ReturnType<typeof rate>) => `${m.caught}/${m.positives} caught, ${m.falseAlarms}/${m.negatives} false alarms`;
console.log(JSON.stringify({ run: runName, figure: short(metrics.figure), border: short(metrics.border), lettering: short(metrics.lettering), retryOnAcceptable: `${metrics.retryOnAcceptable.wouldRetry}/${metrics.retryOnAcceptable.acceptable}`, errors: errors.length, pass }));
