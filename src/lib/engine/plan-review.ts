/**
 * A semantic review of the moment conditions, selected canon and scene plan, before the plan is stored. The
 * model reports problems; code accepts a report only when each problem quotes the right input and names
 * a cast id of the right kind. These checks validate citations, not their meaning. The verdict advises
 * forgiving preparation (select depicted cast, re-plan once, then keep with notes); it is never shown to
 * the image model. A work's depiction profile words the problems about subjects without form, and a work
 * without such subjects is never asked about them (ADR 0010).
 */
import { z } from "zod";
import { parseModelJson, type ReasoningEffort, type TextModel } from "../reading-pass/model";
import type { MomentContext } from "./preparation";
import { planningNeighbors } from "./scene-grounding";
import { CONTENT_OWNERSHIP, type RenderingInput, type SelectedCanon } from "./prompt";
import type { DepictionProfile } from "./depiction";

/** Bump for changes to the review instructions, schema or acceptance rules; plans refresh lazily. */
export const PLAN_REVIEW_PROMPT_VERSION = "2026-10-27-plan-review-v12";
/** The benchmarked configuration: reasoning off flagged every clean plan. Thinking needs room above 1,024 tokens. */
export const PLAN_REVIEW_REASONING: ReasoningEffort = "low";
export const PLAN_REVIEW_MAX_TOKENS = 4000;

/** The review's instructions; the work words the problem about subjects without form, or has none. */
export function planReviewSystem(depiction: DepictionProfile): string {
  const effects = depiction.modes.effects;
  return `You check an illustration plan before it is drawn. You get the moment's text with its neighbours, the depiction rules, the section cast (id, name, hasForm), the plan's selected cast ids (\`present\`), its seven scene fields, any OWNER LOOK CONSTRAINTS that rendering will use, and the canon of the selected entries. Report only clear problems that a careful reader would agree with, and return an empty list when the plan is a reasonable illustration of the moment. Do not report preferences, small omissions or other valid readings. Return only JSON.
${CONTENT_OWNERSHIP}
Kinds:
- unselected_figure: a section cast entry (${effects ? "a person, group, place, object, or a no-form presence shown as its effect" : "a person, group, place or object"}) is clearly depicted in a scene field but its id is not in present. Use its id.
- outside_instant: a selected or described person or presence does not belong in this moment, such as a speaker, writer, prophet or listener put into a scene their words only describe or made a figure of their own words, the narrator of a story or vision, ${effects ? "someone from a different event, or a no-form presence the moment does not show" : "or someone from a different event"}. Use its id, or empty.
- not_one_instant: the fields give someone incompatible poses or places, or show successive steps as one image.
${effects ? `- embodied_formless: ${effects.reviewFault}\n` : ""}- look_conflict: an OWNER LOOK CONSTRAINTS value (only when supplied) contradicts the scene, the text or the depiction rules. Quote that value.
- canon_conflict: a scene field contradicts a selected entry's fixed canon. Quote the scene field.
- missing_canon: the scene depicts a named recurring character or group with no section cast entry. Leave entryId empty.
For each problem, copy a short exact phrase from a scene field or a selected id into planQuote (from an owner constraint for look_conflict) and give a one-sentence reason.`;
}

export const PLAN_REVIEW_KINDS = ["unselected_figure", "outside_instant", "not_one_instant", "embodied_formless", "look_conflict", "canon_conflict", "missing_canon"] as const;
type PlanReviewKind = (typeof PLAN_REVIEW_KINDS)[number];
const reviewSchemaWith = <K extends readonly [PlanReviewKind, ...PlanReviewKind[]]>(kinds: K) => z.object({
  problems: z.array(z.object({
    kind: z.enum(kinds),
    entryId: z.string().describe("The cast id the problem concerns; empty when it has none."),
    planQuote: z.string().describe("A short exact phrase from a look field for look_conflict; otherwise from a scene field or a selected id."),
    reason: z.string(),
  }).strict()),
}).strict();
/** Every problem kind; stored reviews and recorded replies parse against it. */
export const planReviewSchema = reviewSchemaWith(PLAN_REVIEW_KINDS);
/** What a work's review may report: a work without subjects without form cannot report `embodied_formless`. */
export const planReviewSchemaFor = (depiction: DepictionProfile) =>
  depiction.modes.effects ? planReviewSchema : reviewSchemaWith(PLAN_REVIEW_KINDS.filter((kind) => kind !== "embodied_formless") as [PlanReviewKind, ...PlanReviewKind[]]);
export type PlanReviewProblem = z.infer<typeof planReviewSchema>["problems"][number];

export const PLAN_SCENE_FIELDS = ["primarySubject", "action", "setting", "secondaryElements", "mood", "timeOfDay", "composition"] as const;
export type ReviewInput = {
  rules: string;
  /** The work's wording for the review's problems about subjects without form. */
  depiction: DepictionProfile;
  context: MomentContext;
  sectionTitle: string;
  cast: Array<{ entryId: string; name: string; hasForm: boolean }>;
  present: string[];
  fields: Record<(typeof PLAN_SCENE_FIELDS)[number], string>;
  /** Historical shape: conditions plus selected canon. Omitted only by historical isolated plan-review controls. */
  rendering?: { look: Omit<RenderingInput["look"], "version">; lookPolicy?: "generated-guide-v1" | "literal-constraint-v1"; canon: SelectedCanon[] };
};
/** What the review accepts since v10: owner look constraints only when rendering will use them (none for a generated guide). */
export type PlanReviewInput = Omit<ReviewInput, "rendering"> & {
  rendering?: Omit<NonNullable<ReviewInput["rendering"]>, "look"> & { look?: NonNullable<ReviewInput["rendering"]>["look"] };
};

export function planReviewUser(input: PlanReviewInput) {
  const neighbors = planningNeighbors(input.context);
  const label = input.rendering?.lookPolicy === "generated-guide-v1" ? "MOMENT CONDITIONS (exact rendering input)" : input.rendering?.lookPolicy === "literal-constraint-v1" ? "OWNER LOOK CONSTRAINTS (binding verbatim rendering input)" : "SECTION LOOK (verbatim rendering input)";
  const look = input.rendering?.look ? `\n\n${label}:\n${JSON.stringify(input.rendering.look)}` : "";
  const rendering = input.rendering ? `${look}\n\nSELECTED CANON (complete assigned stages; fixed identity, not source evidence):\n${input.rendering.canon.map((c) => `- ${c.entryId} (stage: ${c.stageId}, kind: ${c.kind}, hasForm: ${c.hasForm}): ${c.text}`).join("\n") || "- (none)"}` : "";
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
export function invalidReview(problems: PlanReviewProblem[], input: PlanReviewInput): string | null {
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
  recordId: string, input: PlanReviewInput, options: { maxTokens?: number; reasoningEffort?: ReasoningEffort } = {}): Promise<{ problems: PlanReviewProblem[] } | { unavailable: string }> {
  const user = planReviewUser(input);
  const system = planReviewSystem(input.depiction);
  const schema = planReviewSchemaFor(input.depiction);
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let result;
    try {
      result = await model.complete({ label: `review:${recordId}:${attempt}`, system, user, schemaName: "plan_review", schema,
        maxTokens: options.maxTokens ?? PLAN_REVIEW_MAX_TOKENS, expectedCompletionTokens: 500, reasoningEffort: options.reasoningEffort ?? PLAN_REVIEW_REASONING });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await recordSpend({ outcome: `review error: ${lastError.slice(0, 110)}`, model: model.id, costUsd: null, promptTokens: null, completionTokens: null, elapsedMs: 0 });
      continue;
    }
    const parsed = parseModelJson(schema, result.content);
    const problems = "error" in parsed ? null : parsed.value.problems;
    const invalid = "error" in parsed ? parsed.error : invalidReview(parsed.value.problems, input);
    const outcome = invalid ? "review invalid" : problems!.length ? "review problems" : "review ok";
    await recordSpend({ outcome, model: result.model, costUsd: result.usage.costUsd, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, elapsedMs: result.elapsedMs });
    if (invalid || !problems) { lastError = invalid ?? "missing problems"; continue; }
    return { problems };
  }
  return { unavailable: `plan review unavailable: ${lastError}` };
}
