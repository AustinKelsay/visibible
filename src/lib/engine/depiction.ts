/**
 * A work's depiction profile (`works/<id>/depiction.json`): the wording the engine's prompts and checks use that
 * belongs to one work rather than to the engine, and the depiction modes its canon entries may have. The engine's
 * own wording is general; everything here was written for, or tuned on, one work (the Bible's thrones, chariots and
 * crucifixion came from its God-figure evaluations and its brief). See ADR 0009.
 *
 * Every canon entry has a depiction mode. `form` entries are drawn from their canon. `effects` entries are never
 * drawn: their canon stays out of every prompt, they get no reference sheet, and only the effects the text names
 * stand for them, in the wording the profile gives. A work whose profile has no `effects` wording has no such
 * subjects: its prompts never mention them, its plan review and image check never look for them, and an entry
 * marked without form is refused rather than drawn with another work's wording.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { contentVersion } from "../../../convex/_helpers/contentVersion";

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().refine((value) => value.trim().length > 0 && !/[\x00-\x1f\x7f\u2028\u2029]/.test(value), "Expected nonempty single-line text");

const effectsSchema = z.object({
  /** Replaces the subject's names in the image prompt, so the image model never reads a name it would draw as a person. */
  alias: text,
  /** A numbered priority rule in every image prompt of the work. */
  renderRule: text,
  /** The line added to an image prompt whose scene plan selects such a subject. */
  renderBlock: text,
  /** Added to the section look's instructions, and the look's five field descriptions, when the section cast includes one. */
  lookSystem: text,
  lookFields: z.object({ place: text, timeOfDay: text, weather: text, light: text, clothing: text }).strict(),
  /** Added to the scene plan's instructions, and to its subject and action field descriptions, when the section cast includes one. */
  planSystem: text,
  planField: text,
  /** What the plan review's `embodied_formless` problem means. */
  reviewFault: text,
  /** The finished-image check's `figure_in_light` fault in its direct and describe-first questions, and what the latter lists. */
  checkFigure: z.object({ direct: text, describe: text, brightAreas: text }).strict(),
}).strict();

const profileSchema = z.object({
  schemaVersion: z.literal(1),
  workId: id,
  /** Where writing most often appears in this work's scenes, named in the image prompt's no-writing rule. */
  writingSurfaces: text,
  /** The planner's instruction for this work's written objects, such as "letters and books stay closed". */
  closedDocuments: text,
  /** Objects the finished-image check names as typical bearers of inscriptions in this work. */
  inscribedObjects: text,
  /** Serious subjects this work may show beyond the engine's floor of battles, blood and death. */
  seriousSubjects: z.array(text),
  /** Examples, in the planner's instructions, of a speaker wrongly drawn as a figure of their own words. */
  speakerExamples: text.optional(),
  /** Wording for each depiction mode beyond `form` that this work's entries use. */
  modes: z.object({ effects: effectsSchema.optional() }).strict(),
}).strict();

export type EffectsWording = z.infer<typeof effectsSchema>;
export type DepictionProfile = Readonly<z.infer<typeof profileSchema> & {
  /** The whole profile; recorded with each rendering packet and saved image. */
  version: string;
  /** What scene plans and their review read; a plan made under another version is remade. */
  planVersion: string;
  /** What looks of sections with an `effects` entry read; such a look made under another version is remade. */
  lookVersion: string;
}>;

/** Validate a work's depiction profile; the versions are content hashes, so only a wording change remakes looks and plans. */
export function loadDepictionProfile(input: unknown, workId: string): DepictionProfile {
  const profile = profileSchema.parse(input);
  if (profile.workId !== workId) throw new Error(`The depiction profile of ${profile.workId} was given for ${workId}`);
  const effects = profile.modes.effects;
  return Object.freeze({
    ...profile,
    version: contentVersion(profile),
    planVersion: contentVersion({ closedDocuments: profile.closedDocuments, speakerExamples: profile.speakerExamples ?? null,
      effects: effects ? { planSystem: effects.planSystem, planField: effects.planField, reviewFault: effects.reviewFault } : null }),
    lookVersion: contentVersion(effects ? { lookSystem: effects.lookSystem, lookFields: effects.lookFields } : null),
  });
}

const fromCheckout = new Map<string, DepictionProfile>();

/**
 * A work's profile from the checkout, `works/<workId>/depiction.json`, read once per process the way owner scripts read
 * every work file. The request path passes the profile its work inputs loaded; scripts and records may omit it.
 */
export function readDepictionProfile(workId: string, root = process.cwd()): DepictionProfile {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workId)) throw new Error(`Invalid work id: ${workId}`);
  const key = `${root}|${workId}`;
  let profile = fromCheckout.get(key);
  if (!profile) {
    profile = loadDepictionProfile(JSON.parse(readFileSync(path.join(root, "works", workId, "depiction.json"), "utf8")), workId);
    fromCheckout.set(key, profile);
  }
  return profile;
}

export const DEPICTION_MODES = ["form", "effects"] as const;
export type DepictionMode = (typeof DEPICTION_MODES)[number];

/** Canon stores the mode as `hasForm` (absent means drawn), so existing entries and older deployments read it unchanged. */
export function depictionModeOf(entry: object): DepictionMode {
  return (entry as { hasForm?: unknown }).hasForm === false ? "effects" : "form";
}

/** The stored form of a mode, as `works:correct set-depiction` writes it. */
export function storedDepiction(mode: DepictionMode): { hasForm: boolean } {
  return { hasForm: mode === "form" };
}

/** The work's `effects` wording, or why entries in that mode cannot be prepared or rendered for this work. */
export function effectsWordingFor(profile: DepictionProfile, entryIds: readonly string[]): EffectsWording {
  const effects = profile.modes.effects;
  if (!effects) throw new Error(`${profile.workId} has no wording for subjects without form, so it cannot depict ${entryIds.join(", ")}; set their depiction or add the mode to works/${profile.workId}/depiction.json`);
  return effects;
}
