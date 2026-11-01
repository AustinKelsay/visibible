import { z } from "zod";
import classical from "../../styles/classical.json";
import watercolor from "../../styles/watercolor.json";
import fresco from "../../styles/fresco.json";
import storybook from "../../styles/storybook.json";
import icon from "../../styles/icon.json";

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
// Preserve accepted text verbatim. Invalid controls/blank values fail rather than being trimmed.
const text = z.string().refine((value) => value.trim().length > 0 && !/[\x00-\x1f\x7f\u2028\u2029]/.test(value), "Expected nonempty single-line text");
export const BRIEF_MAX_WORDS = 400;
export const BRIEF_PROMPT_MAX_CHARS = 1200;
export const STYLE_PARTS = ["rendering", "palette", "lighting", "materials", "composition", "negatives"] as const;
export const PROMPT_PRECEDENCE = Object.freeze([
  "engine-rules", "brief-content-and-depiction", "style-rendering", "section-look", "scene-plan",
] as const);
export const COMMON_CONTENT_FLOOR = Object.freeze({
  prohibited: Object.freeze(["Sexually explicit content", "Lingering gore"]),
  /** Shown seriously in every work; a work's depiction profile may name more (the Bible adds crucifixion). */
  seriousSubjects: Object.freeze(["battles", "blood", "death"]),
  permitted: Object.freeze(["Non-sexual nudity"]),
});

const styleSchema = z.object({
  id, label: text, description: text,
  rendering: text, palette: text, lighting: text, materials: text, composition: text, negatives: text,
}).strict();
export type ArtStyle = Readonly<z.infer<typeof styleSchema>>;

export function createStyleLibrary(input: unknown) {
  const styles = z.array(styleSchema).min(1).parse(input).map((style) => Object.freeze(style));
  const byId = new Map<string, ArtStyle>();
  for (const style of styles) {
    if (byId.has(style.id)) throw new Error(`Duplicate art style: ${style.id}`);
    byId.set(style.id, style);
  }
  return Object.freeze({
    styles: Object.freeze(styles),
    get(id: string): ArtStyle {
      const style = byId.get(id);
      if (!style) throw new Error(`Unknown art style: ${id}`);
      return style;
    },
  });
}
export type StyleLibrary = ReturnType<typeof createStyleLibrary>;
export const SHARED_STYLES = createStyleLibrary([classical, watercolor, fresco, storybook, icon]);

/** Metadata helps selection; only the six rendering parts enter prompts. */
export function formatStylePrompt(input: unknown): string {
  const style = styleSchema.parse(input);
  return STYLE_PARTS.map((part) => `${part}: ${style[part]}`).join("\n");
}

const ruleSchema = z.object({ text, styleIds: z.array(id).min(1).optional() }).strict();
const eraSchema = z.object({ id, label: text, people: text, dress: text, buildingsAndObjects: text, technology: text }).strict();
const briefSchema = z.object({
  schemaVersion: z.literal(1), workId: id, tone: text,
  depictionRules: z.array(ruleSchema),
  eras: z.array(eraSchema).min(1),
  styleIds: z.array(id).min(1),
}).strict();
export type WorkBrief = z.infer<typeof briefSchema>;
export type Era = z.infer<typeof eraSchema>;
const ERA_FIELDS = ["label", "people", "dress", "buildingsAndObjects", "technology"] as const;

function requireUnique(values: readonly string[], description: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${description}`);
}

function promptForm(brief: WorkBrief, era: Era) {
  return [
    `Tone: ${brief.tone}`,
    ...brief.depictionRules.map((rule) => `Depiction${rule.styleIds ? ` [styles: ${rule.styleIds.join(", ")}]` : ""}: ${rule.text}`),
    `Era: ${era.label}`,
    `People: ${era.people}`,
    `Dress: ${era.dress}`,
    `Buildings and objects: ${era.buildingsAndObjects}`,
    `Technology: ${era.technology}`,
  ].join("\n");
}

/** Structural validation is not owner approval. A merged brief PR supplies that approval. */
export function validateWorkBrief(input: unknown, library: StyleLibrary = SHARED_STYLES): WorkBrief {
  const brief = briefSchema.parse(input);
  requireUnique(brief.styleIds, "offered style");
  requireUnique(brief.eras.map((era) => era.id), "era ID");
  for (const styleId of brief.styleIds) library.get(styleId);
  for (const rule of brief.depictionRules) {
    if (!rule.styleIds) continue;
    requireUnique(rule.styleIds, "conditional style");
    for (const styleId of rule.styleIds) library.get(styleId);
  }
  const prose = [brief.tone, ...brief.depictionRules.map((rule) => rule.text),
    ...brief.eras.flatMap((era) => ERA_FIELDS.map((field) => era[field]))];
  const words = prose.join(" ").trim().split(/\s+/u).length;
  if (words > BRIEF_MAX_WORDS) throw new Error(`Work brief exceeds ${BRIEF_MAX_WORDS} words: ${words}`);
  for (const era of brief.eras) {
    const length = promptForm(brief, era).length;
    if (length > BRIEF_PROMPT_MAX_CHARS) {
      throw new Error(`Brief prompt for ${era.id} exceeds ${BRIEF_PROMPT_MAX_CHARS} characters: ${length}`);
    }
  }
  return brief;
}

export function formatBriefPrompt(input: unknown, eraId: string, library: StyleLibrary = SHARED_STYLES): string {
  const brief = validateWorkBrief(input, library);
  const era = brief.eras.find((candidate) => candidate.id === eraId);
  if (!era) throw new Error(`Unknown era: ${eraId}`);
  return promptForm(brief, era);
}

/** Section assignments are analysis output, never fields in an owner-authored brief. */
export function selectMainEra(input: unknown, sectionEraIds: readonly string[], library: StyleLibrary = SHARED_STYLES): Era {
  const brief = validateWorkBrief(input, library);
  if (!sectionEraIds.length) throw new Error("Main era requires section assignments");
  const counts = new Map(brief.eras.map((era) => [era.id, 0]));
  for (const eraId of sectionEraIds) {
    const count = counts.get(eraId);
    if (count === undefined) throw new Error(`Unknown section era: ${eraId}`);
    counts.set(eraId, count + 1);
  }
  // Ties retain brief order, independent of the order sections were supplied.
  return brief.eras.reduce((main, era) => counts.get(era.id)! > counts.get(main.id)! ? era : main);
}

export function resolveWorkStyle(input: unknown, savedPreference: string | null, availableStyleIds?: readonly string[], library: StyleLibrary = SHARED_STYLES) {
  const brief = validateWorkBrief(input, library);
  if (availableStyleIds) for (const styleId of availableStyleIds) library.get(styleId);
  const selected = savedPreference && brief.styleIds.includes(savedPreference) ? savedPreference : brief.styleIds[0];
  return {
    style: library.get(selected),
    savedPreference,
    usedDefault: selected !== savedPreference,
    available: availableStyleIds === undefined || availableStyleIds.includes(selected),
  };
}

export type ScopeTerm = { kind: "work" | "person" | "place" | "era"; name: string };
function searchable(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function mentions(value: string, name: string) {
  const term = searchable(name);
  return term.length > 0 && ` ${searchable(value)} `.includes(` ${term} `);
}

/** Deterministic lexical flags, using work/era/entity names supplied by preparation. */
export function inspectStyleScope(input: unknown, terms: readonly ScopeTerm[]) {
  const style = styleSchema.parse(input);
  return STYLE_PARTS.flatMap((field) => terms.filter((term) => mentions(style[field], term.name))
    .map((term) => ({ field, ...term })));
}

export type BriefEntry = { id: string; kind: "character" | "location" | "object"; names: readonly string[] };
export type CanonHint = { entryId: string; kind: BriefEntry["kind"]; sourcePath: string; text: string; styleIds?: string[] };

/**
 * Propose a cleaned draft and retain exact entry-specific rules as canon hints.
 * Named details inside required tone/era fields need rewriting: never drop them silently.
 * This conservative pass is review assistance; an owner may retain an intentional
 * work-wide depiction policy in the brief PR. It is not semantic proof or approval.
 */
export function reviewDraftBrief(input: unknown, entries: readonly BriefEntry[], sectionReferences: readonly string[] = [], library: StyleLibrary = SHARED_STYLES) {
  const draft = validateWorkBrief(input, library);
  const canonHints: CanonHint[] = [];
  const scopeIssues: { path: string; text: string; name: string; destination: "canon" | "section-look" }[] = [];
  const entryMatches = (value: string) => entries.filter((entry) => entry.names.some((name) => mentions(value, name)));
  const inspectField = (path: string, value: string) => {
    for (const entry of entryMatches(value)) {
      canonHints.push({ entryId: entry.id, kind: entry.kind, sourcePath: path, text: value });
      scopeIssues.push({ path, text: value, name: entry.id, destination: "canon" });
    }
    for (const reference of sectionReferences.filter((reference) => mentions(value, reference))) {
      scopeIssues.push({ path, text: value, name: reference, destination: "section-look" });
    }
  };
  draft.depictionRules = draft.depictionRules.filter((rule, index) => {
    const sourcePath = `depictionRules.${index}`;
    const matches = entryMatches(rule.text);
    for (const entry of matches) canonHints.push({ entryId: entry.id, kind: entry.kind, sourcePath, ...rule });
    for (const reference of sectionReferences.filter((reference) => mentions(rule.text, reference))) {
      scopeIssues.push({ path: sourcePath, text: rule.text, name: reference, destination: "section-look" });
    }
    return matches.length === 0;
  });
  inspectField("tone", draft.tone);
  draft.eras.forEach((era, index) => ERA_FIELDS.forEach((field) => inspectField(`eras.${index}.${field}`, era[field])));
  return { brief: scopeIssues.length ? null : validateWorkBrief(draft, library), canonHints, scopeIssues };
}
