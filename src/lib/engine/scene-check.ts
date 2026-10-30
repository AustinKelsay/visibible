/**
 * A look-check of one finished scene image before it is shown (ADR 0007). Two cheap vision calls, run in parallel,
 * look for visible faults: an unpainted edge, a painted frame, lettering and, in a work with subjects without form,
 * a figure in light, cloud or fire (such a subject drawn as a person). The work's depiction profile words that fault
 * and names its typical inscriptions; a work without such subjects is never asked about them (ADR 0010). Code, not
 * the model, decides which faults count and which of two attempts to show. A checker failure never blocks an image.
 *
 * Each question is used for the faults it measured best on the dev set (llm/releases/2026-10-27-scene-check-benchmark):
 * the direct question (v1) for edges and frames, and the describe-first question (v2) for figures and lettering.
 */
import { z } from "zod";
import type { DepictionProfile } from "./depiction";

/** Bump for changes to either question, schema or the fault rules. v3 = v1 edges and frames + v2 figures and lettering; v4 accepts soft edges in Watercolor. */
export const SCENE_CHECK_VERSION = "2026-10-28-scene-check-v4";

/**
 * Styles whose soft white edges are part of the look, not a fault (owner decision, 28 October; ADR 0006 amendment 2).
 * In the launch matrix a retry never fixed them, so they no longer trigger one. Painted frames still count.
 */
export const SOFT_EDGE_STYLES: readonly string[] = ["watercolor"];

export type SceneCheckContext = {
  /** The named characters and groups the image should show (selected canon with form). */
  people: string[];
  /** The scene plan's own words for its subjects, so figures it asks for are not reported. */
  description: string;
  /** The style's soft white edges are accepted, so an unpainted edge is not a fault. */
  softEdges?: boolean;
  /** The work's wording for its inscriptions and for a figure drawn for a subject without form. */
  depiction: DepictionProfile;
};

const sceneLine = (context: SceneCheckContext) =>
  `The scene should show: ${context.people.length ? context.people.join("; ") : "no named characters"}. Its description: ${context.description}`;
const edgeRules = (depiction: DepictionProfile) => `- unpainted_edge: true if any edge or corner fades into or shows bare white or cream paper, a blank band or an unpainted margin. Pale sky or cloud that continues the scene is not a margin.
- painted_frame: true if an ornamental border, gilt band or frame runs along the edges as part of the artwork. A window or doorway inside the scene is not a frame.
- lettering: true if letters, words, numerals, pseudo-script, inscriptions on objects such as ${depiction.inscribedObjects}, a signature or initials appear anywhere, including small marks in corners.`;
const faultCount = (depiction: DepictionProfile) => depiction.modes.effects ? "four" : "three";
const figureRule = (line: string | undefined) => line ? `- figure_in_light: ${line}\n` : "";

/** The direct question (v1): answers first. Used for edges and frames. */
export const edgeCheckSchema = z.object({
  figure_in_light: z.boolean(),
  unpainted_edge: z.boolean(),
  painted_frame: z.boolean(),
  lettering: z.boolean(),
  reasons: z.array(z.string()),
}).strict();
/** A work without subjects without form is not asked about a figure in light. */
export const edgeCheckSchemaFor = (depiction: DepictionProfile) => depiction.modes.effects ? edgeCheckSchema : edgeCheckSchema.omit({ figure_in_light: true });
export function edgeCheckQuestion(context: SceneCheckContext): string {
  const { depiction } = context;
  return `You inspect a finished illustration for ${faultCount(depiction)} visible faults before a reader sees it. Judge only from the image. Return only JSON.
${sceneLine(context)}
${figureRule(depiction.modes.effects?.checkFigure.direct)}${edgeRules(depiction)}
Inspect all four edges and corners. In reasons, name each fault you report and where it is; leave reasons empty when there are none.`;
}

/** The describe-first question (v2): what it sees, then answers. Used for figures and lettering. */
export const figureCheckSchemaFor = (depiction: DepictionProfile) => z.object({
  edges: z.string().describe("What reaches the top, bottom, left and right edges and the four corners, one short phrase each."),
  ...(depiction.modes.effects ? { bright_areas: z.string().describe(depiction.modes.effects.checkFigure.brightAreas) } : {}),
  marks: z.string().describe("Any letters, script, numerals, signature or initials, and where, or \"none\"."),
  ...(depiction.modes.effects ? { figure_in_light: z.boolean() } : {}),
  unpainted_edge: z.boolean(),
  painted_frame: z.boolean(),
  lettering: z.boolean(),
  reasons: z.array(z.string()),
}).strict();
export function figureCheckQuestion(context: SceneCheckContext): string {
  const { depiction } = context;
  return `You inspect a finished illustration for ${faultCount(depiction)} visible faults before a reader sees it. Judge only from the image. Return only JSON.
${sceneLine(context)}
First describe ${depiction.modes.effects ? "the edges, the bright areas and any marks" : "the edges and any marks"}, then answer.
${figureRule(depiction.modes.effects?.checkFigure.describe)}${edgeRules(depiction)}
Each answer must agree with what you described. In reasons, name each fault you report and where it is; leave reasons empty when there are none.`;
}

export type SceneFault = "figure" | "edge" | "frame" | "lettering";
/** Worst first: a figure for a presence without form breaks the work's depiction rules; the rest are craft faults. */
export const SCENE_FAULT_ORDER: SceneFault[] = ["figure", "lettering", "frame", "edge"];

/** The faults that count, worst first, from the two replies. */
/** The answers each question gives; `figure_in_light` only in a work with subjects without form. */
type EdgeAnswers = Omit<z.infer<typeof edgeCheckSchema>, "figure_in_light"> & { figure_in_light?: boolean };
type FigureAnswers = { edges: string; bright_areas?: string; marks: string; figure_in_light?: boolean; unpainted_edge: boolean; painted_frame: boolean; lettering: boolean; reasons: string[] };

export function sceneCheckFaults(edge: EdgeAnswers, figure: FigureAnswers, options: { softEdges?: boolean } = {}): SceneFault[] {
  const faults: SceneFault[] = [];
  if (figure.figure_in_light === true) faults.push("figure");
  if (figure.lettering) faults.push("lettering");
  if (edge.painted_frame) faults.push("frame");
  if (edge.unpainted_edge && !options.softEdges) faults.push("edge");
  return faults;
}

/** Which of two checked images to show: the one whose worst fault is least severe, then fewer faults, then the first. */
export function preferredAttempt(a: SceneFault[], b: SceneFault[]): 0 | 1 {
  const worst = (faults: SceneFault[]) => Math.min(...faults.map((f) => SCENE_FAULT_ORDER.indexOf(f)), SCENE_FAULT_ORDER.length);
  if (worst(a) !== worst(b)) return worst(a) > worst(b) ? 0 : 1;
  return b.length < a.length ? 1 : 0;
}

/** The vision calls the check needs; the reference checker's adapter implements it. */
export type SceneChecker = {
  readonly id: string;
  check<T>(request: { label: string; question: string; schema: z.ZodType<T>; image: { bytes: Uint8Array; mimeType: string } }): Promise<{ value: T; costUsd: number | null; elapsedMs: number }>;
};
export type SceneCheckResult = { faults: SceneFault[]; costUsd: number | null; elapsedMs: number };

/** Both questions in parallel; throws when either reply is unavailable. */
export async function checkScene(checker: SceneChecker, image: { bytes: Uint8Array; mimeType: string }, context: SceneCheckContext, label: string): Promise<SceneCheckResult> {
  const [edge, figure] = await Promise.all([
    checker.check({ label: `${label}:edge`, question: edgeCheckQuestion(context), schema: edgeCheckSchemaFor(context.depiction) as z.ZodType<EdgeAnswers>, image }),
    checker.check({ label: `${label}:figure`, question: figureCheckQuestion(context), schema: figureCheckSchemaFor(context.depiction) as z.ZodType<FigureAnswers>, image }),
  ]);
  return { faults: sceneCheckFaults(edge.value, figure.value, { softEdges: context.softEdges }), costUsd: edge.costUsd === null || figure.costUsd === null ? null : edge.costUsd + figure.costUsd, elapsedMs: Math.max(edge.elapsedMs, figure.elapsedMs) };
}

export type CheckedAttempt<T> = { image: T; check: SceneCheckResult | null; checkError: string | null };
export type CheckedRender<T> = { chosen: 0 | 1; attempts: CheckedAttempt<T>[]; retryError: string | null };

/**
 * Check the first image and, when it has a fault, make one more and show the better of the two. A check that fails
 * keeps the first image (or, after a faulty first image, the retry). A retry that fails keeps the first image.
 */
export async function checkAndRetry<T>(first: T, deps: { check: (image: T, attempt: 1 | 2) => Promise<SceneCheckResult>; retry: () => Promise<T> }): Promise<CheckedRender<T>> {
  const checked = async (image: T, attempt: 1 | 2): Promise<CheckedAttempt<T>> => {
    try { return { image, check: await deps.check(image, attempt), checkError: null }; }
    catch (error) { return { image, check: null, checkError: error instanceof Error ? error.message : String(error) }; }
  };
  const one = await checked(first, 1);
  if (!one.check || one.check.faults.length === 0) return { chosen: 0, attempts: [one], retryError: null };
  let second: T;
  try { second = await deps.retry(); }
  catch (error) { return { chosen: 0, attempts: [one], retryError: error instanceof Error ? error.message : String(error) }; }
  const two = await checked(second, 2);
  return { chosen: preferredAttempt(one.check.faults, two.check?.faults ?? []), attempts: [one, two], retryError: null };
}
