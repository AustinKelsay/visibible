import { withSituation } from "../../../tests/fixtures/scene-grounding";
/** The model selects cast once; source validation and semantic review still decide acceptance. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { reviewReply } from "../../../tests/fixtures/plan-review";
import { createMemoryPreparationStore } from "../engine/memory-store";
import { prepareMoment } from "../engine/preparation";
import { sceneGroundingProblem } from "../engine/scene-grounding";
import { momentContext, readWorkInputs } from "../engine/work-inputs";
import type { AnalysisRecord } from "../engine/preparation";
import type { TextModelRequest } from "../reading-pass/model";
import type { WorkBrief } from "../work-preparation";

const text = "Mara holds the lantern. I tell her story.";
const fields = { primarySubject: "Mara stands beside the door", action: "holds the lantern", setting: "workshop",
  secondaryElements: "", mood: "quiet", timeOfDay: "day", composition: "Mara and the lantern in one view" };
const evidence = (entryId: string, momentQuote = "Mara holds the lantern") => ({ entryId, momentQuote, contextSource: "none", contextQuote: "" });
const reply = () => ({ grounding: { focusQuote: "Mara holds the lantern", instant: "Mara stands holding the lantern.", singleInstant: true },
  selectedCast: [evidence("mara"), evidence("lantern")],
  consideredCast: [{ ...evidence("narrator", "I tell her story"), participation: "framing" }], missingCast: [], ...fields });
const brief: WorkBrief = { schemaVersion: 1, workId: "selection", tone: "Quiet", depictionRules: [], styleIds: ["classical"],
  eras: [{ id: "workshop", label: "Workshop", people: "Workers", dress: "Tunics", buildingsAndObjects: "Tools", technology: "Hand tools" }] };

function setup(answer: unknown, problems: unknown[] = []) {
  const memory = createMemoryPreparationStore([
    { kind: "moment", recordId: "m1", payload: { kind: "moment", sectionId: "s1", firstUnit: "m1", lastUnit: "m1" } },
    { kind: "section", recordId: "s1", payload: { kind: "section", title: "Workshop", eraId: "workshop", cast: ["mara", "lantern", "narrator"].map((entryId) => ({ entryId, stageId: "main" })) } },
    ...["mara", "lantern", "narrator"].map((recordId) => ({ kind: "entry", recordId, payload: { kind: "entry", name: recordId, entryKind: recordId === "lantern" ? "object" : "character", hasForm: true, stages: [{ id: "main", text: `${recordId}: plain appearance.` }] } })),
  ]);
  const calls: TextModelRequest[] = [];
  const run = () => prepareMoment({ workId: "selection", momentId: "m1", store: memory.store, brief, briefVersion: "b1",
    context: { moment: { id: "m1", reference: "1", text }, previous: null, next: null },
    model: { id: "scripted", complete: async (request) => {
      calls.push(request);
      if (request.schemaName === "plan_review") return reviewReply(problems);
      const value = request.schemaName === "section_look" ? { place: "Workshop", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "tunics" } : answer;
      return { content: JSON.stringify(withSituation(value)), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }, elapsedMs: 0 };
    } } });
  return { run, calls, ...memory };
}

describe("one explicit cast selection", () => {
  it.each([
    ["pipeline-s001-2", 1, "cast god_yahweh_the_father_and_god_of_israel has no scene evidence"],
    ["pipeline-s027-2", 27, "cast god_yahweh_the_father_and_god_of_israel is framing, not participating in the chosen instant"],
    ["pipeline-s034-2", 34, "cast yahweh_s_house_in_jerusalem_the_temple has no scene evidence"],
    ["pipeline-s034-3", 34, "cast the_priests_of_jerusalem is framing, not participating in the chosen instant"],
  ])("reproduces the retained contradiction in %s and refuses its obsolete two-list response", async (id, index, problem) => {
    const providers = readFileSync(new URL("../../../llm/releases/2026-10-23-source-pose-check/provider.ndjson", import.meta.url), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const last = providers.filter((row) => row.phase === id && row.request.response_format.json_schema.name === "scene_plan").at(-1)!;
    const old = JSON.parse(last.response.choices[0].message.content);
    const set = JSON.parse(readFileSync(new URL("../../../llm/releases/2026-10-23-cast-policy-check/sample-set.json", import.meta.url), "utf8"));
    const sample = set.samples.find((sample: { index: number }) => sample.index === index);
    const records: AnalysisRecord[] = sample.keys.map((key: string) => set.records[key]);
    const moment = records.find((record) => record.kind === "moment")!, section = records.find((record) => record.kind === "section")!;
    const inputs = await readWorkInputs("bible-web");
    const context = momentContext(inputs.work, { id: sample.momentId, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) },
      { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
    const cast = (section.payload.cast as Array<{ entryId: string }>).map((entry) => entry.entryId);
    const continuing = records.filter((record) => record.kind === "entry" && ["location", "object"].includes(String(record.payload.entryKind))).map((record) => record.recordId);
    expect(sceneGroundingProblem(old.grounding, old.present, context, cast, continuing)).toBe(problem);
    const { run, calls } = setup(reply());
    await run();
    expect(calls.find((request) => request.schemaName === "scene_plan")!.schema.safeParse(old).success).toBe(false);
  });

  it("derives stored IDs and in_scene evidence from exactly the same records, preserving excluded audit entries", async () => {
    const value = reply(), { run, store, calls } = setup(value);
    const result = await run();
    expect(result.present.map((entry) => entry.entryId)).toEqual(["mara", "lantern"]);
    expect(result.plan.payload).toEqual({ present: ["mara", "lantern"], ...fields });
    expect((await store.getActiveRecord("plan", "m1"))?.payload).toMatchObject({
      entries: [{ entryId: "mara", stageId: "main" }, { entryId: "lantern", stageId: "main" }], plan: fields,
      grounding: { ...value.grounding, cast: [...value.selectedCast.map((entry) => ({ ...entry, participation: "in_scene" })), ...value.consideredCast] },
    });
    expect(calls.map((request) => request.schemaName)).toEqual(["section_look", "scene_plan", "plan_review"]);
    const review = calls.at(-1)!;
    expect(review.user).toContain("mara");
    expect(review.user).not.toContain("contextQuote");
  });

  it.each([
    ["unknown ID", () => ({ ...reply(), selectedCast: [evidence("unknown")] })],
    ["duplicate ID", () => ({ ...reply(), selectedCast: [evidence("mara"), evidence("mara")] })],
    ["missing evidence", () => ({ ...reply(), selectedCast: [{ entryId: "mara" }] })],
    ["selected participation classification", () => ({ ...reply(), selectedCast: [{ ...evidence("mara"), participation: "framing" }] })],
    ["considered in_scene", () => ({ ...reply(), consideredCast: [{ ...evidence("narrator"), participation: "in_scene" }] })],
    ["independent present list", () => ({ ...reply(), present: ["narrator"] })],
    ["independent evidence list", () => ({ ...reply(), grounding: { ...reply().grounding, cast: [] } })],
    ["selected and considered overlap", () => ({ ...reply(), consideredCast: [{ ...evidence("mara"), participation: "framing" }] })],
    ["invented quote", () => ({ ...reply(), selectedCast: [evidence("mara", "Mara sits down")] })],
  ])("refuses %s without dropping a selected entry or storing a plan", async (_name, value) => {
    const { run, has, calls } = setup(value());
    await expect(run()).rejects.toThrow("plan unavailable");
    expect(has("plan", "m1")).toBe(false);
    expect(calls.filter((request) => request.schemaName === "scene_plan")).toHaveLength(2);
    expect(calls.some((request) => request.schemaName === "plan_review")).toBe(false);
  });

  it("still refuses a semantically unsupported selection after one re-plan", async () => {
    const value = reply();
    value.selectedCast.push(evidence("narrator", "I tell her story"));
    value.consideredCast = [];
    value.primarySubject = "Mara stands beside the narrator";
    const { run, calls, has } = setup(value, [{ kind: "outside_instant", entryId: "narrator", planQuote: "beside the narrator", reason: "The narrator tells the story but is not inside its scene." }]);
    await expect(run()).rejects.toThrow("plan review: outside_instant narrator");
    expect(calls.map((request) => request.schemaName)).toEqual(["section_look", "scene_plan", "plan_review", "scene_plan", "plan_review"]);
    expect(has("plan", "m1")).toBe(false);
  });
});
