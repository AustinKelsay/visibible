/**
 * A work's depiction profile (`works/<id>/depiction.json`): the wording the engine's prompts and checks use that
 * belongs to one work rather than to the engine, and the depiction modes its canon entries may have. The engine's
 * own wording is general; everything here was written for, or tuned on, one work (the Bible's thrones, chariots and
 * crucifixion came from its God-figure evaluations and its brief). See ADR 0010.
 *
 * Every canon entry has a depiction mode. `form` entries are drawn from their canon. `effects` entries are never
 * drawn: their canon stays out of every prompt, they get no reference sheet, and only the effects the text names
 * stand for them, in the wording the profile gives. `symbol` entries are drawn only in the non-human form their
 * canon describes (Satan as a red dragon), never as a person: their canon is in the prompt, but they are not named
 * among the selected characters and get no sheet. A work whose profile has no wording for a mode has no such
 * subjects: its prompts never mention them, its plan review and image check never look for them, and an entry in
 * that mode is refused rather than drawn with another work's wording.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { contentVersion } from "../../../convex/_helpers/contentVersion";

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().refine((value) => value.trim().length > 0 && !/[\x00-\x1f\x7f\u2028\u2029]/.test(value), "Expected nonempty single-line text");

const effectsSchema = z.object({
  /** Replaces the subject's names in every text the image prompt carries, so the model never reads a name it would draw as a person. */
  alias: text,
  /** A numbered priority rule in every image prompt of the work. */
  renderRule: text,
  /** The line added to an image prompt whose section cast includes such a subject. */
  renderBlock: text,
}).strict();

const symbolSchema = z.object({
  /** Opens the line added to an image prompt whose section cast includes such a subject; the engine appends their names. */
  renderBlock: text,
}).strict();

const profileSchema = z.object({
  schemaVersion: z.literal(1),
  workId: id,
  /** Where writing most often appears in this work's scenes, named in the image prompt's no-writing rule. */
  writingSurfaces: text,
  /** Serious subjects this work may show beyond the engine's floor of battles, blood and death. */
  seriousSubjects: z.array(text),
  /** Wording for each depiction mode beyond `form` that this work's entries use. */
  modes: z.object({ effects: effectsSchema.optional(), symbol: symbolSchema.optional() }).strict(),
}).strict();

export type EffectsWording = z.infer<typeof effectsSchema>;
export type SymbolWording = z.infer<typeof symbolSchema>;
export type DepictionProfile = Readonly<z.infer<typeof profileSchema> & {
  /** The whole profile, as a content hash; recorded with each rendering packet and saved image. */
  version: string;
}>;

/** Validate a work's depiction profile. */
export function loadDepictionProfile(input: unknown, workId: string): DepictionProfile {
  const profile = profileSchema.parse(input);
  if (profile.workId !== workId) throw new Error(`The depiction profile of ${profile.workId} was given for ${workId}`);
  return Object.freeze({ ...profile, version: contentVersion(profile) });
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

export const DEPICTION_MODES = ["form", "effects", "symbol"] as const;
export type DepictionMode = (typeof DEPICTION_MODES)[number];

/**
 * Canon stores the mode as `hasForm` (absent means drawn), plus `depiction: "symbol"` for a symbol entry. A symbol entry
 * keeps `hasForm: false`, so a deployment from before symbols treats it as `effects`, as it did before.
 */
export function depictionModeOf(entry: object): DepictionMode {
  const stored = entry as { hasForm?: unknown; depiction?: unknown };
  if (stored.depiction === "symbol") return "symbol";
  return stored.hasForm === false ? "effects" : "form";
}

/** The stored form of a mode, as `works:correct set-depiction` writes it over a payload without `depiction`. */
export function storedDepiction(mode: DepictionMode): { hasForm: boolean; depiction?: "symbol" } {
  return mode === "symbol" ? { hasForm: false, depiction: "symbol" } : { hasForm: mode === "form" };
}

/** The work's `symbol` wording, or why entries in that mode cannot be rendered for this work. */
export function symbolWordingFor(profile: DepictionProfile, entryIds: readonly string[]): SymbolWording {
  const symbol = profile.modes.symbol;
  if (!symbol) throw new Error(`${profile.workId} has no wording for subjects shown only as a symbol, so it cannot depict ${entryIds.join(", ")}; set their depiction or add the mode to works/${profile.workId}/depiction.json`);
  return symbol;
}

/** The work's `effects` wording, or why entries in that mode cannot be rendered for this work. */
export function effectsWordingFor(profile: DepictionProfile, entryIds: readonly string[]): EffectsWording {
  const effects = profile.modes.effects;
  if (!effects) throw new Error(`${profile.workId} has no wording for subjects without form, so it cannot depict ${entryIds.join(", ")}; set their depiction or add the mode to works/${profile.workId}/depiction.json`);
  return effects;
}
