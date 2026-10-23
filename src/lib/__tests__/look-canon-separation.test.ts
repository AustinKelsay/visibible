/** Exact retained look failure through normal storage/assembly; scripted replies prove no model obedience. */
import { withCleanReview } from "../../../tests/fixtures/plan-review";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { assembleRendering, type AssembleDeps } from "../engine/assemble";
import { createConvexPreparationStore, FORMLESS_LOOK_PROMPT_VERSION, FORMLESS_PLAN_PROMPT_VERSION, MOMENT_CAST_PROMPT_VERSION, type AnalysisRecord } from "../engine/preparation";
import { PLAN_REVIEW_PROMPT_VERSION } from "../engine/plan-review";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { responseSchema } from "../reading-pass/prompts";
import { withGrounding } from "../../../tests/fixtures/scene-grounding";

const evidence = new URL("../../../llm/releases/2026-10-22-daniel-cast-repair/", import.meta.url);
const snapshot: { records: Array<{ record: AnalysisRecord | null }> } = JSON.parse(readFileSync(new URL("after-9.json", evidence), "utf8"));
const scene = JSON.parse(readFileSync(new URL("scene-9.json", evidence), "utf8"));
const trace = readFileSync(new URL("provider.ndjson", evidence), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const retainedLook = JSON.parse(trace.find((row) => row.label === "section_look").response.choices[0].message.content);
const retainedPlan = JSON.parse(trace.find((row) => row.label === "scene_plan").response.choices[0].message.content);
const lookFields = ["place", "timeOfDay", "weather", "light", "clothing"];
// Scripted situational reply, not a model result or a release-quality verdict.
const situationalLook = { place: "A visionary court with an unoccupied throne and burning wheels", timeOfDay: "Night vision", weather: "Still air",
  light: "Firelight across the court; radiance above the seat", clothing: "Daniel in tunic and cloak; attendants in linen" };
const SECRET = "l".repeat(40);
const WORK = "bible-web";
const ID = "daniel-7-9";
type RecordInput = FunctionArgs<typeof api.analysis.putRecords>["records"][number];

describe("no-form section look and canon separation", () => {
  beforeEach(() => { process.env.CONVEX_SERVER_SECRET = SECRET; });

  async function setup({ lookReplies = [situationalLook], marker, currentPlanInputs = false }: { lookReplies?: Array<Record<string, unknown>>; marker?: string; currentPlanInputs?: boolean } = {}) {
    const t = convexTest(schema, modules);
    const inputs = await readWorkInputs(WORK);
    const versions = { workVersion: inputs.workVersion, briefVersion: inputs.briefVersion };
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, ...versions });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, ...versions });
    const records = snapshot.records.flatMap(({ record }) => record && !["look", "plan"].includes(record.kind)
      ? [{ kind: record.kind, recordId: record.recordId, payload: record.payload }] : []) as RecordInput[];
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    // Replay actual persisted refs, not a look whose dependencies have been rewritten to be current.
    for (const kind of ["look", "plan"] as const) {
      const old = snapshot.records.find(({ record }) => record?.kind === kind)!.record!;
      const refs = [...old.inputs, ...(kind === "look" && marker ? [{ kind: "prompt", recordId: "section_look_formless_presence", version: marker }] : [])];
      // Isolate content-hash reuse by adapting this fixture's dependencies; retained artifacts stay unchanged.
      if (kind === "plan" && currentPlanInputs) {
        const section = snapshot.records.find(({ record }) => record?.kind === "section")!.record!;
        refs.push({ kind: "section", recordId: section.recordId, version: section.version },
          { kind: "prompt", recordId: "scene_plan_moment_cast", version: MOMENT_CAST_PROMPT_VERSION },
          { kind: "prompt", recordId: "scene_plan_review", version: PLAN_REVIEW_PROMPT_VERSION });
      }
      const saved = await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind, recordId: ID,
        payload: old.payload as FunctionArgs<typeof api.analysis.putDerivedRecord>["payload"], inputs: refs });
      expect(saved.version).toBe(old.version);
    }
    const client = { query: (ref: unknown, args: unknown) => t.query(ref as never, args as never), mutation: (ref: unknown, args: unknown) => t.mutation(ref as never, args as never) };
    const store = createConvexPreparationStore(client, api.analysis as unknown as Record<string, unknown>, WORK, SECRET);
    const requests: TextModelRequest[] = [];
    let lookAttempt = 0;
    const model: TextModel = withCleanReview({ id: "scripted", complete: async (request) => {
      requests.push(request);
      // Synthetic evidence assertions do not endorse the historical plan's scene or cast.
      const value = request.schemaName === "section_look" ? lookReplies[lookAttempt++] : withGrounding({ ...retainedPlan, missingCast: [] }, scene.context.moment.text);
      if (!value) throw new Error("Unexpected scripted call");
      return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }, elapsedMs: 0 };
    } });
    const getReference = vi.fn<AssembleDeps["getReference"]>(async () => null);
    const render = (styleId = "classical", unitId = ID) => assembleRendering({ inputs, store, model, listMoments: async () => [], getReference,
      loadReference: async () => { throw new Error("No test reference should load"); } },
    { workId: WORK, unitId, styleId, variationNumber: 1, aspectRatio: "16:9" });
    const record = (kind: "look" | "plan" | "entry", recordId = ID) => t.query(api.analysis.getActiveRecord, { workId: WORK, kind, recordId });
    return { t, requests, render, record, getReference };
  }

  it.each([undefined, "older"])("refreshes the retained look with a %s marker, replans on changed content and preserves both failures", async (marker) => {
    const { t, requests, render, record } = await setup({ marker });
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(requests.map((r) => r.schemaName)).toEqual(["section_look", "scene_plan"]);
    const look = requests[0];
    expect(look.user).toContain("- the_ancient_of_days: The Ancient of Days (hasForm: false)");
    expect(look.user).toContain("- daniel_prophet_of_babylon: Daniel (prophet of Babylon) (hasForm: true)");
    expect(look.user).toContain("- the_ancient_of_days (stage: ancient-of-days-light): effect names for placement: radiance, fire, cloud, light");
    expect(look.user).toContain(scene.context.moment.text); // Keep bodily source metaphors unchanged.
    const ancient = await record("entry", "the_ancient_of_days");
    if (ancient?.payload.kind !== "entry") throw new Error("Missing canon");
    const fullCanon = ancient.payload.stages[0].text;
    expect(look.user).not.toContain(fullCanon);
    const daniel = await record("entry", "daniel_prophet_of_babylon");
    if (daniel?.payload.kind !== "entry") throw new Error("Missing formed canon");
    expect(look.user).not.toContain(daniel.payload.stages[0].text);
    expect(look.system).toContain("Bodily wording about those subjects in the source is a metaphor");
    expect(look.system).toContain("Do not repeat prohibited features as denials or substitutes");
    expect(look.system).toContain("Keep formed characters' own situational clothing and props attached to them");
    expect(look.system).toContain("leave their fixed colour, brightness and texture to canon");
    expect(result.prepared.look.payload).toEqual(situationalLook);
    expect(result.packet.lookVersion).not.toBe(scene.result.look.version);
    expect(requests[1].user).toContain(`clothing: ${situationalLook.clothing}`);
    expect(requests[1].user).not.toContain(retainedLook.clothing);
    expect((await record("look"))?.inputs).toContainEqual({ kind: "prompt", recordId: "section_look_formless_presence", version: FORMLESS_LOOK_PROMPT_VERSION });
    const plan = await record("plan");
    expect(plan?.inputs).toContainEqual({ kind: "look", recordId: ID, version: result.packet.lookVersion });
    expect(plan?.inputs).toContainEqual({ kind: "prompt", recordId: "scene_plan_formless_presence", version: FORMLESS_PLAN_PROMPT_VERSION });
    const history = await t.query(api.analysis.listRecordHistory, { workId: WORK, kind: "look", recordId: ID });
    expect(history).toContainEqual(expect.objectContaining({ version: scene.result.look.version, status: "superseded" }));
    const oldLook = await t.query(api.analysis.getRecordVersion, { workId: WORK, generation: 1, kind: "look", recordId: ID, version: scene.result.look.version });
    expect(oldLook?.payload).toEqual({ kind: "look", sectionId: ID, ...retainedLook });
    const planHistory = await t.query(api.analysis.listRecordHistory, { workId: WORK, kind: "plan", recordId: ID });
    expect(planHistory).toContainEqual(expect.objectContaining({ version: scene.result.plan.version, status: "superseded" }));
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const again = await render(styleId);
      if (!again.ok) throw new Error(again.message);
      expect(again.prepared.calls).toBe(0);
      expect(again.packet.lookVersion).toBe(result.packet.lookVersion);
      expect(again.prompt).toContain(fullCanon);
      expect(again.prompt).not.toContain("effect names for placement");
    }
    expect(requests).toHaveLength(2);
  });

  it("retains the exact schema-valid live failure without semantic retry and reuses an unchanged plan", async () => {
    const { t, requests, render, record } = await setup({ lookReplies: [retainedLook], currentPlanInputs: true });
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(requests.map((r) => r.schemaName)).toEqual(["section_look"]);
    expect(requests[0].schema.safeParse(retainedLook).success).toBe(true);
    expect(result.prepared.look.payload).toEqual(retainedLook);
    expect(result.prepared.look.payload.clothing).toContain("white robes like snow and wool-white hair");
    expect(result.prepared.plan.payload).toEqual(retainedPlan);
    expect(result.packet.lookVersion).toBe(scene.result.look.version);
    expect(result.packet.planVersion).toBe(scene.result.plan.version);
    expect((await record("look"))?.inputs).toContainEqual({ kind: "prompt", recordId: "section_look_formless_presence", version: FORMLESS_LOOK_PROMPT_VERSION });
    expect((await t.query(api.analysis.getPreparationSpend, { workId: WORK })).calls).toBe(1);
    await render("watercolor");
    expect(requests).toHaveLength(1); // Same content hash, but new look-input provenance was persisted.
  });

  it("describes every look field in a strict provider schema and enforces the 200-character boundary locally", async () => {
    const { requests, render } = await setup();
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    const request = requests[0];
    expect(responseSchema(request.schema)).toEqual({ type: "object", additionalProperties: false, required: lookFields,
      properties: Object.fromEntries(lookFields.map((key) => [key, { type: "string", description: expect.stringContaining("At most 200 characters.") }])) });
    expect(request.schema.safeParse({ ...situationalLook, extra: "unexpected" }).success).toBe(false);
    for (const key of lookFields) {
      expect(request.schema.safeParse({ ...situationalLook, [key]: "x".repeat(200) }).success).toBe(true);
      expect(request.schema.safeParse({ ...situationalLook, [key]: "x".repeat(201) }).success).toBe(false);
    }
  });

  it("stops after the existing single invalid-response retry without overwriting the historical look or loading references", async () => {
    const invalid = { ...situationalLook, clothing: "x".repeat(201) };
    const { t, requests, render, record, getReference } = await setup({ lookReplies: [invalid, invalid] });
    const result = await render();
    expect(result).toMatchObject({ ok: false, reason: "preparation", stage: "look", retryable: true });
    expect(requests.map((r) => r.schemaName)).toEqual(["section_look", "section_look"]);
    expect((await record("look"))?.version).toBe(scene.result.look.version);
    expect((await record("look"))?.inputs.some((i) => i.kind === "prompt")).toBe(false);
    expect((await record("plan"))?.version).toBe(scene.result.plan.version);
    expect(getReference).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => (await ctx.db.query("preparationLedger").collect()).map((entry) => entry.outcome))).toEqual(["invalid", "invalid"]);
    expect(await t.run(async (ctx) => ctx.db.query("preparationClaims").collect())).toHaveLength(0);
  });

  it("stores a valid second look reply and reuses it without another call", async () => {
    const { t, requests, render } = await setup({ lookReplies: [{ ...situationalLook, light: "x".repeat(201) }, situationalLook] });
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(result.prepared.look.payload).toEqual(situationalLook);
    expect(requests.map((r) => r.schemaName)).toEqual(["section_look", "section_look", "scene_plan"]);
    expect(await t.run(async (ctx) => (await ctx.db.query("preparationLedger").collect()).map((entry) => entry.outcome))).toEqual(["invalid", "ok", "ok", "review ok"]);
    await render("icon");
    expect(requests).toHaveLength(3);
  });
});
