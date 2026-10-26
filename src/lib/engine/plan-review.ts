/**
 * A semantic review of the look, selected canon and scene plan, before the plan is stored. The model
 * reports problems; code accepts a report only when each problem quotes the right input and names
 * a cast id of the right kind. These checks validate citations, not their meaning. Its verdict
 * decides whether preparation re-plans once or stops; it is never shown to the image model.
 */
import { z } from "zod";
import { parseModelJson, type ReasoningEffort, type TextModel } from "../reading-pass/model";
import type { MomentContext } from "./preparation";
import { planningNeighbors } from "./scene-grounding";
import { CONTENT_OWNERSHIP, type RenderingInput, type SelectedCanon } from "./prompt";

/** Bump for changes to the review instructions, schema or acceptance rules; plans refresh lazily. */
export const PLAN_REVIEW_PROMPT_VERSION = "2026-10-26-rendering-review-v8";
/** The benchmarked configuration: reasoning off flagged every clean plan. Thinking needs room above 1,024 tokens. */
export const PLAN_REVIEW_REASONING: ReasoningEffort = "low";
export const PLAN_REVIEW_MAX_TOKENS = 4000;

export const PLAN_REVIEW_SYSTEM = `You review an illustration engine's content before it is used. You get the moment's text with its neighbours inside the same story section, the work's depiction rules, the section cast (id, name, hasForm) and the plan: the selected cast ids (\`present\`) and seven scene fields an image model will receive. Production requests include the resolved MOMENT CONDITIONS (or literal OWNER LOOK CONSTRAINTS) and complete canon of the selected stages, exactly as supplied to rendering. The advisory section guide is not rendered and is not a source of conflict reports. Only selected cast receive their fixed appearance in the image prompt. Report every problem of the kinds below; return an empty list when there are none. Return only JSON.
${CONTENT_OWNERSHIP}
- look_conflict: an active description in the supplied MOMENT CONDITIONS or literal OWNER LOOK CONSTRAINTS (SECTION LOOK in historical isolated controls) conflicts with the source-supported moment plan, selected canon or depiction rules. Check all five look fields for a different fixed place or time, incompatible illumination or costume, forbidden embodiment, and effects representing an unselected or source-unsupported cast member. A look's permitted divine effect still adds a presence; ordinary illumination does not. An explicit range of section settings or times is compatible if it includes this moment; clothing listed for section cast does not by itself put them in the scene. Quote the conflicting look field, not the plan. Do not fix a bad look by changing a source-supported plan or adding cast. An owner-constraint conflict stops for explicit correction. Generated moment-condition faults can receive one re-plan of the scene and conditions together; do not change a source-supported event to fit a guide.
- canon_conflict: a scene field contradicts the fixed identity or appearance of a selected canon stage. Use that selected entry's id and quote the offending scene field. Canon does not establish presence or freeze a character's action, expression or situational state. Do not report a different pose as a canon conflict. Report look contradictions as look_conflict instead. If canon is not supplied in an isolated plan-only control, do not invent it.
- missing_canon: a scene field depicts a named recurring character or group for which no section cast entry is available, including a no-form subject represented through effects. Leave entryId empty and quote the scene field. Source support does not supply missing canon. Do not report unnamed incidental roles, crowds, animals or people named only in passing. If the entry is available but unselected, use unselected_figure instead. A required canon gap stops preparation, like the planner's missingCast; it is never repaired by substituting a different identity.
- unselected_figure: any character, group, animal, no-form presence, location or object with a section cast entry is depicted in a scene field, but its id is not in present. This legacy kind name covers every cast kind. A depicted setting or prop must receive its available canon too; a location mentioned only as an origin, destination or comparison is not depicted. This includes effects standing for a hasForm false cast member even without its name: divine radiance, veiled radiance or a fire-like glow representing God still depicts God, including in the background or at the frame's edge. Use that entry's id. Ordinary sunlight, lamplight, embers, weather and effects that do not represent a cast member do not count; neither does a phrase only denying a presence. Generic scenery and props without a matching cast entry do not need one; do not equate every street with a named city or every vessel with a named relic.
- outside_instant: a selected or described cast identity that the source does not establish in the plan's chosen instant, or an incidental figure from another instant. A related role, subgroup or institution cannot replace the people the source names without an identity link in the moment or its bounded neighbors. This includes a narrator, speaker or listener who only frames the moment (reporting "I saw" or telling a story is not being there), and a cast member from an earlier or later step or event, including a later step of the moment's own text. A no-form cast member represented through effects must belong to this instant too; a section-wide look or a mere mention does not establish its manifestation here. Ordinary scenery, light, weather and effects that do not represent cast are not outside_instant. Use its cast id, or an empty id when it has no entry.
- not_one_instant: the fields give one character or prop two incompatible poses, places or support states (for example kneeling in one field and still walking up in another, or lying in one and sitting up in another), or present successive actions as happening together (for example steps joined by "then", or "does X and afterwards Y"). Ordinary simultaneous detail is fine.
- embodied_formless: a cast entry with hasForm false is given a body, face, hair, clothing, silhouette or figure, or is described as seated, sitting, enthroned or occupying a seat. This includes calling its effects seated or enthroned (for example "light seated above the throne"). Permitted effects such as light, fire or cloud placed at or around an unoccupied seat are fine. Naming a figure only to deny it is not a problem.
Before returning a verdict, make both checks across all seven scene fields:
1. Source support: examine every selected or described cast member, including a no-form member already in present. Selection supplies canon, not evidence that the subject belongs here. First identify who or what the source refers to, then compare that identity with the plan and selected IDs. Membership in a wider group, shared occupation, shared setting, similar appearance or a section-wide cast assignment does not establish that a narrower or different role is meant. For example, a passage about travelers does not by itself establish that they are the available guards. Report an unsupported substitution as outside_instant. A broader group entry may supply canon for its source-identified members without claiming the entire group is present; pronouns and continuing identities may resolve from bounded neighbors. Source-supported unnamed incidental roles remain allowed and do not require a cast entry. For a no-form effect, the current scene must establish the subject manifesting or acting within that scene; a command attributed to it, a curse, an oath, an invocation or a mention alone does not establish a visible manifestation. Depiction rules permit how to show an established presence, never where to add one. Neighbor text can resolve identity or continuity of the current action, but cannot import an unrelated manifestation. Report an unsupported selected no-form effect as outside_instant, even when it obeys every depiction rule. An actual appearance or vision may be represented by permitted effects, including effects around an unoccupied seat for a seated metaphor. Ordinary illumination is still allowed. Check framing speakers independently; selecting a narrator does not move them inside an instruction or embedded story.
2. Simultaneity: compare each character AND each handled object's state across primarySubject, action, secondaryElements and composition. Treat every clause as describing this one image, not as a sequence an image model can choose between. An object held above a bench cannot also have been put down on it; walking up cannot also be kneeling. This applies to incidental people and props without cast IDs too. A hand touching an object already resting on a bench is compatible; holding an object while looking at it is compatible. Do not reject ordinary simultaneous gestures or infer a sequence from a conjunction alone. For not_one_instant, cite one exact conflicting phrase in planQuote and name the other conflicting phrase in the reason.
For each problem, copy planQuote: a short exact phrase from a look field for look_conflict; otherwise from a scene field or a selected id. Give a one-sentence reason. Check the look separately even when the plan has problems. Judge only the supplied inputs; do not suggest rewritten prose.`;

export const PLAN_REVIEW_KINDS = ["unselected_figure", "outside_instant", "not_one_instant", "embodied_formless", "look_conflict", "canon_conflict", "missing_canon"] as const;
export const planReviewSchema = z.object({
  problems: z.array(z.object({
    kind: z.enum(PLAN_REVIEW_KINDS),
    entryId: z.string().describe("The cast id the problem concerns; empty when it has none."),
    planQuote: z.string().describe("A short exact phrase from a look field for look_conflict; otherwise from a scene field or a selected id."),
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
  /** Required by production preparation; omitted only by historical isolated plan-review controls. */
  rendering?: { look: Omit<RenderingInput["look"], "version">; lookPolicy?: "generated-guide-v1" | "literal-constraint-v1"; canon: SelectedCanon[] };
};

export function planReviewUser(input: ReviewInput) {
  const neighbors = planningNeighbors(input.context);
  const label = input.rendering?.lookPolicy === "generated-guide-v1" ? "MOMENT CONDITIONS (exact rendering input)" : input.rendering?.lookPolicy === "literal-constraint-v1" ? "OWNER LOOK CONSTRAINTS (binding verbatim rendering input)" : "SECTION LOOK (verbatim rendering input)";
  const rendering = input.rendering ? `\n\n${label}:\n${JSON.stringify(input.rendering.look)}\n\nSELECTED CANON (complete assigned stages; fixed identity, not source evidence):\n${input.rendering.canon.map((c) => `- ${c.entryId} (stage: ${c.stageId}, kind: ${c.kind}, hasForm: ${c.hasForm}): ${c.text}`).join("\n") || "- (none)"}` : "";
  return `DEPICTION RULES\n${input.rules}\nSTORY SECTION: ${input.sectionTitle}\n\nMOMENT (${input.context.moment.reference}): ${input.context.moment.text}\nPREVIOUS: ${neighbors.previous ?? "(section starts here)"}\nNEXT: ${neighbors.next ?? "(section ends here)"}\n\nSECTION CAST (id: name, hasForm):\n${input.cast.map((c) => `- ${c.entryId}: ${c.name} (hasForm: ${c.hasForm})`).join("\n") || "- (none)"}${rendering}\n\nPLAN\npresent: ${input.present.join(", ") || "(none)"}\n${PLAN_SCENE_FIELDS.map((f) => `${f}: ${input.fields[f]}`).join("\n")}`;
}

const flat = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

/** The request shows compact JSON. Accept its exact string/member forms as well as plain prose. */
function lookQuoteMatches(field: string, value: string, quote: string) {
  if (!quote || !flat(value)) return false;
  if (flat(value).includes(quote)) return true;
  const literal = flat(JSON.stringify(value));
  const member = `${flat(JSON.stringify(field))}:${literal}`;
  // The second retained reply omitted the member's first and last quotation marks.
  // Require the whole value and its actual key; never join fields or strip arbitrary syntax.
  return quote === literal || quote === member || quote === member.slice(1, -1);
}

/** Rejects reports quoting another input/field or naming an unsuitable cast id. */
export function invalidReview(problems: PlanReviewProblem[], input: ReviewInput): string | null {
  const castIds = new Set(input.cast.map((c) => c.entryId));
  const formless = new Set(input.cast.filter((c) => !c.hasForm).map((c) => c.entryId));
  for (const p of problems) {
    const quote = flat(p.planQuote);
    const quoted = p.kind === "look_conflict"
      ? Object.entries(input.rendering?.look ?? {}).some(([field, value]) => lookQuoteMatches(field, value, quote))
      : PLAN_SCENE_FIELDS.some((f) => flat(input.fields[f]).includes(quote)) || input.present.includes(p.planQuote.trim());
    if (!quote || !quoted) return `${p.kind} quote is not in the ${p.kind === "look_conflict" ? "look" : "plan"}`;
    if (p.entryId && !castIds.has(p.entryId)) return `${p.kind} names unknown cast ${p.entryId}`;
    if (p.kind === "unselected_figure" && (!p.entryId || input.present.includes(p.entryId))) return "unselected_figure must name an unselected cast entry";
    if (p.kind === "embodied_formless" && !formless.has(p.entryId)) return "embodied_formless must name a no-form cast entry";
    if (p.kind === "canon_conflict" && !input.rendering?.canon.some((c) => c.entryId === p.entryId && input.present.includes(c.entryId))) return "canon_conflict must name a selected canon entry";
    if (p.kind === "missing_canon" && p.entryId) return "missing_canon must leave entryId empty";
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
