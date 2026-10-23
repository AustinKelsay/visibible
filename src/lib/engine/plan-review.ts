/**
 * A semantic review of one scene plan against its moment, before the plan is stored. The model
 * reports problems; code accepts a report only when each problem quotes the plan exactly and names
 * a cast id of the right kind, so the reviewer cannot invent evidence. Its verdict decides whether
 * preparation re-plans once; it is never shown to the image model.
 */
import { z } from "zod";
import { parseModelJson, type ReasoningEffort, type TextModel } from "../reading-pass/model";
import type { MomentContext } from "./preparation";
import { planningNeighbors } from "./scene-grounding";

/** Bump for changes to the review instructions, schema or acceptance rules; plans refresh lazily. */
export const PLAN_REVIEW_PROMPT_VERSION = "2026-10-23-plan-review-v3";
/** The benchmarked configuration: reasoning off flagged every clean plan. Thinking needs room above 1,024 tokens. */
export const PLAN_REVIEW_REASONING: ReasoningEffort = "low";
export const PLAN_REVIEW_MAX_TOKENS = 4000;

export const PLAN_REVIEW_SYSTEM = `You review one scene plan for an illustration engine before it is used. You get the moment's text with its neighbours inside the same story section, the work's depiction rules, the section cast (id, name, hasForm) and the plan: the selected cast ids (\`present\`) and seven scene fields an image model will receive. Only selected cast receive their fixed appearance in the image prompt. Report every problem of the kinds below; return an empty list when there are none. Return only JSON.
- unselected_figure: a person, group, animal or no-form presence that has a section cast entry is described in a scene field, but its id is not in present. This includes effects standing for a hasForm false cast member even without its name: divine radiance, veiled radiance or a fire-like glow representing God still depicts God, including in the background or at the frame's edge. Use that entry's id. Ordinary sunlight, lamplight, embers, weather and effects that do not represent a cast member do not count; neither does a phrase only denying a presence. Places and objects do not count.
- outside_instant: a selected or described person, group or animal, or a selected place entry, that does not belong to the plan's chosen instant. This includes a narrator, speaker or listener who only frames the moment (reporting "I saw" or telling a story is not being there), and a figure or selected place from an earlier or later step or event, including a later step of the moment's own text. A no-form cast member represented through effects must belong to this instant too; a section-wide look or a mere mention does not establish its manifestation here. Ordinary scenery, light, weather and effects that do not represent cast are not outside_instant. Use its cast id, or an empty id when it has no entry.
- not_one_instant: the fields give one character two incompatible poses or places (for example kneeling in one field and still walking up in another, or lying in one and sitting up in another), or present successive actions as happening together (for example steps joined by "then", or "does X and afterwards Y"). Ordinary simultaneous detail is fine.
- embodied_formless: a cast entry with hasForm false is given a body, face, hair, clothing, silhouette or figure, or is described as seated, sitting, enthroned or occupying a seat. This includes calling its effects seated or enthroned (for example "light seated above the throne"). Permitted effects such as light, fire or cloud placed at or around an unoccupied seat are fine. Naming a figure only to deny it is not a problem.
For each problem, copy planQuote: a short exact phrase from the scene fields, or a selected id, that shows it. Give a one-sentence reason. Judge only the plan against the moment; do not suggest a new plan.`;

export const PLAN_REVIEW_KINDS = ["unselected_figure", "outside_instant", "not_one_instant", "embodied_formless"] as const;
export const planReviewSchema = z.object({
  problems: z.array(z.object({
    kind: z.enum(PLAN_REVIEW_KINDS),
    entryId: z.string().describe("The cast id the problem concerns; empty when it has none."),
    planQuote: z.string().describe("A short exact phrase from the plan's scene fields, or a selected id."),
    reason: z.string(),
  }).strict()),
}).strict();
export type PlanReviewProblem = z.infer<typeof planReviewSchema>["problems"][number];

export const PLAN_SCENE_FIELDS = ["primarySubject", "action", "setting", "secondaryElements", "mood", "timeOfDay", "composition"] as const;
export type ReviewInput = {
  rules: string;
  context: MomentContext;
  sectionTitle: string;
  cast: Array<{ entryId: string; name: string; hasForm: boolean }>;
  present: string[];
  fields: Record<(typeof PLAN_SCENE_FIELDS)[number], string>;
};

export function planReviewUser(input: ReviewInput) {
  const neighbors = planningNeighbors(input.context);
  return `DEPICTION RULES\n${input.rules}\nSTORY SECTION: ${input.sectionTitle}\n\nMOMENT (${input.context.moment.reference}): ${input.context.moment.text}\nPREVIOUS: ${neighbors.previous ?? "(section starts here)"}\nNEXT: ${neighbors.next ?? "(section ends here)"}\n\nSECTION CAST (id: name, hasForm):\n${input.cast.map((c) => `- ${c.entryId}: ${c.name} (hasForm: ${c.hasForm})`).join("\n") || "- (none)"}\n\nPLAN\npresent: ${input.present.join(", ") || "(none)"}\n${PLAN_SCENE_FIELDS.map((f) => `${f}: ${input.fields[f]}`).join("\n")}`;
}

const flat = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

/** Rejects a report whose problems cite text or ids the plan does not contain. */
export function invalidReview(problems: PlanReviewProblem[], input: ReviewInput): string | null {
  const castIds = new Set(input.cast.map((c) => c.entryId));
  const formless = new Set(input.cast.filter((c) => !c.hasForm).map((c) => c.entryId));
  const text = flat(PLAN_SCENE_FIELDS.map((f) => input.fields[f]).join(" \n "));
  for (const p of problems) {
    const quote = flat(p.planQuote);
    if (!quote || !(text.includes(quote) || input.present.includes(p.planQuote.trim()))) return `${p.kind} quote is not in the plan`;
    if (p.entryId && !castIds.has(p.entryId)) return `${p.kind} names unknown cast ${p.entryId}`;
    if (p.kind === "unselected_figure" && (!p.entryId || input.present.includes(p.entryId))) return "unselected_figure must name an unselected cast entry";
    if (p.kind === "embodied_formless" && !formless.has(p.entryId)) return "embodied_formless must name a no-form cast entry";
  }
  return null;
}

/**
 * One review with the existing single malformed-reply retry. A report that fails validation twice
 * makes the review unavailable rather than passing an unchecked plan.
 */
export async function reviewPlan(model: TextModel, recordSpend: (entry: { outcome: string; model: string; costUsd: number | null; promptTokens: number | null; completionTokens: number | null; elapsedMs: number }) => Promise<void>,
  recordId: string, input: ReviewInput, options: { maxTokens?: number; reasoningEffort?: ReasoningEffort } = {}): Promise<{ problems: PlanReviewProblem[] } | { unavailable: string }> {
  const user = planReviewUser(input);
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let result;
    try {
      result = await model.complete({ label: `review:${recordId}:${attempt}`, system: PLAN_REVIEW_SYSTEM, user, schemaName: "plan_review", schema: planReviewSchema,
        maxTokens: options.maxTokens ?? PLAN_REVIEW_MAX_TOKENS, expectedCompletionTokens: 500, reasoningEffort: options.reasoningEffort ?? PLAN_REVIEW_REASONING });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await recordSpend({ outcome: `review error: ${lastError.slice(0, 110)}`, model: model.id, costUsd: null, promptTokens: null, completionTokens: null, elapsedMs: 0 });
      continue;
    }
    const parsed = parseModelJson(planReviewSchema, result.content);
    const problems = "error" in parsed ? null : parsed.value.problems;
    const invalid = "error" in parsed ? parsed.error : invalidReview(parsed.value.problems, input);
    const outcome = invalid ? "review invalid" : problems!.length ? "review problems" : "review ok";
    await recordSpend({ outcome, model: result.model, costUsd: result.usage.costUsd, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, elapsedMs: result.elapsedMs });
    if (invalid || !problems) { lastError = invalid ?? "missing problems"; continue; }
    return { problems };
  }
  return { unavailable: `plan review unavailable: ${lastError}` };
}
