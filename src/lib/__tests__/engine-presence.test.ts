/** No-form presence through real analysis storage, lazy planning and rendering assembly; no providers. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { assembleRendering } from "../engine/assemble";
import { createConvexPreparationStore, FORMLESS_PLAN_PROMPT_VERSION, PLAN_SYSTEM } from "../engine/preparation";
import type { WorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { createWorkReader } from "../work-input";
import { SHARED_STYLES, type WorkBrief } from "../work-preparation";

const SECRET = "p".repeat(40);
const WORK = "presence-fixture";
const voiceCanon = "The voice: a non-figurative presence in light, never a face or body.";
const work = createWorkReader({
  schemaVersion: 1, id: WORK, title: "The Court", author: "Fixture", language: "en",
  referenceText: { name: "Fixture", source: "https://example.com", credit: "Test", sha256: "0".repeat(64) },
  levels: ["Part", "Sentence"], referenceFormats: { Part: "{Part} {Sentence}" }, momentMode: "unit",
  divisions: [{ key: "court", label: "The Court", level: "Part", units: [
    { number: 1, text: "The voice sat upon the throne, clothed in light, while the watcher looked on." },
    { number: 2, text: "The watcher waited alone in the empty court." },
  ] }],
});
const brief: WorkBrief = {
  schemaVersion: 1, workId: WORK, tone: "Quiet.", depictionRules: [{ text: "The voice has no body; show its presence only as light." }],
  eras: [{ id: "court", label: "Ancient court", people: "Courtiers.", dress: "Tunics.", buildingsAndObjects: "Stone throne.", technology: "Oil lamps." }],
  styleIds: ["classical", "watercolor", "icon"],
};
const inputs: WorkInputs = { work, workVersion: "wv", brief, briefVersion: "bv", styles: Object.fromEntries(
  brief.styleIds.map((id) => [id, { style: SHARED_STYLES.get(id), version: `sv-${id}` }]),
) };
const entries = [
  // Legacy entries without hasForm must still be treated as having form.
  { kind: "entry" as const, recordId: "watcher", payload: { kind: "entry" as const, name: "The watcher", entryKind: "character" as const, stages: [{ id: "main", text: "The watcher: a young courtier in a blue tunic." }] } },
  { kind: "entry" as const, recordId: "voice", payload: { kind: "entry" as const, name: "The voice", entryKind: "character" as const, hasForm: false, stages: [{ id: "early", text: "The voice: unseen and without a body." }, { id: "revealed", text: voiceCanon }] } },
  { kind: "entry" as const, recordId: "distant_presence", payload: { kind: "entry" as const, name: "The distant presence", entryKind: "character" as const, hasForm: false, stages: [{ id: "main", text: "The distant presence: a non-figurative glow, without a body." }] } },
];
const lookAnswer = { place: "Stone court", timeOfDay: "night", weather: "still", light: "radiance", clothing: "The watcher wears a tunic; the voice has no body or garments." };
const fields = { primarySubject: "The voice present as radiance above an empty throne", action: "The watcher looks on", setting: "stone court", secondaryElements: "oil lamps", mood: "quiet", timeOfDay: "night", composition: "wide" };

describe("no-form presence selection", () => {
  beforeEach(() => { process.env.CONVEX_SERVER_SECRET = SECRET; });

  async function setup(formless = true, { planFields = fields } = {}) {
    const t = convexTest(schema, modules);
    const selectedEntries = formless ? entries : entries.filter((e) => e.recordId === "watcher");
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records: [
      ...selectedEntries,
      { kind: "section", recordId: "court-1", payload: { kind: "section", title: "The court", firstUnit: "court-1", lastUnit: "court-2", era: "court",
        cast: selectedEntries.map((e) => ({ entryId: e.recordId, stageId: e.recordId === "voice" ? "revealed" : "main" })) } },
      ...["court-1", "court-2"].map((id) => ({ kind: "moment" as const, recordId: id, payload: { kind: "moment" as const, sectionId: "court-1", firstUnit: id, lastUnit: id } })),
    ] });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    const client = { query: (ref: unknown, args: unknown) => t.query(ref as never, args as never), mutation: (ref: unknown, args: unknown) => t.mutation(ref as never, args as never) };
    const store = createConvexPreparationStore(client, api.analysis as unknown as Record<string, unknown>, WORK, SECRET);
    const calls: TextModelRequest[] = [];
    const model: TextModel = { id: "scripted", async complete(request) {
      calls.push(request);
      const alone = request.user.includes("MOMENT (The Court 2)");
      const value = request.schemaName === "section_look" ? lookAnswer : {
        present: alone ? ["watcher"] : ["watcher", "voice", "unknown_entry"],
        ...planFields, ...(alone ? { primarySubject: "The watcher alone", action: "waits" } : {}),
      };
      return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 100, completionTokens: 40, costUsd: 0 }, elapsedMs: 1 };
    } };
    const getReference = vi.fn(async (kind: "sheet" | "styleReference", id: string) => ({ storageId: `${kind}-${id}`, inputs: [], fingerprint: `ref-${id}`, pinned: true }));
    const render = (unitId = "court-1", styleId = "classical") => assembleRendering({ inputs, store, model, listMoments: async () => [], getReference, loadReference: async () => new Uint8Array([1]) },
      { workId: WORK, unitId, styleId, variationNumber: 1, aspectRatio: "16:9" });
    return { t, calls, getReference, render };
  }

  it("supplies form metadata and carries selected no-form canon into every style without a sheet", async () => {
    const { calls, render, getReference } = await setup();
    const versions: string[] = [];
    for (const styleId of brief.styleIds) {
      const result = await render("court-1", styleId);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      versions.push(result.packet.planVersion);
      expect(result.packet.canon.map((c) => [c.entryId, c.stageId])).toEqual([["watcher", "main"], ["voice", "revealed"]]);
      expect(result.prompt).toContain(work.getUnit("court-1").text);
      expect(result.prompt).toContain(voiceCanon);
      expect(result.prompt).toContain("FORMLESS SUBJECTS");
      expect(result.prompt).toContain("- The voice: represent only through the non-figurative presence");
      expect(result.references.some((r) => r.kind === "sheet" && r.entryId !== "watcher")).toBe(false);
    }
    expect(new Set(versions).size).toBe(1);
    expect(calls).toHaveLength(2);
    const plan = calls.find((r) => r.schemaName === "scene_plan")!;
    expect(plan.user).toContain("- watcher: The watcher (hasForm: true)");
    expect(plan.user).toContain("- voice: The voice (hasForm: false)");
    expect(plan.user).toContain(`- voice (stage: revealed): ${voiceCanon}`);
    expect(plan.user).not.toContain(entries[1].payload.stages[0].text);
    expect(plan.user).not.toContain(entries[0].payload.stages[0].text);
    expect(plan.user).toContain(`MOMENT (The Court 1): ${work.getUnit("court-1").text}`);
    expect(plan.system).toContain("Presence does not require a physical body");
    expect(plan.system).toContain("include its id in `present`");
    expect(plan.system).toContain("do not add cast who are absent or merely mentioned");
    expect(plan.system).toContain("use its assigned canon to choose the permitted visible effects");
    expect(plan.system).toContain("describe the unoccupied seat and the permitted surrounding effects rather than a seated presence");
    expect(plan.system).toContain("Do not repeat prohibited features as denials or substitutes");
    expect(plan.system).toContain("Keep formed characters' own poses, clothing and actions");
    expect(getReference.mock.calls.filter(([kind]) => kind === "sheet").map(([, id]) => id)).toEqual(["watcher:main", "watcher:main", "watcher:main"]);
  });

  it("leaves absent no-form cast out of a later moment while sharing the section look", async () => {
    const { render, calls } = await setup();
    const first = await render();
    const alone = await render("court-2");
    expect(first.ok && alone.ok).toBe(true);
    if (!first.ok || !alone.ok) throw new Error("Assembly failed");
    expect(alone.packet.lookVersion).toBe(first.packet.lookVersion);
    expect(alone.prepared.calls).toBe(1);
    expect(alone.packet.canon.map((c) => c.entryId)).toEqual(["watcher"]);
    expect(alone.prompt).not.toContain("FORMLESS SUBJECTS");
    expect(calls[2].user).toContain(voiceCanon); // Section context does not force moment presence.
    expect(alone.prompt).not.toContain(voiceCanon);
    expect(calls).toHaveLength(3);
  });

  it("uses the same first-stage fallback for no-form planning constraints and rendering", async () => {
    const { t, render, calls } = await setup();
    // An owner correction can remove a stage after the generation passes activation checks.
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "voice",
      payload: { ...entries[1].payload, stages: [entries[1].payload.stages[0]] } });
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    const fallbackCanon = entries[1].payload.stages[0].text;
    const request = calls.find((r) => r.schemaName === "scene_plan")!;
    expect(request.user).toContain(`- voice (stage: early): ${fallbackCanon}`);
    expect(request.user).not.toContain(voiceCanon);
    expect(result.packet.canon).toContainEqual(expect.objectContaining({ entryId: "voice", stageId: "early" }));
    expect(result.prompt).toContain(fallbackCanon);
  });

  it("does not silently rewrite or retry a schema-valid contradictory reply", async () => {
    const contradictory = { ...fields, primarySubject: "The voice seated as a figure of light", action: "The watcher kneels in his blue cloak", secondaryElements: "Radiance suggesting white garments" };
    const { t, render, calls } = await setup(true, { planFields: contradictory });
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(calls.filter((r) => r.schemaName === "scene_plan")).toHaveLength(1);
    const stored = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" });
    if (stored?.payload.kind !== "plan") throw new Error("No prepared plan");
    expect(stored.payload.plan).toEqual(contradictory);
    expect(result.prompt).toContain(contradictory.primarySubject);
    expect(result.prompt).toContain(contradictory.action);
    expect(result.prompt).toContain("FORMLESS SUBJECTS");
    // This contract improves model input; live compliance remains an explicit evaluation gate.
    expect((await t.query(api.analysis.getPreparationSpend, { workId: WORK })).calls).toBe(2);
  });

  it.each(["missing", "older", "2026-10-21-formless-presence-v1"])("refreshes a cached no-form plan when the prompt version is %s and preserves its history", async (version) => {
    const { t, render, calls } = await setup();
    const first = await render();
    if (!first.ok) throw new Error(first.message);
    const current = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" });
    if (!current) throw new Error("No prepared plan");
    const oldInputs = version === "missing" ? current.inputs.filter((i) => i.kind !== "prompt")
      : current.inputs.map((i) => i.kind === "prompt" ? { ...i, version } : i);
    // Retain both failures: omitted presence and v1's selected but bodily description.
    const oldPayload = { kind: "plan" as const, momentId: "court-1",
      entries: version.endsWith("-v1") ? [{ entryId: "watcher", stageId: "main" }, { entryId: "voice", stageId: "revealed" }] : [{ entryId: "watcher", stageId: "main" }],
      plan: version.endsWith("-v1") ? { ...fields, primarySubject: "The voice seated as a figure of light" } : fields };
    const old = await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind: "plan", recordId: "court-1",
      payload: oldPayload, inputs: oldInputs });
    calls.length = 0;
    const refreshed = await render();
    if (!refreshed.ok) throw new Error(refreshed.message);
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan"]);
    expect(refreshed.packet.lookVersion).toBe(first.packet.lookVersion);
    expect(refreshed.packet.canon.map((c) => c.entryId)).toEqual(["watcher", "voice"]);
    const saved = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" });
    if (saved?.payload.kind !== "plan") throw new Error("No refreshed plan");
    expect(saved.payload.plan).toEqual(fields);
    expect(saved?.inputs).toContainEqual({ kind: "prompt", recordId: "scene_plan_formless_presence", version: FORMLESS_PLAN_PROMPT_VERSION });
    const history = await t.run(async (ctx) => (await ctx.db.query("analysisRecords").collect()).filter((r) => r.kind === "plan"));
    expect(history).toContainEqual(expect.objectContaining({ version: old.version, status: "superseded", payload: oldPayload }));
    calls.length = 0;
    await render("court-1", "icon");
    expect(calls).toHaveLength(0);
  });

  it("keeps existing plans for cast with form, including legacy entries without the flag", async () => {
    const { t, render, calls } = await setup(false);
    const first = await render();
    if (!first.ok) throw new Error(first.message);
    const plan = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" });
    expect(plan?.inputs.some((i) => i.kind === "prompt")).toBe(false);
    expect(calls[1].system).toBe(PLAN_SYSTEM);
    expect(calls[1].user).toContain("- watcher: The watcher\n");
    expect(calls[1].user).not.toContain("hasForm:");
    expect(calls[1].user).not.toContain("NO-FORM CANON CONSTRAINTS");
    calls.length = 0;
    const again = await render();
    if (!again.ok) throw new Error(again.message);
    expect(calls).toHaveLength(0);
    expect(again.packet.planVersion).toBe(first.packet.planVersion);
    expect(again.references.some((r) => r.kind === "sheet" && r.entryId === "watcher")).toBe(true);
  });
});
