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
  };
  return { ...plan, grounding };
}
