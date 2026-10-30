/** No-form presence through real analysis storage, lazy planning and rendering assembly; no providers. */
import { withPlanningReply } from "../../../tests/fixtures/planning-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { assembleRendering } from "../engine/assemble";
import { createConvexPreparationStore, FORMLESS_PLAN_PROMPT_VERSION, MOMENT_CAST_PROMPT_VERSION, planSystem } from "../engine/preparation";
import type { WorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { responseSchema } from "../reading-pass/prompts";
import { createWorkReader } from "../work-input";
import { SHARED_STYLES, type WorkBrief } from "../work-preparation";
import { withGrounding } from "../../../tests/fixtures/scene-grounding";
import { testDepiction } from "../../../tests/fixtures/depiction";

const PLAN_SYSTEM = planSystem(testDepiction("presence-fixture"));

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
const inputs: WorkInputs = { work, workVersion: "wv", brief, briefVersion: "bv", depiction: testDepiction(WORK), styles: Object.fromEntries(
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

  async function setup(formless = true, { planFields = fields, planReplies }: { planFields?: typeof fields; planReplies?: Array<Record<string, unknown>> } = {}) {
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
    let planAttempt = 0;
    const model: TextModel = withPlanningReply({ id: "scripted", async complete(request) {
      calls.push(request);
      const alone = request.user.includes("MOMENT (The Court 2)");
      const value = request.schemaName === "section_look" ? lookAnswer : planReplies?.[planAttempt++] ?? {
        present: alone ? ["watcher"] : formless ? ["watcher", "voice"] : ["watcher"],
        ...planFields, ...(alone ? { primarySubject: "The watcher alone", action: "waits" } : {}),
      };
      const reply = "present" in value ? withGrounding({ missingCast: [], ...value, present: value.present as string[] }, work.getUnit(alone ? "court-2" : "court-1").text) : value;
      return { content: JSON.stringify(reply), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 100, completionTokens: 40, costUsd: 0 }, elapsedMs: 1 };
    } });
    const getReference = vi.fn(async (kind: "sheet" | "styleReference", id: string) => ({ storageId: `${kind}-${id}`, inputs: [], fingerprint: `ref-${id}`, pinned: true }));
    const render = (unitId = "court-1", styleId = "classical") => assembleRendering({ inputs, store, model, listMoments: async () => [], getReference, loadReference: async () => new Uint8Array([1]) },
      { workId: WORK, unitId, styleId, variationNumber: 1, aspectRatio: "16:9" });
    return { t, calls, getReference, render };
  }

  it("supplies form metadata and records selected no-form canon in every style without a sheet or prompt text", async () => {
    const { calls, render, getReference } = await setup();
    const versions: string[] = [];
    for (const styleId of brief.styleIds) {
      const result = await render("court-1", styleId);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      versions.push(result.packet.planVersion);
      expect(result.packet.canon.map((c) => [c.entryId, c.stageId])).toEqual([["watcher", "main"], ["voice", "revealed"]]);
      // A selected no-form subject is never named, quoted or described: no source text, no canon, no name in the plan.
      expect(result.prompt).not.toContain(work.getUnit("court-1").text);
      expect(result.prompt).not.toContain(voiceCanon);
      expect(result.prompt).toContain("UNSEEN PRESENCE (binding)");
      expect(result.prompt).not.toContain("a non-figurative presence in light, never a face or body.");
      expect(result.prompt).toContain("SELECTED CHARACTERS: The watcher\n");
      expect(result.prompt).toContain("Primary subject: the presence present as radiance above an empty throne");
      expect(result.prompt).not.toContain("FORMLESS SUBJECTS");
      expect(result.references.some((r) => r.kind === "sheet" && r.entryId !== "watcher")).toBe(false);
    }
    expect(new Set(versions).size).toBe(1);
    expect(calls).toHaveLength(1);
    const plan = calls.find((r) => r.schemaName === "scene_plan")!;
    expect(plan.user).toContain("- watcher: The watcher (hasForm: true)");
    expect(plan.user).toContain("- voice: The voice (hasForm: false)");
    // Since formless-effects v14 the planner gets no canon for a no-form subject, so it cannot copy it into the plan.
    expect(plan.user).not.toContain(voiceCanon);
    expect(plan.user).not.toContain("NO-FORM CANON CONSTRAINTS");
    expect(plan.user).not.toContain(entries[1].payload.stages[0].text);
    expect(plan.user).not.toContain(entries[0].payload.stages[0].text);
    expect(plan.user).toContain(`MOMENT (The Court 1): ${work.getUnit("court-1").text}`);
    expect(plan.system.startsWith(PLAN_SYSTEM)).toBe(true);
    expect(plan.system).toContain("Cast marked hasForm: false have no body and are never drawn.");
    expect(plan.system).toContain("select it and show the moment through the place and the people who witness it");
    expect(plan.system).toContain("Leave out cast who are elsewhere or only mentioned.");
    expect(plan.system).toContain("any face, hands, hair or body: bodily words in the text are metaphors");
    expect(plan.system).toContain("Never name it or call it seated, standing, enthroned or riding, and leave out its throne, seat, chariot, robe, train or hem");
    expect(plan.system).toContain("A command, oath or mention alone is not an appearance");
    expect(getReference.mock.calls.filter(([kind]) => kind === "sheet").map(([, id]) => id)).toEqual(["watcher:main", "watcher:main", "watcher:main"]);
  });

  it("sends a strict provider schema with known cast IDs and guidance, and validates field lengths locally", async () => {
    const { calls, render } = await setup();
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    const request = calls.find((r) => r.schemaName === "scene_plan")!;
    expect(responseSchema(request.schema)).toEqual({
      type: "object", additionalProperties: false,
      required: ["focusQuote", "instant", "selectedCast", ...Object.keys(fields)],
      properties: {
        focusQuote: { type: "string", description: expect.any(String) },
        instant: { type: "string", description: expect.any(String) },
        selectedCast: { type: "array", description: expect.any(String), items: expect.objectContaining({ type: "object", additionalProperties: false,
          required: ["entryId", "evidence"], properties: expect.objectContaining({ entryId: { type: "string", enum: entries.map((e) => e.recordId) } }) }) },
        // No maxLength reaches the provider, and long values are trimmed locally rather than refused.
        ...Object.fromEntries(Object.keys(fields).map((key) => [key, { type: "string", description: expect.stringContaining("One or two short phrases.") }])),
      },
    });
    // The no-form addendum reaches the fields that place effects.
    expect((responseSchema(request.schema).properties as Record<string, { description: string }>).primarySubject.description).toContain("For a cast entry with hasForm false, describe only the smoke, cloud, fire, wind or light the text names");
    const reply = { focusQuote: "The voice sat", instant: "One instant.", selectedCast: [], ...fields };
    expect(request.schema.safeParse(reply).success).toBe(true);
    for (const key of Object.keys(fields)) expect(request.schema.safeParse({ ...reply, [key]: "x".repeat(1000) }).success).toBe(true);
    for (const removed of ["grounding", "consideredCast", "missingCast"]) expect(request.schema.safeParse({ ...reply, [removed]: [] }).success).toBe(false);
    // Moment conditions are no longer a separate reply field (moment-cast v12): the scene fields carry setting and time.
    expect(request.schema.safeParse({ ...reply, situation: { place: "court", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "robes" } }).success).toBe(false);
    expect(request.schema.safeParse({ ...reply, selectedCast: [{ entryId: "unknown_entry", evidence: "" }] }).success).toBe(false);
  });

  it("trims an oversized field to 400 characters instead of refusing or retrying the plan", async () => {
    const { t, calls, render } = await setup(true, { planReplies: [{ present: ["watcher", "voice"], ...fields, action: "x".repeat(1000), mood: "y".repeat(300) }] });
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan"]);
    const stored = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" });
    if (stored?.payload.kind !== "plan") throw new Error("No prepared plan");
    expect(stored.payload.plan.action).toBe(`${"x".repeat(399)}…`);
    expect(stored.payload.plan.mood).toBe("y".repeat(300));
    expect(result.prompt).toContain(`Action: ${"x".repeat(399)}…`);
  });

  it.each([
    ["an unknown cast ID", { present: ["watcher", "unknown_entry"], ...fields }],
  ])("refuses %s, which the provider schema forbids, after the existing single retry without storing a plan", async (_label, invalid) => {
    const { t, calls, render, getReference } = await setup(true, { planReplies: [invalid, invalid] });
    const result = await render();
    expect(result).toMatchObject({ ok: false, reason: "preparation", stage: "plan", retryable: true });
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "scene_plan"]);
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" })).toBeNull();
    expect(getReference).not.toHaveBeenCalled();
    const spend = await t.query(api.analysis.getPreparationSpend, { workId: WORK });
    expect(spend.calls).toBe(2);
    expect(await t.run(async (ctx) => (await ctx.db.query("preparationLedger").collect()).map((entry) => entry.outcome))).toEqual(["invalid", "invalid"]);
  });

  it("stores a valid second reply and reuses it across styles without another look or plan call", async () => {
    const valid = { present: ["watcher", "voice"], ...fields, action: "x".repeat(220) };
    const { t, calls, render } = await setup(true, { planReplies: [{ ...valid, present: ["unknown_entry"] }, valid] });
    const first = await render();
    if (!first.ok) throw new Error(first.message);
    expect(first.prepared.calls).toBe(2); // malformed reply and its valid retry
    expect(first.prepared.plan.payload).toEqual(valid);
    expect(await t.run(async (ctx) => (await ctx.db.query("preparationLedger").collect()).map((entry) => entry.outcome))).toEqual(["invalid", "ok"]);
    calls.length = 0;
    const second = await render("court-1", "watercolor");
    if (!second.ok) throw new Error(second.message);
    expect(second.packet.planVersion).toBe(first.packet.planVersion);
    expect(calls).toHaveLength(0);
  });

  it("leaves absent no-form cast out of a later moment while sharing the section look", async () => {
    const { render, calls } = await setup();
    const first = await render();
    const alone = await render("court-2");
    expect(first.ok && alone.ok).toBe(true);
    if (!first.ok || !alone.ok) throw new Error("Assembly failed");
    expect(alone.packet.lookVersion).toBe(first.packet.lookVersion);
    expect(alone.prepared.calls).toBe(1); // one plan
    expect(alone.packet.canon.map((c) => c.entryId)).toEqual(["watcher"]);
    expect(alone.prompt).not.toContain("UNSEEN PRESENCE");
    // A formed-only scene keeps its source text.
    expect(alone.prompt).toContain(work.getUnit("court-2").text);
    expect(first.prompt).not.toContain(work.getUnit("court-1").text);
    expect(calls[1].user).toContain("- voice: The voice (hasForm: false)"); // Section context does not force moment presence.
    expect(calls[1].user).not.toContain(voiceCanon);
    expect(alone.prompt).not.toContain(voiceCanon);
    expect(calls).toHaveLength(2);
  });

  it("refuses a removed section-assigned canon stage without a model call or references", async () => {
    const { t, render, calls, getReference } = await setup();
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "voice",
      payload: { ...entries[1].payload, stages: [entries[1].payload.stages[0]] } });
    expect(await render()).toMatchObject({ ok: false, reason: "preparation", stage: "plan", retryable: true,
      message: expect.stringContaining("missing canon stage voice:revealed") });
    expect(calls).toHaveLength(0);
    expect(getReference).not.toHaveBeenCalled();
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" })).toBeNull();
  });

  it.each([
    ["a bodily substitute", "The voice seated as a figure of light"],
    // Retained v2 Daniel pilot wording, adapted only to this fixture's subject name.
    ["a prohibited-feature denial", "The voice: a white radiance and cloud enthroned over a seat of fiery flame, with no human face or body"],
  ])("does not silently rewrite or retry a schema-valid reply containing %s", async (_label, primarySubject) => {
    const contradictory = { ...fields, primarySubject, action: "The watcher kneels in his blue cloak", secondaryElements: "Radiance suggesting white garments" };
    const { t, render, calls } = await setup(true, { planFields: contradictory });
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(calls.filter((r) => r.schemaName === "scene_plan")).toHaveLength(1);
    const stored = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" });
    if (stored?.payload.kind !== "plan") throw new Error("No prepared plan");
    expect(stored.payload.plan).toEqual(contradictory);
    // Rendering names no no-form subject: its name in the stored plan becomes "the presence" in the prompt only.
    expect(result.prompt).toContain(contradictory.primarySubject.replace(/The voice/g, "the presence"));
    expect(result.prompt).not.toContain(contradictory.primarySubject);
    expect(result.prompt).toContain(contradictory.action);
    expect(result.prompt).toContain("UNSEEN PRESENCE (binding)");
    // Code never rewrites the reply. The scripted review reports no problems; a real review is a
    // separate model judgment measured in evaluation, and live compliance remains a gate.
    expect((await t.query(api.analysis.getPreparationSpend, { workId: WORK })).calls).toBe(1);
  });

  it.each(["missing", "older", "2026-10-21-formless-presence-v1", "2026-10-21-formless-presence-v2", "2026-10-21-formless-presence-v3", "2026-10-22-formless-placement-v4"])("refreshes a cached no-form plan when the prompt version is %s and preserves its history", async (version) => {
    const { t, render, calls } = await setup();
    const first = await render();
    if (!first.ok) throw new Error(first.message);
    const current = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" });
    if (!current) throw new Error("No prepared plan");
    const oldInputs = version === "missing" ? current.inputs.filter((i) => i.kind !== "prompt")
      : current.inputs.map((i) => i.kind === "prompt" && i.recordId !== "scene_plan_look_ownership" ? { ...i, version } : i);
    // Retain earlier failures, including selected presence with bodily wording or denials.
    const selected = version.endsWith("-v1") || version.endsWith("-v2") || version.endsWith("-v3") || version.endsWith("-v4");
    const oldPayload = { kind: "plan" as const, momentId: "court-1",
      entries: selected ? [{ entryId: "watcher", stageId: "main" }, { entryId: "voice", stageId: "revealed" }] : [{ entryId: "watcher", stageId: "main" }],
      plan: selected ? { ...fields, primarySubject: version.endsWith("-v1") ? "The voice seated as a figure of light"
        : version.endsWith("-v4") ? "Radiance above an unoccupied seat"
        : version.endsWith("-v3") ? "Brilliant white radiance above an unoccupied seat, with bright orange fire and soft white cloud"
          : "The voice: radiance enthroned over a seat, with no human face or body",
      ...(version.endsWith("-v4") ? { secondaryElements: "soft white cloud drifting around the throne; brilliant white light radiating outward" } : {}) } : fields };
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

  it.each([true, false])("refreshes only the plan for a stale selected-cast contract (no-form cast: %s)", async (formless) => {
    const { t, render, calls } = await setup(formless);
    const first = await render();
    if (!first.ok) throw new Error(first.message);
    const current = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" });
    if (!current || current.payload.kind !== "plan") throw new Error("Missing plan");
    for (const marker of [undefined, "older", "2026-10-22-moment-cast-v2", "2026-10-22-moment-cast-v3"]) {
      const inputs = current.inputs.filter((input) => input.recordId !== "scene_plan_moment_cast");
      if (marker) inputs.push({ kind: "prompt", recordId: "scene_plan_moment_cast", version: marker });
      // Other inputs, including the no-form prompt contract where applicable, stay current.
      const payload = { ...current.payload, plan: { ...current.payload.plan, primarySubject: `Old selection ${marker}` } };
      if (marker === "2026-10-22-moment-cast-v3" && payload.grounding) {
        // Stored v3 audits have no stated instant and must remain valid storage records.
        const { instant: _instant, ...v3 } = payload.grounding; void _instant; payload.grounding = v3;
      }
      const old = await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind: "plan", recordId: "court-1", payload, inputs });
      calls.length = 0;
      const refreshed = await render();
      if (!refreshed.ok) throw new Error(refreshed.message);
      expect(calls.map((request) => request.schemaName)).toEqual(["scene_plan"]);
      expect(refreshed.packet.lookVersion).toBe(first.packet.lookVersion);
      expect(refreshed.packet.planVersion).toBe(first.packet.planVersion);
      const history = await t.query(api.analysis.listRecordHistory, { workId: WORK, kind: "plan", recordId: "court-1" });
      expect(history).toContainEqual(expect.objectContaining({ version: old.version, status: "superseded" }));
      calls.length = 0;
      await render("court-1", "watercolor");
      expect(calls).toHaveLength(0);
    }
  });

  it("keeps formed look requests and legacy form flags while enforcing selected IDs", async () => {
    const { t, render, calls } = await setup(false);
    const first = await render();
    if (!first.ok) throw new Error(first.message);
    const plan = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "court-1" });
    expect(plan?.inputs.filter((i) => i.kind === "prompt")).toEqual([{ kind: "prompt", recordId: "scene_plan_look_ownership", version: "no-owner-look-v1" }, { kind: "prompt", recordId: "scene_plan_moment_cast", version: MOMENT_CAST_PROMPT_VERSION }, { kind: "prompt", recordId: "depiction_plan", version: testDepiction(WORK).planVersion }]);
    const look = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "look", recordId: "court-1" });
    expect(look).toBeNull();
    expect(calls[0].system).toBe(PLAN_SYSTEM);
    expect(calls[0].schema.safeParse({ missingCast: [], present: ["unknown_entry"], ...fields }).success).toBe(false);
    expect(first.prepared.plan.payload.present).toEqual(["watcher"]);
    expect(calls[0].user).toContain("- watcher: The watcher");
    expect(calls[0].user).not.toContain("hasForm:");
    expect(calls[0].user).not.toContain("NO-FORM CANON CONSTRAINTS");
    calls.length = 0;
    const again = await render();
    if (!again.ok) throw new Error(again.message);
    expect(calls).toHaveLength(0);
    expect(again.packet.planVersion).toBe(first.packet.planVersion);
    expect(again.references.some((r) => r.kind === "sheet" && r.entryId === "watcher")).toBe(true);
  });
});
