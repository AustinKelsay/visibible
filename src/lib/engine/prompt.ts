/**
 * The rules every image prompt repeats and the work brief's block for one era and style (ADR 0010, ADR 0012). The
 * lean prompt (lean.ts) assembles them with the moment, the cast's canon and the art style.
 */
import type { WorkBrief } from "../work-preparation";
import { COMMON_CONTENT_FLOOR } from "../work-preparation";
import type { DepictionProfile } from "./depiction";

/** "a, b and c", or with another final conjunction. */
const listed = (items: readonly string[], last = "and") => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${last} ${items[items.length - 1]}`;

/**
 * Short, general rules: every word here is repeated in every image prompt. The work names where its writing
 * appears, any serious subjects beyond the engine's floor, and its rule for subjects without form (ADR 0010).
 */
export function engineRules(depiction: DepictionProfile): string[] {
  return [
    `No text or symbols anywhere: no letters, numbers, signage, logos or inscriptions, no writing on ${depiction.writingSurfaces}, and no artist's signature or initials in a corner.`,
    "One scene painted to every edge of the frame: no panels, collage, border, frame, margin, visible paper or blank backdrop, and never a photographed painting or mockup.",
    "Nothing from outside the moment's era.",
    "Natural anatomy: no extra or malformed limbs, hands or faces.",
    `${COMMON_CONTENT_FLOOR.prohibited.join(" and ").toLowerCase()} are never shown; serious depictions of ${listed([...COMMON_CONTENT_FLOOR.seriousSubjects, ...depiction.seriousSubjects])} and ${COMMON_CONTENT_FLOOR.permitted.join(" and ").toLowerCase()} may be, treated seriously.`,
    "No likeness of any real actor, performer or public figure.",
    ...(depiction.modes.effects ? [depiction.modes.effects.renderRule] : []),
    "A character you draw from CANON keeps exactly that look. Anyone else the moment needs appears as an unnamed figure with an ordinary, different face.",
  ];
}


/** Depiction rules that apply to this style: unconditional ones and those naming it. */
export function applicableRules(brief: WorkBrief, styleId: string) {
  return brief.depictionRules.filter((rule) => !rule.styleIds || rule.styleIds.includes(styleId)).map((rule) => rule.text);
}

export function briefBlock(brief: WorkBrief, eraId: string, styleId: string): string {
  const era = brief.eras.find((e) => e.id === eraId);
  if (!era) throw new Error(`Unknown era ${eraId}`);
  return [
    `WORK BRIEF (${brief.workId}; what may be shown; it outranks the style):`,
    `Tone: ${brief.tone}`,
    ...applicableRules(brief, styleId).map((text) => `Depiction: ${text}`),
    `Era: ${era.label}`, `People: ${era.people}`, `Dress: ${era.dress}`, `Buildings and objects: ${era.buildingsAndObjects}`, `Technology: ${era.technology}`,
  ].join("\n");
}
