/** Source evidence for a planner's scene choice, not a semantic or visual acceptance verdict. */
import { z } from "zod";
import type { MomentContext } from "./preparation";

export const PLAN_NEIGHBOR_CHARS = 400;

export const sceneGroundingSchema = z.object({
  focusQuote: z.string().describe("A short exact quote from MOMENT identifying the one action or state chosen for this image, not a summary of the whole sequence. Empty only when required canon is missing."),
  cast: z.array(z.object({
    entryId: z.string(),
    momentQuote: z.string().describe("Exact words from MOMENT establishing this entry's participation or physical presence at the chosen instant. A pronoun or continuing setting is valid with context support; a narrator's report alone is not participation."),
    contextSource: z.enum(["none", "previous", "next"]).describe("Use a neighbor only to resolve the identity or continuity of participation already anchored in momentQuote, never to add another event's participants."),
    contextQuote: z.string().describe("Exact words from the named neighbor supporting identity or continuity; empty when contextSource is none."),
    participation: z.enum(["in_scene", "framing", "mentioned", "separate_event", "uncertain"])
      .describe("Classify the entry's relationship to the chosen instant. Only in_scene can be rendered. Reporting a vision or telling a story is framing unless the source also places the reporter inside its depicted action."),
  }).strict()).describe("One evidence record per selected present ID, in the same order. Include locations, objects, groups and no-form subjects as well as formed characters."),
  instant: z.string().describe("One sentence fixing the chosen instant before any scene field: where each selected formed character is and their single pose or movement, and the state or placement of selected places, objects and no-form effects. Every scene field must match it. Empty only when required canon is missing."),
  singleInstant: z.boolean().describe("True only when every scene field can be depicted simultaneously in one instant. False if the plan requires successive poses, locations or stages of an action; do not hide a sequence inside one field."),
}).strict();

export type SceneGrounding = z.infer<typeof sceneGroundingSchema>;

/** The exact bounded context sent to the planner is also the only valid neighbor evidence. */
export function planningNeighbors(context: MomentContext) {
  return { previous: context.previous?.text.slice(0, PLAN_NEIGHBOR_CHARS) ?? null, next: context.next?.text.slice(0, PLAN_NEIGHBOR_CHARS) ?? null };
}

const flat = (value: string) => value.replace(/\s+/g, " ").trim();
const wordStart = /^[\p{L}\p{N}]/u, wordEnd = /[\p{L}\p{N}]$/u;
// An apostrophe between letters continues a word ("can't"), except a possessive "'s" ending.
const continuesAfter = /^['\u2019]\p{L}/u, possessiveAfter = /^['\u2019]s(?![\p{L}\p{N}])/u, continuesBefore = /\p{L}['\u2019]$/u;

/** Finds a fragment at or after `from` that neither starts nor ends inside a source word. */
function findWhole(source: string, fragment: string, from: number) {
  for (let at = source.indexOf(fragment, from); at >= 0; at = source.indexOf(fragment, at + 1)) {
    const before = source.slice(0, at), after = source.slice(at + fragment.length);
    const splitsStart = wordStart.test(fragment) && (wordEnd.test(before) || continuesBefore.test(before));
    const splitsEnd = wordEnd.test(fragment) && (wordStart.test(after) || (continuesAfter.test(after) && !possessiveAfter.test(after)));
    if (!splitsStart && !splitsEnd) return at;
  }
  return -1;
}

/**
 * Formatting whitespace can differ in a JSON reply; words, case and punctuation must match.
 * A quote may skip words only at an explicit ellipsis: each fragment must then be exact, whole
 * words, and after the previous one. Unmarked joins are refused, since a guessed sentence break
 * (an abbreviation such as "Dr.") could splice words into a quote the source never contains.
 */
export function containsQuote(text: string | null, quote: string) {
  if (!text) return false;
  const source = flat(text);
  const fragments = flat(quote).split(/\s*(?:\u2026|\.{3})\s*/u).map(flat).filter(Boolean);
  let from = 0;
  for (const fragment of fragments) {
    const at = findWhole(source, fragment, from);
    if (at < 0) return false;
    from = at + fragment.length;
  }
  return fragments.length > 0;
}

/**
 * Deterministic evidence checks. A real quote can still be irrelevant or misclassified by the
 * model: these checks neither infer participants from prose nor prove simultaneous action.
 * A source/evidence failure is unavailable on the first reply, never a semantic reroll.
 */
export function sceneGroundingProblem(grounding: SceneGrounding, present: string[], context: MomentContext): string | null {
  if (!grounding.singleInstant) return "scene requires successive instants";
  if (!grounding.instant.trim()) return "scene instant is not stated";
  if (!containsQuote(context.moment.text, grounding.focusQuote)) return "scene focus is not quoted from the current moment";
  if (grounding.cast.length !== present.length || grounding.cast.some((entry, index) => entry.entryId !== present[index])) {
    return "scene evidence must match the selected cast exactly";
  }
  const neighbors = planningNeighbors(context);
  for (const entry of grounding.cast) {
    if (entry.participation !== "in_scene") return `cast ${entry.entryId} is ${entry.participation}, not participating in the chosen instant`;
    if (!containsQuote(context.moment.text, entry.momentQuote)) return `cast ${entry.entryId} lacks current-moment evidence`;
    if (entry.contextSource === "none") {
      if (entry.contextQuote.trim()) return `cast ${entry.entryId} has context evidence without a source`;
    } else if (!containsQuote(neighbors[entry.contextSource], entry.contextQuote)) {
      return `cast ${entry.entryId} has invalid ${entry.contextSource} evidence`;
    }
  }
  return null;
}
