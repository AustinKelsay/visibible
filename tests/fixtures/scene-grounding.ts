/**
 * Scripted evidence envelope for tests of unrelated engine mechanics. Supplying a real quote
 * here is a model assertion, not proof it supports the scene or every selected participant.
 * Grounding-specific tests use explicit per-entry evidence and retain false assertions too.
 */
import type { SceneGrounding } from "../../src/lib/engine/scene-grounding";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { FORMLESS_LOOK_PROMPT_VERSION } from "../../src/lib/engine/preparation";
import { loadDepictionProfile } from "../../src/lib/engine/depiction";

/** The deployed Bible brief's version, as the engine computes it from the file. */
const bibleBriefVersion = createHash("sha256").update(readFileSync(new URL("../../works/bible-web/brief.json", import.meta.url), "utf8")).digest("hex");
const bibleDepiction = loadDepictionProfile(JSON.parse(readFileSync(new URL("../../works/bible-web/depiction.json", import.meta.url), "utf8")), "bible-web");

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

/** The planner reply format since moment-cast v12 has no `situation`: scene fields carry setting and time. */
export function selectionReply(value: unknown): unknown {
  const reply = selectionContract(value);
  if (typeof reply !== "object" || reply === null || Array.isArray(reply)) return reply;
  const { situation: _situation, ...rest } = reply as Record<string, unknown>;
  void _situation;
  return rest;
}

/**
 * Retained looks and plans record the no-form look contract and the Bible brief they were made with. Tests of other
 * mechanics treat them as made under the current contract and the deployed brief (a styles-only brief change keeps
 * the same rules), so they are reused rather than remade.
 */
export function withCurrentLookMarker<T extends { kind: string; inputs: Array<{ kind: string; recordId: string; version: string }> }>(record: T): T {
  if (record.kind !== "look" && record.kind !== "plan") return record;
  const inputs = record.inputs.map((input) =>
    input.kind === "prompt" && input.recordId === "section_look_formless_presence" ? { ...input, version: FORMLESS_LOOK_PROMPT_VERSION }
    : input.kind === "brief" && input.recordId === "bible-web" ? { ...input, version: bibleBriefVersion } : input);
  // Retained Bible records predate depiction profiles (ADR 0010); the Bible's profile words them identically.
  if (!inputs.some((input) => input.kind === "brief" && input.recordId === "bible-web")) return { ...record, inputs };
  const has = (recordId: string) => inputs.some((input) => input.kind === "prompt" && input.recordId === recordId);
  if (record.kind === "look" && has("section_look_formless_presence") && !has("depiction_look")) inputs.push({ kind: "prompt", recordId: "depiction_look", version: bibleDepiction.lookVersion });
  if (record.kind === "plan" && !has("depiction_plan")) inputs.push({ kind: "prompt", recordId: "depiction_plan", version: bibleDepiction.planVersion });
  return { ...record, inputs };
}
