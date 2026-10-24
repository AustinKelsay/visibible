/** Plan review and the single re-plan over retained Luke records; scripted replies, no provider or live writes. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { selectionReply, withGrounding } from "../../../tests/fixtures/scene-grounding";
import { reviewReply } from "../../../tests/fixtures/plan-review";
import { prepareMoment, PreparationUnavailableError, type AnalysisRecord, type PreparationStore } from "../engine/preparation";
import { invalidReview, type ReviewInput } from "../engine/plan-review";
import { sceneGroundingProblem } from "../engine/scene-grounding";
import { momentContext, readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";

const repair = new URL("../../../llm/releases/2026-10-22-luke-cast-repair/", import.meta.url);
const rateCheck = new URL("../../../llm/releases/2026-10-23-grounding-rate-check/", import.meta.url);
const snapshot = JSON.parse(readFileSync(new URL("final.json", repair), "utf8")) as { records: Array<{ record: AnalysisRecord | null }> };
const records0 = snapshot.records.flatMap(({ record }) => record ? [record] : []);
const find = (kind: string, id: string) => records0.find((r) => r.kind === kind && r.recordId === id)!;
const lukeCast = (find("section", "luke-10-25").payload as unknown as { cast: Array<{ entryId: string }> }).cast.map((c) => c.entryId);
const samaritan = "the_samaritan", wounded = "wounded_traveler_in_samaritan_parable", mount = "samaritans_mount_in_parable";
const fields = { primarySubject: "The Samaritan kneeling beside the wounded traveler", action: "binds the wounds with cloth",
  setting: "roadside", secondaryElements: "the Samaritan's donkey stands nearby", mood: "compassion", timeOfDay: "day", composition: "two figures close together" };
const plan = (overrides: Record<string, unknown> = {}) => withGrounding({ present: [samaritan, wounded], missingCast: [], ...fields, ...overrides }, "bound up his wounds",
  { [samaritan]: "came to him, and bound up his wounds", [wounded]: "his wounds" });
const donkey = { kind: "unselected_figure", entryId: mount, planQuote: "the Samaritan's donkey", reason: "The mount is described but not selected." };

async function setup(planReplies: unknown[], reviewReplies: unknown[][]) {
  const inputs = await readWorkInputs("bible-web");
  const records: AnalysisRecord[] = structuredClone(records0);
  const writes: AnalysisRecord[] = [], spend: Array<{ kind: string; outcome: string; costUsd: number | null }> = [];
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
    claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (entry) => { spend.push(entry); },
    putDerivedRecord: async (args) => {
      const record = { ...structuredClone(args), version: contentVersion(args.payload) } as AnalysisRecord;
      const index = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId);
      if (index < 0) records.push(record); else records[index] = record;
      writes.push(record); return { version: record.version };
    },
  };
  const calls: TextModelRequest[] = [];
  let planIndex = 0, reviewIndex = 0;
  const model: TextModel = { id: "scripted", complete: async (request) => {
    calls.push(request);
    if (request.schemaName === "plan_review") return reviewReply(reviewReplies[reviewIndex++] ?? []);
    return { content: JSON.stringify(selectionReply(planReplies[planIndex++] ?? planReplies.at(-1))), model: "scripted", providerRequestId: null, finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 100, costUsd: 0.0004 }, elapsedMs: 1 };
  } };
  const moment = find("moment", "luke-10-34"), section = find("section", "luke-10-25");
  const context = momentContext(inputs.work, { id: "luke-10-34", firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) },
    { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  const run = () => prepareMoment({ workId: "bible-web", momentId: "luke-10-34", store, model, brief: inputs.brief, briefVersion: inputs.briefVersion, context });
  return { run, calls, writes, spend, context };
}

describe("plan review before storage", () => {
  it("stores a plan whose review is clean, after one review of the rendering-bound text only", async () => {
    const { run, calls, writes, spend } = await setup([plan()], [[]]);
    const result = await run();
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "plan_review"]);
    // The benchmarked review configuration travels with the request; planning keeps reasoning off.
    expect(calls[1]).toMatchObject({ reasoningEffort: "low", maxTokens: 4000 });
    expect(calls[0].reasoningEffort).toBeUndefined();
    expect(result.calls).toBe(2);
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ plan: fields, review: { rounds: 1 } });
    expect(spend.map((s) => s.outcome)).toEqual(["ok", "review ok"]);
    const review = calls[1].user;
    expect(review).toContain("MOMENT (Luke 10:34)");
    expect(review).toContain(`present: ${samaritan}, ${wounded}`);
    expect(review).toContain(`secondaryElements: ${fields.secondaryElements}`);
    expect(review).toContain(`- ${mount}: `);
    for (const audit of ["focusQuote", "momentQuote", "contextQuote", "singleInstant", "participation"]) expect(review).not.toContain(audit);
  });

  it("re-plans once with the review's problems as feedback and stores the second plan with the rejection audit", async () => {
    const second = plan({ present: [samaritan, wounded, mount], secondaryElements: "the Samaritan's donkey stands nearby" });
    second.grounding.cast.find((e) => e.entryId === mount)!.momentQuote = "He set him on his own animal";
    const { run, calls, writes, spend } = await setup([plan(), second], [[donkey], []]);
    const result = await run();
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "plan_review", "scene_plan", "plan_review"]);
    expect(calls[2].user.startsWith(calls[0].user)).toBe(true);
    expect(calls[2].user.slice(calls[0].user.length)).toBe(`\n\nA PREVIOUS PLAN FOR THIS MOMENT WAS REJECTED. Write a new plan that fixes every problem below and keeps what was correct:\n- unselected_figure: ${donkey.reason} (plan said: "${donkey.planQuote}")`);
    expect(result.present.map((p) => p.entryId)).toEqual([samaritan, wounded, mount]);
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ review: { rounds: 2, problems: [donkey] } });
    expect(spend.map((s) => s.outcome)).toEqual(["ok", "review problems", "ok", "review ok"]);
  });

  it("stops after a second rejected plan, storing nothing and recording every paid call", async () => {
    const { run, calls, writes, spend } = await setup([plan()], [[donkey], [donkey]]);
    await expect(run()).rejects.toThrow(new PreparationUnavailableError("plan", `plan review: unselected_figure ${mount}`));
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "plan_review", "scene_plan", "plan_review"]);
    expect(writes).toHaveLength(0);
    expect(spend.map((s) => s.outcome)).toEqual(["ok", "review problems", "ok", "review problems"]);
  });

  it("re-plans once after an evidence refusal, then reviews the replacement", async () => {
    const refused = plan(); refused.grounding.focusQuote = "the robbers stripped him";
    const { run, calls, writes } = await setup([refused, plan()], [[]]);
    await run();
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "scene_plan", "plan_review"]);
    expect(calls[1].user.slice(calls[0].user.length)).toContain("- evidence: scene focus is not quoted from the current moment");
    expect(writes[0].payload).toMatchObject({ review: { rounds: 2, evidence: "scene focus is not quoted from the current moment" } });
  });

  it("stores a plan whose continuing road is anchored only by the previous verse, through the real cast kinds", async () => {
    const road = "jerusalem_to_jericho_road";
    const reply = plan({ present: [samaritan, wounded, road] });
    const entry = reply.grounding.cast.find((e) => e.entryId === road)!;
    Object.assign(entry, { momentQuote: "", contextSource: "previous", contextQuote: "as he traveled, came where he was" });
    const { run, calls, writes, context } = await setup([reply], [[]]);
    expect(context.previous?.text).toContain("as he traveled, came where he was");
    await run();
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "plan_review"]);
    expect(writes[0].payload).toMatchObject({ entries: [{ entryId: samaritan }, { entryId: wounded }, { entryId: road }] });
  });

  it("never re-plans a source gap or a twice-malformed plan", async () => {
    const gap = await setup([plan({ missingCast: ["host"], present: [] })], []);
    await expect(gap.run()).rejects.toThrow(/required canon unavailable: host/);
    expect(gap.calls.map((r) => r.schemaName)).toEqual(["scene_plan"]);
    const malformed = await setup(["not a plan"], []);
    await expect(malformed.run()).rejects.toThrow(PreparationUnavailableError);
    expect(malformed.calls.map((r) => r.schemaName)).toEqual(["scene_plan", "scene_plan"]);
  });

  it("treats a review that cites text the plan does not contain as unavailable, after one retry", async () => {
    const invented = { ...donkey, planQuote: "a camel kneels" };
    const { run, calls, writes, spend } = await setup([plan()], [[invented], [invented]]);
    await expect(run()).rejects.toThrow(/plan review unavailable: unselected_figure quote is not in the plan/);
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "plan_review", "plan_review"]);
    expect(writes).toHaveLength(0);
    expect(spend.map((s) => s.outcome)).toEqual(["ok", "review invalid", "review invalid"]);
  });
});

describe("review report validation", () => {
  const input = (present: string[]): ReviewInput => ({ rules: "- none", context: { moment: { id: "m", reference: "M", text: "text" }, previous: null, next: null }, sectionTitle: "S",
    cast: [{ entryId: "a", name: "A", hasForm: true }, { entryId: "b", name: "B", hasForm: true }, { entryId: "voice", name: "Voice", hasForm: false }],
    present, fields: { primarySubject: "A kneels", action: "Light   SEATED above the throne", setting: "hall", secondaryElements: "B waits", mood: "", timeOfDay: "", composition: "" } });
  it.each([
    ["an exact phrase, ignoring case and spacing", { kind: "embodied_formless", entryId: "voice", planQuote: "light seated above", reason: "" }, null],
    ["a selected id as the quote", { kind: "outside_instant", entryId: "a", planQuote: "a", reason: "" }, null],
    ["an empty id for an outside figure without an entry", { kind: "outside_instant", entryId: "", planQuote: "B waits", reason: "" }, null],
    ["a quote absent from the plan", { kind: "outside_instant", entryId: "", planQuote: "C arrives", reason: "" }, "outside_instant quote is not in the plan"],
    ["an unknown cast id", { kind: "outside_instant", entryId: "zed", planQuote: "B waits", reason: "" }, "outside_instant names unknown cast zed"],
    ["an unselected_figure that is selected", { kind: "unselected_figure", entryId: "a", planQuote: "A kneels", reason: "" }, "unselected_figure must name an unselected cast entry"],
    ["an embodied_formless on a formed entry", { kind: "embodied_formless", entryId: "a", planQuote: "A kneels", reason: "" }, "embodied_formless must name a no-form cast entry"],
  ] as const)("checks %s", (_label, problem, expected) => {
    expect(invalidReview([problem], input(["a", "voice"]))).toBe(expected);
  });
});

describe("evidence records for considered but excluded cast", () => {
  const lines = readFileSync(new URL("provider.ndjson", rateCheck), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { phase: string; response: { choices: Array<{ message: { content: string } }> } });
  const reply = (phase: string) => JSON.parse(lines.filter((t) => t.phase === phase).at(-1)!.response.choices[0].message.content);
  const contextFor = async (unit: string, sectionId: string) => {
    const inputs = await readWorkInputs("bible-web");
    const rate = JSON.parse(readFileSync(new URL("snapshot.json", rateCheck), "utf8")) as { records: Array<{ kind: string; recordId: string; record: AnalysisRecord | null }> };
    const get = (kind: string, id: string) => rate.records.find((r) => r.kind === kind && r.recordId === id)!.record!;
    const moment = get("moment", unit), section = get("section", sectionId);
    return { context: momentContext(inputs.work, { id: unit, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) }, { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) }),
      castIds: (section.payload as unknown as { cast: Array<{ entryId: string }> }).cast.map((c) => c.entryId) };
  };

  it("now accepts the retained v4 Daniel 7:9 reply that documented the assembly as uncertain", async () => {
    const live = reply("v4-daniel-7-9-r2"), { context, castIds } = await contextFor("daniel-7-9", "daniel-7-9");
    expect(live.grounding.cast.map((e: { entryId: string; participation: string }) => [e.entryId, e.participation])).toEqual([["the_ancient_of_days", "in_scene"], ["ministering_assembly_in_daniels_vision", "uncertain"]]);
    expect(live.present).toEqual(["the_ancient_of_days"]);
    expect(sceneGroundingProblem(live.grounding, live.present, context, castIds)).toBeNull();
  });

  it("still refuses the retained v3 Luke 10:34 reply that called an unselected inn in_scene", async () => {
    const live = reply("v3-luke-10-34-r1"), { context, castIds } = await contextFor("luke-10-34", "luke-10-25");
    // v3 replies predate the stated instant; supply one so only the evidence rule is under test.
    const grounding = { ...live.grounding, instant: "The Samaritan kneels by the road, binding the wounds." };
    expect(sceneGroundingProblem(grounding, live.present, context, castIds)).toBe("cast inn_in_samaritan_parable is in_scene but not selected");
  });

  it("accepts any order, and refuses repeats, unknown ids and missing selected evidence", () => {
    const base = plan().grounding, context = { moment: { id: "luke-10-34", reference: "Luke 10:34", text: "came to him, and bound up his wounds, pouring on oil and wine." }, previous: null, next: null };
    const reversed = { ...base, cast: [...base.cast].reverse() };
    expect(sceneGroundingProblem(reversed, [samaritan, wounded], context, lukeCast)).toBeNull();
    expect(sceneGroundingProblem({ ...base, cast: [...base.cast, base.cast[0]] }, [samaritan, wounded], context, lukeCast)).toBe("scene evidence repeats a cast entry");
    expect(sceneGroundingProblem({ ...base, cast: [...base.cast, { ...base.cast[0], entryId: "stranger" }] }, [samaritan, wounded], context, lukeCast)).toBe("scene evidence names unknown cast stranger");
    expect(sceneGroundingProblem({ ...base, cast: [base.cast[0]] }, [samaritan, wounded], context, lukeCast)).toBe(`cast ${wounded} has no scene evidence`);
  });
});
