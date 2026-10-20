/**
 * Reference sheets and style references (#172) with fake image and checker adapters over the
 * real Convex analysis module: who gets a sheet, stage and era selection, hard-fault retries,
 * canon notes, exhaustion, staleness, pinning, readable stored versions, budget and resume.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { sheetSubjects, mainEra, sheetPrompt, createReferenceBlobCache, type ImageMaker, type VisionChecker, type ActiveEntry, type ActiveSection } from "../engine/references";
import { runReferences, planReferences, emptyReferenceState, ReferenceBudgetError, type ReferenceStore } from "../engine/references-run";
import { SHARED_STYLES, type WorkBrief } from "../work-preparation";

const SECRET = "s".repeat(40);
process.env.CONVEX_SERVER_SECRET = SECRET;
const WORK = "two-books";
const brief: WorkBrief = {
  schemaVersion: 1, workId: WORK, tone: "Quiet.", depictionRules: [{ text: "The voice is never given a body." }],
  eras: [
    { id: "early", label: "Early kingdom", people: "Fisherfolk.", dress: "Rough wool.", buildingsAndObjects: "Reed boats.", technology: "Oar." },
    { id: "late", label: "Late kingdom", people: "Courtiers.", dress: "Dyed linen.", buildingsAndObjects: "Stone palace, sailed ships.", technology: "Sail." },
  ],
  styleIds: ["classical", "watercolor", "icon"],
};
const entryRecords = [
  { recordId: "jonah", payload: { kind: "entry" as const, name: "Jonah", entryKind: "character" as const, hasForm: true, stages: [{ id: "young", text: "Jonah: young fisherman." }, { id: "old", text: "Jonah: weathered sailor." }] } },
  { recordId: "amos", payload: { kind: "entry" as const, name: "Amos", entryKind: "character" as const, hasForm: true, stages: [{ id: "main", text: "Amos: hill farmer." }] } },
  { recordId: "the_voice", payload: { kind: "entry" as const, name: "the voice", entryKind: "character" as const, hasForm: false, stages: [{ id: "main", text: "The voice: light only." }] } },
  { recordId: "the_lake", payload: { kind: "entry" as const, name: "the lake", entryKind: "location" as const, hasForm: true, stages: [{ id: "main", text: "The lake: wide and grey." }] } },
];
const sectionRecords = [
  { recordId: "s1", payload: { kind: "section" as const, title: "One", firstUnit: "s1", lastUnit: "s1", era: "early", cast: [{ entryId: "jonah", stageId: "young" }, { entryId: "amos", stageId: "main" }, { entryId: "the_voice", stageId: "main" }, { entryId: "the_lake", stageId: "main" }] } },
  { recordId: "s2", payload: { kind: "section" as const, title: "Two", firstUnit: "s2", lastUnit: "s2", era: "late", cast: [{ entryId: "jonah", stageId: "old" }, { entryId: "the_voice", stageId: "main" }, { entryId: "the_lake", stageId: "main" }] } },
  { recordId: "s3", payload: { kind: "section" as const, title: "Three", firstUnit: "s3", lastUnit: "s3", era: "late", cast: [{ entryId: "jonah", stageId: "old" }] } },
];
const records = [
  ...entryRecords.map((r) => ({ kind: "entry" as const, ...r })),
  ...sectionRecords.map((r) => ({ kind: "section" as const, ...r })),
  { kind: "moment" as const, recordId: "s1", payload: { kind: "moment" as const, sectionId: "s1", firstUnit: "s1", lastUnit: "s1" } },
];
const activeEntries: ActiveEntry[] = entryRecords.map((r) => ({ recordId: r.recordId, version: "v", name: r.payload.name, entryKind: r.payload.entryKind, hasForm: r.payload.hasForm, stages: r.payload.stages }));
const activeSections: ActiveSection[] = sectionRecords.map((r) => ({ recordId: r.recordId, era: r.payload.era, cast: r.payload.cast }));
const pass = { views_ok: true, same_subject: true, extra_figures: false, text_present: false, frame_present: false, canon_notes: [] as string[], verdict: "pass" as const, reasons: [] as string[] };
const stylePass = { people_present: false, frame_present: false, text_present: false, full_bleed: true, verdict: "pass" as const, reasons: [] as string[] };

function fakeMaker(cost = 0.034) {
  const prompts: string[] = [];
  const maker: ImageMaker & { prompts: string[] } = { id: "fake-lite", prompts, async generate(request) { prompts.push(request.prompt); return { bytes: new TextEncoder().encode(`jpeg:${request.label}`), mimeType: "image/jpeg", costUsd: cost, elapsedMs: 3 }; } };
  return maker;
}
function fakeChecker(verdicts: (key: string, n: number) => unknown) {
  const counts = new Map<string, number>();
  const checker: VisionChecker = { id: "fake-haiku", async check(request) {
    const key = request.label.replace(/^check:/, "").replace(/:\d+$/, "");
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return { value: request.schema.parse(verdicts(key, n)), costUsd: 0.0004, elapsedMs: 1 };
  } };
  return checker;
}

describe("reference images", () => {
  let t: ReturnType<typeof convexTest>;
  let store: ReferenceStore;
  let blobs: { store: (bytes: Uint8Array, mimeType: string) => Promise<{ storageId: string }> };
  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    store = {
      listActiveRecords: (kind) => t.query(api.analysis.listActiveRecords, { workId: WORK, kind }) as never,
      getReference: async (kind, recordId, expectedInputs) => { const r = await t.query(api.analysis.getReference, { workId: WORK, kind, recordId, expectedInputs }); return r ? { storageId: r.storageId, stale: r.stale, pinned: r.pinned } : null; },
      putReference: async (args) => { await t.mutation(api.analysis.putReference, { serverSecret: SECRET, workId: WORK, ...args, storageId: args.storageId as never }); },
      noteAttention: async (item) => { await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: WORK, ...item }); },
    };
    blobs = { store: async (bytes, mimeType) => ({ storageId: await t.run(async (ctx) => ctx.storage.store(new Blob([bytes as unknown as BlobPart], { type: mimeType }))) }) };
  });
  const styleVersions = { classical: "c1", watercolor: "w1", icon: "i1" };

  it("chooses sheets for recurring entries by stage with their sections' eras and skips no-form entries", () => {
    const subjects = sheetSubjects(activeEntries, activeSections, brief);
    expect(subjects.map((s) => [s.entryId, s.stageId, s.eras.map((e) => e.id)])).toEqual([
      ["jonah", "young", ["early"]], ["the_lake", "main", ["early", "late"]], ["jonah", "old", ["late"]],
    ]);
    // Amos is in one section, the voice has no form: neither gets a sheet.
    expect(subjects.some((s) => s.entryId === "amos" || s.entryId === "the_voice")).toBe(false);
    expect(mainEra(activeSections, brief).id).toBe("late");
    const prompt = sheetPrompt({ title: "Two Books" }, subjects[0], SHARED_STYLES.get("classical"));
    expect(prompt).toContain("World: Fisherfolk. Rough wool.");
    expect(prompt).toContain("Character: Jonah: young fisherman.");
    expect(prompt).toContain("No likeness of any real actor");
    expect(prompt).not.toContain("Stone palace");
  });

  it("makes, checks, retries with feedback, records notes, and surfaces exhaustion as attention", async () => {
    const maker = fakeMaker();
    const checker = fakeChecker((key, n) => {
      if (key === "sheet:jonah:young") return n === 1 ? { ...pass, text_present: true, verdict: "fail", reasons: ["letters on the sleeve"] } : { ...pass, canon_notes: ["beard greyer than canon"] };
      if (key === "sheet:the_lake:main") return { ...pass, frame_present: true, verdict: "fail", reasons: ["black divider reads as a frame"] };
      if (key.startsWith("styleref:")) return stylePass;
      return pass;
    });
    const saved: number[] = [];
    const state = await runReferences({ workId: WORK, workTitle: "Two Books", brief, store, maker, checker, blobs, state: emptyReferenceState(WORK), saveState: async (s) => { saved.push(Object.keys(s.done).length); }, budgetUsd: 5, styleVersions });
    // Jonah young: failed once on text, passed with a note. The lake: three failures. Jonah old: first try. Two style references.
    expect(state.done["sheet:jonah:young"]).toMatchObject({ ok: true, attempts: 2 });
    expect(maker.prompts[1]).toContain("A previous attempt was rejected because: letters on the sleeve");
    expect(state.done["sheet:the_lake:main"]).toMatchObject({ ok: false, attempts: 3 });
    expect(state.done["sheet:jonah:old"]).toMatchObject({ ok: true, attempts: 1 });
    expect(state.done["styleReference:watercolor"]).toMatchObject({ ok: true, attempts: 1 });
    expect(state.done["styleReference:icon"]).toMatchObject({ ok: true, attempts: 1 });
    expect(state.spentUsd).toBeCloseTo(8 * 0.034 + 8 * 0.0004, 6);
    expect(saved).toHaveLength(5);
    const attention = await t.query(api.analysis.listAttention, { workId: WORK });
    expect(attention.map((a) => [a.reason, a.recordId])).toEqual(expect.arrayContaining([["canon_note", "jonah:young"], ["sheet_failed", "the_lake:main"]]));
    expect(attention).toHaveLength(2);
    // Stored references are readable with their inputs; the failed one is absent and nothing blocks readiness.
    const young = await t.query(api.analysis.getReference, { workId: WORK, kind: "sheet", recordId: "jonah:young" });
    expect(young?.inputs.map((i) => i.kind)).toEqual(["entry", "stage", "style", "era"]);
    expect(await t.run(async (ctx) => (await ctx.storage.get(young!.storageId))?.size)).toBeGreaterThan(0);
    expect(await t.query(api.analysis.getReference, { workId: WORK, kind: "sheet", recordId: "the_lake:main" })).toBeNull();
    expect((await t.query(api.analysis.getWorkStatus, { workId: WORK })).ready).toBe(true);
    // A second run with the same state makes nothing.
    const again = await runReferences({ workId: WORK, workTitle: "Two Books", brief, store, maker, checker, blobs, state, saveState: async () => {}, budgetUsd: 5, styleVersions });
    expect(maker.prompts).toHaveLength(8);
    expect(again.spentUsd).toBe(state.spentUsd);
    // The plan shows the failed lake as failed for these inputs; with a fresh run state it would be retried.
    const plan = await planReferences({ workId: WORK, brief, store, state, styleVersions });
    expect(plan.sheets.map((s) => [s.recordId, s.status])).toEqual([["jonah:young", "fresh"], ["the_lake:main", "failed"], ["jonah:old", "fresh"]]);
    expect((await planReferences({ workId: WORK, brief, store, state: emptyReferenceState(WORK), styleVersions })).sheets[1].status).toBe("missing");
    expect(plan.styles.map((s) => [s.styleId, s.status])).toEqual([["watercolor", "fresh"], ["icon", "fresh"]]);
  });

  it("remakes only stale references, honours pins, and stops at the budget, even under the same run state", async () => {
    const maker = fakeMaker();
    const checker = fakeChecker((key) => (key.startsWith("styleref:") ? stylePass : pass));
    const state = await runReferences({ workId: WORK, workTitle: "Two Books", brief, store, maker, checker, blobs, state: emptyReferenceState(WORK), saveState: async () => {}, budgetUsd: 5, styleVersions });
    expect(maker.prompts).toHaveLength(5);
    // A changed input is remade even when the same run state says it was done (the fingerprint differs).
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "the_lake", payload: { kind: "entry", name: "the lake", entryKind: "location", hasForm: true, stages: [{ id: "main", text: "The lake: wide, grey and reed-fringed." }] } });
    expect((await planReferences({ workId: WORK, brief, store, state, styleVersions })).sheets[1].status).toBe("stale");
    await runReferences({ workId: WORK, workTitle: "Two Books", brief, store, maker, checker, blobs, state, saveState: async () => {}, budgetUsd: 5, styleVersions });
    expect(maker.prompts).toHaveLength(6);
    expect(maker.prompts[5]).toContain("reed-fringed");
    // An owner edit to Jonah changes his entry version, so both his sheets are stale; the lake is untouched.
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "jonah", payload: { kind: "entry", name: "Jonah", entryKind: "character", hasForm: true, stages: [{ id: "young", text: "Jonah: young fisherman." }, { id: "old", text: "Jonah: weathered sailor, scarred." }] } });
    const plan = await planReferences({ workId: WORK, brief, store, state: emptyReferenceState(WORK), styleVersions });
    expect(plan.sheets.map((s) => [s.recordId, s.status])).toEqual([["jonah:young", "stale"], ["the_lake:main", "fresh"], ["jonah:old", "stale"]]);
    // Pin the young sheet: only the old one is remade, with the edited text.
    await t.mutation(api.analysis.pinReference, { serverSecret: SECRET, workId: WORK, kind: "sheet", recordId: "jonah:young", pinned: true });
    await runReferences({ workId: WORK, workTitle: "Two Books", brief, store, maker, checker, blobs, state: emptyReferenceState(WORK), saveState: async () => {}, budgetUsd: 5, styleVersions });
    expect(maker.prompts).toHaveLength(7);
    expect(maker.prompts[6]).toContain("Jonah: weathered sailor, scarred.");
    // A style file change makes only that style reference stale.
    const plan2 = await planReferences({ workId: WORK, brief, store, state: emptyReferenceState(WORK), styleVersions: { ...styleVersions, icon: "i2" } });
    expect(plan2.styles.map((s) => [s.styleId, s.status])).toEqual([["watercolor", "fresh"], ["icon", "stale"]]);
    expect(plan2.sheets.map((s) => s.status)).toEqual(["pinned", "fresh", "fresh"]);
    // The budget stops before a call that would pass it.
    await expect(runReferences({ workId: WORK, workTitle: "Two Books", brief, store, maker, checker, blobs, state: emptyReferenceState(WORK), saveState: async () => {}, budgetUsd: 0.01, styleVersions: { ...styleVersions, icon: "i2" } })).rejects.toThrow(ReferenceBudgetError);
    expect(maker.prompts).toHaveLength(7);
  });

  it("counts a paid image when the checker or the blob store fails, and a missing provider cost at the estimate", async () => {
    const maker = fakeMaker();
    const noCost: ImageMaker = { id: "no-cost", async generate(request) { const r = await maker.generate(request); return { ...r, costUsd: null }; } };
    let checks = 0;
    const flaky: VisionChecker = { id: "flaky", async check(request) { checks++; if (checks === 1) throw new Error("checker down"); return { value: request.schema.parse(request.label.includes("styleref") ? stylePass : pass), costUsd: null, elapsedMs: 1 }; } };
    let stores = 0;
    const flakyBlobs = { store: async (bytes: Uint8Array, mimeType: string) => { stores++; if (stores === 1) throw new Error("storage down"); return blobs.store(bytes, mimeType); } };
    const state = await runReferences({ workId: WORK, workTitle: "Two Books", brief, store, maker: noCost, checker: flaky, blobs: flakyBlobs, state: emptyReferenceState(WORK), saveState: async () => {}, budgetUsd: 5, styleVersions });
    // First subject: attempt 1 lost to the checker, attempt 2 lost to storage, attempt 3 stored. Every attempt counted at the estimate.
    expect(state.done["sheet:jonah:young"]).toMatchObject({ ok: true, attempts: 3 });
    expect(state.spentUsd).toBeCloseTo(3 * 0.04 + 2 * 0.005 + 4 * 0.045, 6);
  });

  it("keeps the spend of paid attempts when the budget stops a subject midway", async () => {
    const maker = fakeMaker();
    const checker = fakeChecker((key, n) => (key === "sheet:jonah:young" && n === 1 ? { ...pass, text_present: true, verdict: "fail", reasons: ["text"] } : pass));
    const saved: number[] = [];
    // Enough for one attempt and its check, not for the retry.
    await expect(runReferences({ workId: WORK, workTitle: "Two Books", brief, store, maker, checker, blobs, state: emptyReferenceState(WORK), saveState: async (s) => { saved.push(s.spentUsd); }, budgetUsd: 0.05, styleVersions })).rejects.toThrow(ReferenceBudgetError);
    expect(maker.prompts).toHaveLength(1);
    expect(saved[saved.length - 1]).toBeCloseTo(0.034 + 0.0004, 6);
    expect(await t.query(api.analysis.listAttention, { workId: WORK })).toEqual([]);
  });

  it("caches reference bytes per instance within bounds", async () => {
    const loads: string[] = [];
    const cache = createReferenceBlobCache(async (id) => { loads.push(id); return new Uint8Array(100); }, { maxEntries: 2 });
    await cache.get("a"); await cache.get("b"); await cache.get("a"); await cache.get("c");
    expect(loads).toEqual(["a", "b", "c"]);
    expect(cache.size).toBe(2);
    await cache.get("b");
    expect(loads).toEqual(["a", "b", "c", "b"]);
    // Concurrent misses for one id load once and count once.
    const shared = createReferenceBlobCache(async (id) => { loads.push(id); return new Uint8Array(10); });
    await Promise.all([shared.get("x"), shared.get("x"), shared.get("x")]);
    expect(loads.filter((l) => l === "x")).toHaveLength(1);
    expect(shared.bytes).toBe(10);
  });
});
