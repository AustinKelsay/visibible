/** Retained cold packets at the real preparation/rendering seam. No provider calls or semantic scores. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { createConvexPreparationStore, type PreparationStore } from "../engine/preparation";
import { invalidReview, type PlanReviewProblem, type ReviewInput } from "../engine/plan-review";
import { reviewReply } from "../../../tests/fixtures/plan-review";
import { assembleRendering } from "../engine/assemble";
import { createMemoryPreparationStore } from "../engine/memory-store";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";

const release = new URL("../../../llm/releases/2026-10-23-source-first-check/", import.meta.url);
const set = JSON.parse(readFileSync(new URL("sample-set.json", release), "utf8"));
const traces = readFileSync(new URL("provider.ndjson", release), "utf8").trim().split("\n").map((line) => JSON.parse(line));
function captured(id: string, arm = "candidate") {
  const sample = set.samples.find((s: { id: string }) => s.id === id);
  const replies = traces.filter((r) => r.phase === `${id}-${arm}`);
  const reply = (name: string) => JSON.parse(replies.filter((r) => r.request.response_format.json_schema.name === name).at(-1).response.choices[0].message.content);
  return { sample, look: reply("section_look"), plan: reply("scene_plan") };
}

async function setup(id = "r027", arm = "candidate", reports: unknown[][] = [[]], replacement?: object, store?: PreparationStore) {
  const { sample, look, plan } = captured(id, arm);
  const memory = createMemoryPreparationStore(structuredClone(sample.keys.map((key: string) => set.records[key])));
  const inputs = await readWorkInputs("bible-web");
  const calls: TextModelRequest[] = [];
  let reviews = 0, plans = 0;
  const model: TextModel = { id: "scripted", complete: async (request) => {
    calls.push(request);
    if (request.schemaName === "plan_review") return reviewReply(reports[Math.min(reviews++, reports.length - 1)]);
    const value = request.schemaName === "section_look" ? look : ++plans > 1 && replacement ? replacement : plan;
    return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0001 }, elapsedMs: 0 };
  } };
  const getReference = vi.fn(async () => null);
  const render = (styleId = "classical") => assembleRendering({ inputs, store: store ?? memory.store, model, listMoments: memory.listMoments,
    getReference, loadReference: async () => { throw Error("No reference expected"); } },
  { workId: "bible-web", unitId: sample.momentId, styleId, variationNumber: 1, aspectRatio: "16:9" });
  return { sample, look, plan, memory, calls, render, getReference };
}

const god = "god_yahweh_the_father_and_god_of_israel";
const lookProblem = (quote: string, entryId = ""): PlanReviewProblem => ({ kind: "look_conflict", entryId, planQuote: quote,
  reason: "Scripted pipeline probe: the shared look contradicts the chosen moment. This is not a new model verdict." });

describe("combined rendering content review", () => {
  it.each(["r027", "r067", "f011", "f003"])("reviews the exact look and complete selected stages for retained packet %s", async (id) => {
    const { look, calls, render, memory, sample } = await setup(id);
    const result = await render();
    if (!result.ok) throw Error(result.message);
    const review = calls.find((c) => c.schemaName === "plan_review")!.user;
    for (const value of Object.values(look)) expect(review).toContain(value);
    for (const canon of result.canon) {
      expect(review).toContain(canon.text);
      expect(result.prompt).toContain(canon.text);
      expect(review).toContain(`${canon.entryId} (stage: ${canon.stageId}`);
    }
    const unselected = sample.keys.map((key: string) => set.records[key]).filter((r: { kind: string; recordId: string }) => r.kind === "entry" && !result.canon.some((c) => c.entryId === r.recordId));
    for (const entry of unselected) for (const stage of entry.payload.stages) expect(review).not.toContain(stage.text);
    expect(result.prepared.look.payload).toEqual(look);
    const saved = await memory.store.getActiveRecord("plan", sample.momentId);
    expect(saved?.inputs).toContainEqual({ kind: "look", recordId: sample.sectionId, version: result.packet.lookVersion });
    for (const styleId of ["watercolor", "icon"]) {
      const again = await render(styleId);
      if (!again.ok) throw Error(again.message);
      expect(again.prepared.calls).toBe(0);
      expect(again.prepared.look.payload).toEqual(look);
    }
    expect(calls.map((c) => c.schemaName)).toEqual(["section_look", "scene_plan", "plan_review"]);
  });

  it.each(["place", "timeOfDay", "light"])("stops a reported retained Exodus look %s conflict without re-planning or rewriting it", async (field) => {
    const { look } = captured("r027");
    const problem = lookProblem(look[field], field === "light" ? god : "");
    const { render, calls, memory, getReference, sample } = await setup("r027", "candidate", [[problem]]);
    expect(await render()).toMatchObject({ ok: false, reason: "preparation", stage: "look", retryable: true, message: expect.stringContaining(problem.reason) });
    expect(calls.map((c) => c.schemaName)).toEqual(["section_look", "scene_plan", "plan_review"]);
    expect(getReference).not.toHaveBeenCalled();
    expect(memory.has("plan", sample.momentId)).toBe(false);
    expect((await memory.store.getActiveRecord("look", sample.sectionId))?.payload).toEqual({ kind: "look", sectionId: sample.sectionId, ...look });
    expect(memory.ledger.map((e) => e.outcome)).toEqual(["ok", "ok", "review problems"]);
  });

  it("stops rather than using a re-plan to work around a look fault reported with a plan fault", async () => {
    const { look, plan } = captured("r067");
    const { render, calls } = await setup("r067", "candidate", [[
      { kind: "outside_instant", entryId: "aaron_brother_of_moses", planQuote: plan.primarySubject, reason: "The source says a priest, without identifying Aaron." },
      lookProblem(look.light, god),
    ]]);
    expect(await render()).toMatchObject({ ok: false, stage: "look" });
    expect(calls.filter((c) => c.schemaName === "scene_plan")).toHaveLength(1);
  });

  it("repairs a reported canon conflict once, preserving the complete fixed stage in both reviews", async () => {
    const { plan } = captured("f008", "baseline");
    const quote = "Esther seated on a low stool in royal blue robes";
    const problem = { kind: "canon_conflict", entryId: "esther", planQuote: quote, reason: "Esther's selected canon fixes her robe as crimson." };
    const replacement = { ...plan, secondaryElements: plan.secondaryElements.replace("royal blue robes", "crimson robes") };
    const { render, calls, memory, sample } = await setup("f008", "baseline", [[problem], []], replacement);
    const result = await render();
    if (!result.ok) throw Error(result.message);
    expect(calls.map((c) => c.schemaName)).toEqual(["section_look", "scene_plan", "plan_review", "scene_plan", "plan_review"]);
    expect(calls[3].user).toContain(problem.reason);
    expect(result.prompt).toContain("crimson robes");
    const canon = result.canon.find((c) => c.entryId === "esther")!;
    expect(canon.text).toContain("crimson");
    for (const review of calls.filter((c) => c.schemaName === "plan_review")) expect(review.user).toContain(canon.text);
    expect((await memory.store.getActiveRecord("plan", sample.momentId))?.payload).toMatchObject({ review: { rounds: 2, problems: [problem] } });
    expect(memory.ledger).toHaveLength(5);
  });

  it("refuses a repeated canon conflict after one re-plan, storing no plan", async () => {
    const problem = { kind: "canon_conflict", entryId: "esther", planQuote: "royal blue robes", reason: "The selected stage specifies crimson." };
    const { render, calls, memory, sample } = await setup("f008", "baseline", [[problem]]);
    expect(await render()).toMatchObject({ ok: false, stage: "plan", message: expect.stringContaining("canon_conflict esther") });
    expect(calls.filter((c) => c.schemaName === "scene_plan")).toHaveLength(2);
    expect(calls.filter((c) => c.schemaName === "plan_review")).toHaveLength(2);
    expect(memory.has("plan", sample.momentId)).toBe(false);
    expect(memory.ledger).toHaveLength(5);
  });

  it("stops the retained Psalms packet's reported required-canon gap without inventing a replacement identity", async () => {
    const { plan } = captured("f003");
    const { render, calls, memory, sample, getReference } = await setup("f003", "candidate", [[
      { kind: "missing_canon", entryId: "", planQuote: plan.primarySubject, reason: "God is represented but has no available canon entry in this section." },
    ]]);
    expect(await render()).toMatchObject({ ok: false, stage: "plan", message: expect.stringContaining("required canon unavailable") });
    expect(calls.map((c) => c.schemaName)).toEqual(["section_look", "scene_plan", "plan_review"]);
    expect(memory.has("plan", sample.momentId)).toBe(false);
    expect(getReference).not.toHaveBeenCalled();
  });

  it("rejects a look report quoting the plan, after only the malformed-review retry", async () => {
    const { plan } = captured("r027");
    const { render, calls, memory, getReference } = await setup("r027", "candidate", [[lookProblem(plan.primarySubject)]]);
    expect(await render()).toMatchObject({ ok: false, stage: "plan", message: expect.stringContaining("look_conflict quote is not in the look") });
    expect(calls.map((c) => c.schemaName)).toEqual(["section_look", "scene_plan", "plan_review", "plan_review"]);
    expect(getReference).not.toHaveBeenCalled();
    expect(memory.ledger.map((e) => e.outcome)).toEqual(["ok", "ok", "review invalid", "review invalid"]);
  });

  it("refreshes a cached plan with an older review contract while reusing its unchanged look", async () => {
    const { render, memory, sample, calls } = await setup();
    const first = await render();
    if (!first.ok) throw Error(first.message);
    const cached = await memory.store.getActiveRecord("plan", sample.momentId);
    cached!.inputs.find((i) => i.recordId === "scene_plan_review")!.version = "2026-10-24-rendering-review-v6";
    const again = await render();
    if (!again.ok) throw Error(again.message);
    expect(again.prepared.calls).toBe(2);
    expect(again.packet.lookVersion).toBe(first.packet.lookVersion);
    expect(calls.map((c) => c.schemaName)).toEqual(["section_look", "scene_plan", "plan_review", "scene_plan", "plan_review"]);
  });

  it("persists the canon rejection audit through the real Convex validator and reuses the approved packet", async () => {
    const secret = "c".repeat(40);
    process.env.CONVEX_SERVER_SECRET = secret;
    const t = convexTest(schema, modules);
    const { sample, plan } = captured("f008", "baseline");
    const inputs = await readWorkInputs("bible-web");
    const versions = { workVersion: inputs.workVersion, briefVersion: inputs.briefVersion };
    await t.mutation(api.analysis.registerWork, { serverSecret: secret, workId: "bible-web", ...versions });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: secret, workId: "bible-web", ...versions });
    await t.mutation(api.analysis.putRecords, { serverSecret: secret, workId: "bible-web", generation,
      records: sample.keys.map((key: string) => set.records[key]).map(({ kind, recordId, payload }: FunctionArgs<typeof api.analysis.putRecords>["records"][number]) => ({ kind, recordId, payload })) });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: secret, workId: "bible-web", generation });
    const client = { query: (ref: unknown, args: unknown) => t.query(ref as never, args as never), mutation: (ref: unknown, args: unknown) => t.mutation(ref as never, args as never) };
    const store = createConvexPreparationStore(client, api.analysis as unknown as Record<string, unknown>, "bible-web", secret);
    const problem = { kind: "canon_conflict", entryId: "esther", planQuote: "royal blue robes", reason: "The selected stage specifies crimson." };
    const replacement = { ...plan, secondaryElements: plan.secondaryElements.replace("royal blue robes", "crimson robes") };
    const reports: unknown[][] = [[problem], []];
    const { render, calls } = await setup("f008", "baseline", reports, replacement, store);
    expect(await render()).toMatchObject({ ok: true });
    expect((await store.getActiveRecord("plan", sample.momentId))?.payload).toMatchObject({ review: { rounds: 2, problems: [problem] } });
    const again = await render("watercolor");
    expect(again).toMatchObject({ ok: true, prepared: { calls: 0 } });
    expect(calls).toHaveLength(5);
    // An owner taking responsibility for the same prose does not permit a silent rewrite on refusal.
    const look = await t.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: "look", recordId: sample.sectionId });
    if (!look || look.payload.kind !== "look") throw Error("Missing look");
    await t.mutation(api.analysis.correctRecord, { serverSecret: secret, workId: "bible-web", kind: "look", recordId: sample.sectionId, payload: look.payload, expectedVersion: look.version });
    const ownerLook = await t.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: "look", recordId: sample.sectionId });
    expect(ownerLook?.source).toBe("owner");
    await t.mutation(api.analysis.clearRecord, { serverSecret: secret, workId: "bible-web", kind: "plan", recordId: sample.momentId });
    reports.push([lookProblem(look.payload.light)]);
    expect(await render()).toMatchObject({ ok: false, stage: "look" });
    expect(await t.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: "look", recordId: sample.sectionId })).toEqual(ownerLook);
    expect(calls.slice(5).map((c) => c.schemaName)).toEqual(["scene_plan", "plan_review"]);
  });
});

describe("review quote ownership", () => {
  const input: ReviewInput = { rules: "", sectionTitle: "S", context: { moment: { id: "m", reference: "M", text: "A walks" }, previous: null, next: null },
    cast: [{ entryId: "a", name: "A", hasForm: true }, { entryId: "b", name: "B", hasForm: true }], present: ["a"],
    fields: { primarySubject: "A in blue", action: "walks", setting: "court", secondaryElements: "", mood: "", timeOfDay: "day", composition: "" },
    rendering: { look: { place: "shore", timeOfDay: "night", weather: "clear", light: "moonlight", clothing: "red coats" },
      canon: [{ entryId: "a", name: "A", hasForm: true, stageId: "main", kind: "character", text: "A wears red", version: "v" }] } };
  it("accepts exact look quotes, including case/spacing differences, but never canon or plan quotes as look evidence", () => {
    expect(invalidReview([lookProblem(" MOONLIGHT ")], input)).toBeNull();
    expect(invalidReview([lookProblem("A in blue")], input)).toBe("look_conflict quote is not in the look");
    expect(invalidReview([lookProblem("A wears red")], input)).toBe("look_conflict quote is not in the look");
    expect(invalidReview([lookProblem("shore", "unknown")], input)).toContain("unknown cast");
    expect(invalidReview([lookProblem("shore night")], input)).toBe("look_conflict quote is not in the look");
  });
  it("requires selected canon for a canon conflict, and requires a quote from the plan", () => {
    const problem = { kind: "canon_conflict" as const, entryId: "a", planQuote: "A in blue", reason: "Canon specifies red" };
    expect(invalidReview([problem], input)).toBeNull();
    expect(invalidReview([{ ...problem, entryId: "b" }], input)).toBe("canon_conflict must name a selected canon entry");
    expect(invalidReview([{ ...problem, planQuote: "red coats" }], input)).toBe("canon_conflict quote is not in the plan");
    expect(invalidReview([problem], { ...input, rendering: undefined })).toBe("canon_conflict must name a selected canon entry");
    expect(invalidReview([{ ...problem, planQuote: "A in blue walks" }], input)).toBe("canon_conflict quote is not in the plan");
  });
  it("requires missing-canon reports to cite the plan without naming an available entry", () => {
    const problem = { kind: "missing_canon" as const, entryId: "", planQuote: "A in blue", reason: "Missing required identity" };
    expect(invalidReview([problem], input)).toBeNull();
    expect(invalidReview([{ ...problem, entryId: "a" }], input)).toBe("missing_canon must leave entryId empty");
    expect(invalidReview([{ ...problem, planQuote: "moonlight" }], input)).toBe("missing_canon quote is not in the plan");
  });
});
