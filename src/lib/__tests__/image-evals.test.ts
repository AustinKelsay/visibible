/**
 * The image evaluation harness (#98) with fake providers: committed cases, the costed dry-run
 * manifest, reports with latency and spend, missing usage, planner failure, partial results,
 * an exhausted budget, resume without repeats, undersampled comparisons and the contact sheet.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEvalCases, describeCoverage, type EvalCase } from "../image-evals/cases";
import { emptyEvalState, runImageEval, type EvalPassage, type EvalProviders, type EvalRunState } from "../image-evals/runner";
import { buildReport, buildScoreTemplate, renderContactSheet } from "../image-evals/report";
import { createOpenRouterEvalImageProvider, createOpenRouterEvalPlannerProvider } from "../image-evals/adapters";

const committed = loadEvalCases(JSON.parse(readFileSync(path.join(process.cwd(), "evals/images/cases.json"), "utf8")));
const two = committed.filter((c) => ["genesis-1-3-light", "exodus-14-21-sea-parts"].includes(c.id));

function fakeProviders(overrides: Partial<{ imageCost: number | null; failImageFor: string[]; plannerContent: string | null | Error; storeFails: boolean; passageMissing: string[] }> = {}) {
  const calls = { image: [] as string[], planner: [] as string[] };
  const passage = (reference: string): EvalPassage => ({ reference, verseText: `Text of ${reference}.`, prevVerse: { number: 1, text: "Before." }, nextVerse: { number: 3, text: "After." }, chapterTheme: null });
  const providers: EvalProviders = {
    resolvePassage: async (reference) => (overrides.passageMissing?.includes(reference) ? null : passage(reference)),
    image: { id: "fake-image", async generate(request) {
      calls.image.push(request.label);
      if (overrides.failImageFor?.includes(request.label)) throw new Error("provider 500");
      return { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", costUsd: overrides.imageCost === undefined ? 0.03 : overrides.imageCost, elapsedMs: 1200 + calls.image.length, providerRequestId: `gen-${calls.image.length}` };
    } },
    planner: { id: "fake-planner", async plan(request) {
      calls.planner.push(request.label);
      const content = overrides.plannerContent === undefined ? JSON.stringify({ primarySubject: "Light", action: "breaks", setting: "deep", secondaryElements: "waters", mood: "awe", timeOfDay: "dawn", composition: "wide" }) : overrides.plannerContent;
      if (content instanceof Error) throw content;
      return { content, costUsd: 0.0004, elapsedMs: 300 };
    } },
    sink: { save: async (key) => { if (overrides.storeFails) throw new Error("disk full"); return `outputs/${key}.png`; } },
  };
  return { providers, calls };
}
const run = (cases: EvalCase[], providers: EvalProviders, extra: Partial<Parameters<typeof runImageEval>[0]> = {}) => {
  const state: EvalRunState = extra.state ?? emptyEvalState("test", "google/gemini-3.1-flash-lite-image", "fake-planner", 1_000);
  return runImageEval({ cases, arms: ["direct", "planner"], repeats: 1, budgetUsd: 1, estimateUsd: { image: 0.035, planner: 0.001 }, providers, saveState: async () => {}, now: () => 5_000, ...extra, state });
};

describe("image evaluation harness", () => {
  it("commits a representative case set with fixed settings", () => {
    const coverage = describeCoverage(committed);
    expect(coverage.representative).toBe(true);
    expect(coverage.total).toBeGreaterThanOrEqual(24);
    expect(coverage.missing).toEqual([]);
    expect(committed.every((c) => c.resolvedSettings.model === "google/gemini-3.1-flash-lite-image" && c.resolvedSettings.translation === "web")).toBe(true);
    expect(committed.filter((c) => c.tags?.includes("continuity")).map((c) => c.id)).toEqual(expect.arrayContaining(["matthew-14-29-peter-water", "john-21-7-peter-sea", "exodus-14-21-sea-parts", "exodus-14-22-sea-walls", "genesis-1-3-light"]));
    expect(() => loadEvalCases({ schemaVersion: 1, cases: [{ id: "a", reference: "Genesis 1:1", genre: "narrative", expected: "x" }, { id: "a", reference: "Genesis 1:2", genre: "narrative", expected: "y" }] })).toThrow(/Duplicate/);
  });

  it("prices the dry-run manifest without calling anything and reports when it does not fit", async () => {
    const { providers, calls } = fakeProviders();
    const { manifest } = await run(two, providers, { dryRun: true, repeats: 3, budgetUsd: 0.3 });
    expect(manifest.plannedCalls).toBe(12);
    expect(manifest.estimatedUsd).toBeCloseTo(6 * 0.035 + 6 * 0.036, 6);
    expect(manifest.withinBudget).toBe(false);
    expect(calls.image).toEqual([]);
  });

  it("runs both arms through the production prompt builders and reports spend, latency, outputs and reproducibility", async () => {
    const { providers, calls } = fakeProviders();
    const { state } = await run(two, providers);
    expect(calls.image).toHaveLength(4);
    expect(calls.planner).toHaveLength(2);
    const planned = state.samples["genesis-1-3-light/planner/1"];
    expect(planned).toMatchObject({ status: "completed", plannerOutcome: "planned", output: "outputs/genesis-1-3-light/planner-1.png", imageCostUsd: 0.03, plannerCostUsd: 0.0004, usageMissing: false, providerRequestId: "gen-2" });
    expect(planned.prompt).toContain("Light");
    expect(planned.scenePlan?.primarySubject).toBe("Light");
    expect(state.samples["genesis-1-3-light/direct/1"].scenePlan).toBeNull();
    expect(state.spentUsd).toBeCloseTo(4 * 0.03 + 2 * 0.0004, 6);
    const report = buildReport(state, two, { arms: ["direct", "planner"], repeats: 1, sampleFloor: 1, now: () => 6_000 });
    expect(report.arms.direct).toMatchObject({ completed: 2, failed: 0, notRun: 0, usageMissing: 0 });
    expect(report.arms.planner.spendUsd.planner).toBeCloseTo(0.0008, 6);
    expect(report.arms.planner.latencyMs.planner.p50).toBe(300);
    expect(report.arms.direct.latencyMs.image.p90).toBeGreaterThan(1200);
    expect(report.reproducibility).toMatchObject({ promptVersion: "2026-09-08-canonical", imageModel: "google/gemini-3.1-flash-lite-image", plannerModel: "fake-planner", repeats: 1 });
    expect(report.comparisons).toEqual({ ready: 2, inconclusive: 0, incomplete: 0 });
    const sheet = renderContactSheet(report);
    expect(sheet).toContain("outputs/genesis-1-3-light/planner-1.png");
    expect(sheet).toContain("Exodus 14:21");
    const scores = buildScoreTemplate(report);
    expect(scores.rows).toHaveLength(4);
    expect(scores.rows[0]).toMatchObject({ caseId: "genesis-1-3-light", arm: "direct", relevance: null, verdict: null });
  });

  it("records missing usage against the estimate, a planner failure as a direct sample, and failures as partial results", async () => {
    const { providers } = fakeProviders({ imageCost: null, plannerContent: new Error("planner down"), failImageFor: ["exodus-14-21-sea-parts/direct/1"] });
    const { state } = await run(two, providers);
    expect(state.samples["genesis-1-3-light/direct/1"]).toMatchObject({ usageMissing: true, imageCostUsd: 0.035 });
    expect(state.samples["genesis-1-3-light/planner/1"]).toMatchObject({ status: "completed", plannerOutcome: "failed", scenePlan: null });
    expect(state.samples["exodus-14-21-sea-parts/direct/1"]).toMatchObject({ status: "failed", stage: "image", error: "provider 500", imageCostUsd: 0 });
    const report = buildReport(state, two, { arms: ["direct", "planner"], repeats: 1, sampleFloor: 1 });
    expect(report.arms.direct).toMatchObject({ completed: 1, failed: 1, failureRate: 0.5, usageMissing: 1, failuresByStage: { image: 1 } });
    expect(report.arms.planner.plannerOutcomes).toEqual({ failed: 2 });
    expect(report.cases.find((c) => c.id === "exodus-14-21-sea-parts")?.comparison).toBe("inconclusive");
    expect(renderContactSheet(report)).toContain("failed at image");
    // A stored-but-unsaveable image still counts against spend.
    const stored = fakeProviders({ storeFails: true });
    const { state: lost } = await run(two.slice(0, 1), stored.providers, { arms: ["direct"] });
    expect(lost.samples["genesis-1-3-light/direct/1"]).toMatchObject({ status: "failed", stage: "store", imageCostUsd: 0.03 });
    expect(lost.spentUsd).toBeCloseTo(0.03, 6);
    const missing = fakeProviders({ passageMissing: ["Genesis 1:3"] });
    const { state: noPassage } = await run(two.slice(0, 1), missing.providers, { arms: ["direct"] });
    expect(noPassage.samples["genesis-1-3-light/direct/1"]).toMatchObject({ status: "failed", stage: "passage" });
  });

  it("stops on an image funding rejection, saves paid planner usage, and resumes without repeating completed images", async () => {
    const { providers, calls } = fakeProviders();
    let requests = 0;
    providers.image = createOpenRouterEvalImageProvider({ apiKey: "fake", fetch: async () => {
      requests++;
      return requests === 2
        ? Response.json({ error: { message: "Insufficient credits" } }, { status: 402 })
        : Response.json({ id: `gen-${requests}`, choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,AQID" } }] } }], usage: { cost: 0.03 } });
    } });
    const saved: EvalRunState[] = [];
    const first = await run(two, providers, { saveState: async (state) => { saved.push(structuredClone(state)); } });
    expect(requests).toBe(2);
    expect(calls.planner).toHaveLength(1);
    expect(first.state.stopped).toMatchObject({ reason: "provider_funding", at: 5_000, detail: expect.stringContaining("OpenRouter 402") });
    expect(first.state.samples["genesis-1-3-light/planner/1"]).toMatchObject({ status: "failed", stage: "image", plannerCostUsd: 0.0004, imageCostUsd: 0 });
    expect(first.state.spentUsd).toBeCloseTo(0.0304, 6);
    expect(saved).toHaveLength(2);
    expect(saved[1]).toEqual(first.state);
    const report = buildReport(first.state, two, { arms: ["direct", "planner"], repeats: 1, sampleFloor: 1 });
    expect(report.arms.direct).toMatchObject({ completed: 1, notRun: 1 });
    expect(report.arms.planner).toMatchObject({ failed: 1, notRun: 1 });
    expect(renderContactSheet(report)).toContain("stopped: provider_funding");
    const resumed = await run(two, providers, { state: first.state });
    expect(requests).toBe(5); // four completed images and one rejected attempt
    expect(resumed.state.stopped).toBeUndefined();
    expect(resumed.state.samples["genesis-1-3-light/direct/1"].providerRequestId).toBe("gen-1");
    expect(resumed.state.samples["genesis-1-3-light/planner/1"]).toMatchObject({ status: "completed", priorCostUsd: 0.0004 });
    expect(resumed.state.spentUsd).toBeCloseTo(0.1212, 6);
    const recovered = buildReport(resumed.state, two, { arms: ["direct", "planner"], repeats: 1, sampleFloor: 1 });
    expect(recovered.comparisons).toEqual({ ready: 2, inconclusive: 0, incomplete: 0 });
    expect(recovered.arms.direct.spendUsd.total + recovered.arms.planner.spendUsd.total).toBeCloseTo(resumed.state.spentUsd, 6);
  });

  it("stops on a planner funding rejection before requesting an image", async () => {
    const { providers, calls } = fakeProviders();
    let requests = 0;
    providers.planner = createOpenRouterEvalPlannerProvider({ apiKey: "fake", model: "fake-planner", fetch: async () => {
      requests++;
      return Response.json({ error: { message: "Insufficient credits" } }, { status: 402 });
    } });
    const { state } = await run(two, providers, { arms: ["planner"] });
    expect(requests).toBe(1);
    expect(calls.image).toEqual([]);
    expect(state.stopped?.reason).toBe("provider_funding");
    expect(state.samples["genesis-1-3-light/planner/1"]).toMatchObject({ status: "failed", stage: "planner", plannerOutcome: "failed", plannerCostUsd: 0, imageCostUsd: 0 });
    expect(state.spentUsd).toBe(0);
    expect(buildReport(state, two, { arms: ["planner"], repeats: 1 }).arms.planner).toMatchObject({ failed: 1, notRun: 1 });
  });

  it("uses the HTTP status rather than error text to distinguish funding from ordinary provider failures", async () => {
    const { providers, calls } = fakeProviders();
    providers.image = createOpenRouterEvalImageProvider({ apiKey: "fake", fetch: async () => Response.json({ error: { message: "Upstream 402 mentioned in diagnostic text" } }, { status: 500 }) });
    providers.planner = createOpenRouterEvalPlannerProvider({ apiKey: "fake", model: "fake-planner", fetch: async () => Response.json({ error: { message: "Upstream 402 mentioned in diagnostic text" } }, { status: 500 }) });
    // Image failures still allow later samples to run.
    const images = await run(two, providers, { arms: ["direct"] });
    expect(images.state.stopped).toBeUndefined();
    expect(Object.values(images.state.samples)).toHaveLength(2);
    expect(Object.values(images.state.samples).every((s) => s.status === "failed" && s.stage === "image")).toBe(true);
    // Ordinary planner failures still fall back to direct image generation.
    const fallback = fakeProviders();
    providers.image = fallback.providers.image;
    const planners = await run(two, providers, { arms: ["planner"] });
    expect(planners.state.stopped).toBeUndefined();
    expect(fallback.calls.image).toHaveLength(2);
    expect(calls.image).toHaveLength(0);
    expect(Object.values(planners.state.samples).every((s) => s.status === "completed" && s.plannerOutcome === "failed")).toBe(true);
  });

  it("stops at the hard budget, leaves the rest not run and incomplete, and resumes without repeating a completed sample", async () => {
    const { providers, calls } = fakeProviders();
    const first = await run(two, providers, { budgetUsd: 0.07, arms: ["direct"], repeats: 3 });
    // Two $0.03 samples fit; the third's $0.035 estimate would pass $0.07.
    expect(calls.image).toHaveLength(2);
    expect(first.state.stopped?.reason).toBe("budget_exhausted");
    const report = buildReport(first.state, two, { arms: ["direct"], repeats: 3 });
    expect(report.arms.direct).toMatchObject({ completed: 2, notRun: 4 });
    expect(report.cases.map((c) => c.comparison)).toEqual(["incomplete", "incomplete"]);
    expect(renderContactSheet(report)).toContain("stopped: budget_exhausted");
    // Resume with a larger budget: the two completed samples are not repeated.
    const second = await run(two, providers, { state: first.state, budgetUsd: 1, arms: ["direct"], repeats: 3 });
    expect(calls.image).toHaveLength(6);
    expect(second.state.stopped).toBeUndefined();
    const resumed = buildReport(second.state, two, { arms: ["direct"], repeats: 3 });
    expect(resumed.comparisons).toEqual({ ready: 2, inconclusive: 0, incomplete: 0 });
    // Fewer than the floor is inconclusive even when every repeat ran: the floor is never lowered to the repeat count.
    const thin = buildReport(second.state, two, { arms: ["direct"], repeats: 3, sampleFloor: 4 });
    expect(thin.cases[0]).toMatchObject({ comparison: "inconclusive", reason: expect.stringContaining("fewer than 4") });
    const short = await run(two, fakeProviders().providers, { arms: ["direct"], repeats: 2 });
    expect(buildReport(short.state, two, { arms: ["direct"], repeats: 2, sampleFloor: 3 }).cases[0]).toMatchObject({ comparison: "inconclusive" });
    const under = await run(two, fakeProviders({ failImageFor: ["genesis-1-3-light/direct/2"] }).providers, { arms: ["direct"], repeats: 3 });
    expect(buildReport(under.state, two, { arms: ["direct"], repeats: 3 }).cases[0]).toMatchObject({ comparison: "inconclusive" });
    // A rerun retries the failed sample and keeps its earlier cost on the ledger; a subset report counts only its own cases and repeats.
    const retried = await run(two, fakeProviders().providers, { state: under.state, arms: ["direct"], repeats: 3 });
    expect(retried.state.samples["genesis-1-3-light/direct/2"].status).toBe("completed");
    expect(retried.state.samples["genesis-1-3-light/direct/2"].priorCostUsd).toBeUndefined(); // the failed attempt cost nothing
    const storeLost = await run(two.slice(0, 1), fakeProviders({ storeFails: true }).providers, { arms: ["direct"] });
    const recovered = await run(two.slice(0, 1), fakeProviders().providers, { state: storeLost.state, arms: ["direct"] });
    expect(recovered.state.samples["genesis-1-3-light/direct/1"]).toMatchObject({ status: "completed", priorCostUsd: 0.03 });
    const recoveredReport = buildReport(recovered.state, two.slice(0, 1), { arms: ["direct"], repeats: 1, sampleFloor: 1 });
    expect(recoveredReport.arms.direct.spendUsd.total).toBeCloseTo(recovered.state.spentUsd, 6);
    const subset = buildReport(second.state, two.slice(0, 1), { arms: ["direct"], repeats: 2, sampleFloor: 2 });
    expect(subset.arms.direct).toMatchObject({ completed: 2, failed: 0, notRun: 0 });
    expect(subset.arms.direct.spendUsd.total).toBeCloseTo(0.06, 6);
  });
});
