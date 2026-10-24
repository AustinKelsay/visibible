/** Frozen direct review cases and ordinary production preparations; local retained fixtures only. */
import { reviewPlan, type ReviewInput } from "../../../src/lib/engine/plan-review";
import type { TextModel } from "../../../src/lib/reading-pass/model";
import { perform as prepare, type Operation as Preparation } from "../2026-10-23-formless-selection-check/scenarios.mjs";
import { json } from "./common.mjs";
export const plan = json("plan.json");
export const cases = json("review-cases.json") as Array<{ id: string; provenance: string; required: Array<{ kind: string; entryId: string }>; input: ReviewInput }>;
export type Operation = { id: string; kind: "review" | "pipeline"; sample: string; arm: "candidate"; repeat: number; defect: boolean };
export const operations: Operation[] = [
  ...cases.map((c) => ({ id: c.id, kind: "review" as const, sample: c.id, arm: "candidate" as const, repeat: 1, defect: c.required.length > 0 })),
  ...[1, 2].map((repeat) => ({ id: `identity-s034-${repeat}`, kind: "pipeline" as const, sample: "s034", arm: "candidate" as const, repeat, defect: true })),
];
export async function perform(op: Operation, model: TextModel) {
  if (op.kind === "review") return reviewPlan(model, async () => {}, op.id, cases.find((c) => c.id === op.id)!.input);
  return prepare(op as Preparation, model);
}
