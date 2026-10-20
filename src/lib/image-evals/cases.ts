/**
 * Image evaluation cases (#98, S10): a committed, fixed set of verses with their settings and the
 * visual behaviour a reviewer expects, so baseline and candidate runs compare the same inputs.
 */
import { z } from "zod";
import { DEFAULT_ASPECT_RATIO, DEFAULT_IMAGE_MODEL, DEFAULT_RESOLUTION, isValidAspectRatio, isValidResolution } from "../image-models";

export const EVAL_GENRES = ["narrative", "poetry", "prophecy", "genealogy", "symbolic", "difficult", "law", "epistle", "parable"] as const;
export type EvalGenre = (typeof EVAL_GENRES)[number];
/** The legacy arms; generic arms are `generic:<styleId>` (#181). */
export const EVAL_ARMS = ["direct", "planner"] as const;
export type LegacyEvalArm = (typeof EVAL_ARMS)[number];
export type EvalArm = LegacyEvalArm | `generic:${string}`;

const settingsSchema = z.object({
  model: z.string().min(1).optional(),
  aspectRatio: z.string().refine(isValidAspectRatio, "Unsupported aspect ratio").optional(),
  resolution: z.string().refine(isValidResolution, "Unsupported resolution").optional(),
  translation: z.string().min(1).optional(),
}).strict();

const caseSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Case ids are kebab-case"),
  reference: z.string().min(1),
  genre: z.enum(EVAL_GENRES),
  /** What a reviewer should see; it is scored, never sent to a model. */
  expected: z.string().min(1),
  settings: settingsSchema.optional(),
  style: z.string().optional(),
  tags: z.array(z.string()).optional(),
  /** The work the generic engine renders from; Bible verses resolve their unit from the reference. */
  work: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  /** The unit (verse or paragraph) id for the generic engine; derived from the reference when omitted. */
  unitId: z.string().optional(),
  /** Restrict the generic arms this case runs in; every requested style otherwise. */
  styles: z.array(z.string()).optional(),
}).strict();

export const evalCaseFileSchema = z.object({
  schemaVersion: z.literal(1),
  defaults: settingsSchema.optional(),
  cases: z.array(caseSchema).min(1),
}).strict();

export type EvalCase = z.infer<typeof caseSchema> & { resolvedSettings: { model: string; aspectRatio: string; resolution: string; translation: string } };

/** Parse the fixture, apply defaults and refuse duplicate ids. */
export function loadEvalCases(input: unknown): EvalCase[] {
  const file = evalCaseFileSchema.parse(input);
  const seen = new Set<string>();
  return file.cases.map((c) => {
    if (seen.has(c.id)) throw new Error(`Duplicate eval case id: ${c.id}`);
    seen.add(c.id);
    return {
      ...c,
      resolvedSettings: {
        model: c.settings?.model ?? file.defaults?.model ?? DEFAULT_IMAGE_MODEL,
        aspectRatio: c.settings?.aspectRatio ?? file.defaults?.aspectRatio ?? DEFAULT_ASPECT_RATIO,
        resolution: c.settings?.resolution ?? file.defaults?.resolution ?? DEFAULT_RESOLUTION,
        translation: c.settings?.translation ?? file.defaults?.translation ?? "web",
      },
    };
  });
}

/** Genres a case set must cover before it counts as representative. */
export const REQUIRED_GENRES: readonly EvalGenre[] = ["narrative", "poetry", "prophecy", "genealogy", "symbolic", "difficult"];

export function describeCoverage(cases: readonly EvalCase[]) {
  const byGenre: Record<string, number> = {};
  const byWork: Record<string, number> = {};
  for (const c of cases) { byGenre[c.genre] = (byGenre[c.genre] ?? 0) + 1; const work = c.work ?? "bible-web"; byWork[work] = (byWork[work] ?? 0) + 1; }
  const missing = REQUIRED_GENRES.filter((g) => !byGenre[g]);
  const bible = byWork["bible-web"] ?? 0;
  return { total: cases.length, byGenre, byWork, missing, representative: bible >= 24 && missing.length === 0 };
}

export const toUnitId = (reference: string) => reference.toLowerCase().replace(/:/g, "-").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
export const caseWork = (c: EvalCase) => c.work ?? "bible-web";
export const caseUnitId = (c: EvalCase) => c.unitId ?? toUnitId(c.reference);
/** The arms a case takes part in: every legacy arm, and the generic arms whose style the case allows. */
export function armsFor(c: EvalCase, arms: readonly EvalArm[]): EvalArm[] {
  return arms.filter((arm) => !arm.startsWith("generic:") || !c.styles || c.styles.includes(arm.slice("generic:".length)));
}
