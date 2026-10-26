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
 * Serialize an internal audit fixture (present + grounding) or an older strict reply (selectedCast with
 * momentQuote, consideredCast, missingCast) in the planner's general reply format. Fixture plumbing only.
 */
function selectionContract(value: unknown): unknown {
  const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!object(value) || !("present" in value || "selectedCast" in value || "grounding" in value)) return value;
  const { present, grounding, selectedCast, consideredCast: _considered, missingCast: _missing, ...fields } = value;
  void _considered; void _missing;
  const audit = object(grounding) ? grounding : {};
  const records = Array.isArray(audit.cast) ? audit.cast.filter(object) : [];
  const chosen: Array<Record<string, unknown>> = Array.isArray(selectedCast) ? selectedCast.filter(object) : Array.isArray(present) ? present.map((entryId) => ({ entryId })) : [];
  return { ...fields, focusQuote: typeof audit.focusQuote === "string" ? audit.focusQuote : "", instant: typeof audit.instant === "string" ? audit.instant : "",
    selectedCast: chosen.map((entry) => {
      const record = records.find((r) => r.entryId === entry.entryId);
      const evidence = typeof entry.evidence === "string" ? entry.evidence : typeof entry.momentQuote === "string" ? entry.momentQuote : typeof record?.momentQuote === "string" ? record.momentQuote : "";
      return { entryId: entry.entryId, evidence };
    }),
  };
}

/** Hand-authored conditions for unrelated mechanical fixtures; never model/semantic evidence. */
export function withSituation(value: unknown, owner?: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const plan = value as Record<string, unknown>;
  if (plan.situation !== undefined || !("primarySubject" in plan || "selectedCast" in plan || "present" in plan)) return value;
  return { ...plan, situation: owner ?? { place: plan.setting ?? "", timeOfDay: plan.timeOfDay ?? "", weather: "clear", light: "ordinary daylight", clothing: "ordinary situational clothing" } };
}

export function selectionReply(value: unknown): unknown {
  return withSituation(selectionContract(value));
}
