/**
 * The image evaluation harness (#98, #181) with fake providers over an in-memory analysis: the committed
 * cases, the same assembly as the request engine, prepared against cold samples, preparation spend apart
 * from image spend, the quote against reported usage, retained packets and references, the style matrix,
 * prose moments found from a unit, owner style trials, assembly failures as partial results, the dry-run
 * manifest, the hard budget and resume, funding told by HTTP status, and the baseline-versus-candidate sheet.
 */
import { REVIEW_USAGE, reviewReply } from "../../../tests/fixtures/plan-review";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWorkReader } from "../work-input";
import { SHARED_STYLES, type WorkBrief } from "../work-preparation";
import { normalizeImageBilling } from "../image-catalog";
import { createMemoryPreparationStore } from "../engine/memory-store";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { describeCoverage, loadEvalCases } from "../image-evals/cases";
import { createOpenRouterEvalImageProvider } from "../image-evals/adapters";
import { COLD_PREPARATION_CALLS, emptyEvalState, runImageEval, type EvalProviders, type EvalRunState } from "../image-evals/runner";
import { buildReport, buildScoreTemplate, renderComparisonSheet, renderContactSheet } from "../image-evals/report";
import type { GenericEvalProvider } from "../image-evals/generic";
import type { WorkInputs } from "../engine/work-inputs";
import { selectionReply, withGrounding } from "../../../tests/fixtures/scene-grounding";
import { testDepiction } from "../../../tests/fixtures/depiction";

/** Clean reviews and the v12 planner reply format (no `situation`); the shared clean-review fixture still adds conditions. */
function withCleanV12Review<T extends TextModel>(model: T): T {
  return { ...model, id: model.id, complete: async (request: TextModelRequest) => {
    if (request.schemaName === "plan_review") return reviewReply();
    const result = await model.complete(request);
    if (request.schemaName !== "scene_plan") return result;
    let value: unknown;
    try { value = JSON.parse(result.content); } catch { return result; }
    return { ...result, content: JSON.stringify(selectionReply(value)) };
  } } as T;
}

const WORK = "two-books";
const work = createWorkReader({
  schemaVersion: 1, id: WORK, title: "Two Books", author: "Fixture", language: "en",
  referenceText: { name: "Fixture", source: "https://example.com", credit: "Test", sha256: "0".repeat(64) },
  levels: ["Book", "Chapter", "Verse"], referenceFormats: { Chapter: "{Book} {Chapter}:{Verse}" }, momentMode: "unit",
  divisions: [{ key: "alpha", label: "Alpha", level: "Book", divisions: [{ key: "1", label: "1", level: "Chapter", units: [1, 2, 3].map((n) => ({ number: n, text: `Verse ${n} of Alpha.` })) }] }],
});
const PROSE = "two-tales";
const prose = createWorkReader({
  schemaVersion: 1, id: PROSE, title: "Two Tales", author: "Fixture", language: "en",
  referenceText: { name: "Fixture", source: "https://example.com", credit: "Test", sha256: "1".repeat(64) },
  levels: ["Story", "Paragraph"], referenceFormats: { Story: "{Story} ¶{Paragraph}" }, momentMode: "reading-pass",
  divisions: [{ key: "lamp", label: "The Lamp", level: "Story", units: [1, 2, 3, 4].map((n) => ({ number: n, text: `Paragraph ${n} of the lamp story.` })) }],
});
const brief = (workId: string): WorkBrief => ({ schemaVersion: 1, workId, tone: "Quiet.", depictionRules: [{ text: "Royalty wears a plain circlet." }], eras: [{ id: "lakeside", label: "Lakeside kingdom", people: "Fisherfolk.", dress: "Wool.", buildingsAndObjects: "Boats.", technology: "Sail." }], styleIds: ["classical", "watercolor"] });
const inputsFor = (reader: typeof work, workId: string): WorkInputs => ({ work: reader, workVersion: "wv", brief: brief(workId), briefVersion: "bv", depiction: testDepiction(workId), styles: Object.fromEntries(brief(workId).styleIds.map((id) => [id, { style: SHARED_STYLES.get(id), version: `sv-${id}` }])) });
const records = [
  { kind: "entry", recordId: "jonah", payload: { kind: "entry", name: "Jonah", entryKind: "character", hasForm: true, stages: [{ id: "old", text: "Jonah: a weathered sailor with a grey beard." }] } },
  { kind: "section", recordId: "alpha-1-1", payload: { kind: "section", title: "At the lake", firstUnit: "alpha-1-1", lastUnit: "alpha-1-3", era: "lakeside", cast: [{ entryId: "jonah", stageId: "old" }] } },
  ...["alpha-1-1", "alpha-1-2", "alpha-1-3"].map((id) => ({ kind: "moment", recordId: id, payload: { kind: "moment", sectionId: "alpha-1-1", firstUnit: id, lastUnit: id } })),
];
const proseRecords = [
  { kind: "entry", recordId: "lamplighter", payload: { kind: "entry", name: "The lamplighter", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "The lamplighter: a thin old man with a long pole." }] } },
  { kind: "section", recordId: "lamp-1", payload: { kind: "section", title: "The lamp", firstUnit: "lamp-1", lastUnit: "lamp-4", era: "lakeside", cast: [{ entryId: "lamplighter", stageId: "main" }] } },
  { kind: "moment", recordId: "lamp-1", payload: { kind: "moment", sectionId: "lamp-1", firstUnit: "lamp-1", lastUnit: "lamp-2" } },
  { kind: "moment", recordId: "lamp-3", payload: { kind: "moment", sectionId: "lamp-1", firstUnit: "lamp-3", lastUnit: "lamp-4" } },
];
const lookAnswer = { place: "Lakeshore", timeOfDay: "dawn", weather: "calm", light: "low sun", clothing: "wool" };
const planAnswer = (present: string[]) => ({ present, missingCast: [], primarySubject: "Jonah by the boats", action: "mends nets", setting: "shore", secondaryElements: "boats", mood: "quiet", timeOfDay: "dawn", composition: "wide" });
function scriptedModel(costUsd: number | null = 0.0004) {
  const calls: TextModelRequest[] = [];
  const model: TextModel & { calls: TextModelRequest[] } = withCleanV12Review({ id: "scripted", calls, async complete(request) {
    calls.push(request);
    const id = request.label.split(":")[1];
    const reader = request.user.includes("lamplighter") ? prose : work;
    const value = request.schemaName === "section_look" ? lookAnswer : withGrounding(planAnswer(reader === prose ? ["lamplighter"] : ["jonah"]), reader.getUnit(id).text);
    return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 100, completionTokens: 40, costUsd }, elapsedMs: 250 };
  } });
  return model;
}
const billing = normalizeImageBilling("google/gemini-3.1-flash-lite-image", { prompt: "0.0000001", completion: "0.0000004", image_output: "0.00001", image: "0.001" }, 1);
const cases = loadEvalCases({ schemaVersion: 1, defaults: { translation: "web" }, cases: [
  { id: "alpha-one", reference: "Alpha 1:1", genre: "narrative", expected: "Jonah at dawn.", work: WORK, unitId: "alpha-1-1" },
  { id: "alpha-two", reference: "Alpha 1:2", genre: "poetry", expected: "Still by the lake.", work: WORK, unitId: "alpha-1-2", styles: ["classical"] },
  { id: "lamp-second", reference: "The Lamp ¶2", genre: "narrative", expected: "The lamplighter in the second paragraph.", work: PROSE, unitId: "lamp-2" },
] });

function setup(options: { imageCost?: number | null; failStore?: boolean; failImageFor?: string[]; trial?: GenericEvalProvider["styleTrials"]; preparationCost?: number | null; references?: boolean } = {}) {
  const memory = createMemoryPreparationStore(records);
  const proseMemory = createMemoryPreparationStore(proseRecords);
  const model = scriptedModel(options.preparationCost === undefined ? 0.0004 : options.preparationCost);
  const imageCalls: Array<{ label: string; references: number; referenceBytes: number[][]; prompt: string }> = [];
  const providers: EvalProviders = {
    image: { id: "fake", async generate(request) {
      imageCalls.push({ label: request.label, references: request.references?.length ?? 0, referenceBytes: (request.references ?? []).map((r) => [...r.bytes]), prompt: request.prompt });
      if (options.failImageFor?.includes(request.label)) throw new Error("provider 500");
      return { bytes: new Uint8Array([9]), mimeType: "image/png", costUsd: options.imageCost === undefined ? 0.03 : options.imageCost, elapsedMs: 1500, providerRequestId: `gen-${imageCalls.length}` };
    } },
    generic: {
      context: async (workId) => workId === PROSE
        ? { inputs: inputsFor(prose, PROSE), store: proseMemory.store, listMoments: proseMemory.listMoments, getReference: async () => null, loadReference: async () => { throw new Error("none"); } }
        : { inputs: inputsFor(work, WORK), store: memory.store, listMoments: memory.listMoments,
          getReference: async (kind, recordId) => options.references ? { storageId: `${kind}:${recordId}`, inputs: [], fingerprint: `ref-${recordId}`, pinned: true } : null,
          loadReference: async (id) => new Uint8Array(id.startsWith("styleReference:") ? [1, 2] : [3, 4]) },
      model, billing: () => billing, styleTrials: options.trial,
    },
    sink: { save: async (key) => { if (options.failStore) throw new Error("disk full"); return `outputs/${key}.png`; } },
  };
  return { providers, imageCalls, model, memory, proseMemory };
}
const run = (providers: EvalProviders, extra: Partial<Parameters<typeof runImageEval>[0]> = {}) => {
  const state: EvalRunState = extra.state ?? emptyEvalState("gen", "google/gemini-3.1-flash-lite-image", 1_000);
  return runImageEval({ cases, arms: ["generic:classical", "generic:watercolor"], repeats: 1, budgetUsd: 1, estimateUsd: { image: 0.035, preparation: 0.0005 }, providers, saveState: async () => {}, now: () => 5_000, ...extra, state });
};

describe("generic evaluation arms", () => {
  it("commits a representative case set with fixed settings", () => {
    const committed = loadEvalCases(JSON.parse(readFileSync(path.join(process.cwd(), "evals/images/cases.json"), "utf8")));
    const coverage = describeCoverage(committed);
    expect(coverage.representative).toBe(true);
    expect(coverage.total).toBeGreaterThanOrEqual(24);
    expect(coverage.missing).toEqual([]);
    expect(committed.every((c) => c.resolvedSettings.model === "google/gemini-3.1-flash-lite-image" && c.resolvedSettings.translation === "web")).toBe(true);
    expect(committed.filter((c) => c.tags?.includes("continuity")).map((c) => c.id)).toEqual(expect.arrayContaining(["matthew-14-29-peter-water", "john-21-7-peter-sea", "exodus-14-21-sea-parts", "exodus-14-22-sea-walls", "genesis-1-3-light"]));
    expect(() => loadEvalCases({ schemaVersion: 1, cases: [{ id: "a", reference: "Genesis 1:1", genre: "narrative", expected: "x" }, { id: "a", reference: "Genesis 1:2", genre: "narrative", expected: "y" }] })).toThrow(/Duplicate/);
  });

  it("stops at the hard budget, leaves the rest not run and incomplete, and resumes without repeating a completed sample", async () => {
    const two = cases.slice(0, 2);
    const arms: ["generic:classical"] = ["generic:classical"];
    const arm = arms[0];
    const { providers, imageCalls } = setup();
    const dry = await run(providers, { cases: two, arms, repeats: 3, budgetUsd: 0.07, dryRun: true });
    expect(dry.manifest.withinBudget).toBe(false);
    expect(imageCalls).toHaveLength(0);
    const first = await run(providers, { cases: two, arms, repeats: 3, budgetUsd: 0.07 });
    // Two samples fit; the third's estimate (an image and three preparation calls) would pass $0.07.
    expect(imageCalls).toHaveLength(2);
    expect(first.state.stopped?.reason).toBe("budget_exhausted");
    const report = buildReport(first.state, two, { arms, repeats: 3 });
    expect(report.arms[arm]).toMatchObject({ completed: 2, notRun: 4 });
    expect(report.cases.map((c) => c.comparison)).toEqual(["incomplete", "incomplete"]);
    expect(renderContactSheet(report)).toContain("stopped: budget_exhausted");
    // Resume with a larger budget: the two completed samples are not repeated.
    const second = await run(providers, { cases: two, arms, repeats: 3, state: first.state });
    expect(imageCalls).toHaveLength(6);
    expect(second.state.stopped).toBeUndefined();
    expect(buildReport(second.state, two, { arms, repeats: 3 }).comparisons).toEqual({ ready: 2, inconclusive: 0, incomplete: 0 });
    // Fewer than the floor is inconclusive even when every repeat ran.
    expect(buildReport(second.state, two, { arms, repeats: 3, sampleFloor: 4 }).cases[0]).toMatchObject({ comparison: "inconclusive", reason: expect.stringContaining("fewer than 4") });
    // A failed image leaves its case inconclusive; a rerun retries it, and the failed attempt cost nothing.
    const under = await run(setup({ failImageFor: [`alpha-one/${arm}/2`] }).providers, { cases: two, arms, repeats: 3 });
    expect(buildReport(under.state, two, { arms, repeats: 3 }).cases[0]).toMatchObject({ comparison: "inconclusive" });
    const retried = await run(setup().providers, { cases: two, arms, repeats: 3, state: under.state });
    expect(retried.state.samples[`alpha-one/${arm}/2`].status).toBe("completed");
    expect(retried.state.samples[`alpha-one/${arm}/2`].priorCostUsd).toBeUndefined();
    // An image that could not be stored was paid for: its cost stays on the ledger when the rerun completes.
    const storeLost = await run(setup({ failStore: true }).providers, { cases: [two[0]], arms });
    const recovered = await run(setup().providers, { cases: [two[0]], arms, state: storeLost.state });
    expect(recovered.state.samples[`alpha-one/${arm}/1`]).toMatchObject({ status: "completed", priorCostUsd: 0.03 });
    const recoveredArm = buildReport(recovered.state, [two[0]], { arms, repeats: 1, sampleFloor: 1 }).arms[arm];
    expect(recoveredArm.spendUsd.total + recoveredArm.preparation!.spendUsd).toBeCloseTo(recovered.state.spentUsd, 6);
  });

  it("uses the HTTP status rather than error text to tell funding from ordinary provider failures", async () => {
    const { providers } = setup();
    providers.image = createOpenRouterEvalImageProvider({ apiKey: "fake", fetch: async () => Response.json({ error: { message: "Upstream 402 mentioned in diagnostic text" } }, { status: 500 }) });
    // An ordinary image failure lets later samples run.
    const { state } = await run(providers, { cases: cases.slice(0, 2), arms: ["generic:classical"] });
    expect(state.stopped).toBeUndefined();
    expect(Object.values(state.samples)).toHaveLength(2);
    expect(Object.values(state.samples).every((s) => s.status === "failed" && s.stage === "image")).toBe(true);
  });

  it("renders through the engine assembly, tells prepared from cold, keeps preparation spend apart and compares quote to usage", async () => {
    const { providers, imageCalls, model } = setup();
    const { state, manifest } = await run(providers);
    // alpha-two allows only Classical; the prose case runs in both styles.
    expect(manifest.entries.map((e) => e.key)).toEqual(["alpha-one/generic:classical/1", "alpha-one/generic:watercolor/1", "alpha-two/generic:classical/1", "lamp-second/generic:classical/1", "lamp-second/generic:watercolor/1"]);
    expect(imageCalls).toHaveLength(5);
    const cold = state.samples["alpha-one/generic:classical/1"];
    expect(cold).toMatchObject({ status: "completed", engine: "generic", prepared: false, preparationCalls: 2, preparationCostUsd: expect.closeTo(0.0004 + REVIEW_USAGE.costUsd, 9), momentId: "alpha-1-1", referencesSent: 0, imageCostUsd: 0.03, usageMissing: false });
    expect(cold.prompt).toContain("Jonah: a weathered sailor");
    expect(cold.packet).toMatchObject({ styleId: "classical", briefVersion: "bv", canon: [{ entryId: "jonah", stageId: "old" }] });
    expect(cold.quote?.credits).toBeGreaterThan(0);
    expect(cold.varianceUsd).toBeCloseTo(0.03 - cold.quote!.providerUsd, 6);
    // The second style of the same moment reuses the look and plan: no preparation call, no preparation spend.
    const warm = state.samples["alpha-one/generic:watercolor/1"];
    expect(warm).toMatchObject({ prepared: true, preparationCalls: 0, preparationCostUsd: 0 });
    expect(warm.packet?.styleId).toBe("watercolor");
    expect(model.calls.filter((c) => c.schemaName === "scene_plan")).toHaveLength(3); // alpha-1-1, alpha-1-2, lamp-1
    // The prose moment holding the unit was found from the moment list.
    expect(state.samples["lamp-second/generic:classical/1"]).toMatchObject({ momentId: "lamp-1", status: "completed" });
    expect(state.samples["lamp-second/generic:classical/1"].prompt).toContain("Paragraph 1 of the lamp story. Paragraph 2");
    // Preparation: alpha-1-1 look + plan, alpha-1-2 plan only (the section look exists), lamp-1 look + plan; each plan is reviewed.
    expect(state.samples["alpha-two/generic:classical/1"]).toMatchObject({ prepared: false, preparationCalls: 2 });
    expect(state.spentUsd).toBeCloseTo(5 * 0.03 + 3 * 0.0004 + 3 * REVIEW_USAGE.costUsd, 6); // two looks, three plans, three reviews
    const report = buildReport(state, cases, { arms: ["generic:classical", "generic:watercolor"], repeats: 1, sampleFloor: 1 });
    expect(report.arms["generic:classical"].preparation).toMatchObject({ prepared: 0, cold: 3, calls: 6, spendUsd: expect.closeTo(0.0012 + 3 * REVIEW_USAGE.costUsd, 6), usageMissing: 0 }); // five look/plan calls and three reviews
    expect(report.arms["generic:watercolor"].preparation).toMatchObject({ prepared: 2, cold: 0, calls: 0 });
    expect(report.arms["generic:classical"].quoteVariance).toMatchObject({ samples: 3, unpriced: 0, withinLiteTarget: true });
    expect(report.styleMatrix).toEqual({ classical: { cases: 3, completed: 3, failed: 0, notRun: 0, complete: true }, watercolor: { cases: 2, completed: 2, failed: 0, notRun: 0, complete: true } });
    expect(report.cases.find((c) => c.id === "alpha-two")!.arms["generic:watercolor"]).toBeUndefined();
    expect(report.comparisons).toEqual({ ready: 3, inconclusive: 0, incomplete: 0 });
    const sheet = renderContactSheet(report);
    expect(sheet).toContain("cold");
    expect(sheet).toContain("within the five-credit target");
    const scores = buildScoreTemplate(report);
    expect(scores.rows.find((r) => r.arm === "generic:classical")).toMatchObject({ identity: null, continuity: null, style: null });
    expect(scores.rows.filter((r) => r.caseId === "alpha-two")).toHaveLength(1);
  });

  it("prices generic samples with preparation in the manifest, charges missing usage at the quote, and records assembly failures as partial results", async () => {
    const dry = await run(setup().providers, { dryRun: true });
    expect(dry.manifest.estimatedUsd).toBeCloseTo(5 * (0.035 + COLD_PREPARATION_CALLS * 0.0005), 6);
    const missing = setup({ imageCost: null, preparationCost: null });
    const { state } = await run(missing.providers, { arms: ["generic:classical"] });
    const s = state.samples["alpha-one/generic:classical/1"];
    expect(s).toMatchObject({ usageMissing: true, preparationUsageMissing: true, preparationCostUsd: expect.closeTo(0.0005 + REVIEW_USAGE.costUsd, 9) }); // two missing at the estimate; the scripted review reports usage
    expect(s.imageCostUsd).toBeCloseTo(s.quote!.providerUsd, 9);
    expect(s.varianceUsd).toBeUndefined();
    // A style the brief does not offer fails at assembly; other samples still run.
    const icon = await run(setup().providers, { arms: ["generic:icon", "generic:classical"] });
    expect(icon.state.samples["alpha-one/generic:icon/1"]).toMatchObject({ status: "failed", stage: "assemble", error: expect.stringContaining("style:") });
    expect(icon.state.samples["alpha-one/generic:icon/1"].prepared).toBeUndefined(); // never assembled, so neither prepared nor cold
    expect(icon.state.samples["alpha-one/generic:classical/1"].status).toBe("completed");
    const report = buildReport(icon.state, cases, { arms: ["generic:icon", "generic:classical"], repeats: 1, sampleFloor: 1 });
    // alpha-two restricts itself to Classical, so Icon has two eligible cases.
    expect(report.styleMatrix.icon).toMatchObject({ cases: 2, completed: 0, failed: 2, complete: false });
    expect(report.arms["generic:icon"].failuresByStage).toEqual({ assemble: 2 });
    // A lost store keeps the image on the ledger.
    const lost = await run(setup({ failStore: true }).providers, { arms: ["generic:classical"] });
    expect(lost.state.samples["alpha-one/generic:classical/1"]).toMatchObject({ status: "failed", stage: "store", imageCostUsd: 0.03, preparationCostUsd: expect.closeTo(0.0004 + REVIEW_USAGE.costUsd, 9) });
    // A retry keeps the failed attempt's preparation spend in the breakdown, so it still matches the ledger.
    const retried = await run(setup().providers, { arms: ["generic:classical"], state: lost.state });
    expect(retried.state.samples["alpha-one/generic:classical/1"]).toMatchObject({ status: "completed", priorPreparationCostUsd: expect.closeTo(0.0004 + REVIEW_USAGE.costUsd, 9), priorCostUsd: 0.03 });
    const retriedReport = buildReport(retried.state, cases, { arms: ["generic:classical"], repeats: 1, sampleFloor: 1 });
    expect(retriedReport.arms["generic:classical"].preparation!.spendUsd + retriedReport.arms["generic:classical"].spendUsd.total).toBeCloseTo(retried.state.spentUsd, 6);
  });

  it("uses an owner style trial instead of the library style of that id", async () => {
    const trial = { watercolor: { style: { ...SHARED_STYLES.get("watercolor"), rendering: "Loose gouache on rough paper, trial rendering." }, version: "trial-1" } };
    const { providers, imageCalls } = setup({ trial });
    await run(providers, { arms: ["generic:watercolor"] });
    expect(imageCalls[0].prompt).toContain("trial rendering");
    expect(imageCalls.every((c) => c.prompt.includes("trial rendering"))).toBe(true);
  });

  it("omits only the style reference in a labelled trial, keeping cached preparation, canon, sheets and registered style", async () => {
    const { providers, imageCalls, model } = setup({ references: true });
    const scope = { cases: [cases[0]], arms: ["generic:watercolor"] as const };
    const baseline = await run(providers, scope);
    const trial = await run(providers, { ...scope, omitStyleReference: true, state: emptyEvalState("no-style-reference", "google/gemini-3.1-flash-lite-image") });
    expect(model.calls).toHaveLength(1); // One shared look and plan, unchanged for the trial.
    expect(imageCalls.map((c) => c.referenceBytes)).toEqual([[[1, 2], [3, 4]], [[3, 4]]]);
    const normal = baseline.state.samples["alpha-one/generic:watercolor/1"];
    const omitted = trial.state.samples["alpha-one/generic:watercolor/1"];
    expect(normal.packet?.references.map((r) => r.id)).toEqual(["watercolor", "jonah:old"]);
    expect(omitted.packet?.references).toEqual([{ ...normal.packet!.references[1], caption: normal.packet!.references[1].caption.replace("Image 2:", "Image 1:") }]);
    const withoutCaptions = (prompt: string) => prompt.replace(/\n\nREFERENCE IMAGES[\s\S]*?(?=\n\n)/, "");
    expect(withoutCaptions(omitted.prompt!)).toBe(withoutCaptions(normal.prompt!));
    expect(omitted.packet).toMatchObject({ styleVersion: normal.packet!.styleVersion, briefVersion: normal.packet!.briefVersion, planVersion: normal.packet!.planVersion, canon: normal.packet!.canon, flags: { ...normal.packet!.flags, omitStyleReference: true } });
    expect(omitted).toMatchObject({ omitStyleReference: true, preparationCalls: 0, referencesSent: 1, quote: { referenceImages: 1 } });
    expect(omitted.quote!.providerUsd).toBeLessThan(normal.quote!.providerUsd);
    expect(trial.manifest.omitStyleReference).toBe(true);
    const report = buildReport(trial.state, scope.cases, { arms: scope.arms, repeats: 1 });
    expect(report.reproducibility.omitStyleReference).toBe(true);
    expect(renderContactSheet(report)).toContain("style reference omitted by evaluation control");
    expect(renderComparisonSheet(buildReport(baseline.state, scope.cases, { arms: scope.arms, repeats: 1 }), report)).toContain("style reference omitted by evaluation control");
    await run(providers, { ...scope, omitStyleReference: true, state: trial.state });
    expect(imageCalls).toHaveLength(2); // A same-mode resume replays completed samples without calls.
    expect(model.calls).toHaveLength(1);
  });

  it("locks the control for dry runs and failed or completed samples, including historical normal-reference states", async () => {
    const { providers, imageCalls, model } = setup();
    const dry = await run(providers, { dryRun: true, omitStyleReference: true });
    expect(dry.manifest.omitStyleReference).toBe(true);
    expect(imageCalls).toHaveLength(0);
    expect(model.calls).toHaveLength(0);
    const snapshot = structuredClone(dry.state);
    await expect(run(providers, { dryRun: true, state: dry.state })).rejects.toThrow("use a new --run");
    expect(dry.state).toEqual(snapshot);
    await run(providers, { dryRun: true, omitStyleReference: true, state: dry.state });
    const normal = await run(providers, { cases: [cases[0]], arms: ["generic:classical"] });
    delete normal.state.omitStyleReference; // Historical records predate the flag.
    const calls = imageCalls.length;
    await expect(run(providers, { state: normal.state, omitStyleReference: true })).rejects.toThrow("use a new --run");
    expect(imageCalls).toHaveLength(calls);
    const failed = await run(setup({ failStore: true }).providers, { cases: [cases[0]], arms: ["generic:watercolor"] });
    expect(Object.values(failed.state.samples)[0].status).toBe("failed");
    await expect(run(providers, { state: failed.state, omitStyleReference: true })).rejects.toThrow("use a new --run");
  });

  it("preserves paid preparation on a funding stop and resumes unfinished samples without preparing later moments early", async () => {
    const { providers, model } = setup();
    let requests = 0;
    providers.image = createOpenRouterEvalImageProvider({ apiKey: "fake", fetch: async () => {
      requests++;
      return requests === 3
        ? Response.json({ error: { message: "Insufficient credits" } }, { status: 402 })
        : Response.json({ id: `gen-${requests}`, choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,AQID" } }] } }], usage: { cost: 0.03 } });
    } });
    const saved: EvalRunState[] = [];
    const first = await run(providers, { saveState: async (state) => { saved.push(structuredClone(state)); } });
    expect(requests).toBe(3);
    expect(model.calls).toHaveLength(2); // alpha-one look + plan, alpha-two plan; no prose preparation yet
    expect(first.state.stopped?.reason).toBe("provider_funding");
    expect(first.state.samples["alpha-two/generic:classical/1"]).toMatchObject({ status: "failed", stage: "image", preparationCalls: 2, preparationCostUsd: expect.closeTo(0.0004 + REVIEW_USAGE.costUsd, 9), imageCostUsd: 0 });
    expect(first.state.spentUsd).toBeCloseTo(0.0608 + 2 * REVIEW_USAGE.costUsd, 6); // plus the two plan reviews
    expect(saved).toHaveLength(3);
    expect(saved[2]).toEqual(first.state);
    const options = { arms: ["generic:classical", "generic:watercolor"] as const, repeats: 1, sampleFloor: 1 };
    const report = buildReport(first.state, cases, options);
    expect(report.arms["generic:classical"]).toMatchObject({ completed: 1, failed: 1, notRun: 1 });
    expect(report.arms["generic:watercolor"]).toMatchObject({ completed: 1, notRun: 1 });
    expect(report.cases.find((c) => c.id === "lamp-second")?.comparison).toBe("incomplete");
    const resumed = await run(providers, { state: first.state });
    expect(requests).toBe(6); // five completed images and one rejected attempt
    expect(model.calls).toHaveLength(3); // the failed image reuses its prepared plan
    expect(resumed.state.stopped).toBeUndefined();
    expect(resumed.state.samples["alpha-one/generic:classical/1"].providerRequestId).toBe("gen-1");
    expect(resumed.state.samples["alpha-two/generic:classical/1"]).toMatchObject({ status: "completed", preparationCalls: 0, priorPreparationCostUsd: expect.closeTo(0.0004 + REVIEW_USAGE.costUsd, 9) });
    expect(resumed.state.spentUsd).toBeCloseTo(0.1512 + 3 * REVIEW_USAGE.costUsd, 6); // three plan reviews across both runs
    const recovered = buildReport(resumed.state, cases, options);
    expect(recovered.comparisons).toEqual({ ready: 3, inconclusive: 0, incomplete: 0 });
    expect(Object.values(recovered.arms).reduce((sum, arm) => sum + arm.spendUsd.total + (arm.preparation?.spendUsd ?? 0), 0)).toBeCloseTo(resumed.state.spentUsd, 6);
  });

  it("compares a baseline and a candidate run, flagging candidate fails and worsening and retaining the baseline otherwise", async () => {
    const base = await run(setup().providers, { arms: ["generic:classical"] });
    const cand = await run(setup({ imageCost: 0.05 }).providers, { arms: ["generic:classical"], state: emptyEvalState("cand", "google/gemini-3.1-flash-lite-image", 2_000) });
    const options = { arms: ["generic:classical" as const], repeats: 1, sampleFloor: 1 };
    const baseline = buildReport(base.state, cases, options);
    const candidate = buildReport(cand.state, cases, options);
    const scoreFile = (verdicts: Record<string, string>) => ({ rows: Object.entries(verdicts).map(([caseId, verdict]) => ({ caseId, arm: "generic:classical", verdict })) });
    const html = renderComparisonSheet(baseline, candidate, { baseline: scoreFile({ "alpha-one": "pass", "alpha-two": "pass", "lamp-second": "accepted limitation" }), candidate: scoreFile({ "alpha-one": "accepted limitation", "alpha-two": "pass", "lamp-second": "fail" }) });
    expect(html).toContain("2 cell(s) need review");
    expect(html).toContain("outputs/alpha-one/generic-classical-1.png");
    // Each side resolves its own run's files, so the candidate column never shows baseline images.
    const resolved = renderComparisonSheet(baseline, candidate, {}, { baseline: (ref) => `../runs/base/${ref}`, candidate: (ref) => `../runs/cand/${ref}` });
    expect(resolved).toContain("../runs/base/outputs/alpha-one/generic-classical-1.png");
    expect(resolved).toContain("../runs/cand/outputs/alpha-one/generic-classical-1.png");
    // An incomplete candidate case retains the baseline.
    const partial = buildReport({ ...cand.state, samples: Object.fromEntries(Object.entries(cand.state.samples).filter(([k]) => !k.startsWith("alpha-two"))) }, cases, options);
    expect(renderComparisonSheet(baseline, partial)).toContain("retains baseline");
  });
});
