/**
 * Generic-engine evaluation arms (#181) with fake providers over an in-memory analysis: the same
 * assembly as the request engine, prepared against cold samples, preparation spend apart from
 * image spend, the quote against reported usage, retained packets and references, the style
 * matrix, prose moments found from a unit, owner style trials, assembly failures as partial
 * results, the dry-run manifest, and the baseline-versus-candidate sheet.
 */
import { describe, it, expect } from "vitest";
import { createWorkReader } from "../work-input";
import { SHARED_STYLES, type WorkBrief } from "../work-preparation";
import { normalizeImageBilling } from "../image-catalog";
import { createMemoryPreparationStore } from "../engine/memory-store";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { loadEvalCases } from "../image-evals/cases";
import { emptyEvalState, runImageEval, type EvalProviders, type EvalRunState } from "../image-evals/runner";
import { buildReport, buildScoreTemplate, renderComparisonSheet, renderContactSheet } from "../image-evals/report";
import type { GenericEvalProvider } from "../image-evals/generic";
import type { WorkInputs } from "../engine/work-inputs";

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
const inputsFor = (reader: typeof work, workId: string): WorkInputs => ({ work: reader, workVersion: "wv", brief: brief(workId), briefVersion: "bv", styles: Object.fromEntries(brief(workId).styleIds.map((id) => [id, { style: SHARED_STYLES.get(id), version: `sv-${id}` }])) });
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
const planAnswer = (present: string[]) => ({ present, primarySubject: "Jonah by the boats", action: "mends nets", setting: "shore", secondaryElements: "boats", mood: "quiet", timeOfDay: "dawn", composition: "wide" });
function scriptedModel(costUsd: number | null = 0.0004) {
  const calls: TextModelRequest[] = [];
  const model: TextModel & { calls: TextModelRequest[] } = { id: "scripted", calls, async complete(request) {
    calls.push(request);
    const value = request.schemaName === "section_look" ? lookAnswer : planAnswer(request.user.includes("lamplighter") ? ["lamplighter"] : ["jonah"]);
    return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 100, completionTokens: 40, costUsd }, elapsedMs: 250 };
  } };
  return model;
}
const billing = normalizeImageBilling("google/gemini-3.1-flash-lite-image", { prompt: "0.0000001", completion: "0.0000004", image_output: "0.00001", image: "0.001" }, 1);
const cases = loadEvalCases({ schemaVersion: 1, defaults: { translation: "web" }, cases: [
  { id: "alpha-one", reference: "Alpha 1:1", genre: "narrative", expected: "Jonah at dawn.", work: WORK, unitId: "alpha-1-1" },
  { id: "alpha-two", reference: "Alpha 1:2", genre: "poetry", expected: "Still by the lake.", work: WORK, unitId: "alpha-1-2", styles: ["classical"] },
  { id: "lamp-second", reference: "The Lamp ¶2", genre: "narrative", expected: "The lamplighter in the second paragraph.", work: PROSE, unitId: "lamp-2" },
] });

function setup(options: { imageCost?: number | null; failStore?: boolean; trial?: GenericEvalProvider["styleTrials"]; preparationCost?: number | null } = {}) {
  const memory = createMemoryPreparationStore(records);
  const proseMemory = createMemoryPreparationStore(proseRecords);
  const model = scriptedModel(options.preparationCost === undefined ? 0.0004 : options.preparationCost);
  const imageCalls: Array<{ label: string; references: number; prompt: string }> = [];
  const providers: EvalProviders = {
    resolvePassage: async () => null,
    image: { id: "fake", async generate(request) {
      imageCalls.push({ label: request.label, references: request.references?.length ?? 0, prompt: request.prompt });
      return { bytes: new Uint8Array([9]), mimeType: "image/png", costUsd: options.imageCost === undefined ? 0.03 : options.imageCost, elapsedMs: 1500, providerRequestId: `gen-${imageCalls.length}` };
    } },
    planner: null,
    generic: {
      context: async (workId) => workId === PROSE
        ? { inputs: inputsFor(prose, PROSE), store: proseMemory.store, listMoments: proseMemory.listMoments, getReference: async () => null, loadReference: async () => { throw new Error("none"); } }
        : { inputs: inputsFor(work, WORK), store: memory.store, listMoments: memory.listMoments, getReference: async () => null, loadReference: async () => { throw new Error("none"); } },
      model, billing: () => billing, styleTrials: options.trial,
    },
    sink: { save: async (key) => { if (options.failStore) throw new Error("disk full"); return `outputs/${key}.png`; } },
  };
  return { providers, imageCalls, model, memory, proseMemory };
}
const run = (providers: EvalProviders, extra: Partial<Parameters<typeof runImageEval>[0]> = {}) => {
  const state: EvalRunState = extra.state ?? emptyEvalState("gen", "google/gemini-3.1-flash-lite-image", null, 1_000);
  return runImageEval({ cases, arms: ["generic:classical", "generic:watercolor"], repeats: 1, budgetUsd: 1, estimateUsd: { image: 0.035, planner: 0, preparation: 0.0005 }, providers, saveState: async () => {}, now: () => 5_000, ...extra, state });
};

describe("generic evaluation arms", () => {
  it("renders through the engine assembly, tells prepared from cold, keeps preparation spend apart and compares quote to usage", async () => {
    const { providers, imageCalls, model } = setup();
    const { state, manifest } = await run(providers);
    // alpha-two allows only Classical; the prose case runs in both styles.
    expect(manifest.entries.map((e) => e.key)).toEqual(["alpha-one/generic:classical/1", "alpha-one/generic:watercolor/1", "alpha-two/generic:classical/1", "lamp-second/generic:classical/1", "lamp-second/generic:watercolor/1"]);
    expect(imageCalls).toHaveLength(5);
    const cold = state.samples["alpha-one/generic:classical/1"];
    expect(cold).toMatchObject({ status: "completed", engine: "generic", prepared: false, preparationCalls: 2, preparationCostUsd: 0.0008, momentId: "alpha-1-1", referencesSent: 0, imageCostUsd: 0.03, usageMissing: false });
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
    // Preparation: alpha-1-1 look + plan, alpha-1-2 plan only (the section look exists), lamp-1 look + plan.
    expect(state.samples["alpha-two/generic:classical/1"]).toMatchObject({ prepared: false, preparationCalls: 1 });
    expect(state.spentUsd).toBeCloseTo(5 * 0.03 + 5 * 0.0004, 6);
    const report = buildReport(state, cases, { arms: ["generic:classical", "generic:watercolor"], repeats: 1, sampleFloor: 1 });
    expect(report.arms["generic:classical"].preparation).toMatchObject({ prepared: 0, cold: 3, calls: 5, spendUsd: expect.closeTo(0.002, 6), usageMissing: 0 });
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
    expect(dry.manifest.estimatedUsd).toBeCloseTo(5 * (0.035 + 2 * 0.0005), 6);
    const missing = setup({ imageCost: null, preparationCost: null });
    const { state } = await run(missing.providers, { arms: ["generic:classical"] });
    const s = state.samples["alpha-one/generic:classical/1"];
    expect(s).toMatchObject({ usageMissing: true, preparationUsageMissing: true, preparationCostUsd: 0.001 });
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
    expect(lost.state.samples["alpha-one/generic:classical/1"]).toMatchObject({ status: "failed", stage: "store", imageCostUsd: 0.03, preparationCostUsd: 0.0008 });
    // A retry keeps the failed attempt's preparation spend in the breakdown, so it still matches the ledger.
    const retried = await run(setup().providers, { arms: ["generic:classical"], state: lost.state });
    expect(retried.state.samples["alpha-one/generic:classical/1"]).toMatchObject({ status: "completed", priorPreparationCostUsd: 0.0008, priorCostUsd: 0.03 });
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

  it("compares a baseline and a candidate run, flagging candidate fails and worsening and retaining the baseline otherwise", async () => {
    const base = await run(setup().providers, { arms: ["generic:classical"] });
    const cand = await run(setup({ imageCost: 0.05 }).providers, { arms: ["generic:classical"], state: emptyEvalState("cand", "google/gemini-3.1-flash-lite-image", null, 2_000) });
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
