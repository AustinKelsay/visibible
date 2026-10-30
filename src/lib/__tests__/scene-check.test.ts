/** The finished-image check (ADR 0007): both questions, which faults count from which reply, and which attempt is shown. */
import { describe, expect, it } from "vitest";
import { checkAndRetry, checkScene, edgeCheckQuestion, edgeCheckSchema, figureCheckQuestion, figureCheckSchemaFor, preferredAttempt, sceneCheckFaults, SOFT_EDGE_STYLES } from "../engine/scene-check";
import { testDepiction } from "../../../tests/fixtures/depiction";

const bible = testDepiction("bible-web");
const figureCheckSchema = figureCheckSchemaFor(bible);

const answers = { figure_in_light: false, unpainted_edge: false, painted_frame: false, lettering: false, reasons: [] };
const described = { edges: "scenery at every edge", bright_areas: "none", marks: "none", ...answers };
const context = { people: ["Moses", "The Israelite people"], description: "Moses on the summit; cloud and pale radiance over the rocks", depiction: bible };

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
    expect(edgeCheckQuestion({ people: [], description: "Light over dark water", depiction: bible })).toContain("The scene should show: no named characters.");
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

  it("accepts soft edges in Watercolor but still reports its painted frames (owner decision, 28 October)", () => {
    expect(SOFT_EDGE_STYLES).toEqual(["watercolor"]);
    expect(sceneCheckFaults({ ...answers, unpainted_edge: true }, described, { softEdges: true })).toEqual([]);
    expect(sceneCheckFaults({ ...answers, unpainted_edge: true, painted_frame: true }, described, { softEdges: true })).toEqual(["frame"]);
    expect(sceneCheckFaults({ ...answers, unpainted_edge: true }, described, { softEdges: false })).toEqual(["edge"]);
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

describe("check and retry", () => {
  const result = (faults: Parameters<typeof preferredAttempt>[0]) => ({ faults, costUsd: 0.0007, elapsedMs: 5 });
  const run = (checks: Array<ReturnType<typeof result> | Error>, retry: () => Promise<string> = async () => "second") => {
    const calls: string[] = [];
    return { calls, done: checkAndRetry("first", {
      check: async (image, attempt) => { calls.push(`check:${image}:${attempt}`); const next = checks.shift()!; if (next instanceof Error) throw next; return next; },
      retry: async () => { calls.push("retry"); return retry(); },
    }) };
  };

  it("keeps a clean first image without a retry", async () => {
    const { calls, done } = run([result([])]);
    expect(await done).toMatchObject({ chosen: 0, attempts: [{ image: "first", checkError: null }], retryError: null });
    expect(calls).toEqual(["check:first:1"]);
  });

  it("retries a faulty image once and shows the better one", async () => {
    const better = run([result(["figure"]), result(["edge"])]);
    expect(await better.done).toMatchObject({ chosen: 1, attempts: [{ image: "first" }, { image: "second" }] });
    expect(better.calls).toEqual(["check:first:1", "retry", "check:second:2"]);
    expect((await run([result(["edge"]), result(["figure"])]).done).chosen).toBe(0);
  });

  it("keeps the first image when its check or the retry fails, and the retry when only its check fails", async () => {
    const unchecked = run([new Error("checker down")]);
    expect(await unchecked.done).toMatchObject({ chosen: 0, attempts: [{ check: null, checkError: "checker down" }] });
    expect(unchecked.calls).toEqual(["check:first:1"]);
    expect(await run([result(["lettering"])], async () => { throw new Error("provider 503"); }).done).toMatchObject({ chosen: 0, retryError: "provider 503" });
    expect(await run([result(["lettering"]), new Error("checker down")]).done).toMatchObject({ chosen: 1, attempts: [{ image: "first" }, { image: "second", checkError: "checker down" }] });
  });
});

describe("checkScene", () => {
  it("asks both questions in parallel and combines their faults and costs", async () => {
    const labels: string[] = [];
    const checker = { id: "fake", check: async <T,>(request: { label: string; schema: { parse: (v: unknown) => T } }) => {
      labels.push(request.label);
      const value = request.label.endsWith(":edge") ? { ...answers, unpainted_edge: true, figure_in_light: true } : { ...described, lettering: true };
      return { value: request.schema.parse(value), costUsd: 0.0003, elapsedMs: request.label.endsWith(":edge") ? 4 : 7 };
    } };
    const out = await checkScene(checker as never, { bytes: new Uint8Array([1]), mimeType: "image/png" }, context, "m");
    expect(labels.sort()).toEqual(["m:edge", "m:figure"]);
    expect(out).toEqual({ faults: ["lettering", "edge"], costUsd: 0.0006, elapsedMs: 7 });
    expect((await checkScene(checker as never, { bytes: new Uint8Array([1]), mimeType: "image/png" }, { ...context, softEdges: true }, "w")).faults).toEqual(["lettering"]);
  });
});
