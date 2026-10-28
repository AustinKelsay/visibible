/** Exact retained fixtures, ordinary production preparation, memory-only writes. */
import { perform as prepare, type Operation } from "../2026-10-23-formless-selection-check/scenarios.mjs";
import { json } from "./common.mjs";
export const plan = json("plan.json");
export const operations: Operation[] = [];
for (let repeat = 1; repeat <= plan.cases.repeats; repeat++) for (const sample of plan.cases.samples) {
  operations.push({ id: `selection-${sample}-${repeat}`, kind: "pipeline", sample, arm: "candidate", repeat, defect: true });
}
export const perform = prepare;
