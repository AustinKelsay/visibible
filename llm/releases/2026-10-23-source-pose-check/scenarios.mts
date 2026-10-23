/** Local retained fixtures, paired reviews and ordinary production prepareMoment in memory only. */
import fs from "node:fs";
import path from "node:path";
import { reviewPlan, type ReviewInput } from "../../../src/lib/engine/plan-review";
import type { TextModel } from "../../../src/lib/reading-pass/model";
import { perform as priorPerform } from "../2026-10-23-formless-selection-check/scenarios.mjs";
import { dir, json } from "./common.mjs";

export const plan = json("plan.json");
export const baselineDir = path.resolve(dir, plan.baseline);
export const cases = json("review-cases.json") as Array<{ id: string; targets: Array<{ kind: string; entryId: string }>; input: ReviewInput }>;
export type Operation = { id: string; kind: "review" | "pipeline"; sample: string; arm: "baseline" | "candidate"; repeat: number; defect: boolean };
export const operations: Operation[] = [];
for (let repeat = 1; repeat <= plan.cases.reviewRepeats; repeat++) {
  for (const c of cases) for (const arm of ["baseline", "candidate"] as const) operations.push({ id: `review-${c.id}-${arm}-${repeat}`, kind: "review", sample: c.id, arm, repeat, defect: c.targets.length > 0 });
}
for (let repeat = 1; repeat <= plan.cases.repeats; repeat++) for (const sample of [...plan.cases.defects, ...plan.cases.ordinaryLightControls].sort()) {
  operations.push({ id: `pipeline-${sample}-${repeat}`, kind: "pipeline", sample, arm: "candidate", repeat, defect: plan.cases.defects.includes(sample) });
}
export async function perform(op: Operation, model: TextModel) {
  if (op.kind === "pipeline") return priorPerform(op, model);
  const input = cases.find((c) => c.id === op.sample)!.input;
  const chosen = op.arm === "candidate" ? model : { id: model.id, complete: (request: Parameters<TextModel["complete"]>[0]) => model.complete({ ...request, system: fs.readFileSync(path.join(dir, "baseline-review-system.txt"), "utf8") }) };
  return reviewPlan(chosen, async () => {}, op.id, input);
}
