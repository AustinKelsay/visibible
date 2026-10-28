/** Unchanged control inputs/expectations; use production citation validation on the intended field. */
import { cases as originalCases } from "../2026-10-24-rendering-review-check/controls.mjs";
import { invalidReview, planReviewSchema, type ReviewInput } from "../../../src/lib/engine/plan-review";
// Inputs/expectations are unchanged except for the explicit owner-policy adapter.
export const cases = originalCases.map((c) => ({ ...c, input: { ...c.input, rendering: c.input.rendering ? { ...c.input.rendering, lookPolicy: "literal-constraint-v1" as const } : undefined } }));
type Required = (typeof cases)[number]["required"][number];
const flat = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
export function matchesRequired(problem: { kind: string; entryId: string; planQuote: string }, expected: Required, input: ReviewInput) {
  if (problem.kind !== expected.kind || (expected.entryId !== undefined && problem.entryId !== expected.entryId) || !flat(problem.planQuote)) return false;
  if (!expected.quoteFrom) return true;
  if (problem.kind !== "look_conflict") return flat(expected.quoteFrom).includes(flat(problem.planQuote));
  if (!input.rendering) return false;
  const look = { ...input.rendering.look };
  for (const field of ["place", "timeOfDay", "weather", "light", "clothing"] as const) {
    if (look[field] !== expected.quoteFrom) look[field] = "";
  }
  const parsed = planReviewSchema.safeParse({ problems: [{ ...problem, reason: "Frozen expected-field citation check." }] });
  return parsed.success && invalidReview(parsed.data.problems, { ...input, rendering: { ...input.rendering, look } }) === null;
}
