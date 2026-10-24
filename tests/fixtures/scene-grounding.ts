/**
 * Scripted evidence envelope for tests of unrelated engine mechanics. Supplying a real quote
 * here is a model assertion, not proof it supports the scene or every selected participant.
 * Grounding-specific tests use explicit per-entry evidence and retain false assertions too.
 */
import type { SceneGrounding } from "../../src/lib/engine/scene-grounding";

export function withGrounding<T extends { present: string[] }>(plan: T, focusQuote: string, quotes: Record<string, string> = {}) {
  const grounding: SceneGrounding = { focusQuote, singleInstant: true,
    cast: plan.present.map((entryId) => ({ entryId, momentQuote: quotes[entryId] ?? focusQuote,
      contextSource: "none", contextQuote: "", participation: "in_scene" })),
    instant: `The single chosen instant: ${focusQuote}`,
  };
  return { ...plan, grounding };
}

/**
 * Serialize an internal audit fixture in the planner's single-selection format. This is only
 * fixture plumbing: missing evidence and contradictory classifications stay malformed rather
 * than being invented or removed. Production accepts only the new response, never this adapter.
 */
export function selectionReply(value: unknown): unknown {
  const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!object(value) || !Array.isArray(value.present) || !object(value.grounding)) return value;
  const { present, grounding: audit, ...fields } = value;
  const { cast, ...grounding } = audit;
  const records = Array.isArray(cast) ? cast.filter(object) : [];
  return { ...fields, grounding,
    selectedCast: present.map((entryId) => {
      const record = records.find((entry) => entry.entryId === entryId);
      if (!record) return { entryId }; // Keep missing mandatory evidence invalid.
      const { participation, ...evidence } = record;
      return participation === "in_scene" ? evidence : { ...evidence, participation };
    }),
    consideredCast: records.filter((entry) => !present.includes(entry.entryId)),
  };
}
