/** The finished-image check (ADR 0007): both questions, which faults count from which reply, and which attempt is shown. */
import { describe, expect, it } from "vitest";
import { edgeCheckQuestion, edgeCheckSchema, figureCheckQuestion, figureCheckSchema, preferredAttempt, sceneCheckFaults } from "../engine/scene-check";

const answers = { figure_in_light: false, unpainted_edge: false, painted_frame: false, lettering: false, reasons: [] };
const described = { edges: "scenery at every edge", bright_areas: "none", marks: "none", ...answers };
const context = { people: ["Moses", "The Israelite people"], description: "Moses on the summit; cloud and pale radiance over the rocks" };

describe("scene check", () => {
  it("asks both questions with the scene's own people and description", () => {
    for (const question of [edgeCheckQuestion(context), figureCheckQuestion(context)]) {
      expect(question).toContain("The scene should show: Moses; The Israelite people.");
      expect(question).toContain("Its description: Moses on the summit; cloud and pale radiance over the rocks");
      for (const field of ["figure_in_light", "unpainted_edge", "painted_frame", "lettering"]) expect(question).toContain(`- ${field}:`);
    }
    expect(edgeCheckQuestion(context)).toContain("Inspect all four edges and corners.");
    expect(figureCheckQuestion(context)).toContain("First describe the edges, the bright areas and any marks, then answer.");
    expect(figureCheckQuestion(context)).toContain("A flame, a heart-shaped glow or billowing cloud is not a figure.");
    expect(edgeCheckQuestion({ people: [], description: "Light over dark water" })).toContain("The scene should show: no named characters.");
  });

  it("accepts only each question's strict reply shape", () => {
    expect(edgeCheckSchema.safeParse(answers).success).toBe(true);
    expect(edgeCheckSchema.safeParse(described).success).toBe(false);
    expect(figureCheckSchema.safeParse(described).success).toBe(true);
    expect(figureCheckSchema.safeParse(answers).success).toBe(false);
  });

  it("takes edges and frames from the direct reply, figures and lettering from the describe-first reply", () => {
    expect(sceneCheckFaults(answers, described)).toEqual([]);
    // The direct reply's figure and lettering answers are ignored; so are the describe-first reply's edges.
    expect(sceneCheckFaults({ ...answers, figure_in_light: true, lettering: true }, { ...described, unpainted_edge: true, painted_frame: true })).toEqual([]);
    expect(sceneCheckFaults({ ...answers, unpainted_edge: true, painted_frame: true }, { ...described, figure_in_light: true, lettering: true })).toEqual(["figure", "lettering", "frame", "edge"]);
  });

  it("shows the attempt whose worst fault is least severe, then the one with fewer faults, then the first", () => {
    expect(preferredAttempt([], [])).toBe(0);
    expect(preferredAttempt(["edge"], [])).toBe(1);
    expect(preferredAttempt([], ["edge"])).toBe(0);
    expect(preferredAttempt(["figure"], ["edge", "lettering"])).toBe(1);
    expect(preferredAttempt(["lettering"], ["figure"])).toBe(0);
    expect(preferredAttempt(["edge", "frame"], ["frame"])).toBe(1);
    expect(preferredAttempt(["edge"], ["edge"])).toBe(0);
  });
});
