/**
 * A look-check of one finished scene image before it is shown (ADR 0007). Two cheap vision calls, run in parallel,
 * look for four visible faults: a figure in light, cloud or fire (God or another presence without form drawn as a
 * person), an unpainted edge, a painted frame, and lettering. Code, not the model, decides which faults count and
 * which of two attempts to show. A checker failure never blocks an image.
 *
 * Each question is used for the faults it measured best on the dev set (llm/releases/2026-10-27-scene-check-benchmark):
 * the direct question (v1) for edges and frames, and the describe-first question (v2) for figures and lettering.
 */
import { z } from "zod";

/** Bump for changes to either question, schema or the fault rules. v3 = v1 edges and frames + v2 figures and lettering. */
export const SCENE_CHECK_VERSION = "2026-10-27-scene-check-v3";

export type SceneCheckContext = {
  /** The named characters and groups the image should show (selected canon with form). */
  people: string[];
  /** The scene plan's own words for its subjects, so figures it asks for are not reported. */
  description: string;
};

const sceneLine = (context: SceneCheckContext) =>
  `The scene should show: ${context.people.length ? context.people.join("; ") : "no named characters"}. Its description: ${context.description}`;
const EDGE_RULES = `- unpainted_edge: true if any edge or corner fades into or shows bare white or cream paper, a blank band or an unpainted margin. Pale sky or cloud that continues the scene is not a margin.
- painted_frame: true if an ornamental border, gilt band or frame runs along the edges as part of the artwork. A window or doorway inside the scene is not a frame.
- lettering: true if letters, words, numerals, pseudo-script, inscriptions on objects such as tablets or scrolls, a signature or initials appear anywhere, including small marks in corners.`;

/** The direct question (v1): answers first. Used for edges and frames. */
export const edgeCheckSchema = z.object({
  figure_in_light: z.boolean(),
  unpainted_edge: z.boolean(),
  painted_frame: z.boolean(),
  lettering: z.boolean(),
  reasons: z.array(z.string()),
}).strict();
export function edgeCheckQuestion(context: SceneCheckContext): string {
  return `You inspect a finished illustration for four visible faults before a reader sees it. Judge only from the image. Return only JSON.
${sceneLine(context)}
- figure_in_light: true if any face, head, hands, robe, body or human-shaped silhouette appears inside, made of or emerging from light, radiance, cloud, smoke, fire, a pillar or the sky, or seated or standing on a throne, unless it is clearly one of the beings the description names. Look closely at every bright area, cloud and throne; a faint, translucent or partial figure counts. People standing in the scene, and winged angels or creatures the description names, do not count.
${EDGE_RULES}
Inspect all four edges and corners. In reasons, name each fault you report and where it is; leave reasons empty when there are none.`;
}

/** The describe-first question (v2): what it sees, then answers. Used for figures and lettering. */
export const figureCheckSchema = z.object({
  edges: z.string().describe("What reaches the top, bottom, left and right edges and the four corners, one short phrase each."),
  bright_areas: z.string().describe("What is inside each bright area, cloud, fire, pillar or throne, or \"none\"."),
  marks: z.string().describe("Any letters, script, numerals, signature or initials, and where, or \"none\"."),
  figure_in_light: z.boolean(),
  unpainted_edge: z.boolean(),
  painted_frame: z.boolean(),
  lettering: z.boolean(),
  reasons: z.array(z.string()),
}).strict();
export function figureCheckQuestion(context: SceneCheckContext): string {
  return `You inspect a finished illustration for four visible faults before a reader sees it. Judge only from the image. Return only JSON.
${sceneLine(context)}
First describe the edges, the bright areas and any marks, then answer.
- figure_in_light: true if a head, face, hands, shoulders or a robed or human-shaped body appears inside, made of or emerging from light, radiance, cloud, smoke, fire, a pillar or the sky, or seated or standing on a throne, unless it is clearly one of the beings the description names. A faint or translucent figure counts if you can point to its head, face, hands or body outline. A flame, a heart-shaped glow or billowing cloud is not a figure. People standing in the scene, and winged angels or creatures the description names, do not count.
${EDGE_RULES}
Each answer must agree with what you described. In reasons, name each fault you report and where it is; leave reasons empty when there are none.`;
}

export type SceneFault = "figure" | "edge" | "frame" | "lettering";
/** Worst first: a figure for a presence without form breaks the work's depiction rules; the rest are craft faults. */
export const SCENE_FAULT_ORDER: SceneFault[] = ["figure", "lettering", "frame", "edge"];

/** The faults that count, worst first, from the two replies. */
export function sceneCheckFaults(edge: z.infer<typeof edgeCheckSchema>, figure: z.infer<typeof figureCheckSchema>): SceneFault[] {
  const faults: SceneFault[] = [];
  if (figure.figure_in_light) faults.push("figure");
  if (figure.lettering) faults.push("lettering");
  if (edge.painted_frame) faults.push("frame");
  if (edge.unpainted_edge) faults.push("edge");
  return faults;
}

/** Which of two checked images to show: the one whose worst fault is least severe, then fewer faults, then the first. */
export function preferredAttempt(a: SceneFault[], b: SceneFault[]): 0 | 1 {
  const worst = (faults: SceneFault[]) => Math.min(...faults.map((f) => SCENE_FAULT_ORDER.indexOf(f)), SCENE_FAULT_ORDER.length);
  if (worst(a) !== worst(b)) return worst(a) > worst(b) ? 0 : 1;
  return b.length < a.length ? 1 : 0;
}
