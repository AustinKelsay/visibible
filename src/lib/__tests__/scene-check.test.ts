/** The finished-image check (ADR 0007): question content, which faults count, and which attempt is shown. */
import { describe, expect, it } from "vitest";
import { preferredAttempt, sceneCheckFaults, sceneCheckQuestion, sceneCheckSchema } from "../engine/scene-check";

const clean = { figure_in_light: false, unpainted_edge: false, painted_frame: false, lettering: false, reasons: [] };

describe("scene check", () => {
  it("asks about all four faults with the scene's own people and description", () => {
    const question = sceneCheckQuestion({ people: ["Moses", "The Israelite people"], description: "Moses on the summit; cloud and pale radiance over the rocks" });
    expect(question).toContain("The scene should show: Moses; The Israelite people.");
    expect(question).toContain("Its description: Moses on the summit; cloud and pale radiance over the rocks");
    for (const field of ["figure_in_light", "unpainted_edge", "painted_frame", "lettering"]) expect(question).toContain(`- ${field}:`);
    expect(question).toContain("a faint, translucent or partial figure counts");
    expect(sceneCheckQuestion({ people: [], description: "Light over dark water" })).toContain("The scene should show: no named characters.");
  });

  it("accepts only the strict reply shape", () => {
    expect(sceneCheckSchema.safeParse(clean).success).toBe(true);
    expect(sceneCheckSchema.safeParse({ ...clean, verdict: "pass" }).success).toBe(false);
    expect(sceneCheckSchema.safeParse({ ...clean, lettering: "no" }).success).toBe(false);
  });

  it("lists faults worst first", () => {
    expect(sceneCheckFaults(clean)).toEqual([]);
    expect(sceneCheckFaults({ ...clean, unpainted_edge: true, figure_in_light: true, lettering: true })).toEqual(["figure", "lettering", "edge"]);
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
