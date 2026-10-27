/**
 * A look-check of one finished scene image before it is shown (ADR 0007). A cheap vision model reports four
 * visible faults: a figure in light, cloud or fire (God or another presence without form drawn as a person),
 * an unpainted edge, a painted frame, and lettering. Code, not the model, decides which faults count. The
 * caller decides whether to retry. A checker failure never blocks an image.
 */
import { z } from "zod";

/** Bump for changes to the question, schema or fault rules. */
export const SCENE_CHECK_VERSION = "2026-10-27-scene-check-v2";

// v2: the model describes what it sees before it answers. In v1 it sometimes noted a signature in its reasons and still
// answered false, because the answers came first.
export const sceneCheckSchema = z.object({
  edges: z.string().describe("What reaches the top, bottom, left and right edges and the four corners, one short phrase each."),
  bright_areas: z.string().describe("What is inside each bright area, cloud, fire, pillar or throne, or \"none\"."),
  marks: z.string().describe("Any letters, script, numerals, signature or initials, and where, or \"none\"."),
  figure_in_light: z.boolean(),
  unpainted_edge: z.boolean(),
  painted_frame: z.boolean(),
  lettering: z.boolean(),
  reasons: z.array(z.string()),
}).strict();
export type SceneCheck = z.infer<typeof sceneCheckSchema>;
export type SceneFault = "figure" | "edge" | "frame" | "lettering";
/** Worst first: a figure for a presence without form breaks the work's depiction rules; the rest are craft faults. */
export const SCENE_FAULT_ORDER: SceneFault[] = ["figure", "lettering", "frame", "edge"];

export type SceneCheckContext = {
  /** The named characters and groups the image should show (selected canon with form). */
  people: string[];
  /** The scene plan's own words for its subjects, so figures it asks for are not reported. */
  description: string;
};

export function sceneCheckQuestion(context: SceneCheckContext): string {
  return `You inspect a finished illustration for four visible faults before a reader sees it. Judge only from the image. Return only JSON.
The scene should show: ${context.people.length ? context.people.join("; ") : "no named characters"}. Its description: ${context.description}
First describe the edges, the bright areas and any marks, then answer.
- figure_in_light: true if a head, face, hands, shoulders or a robed or human-shaped body appears inside, made of or emerging from light, radiance, cloud, smoke, fire, a pillar or the sky, or seated or standing on a throne, unless it is clearly one of the beings the description names. A faint or translucent figure counts if you can point to its head, face, hands or body outline. A flame, a heart-shaped glow or billowing cloud is not a figure. People standing in the scene, and winged angels or creatures the description names, do not count.
- unpainted_edge: true if any edge or corner fades into or shows bare white or cream paper, a blank band or an unpainted margin. Pale sky or cloud that continues the scene is not a margin.
- painted_frame: true if an ornamental border, gilt band or frame runs along the edges as part of the artwork. A window or doorway inside the scene is not a frame.
- lettering: true if letters, words, numerals, pseudo-script, inscriptions on objects such as tablets or scrolls, a signature or initials appear anywhere, including small marks in corners.
Each answer must agree with what you described. In reasons, name each fault you report and where it is; leave reasons empty when there are none.`;
}

export function sceneCheckFaults(check: SceneCheck): SceneFault[] {
  const faults: SceneFault[] = [];
  if (check.figure_in_light) faults.push("figure");
  if (check.lettering) faults.push("lettering");
  if (check.painted_frame) faults.push("frame");
  if (check.unpainted_edge) faults.push("edge");
  return faults;
}

/** Which of two checked images to show: the one whose worst fault is least severe, then fewer faults, then the first. */
export function preferredAttempt(a: SceneFault[], b: SceneFault[]): 0 | 1 {
  const worst = (faults: SceneFault[]) => Math.min(...faults.map((f) => SCENE_FAULT_ORDER.indexOf(f)), SCENE_FAULT_ORDER.length);
  if (worst(a) !== worst(b)) return worst(a) > worst(b) ? 0 : 1;
  return b.length < a.length ? 1 : 0;
}
