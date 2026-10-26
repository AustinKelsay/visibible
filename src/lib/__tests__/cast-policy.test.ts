/** Moment-cast v6 policy: uncast incidental figures, narrow missing-cast reports and continuing locations. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAN_SYSTEM, MOMENT_CAST_PROMPT_VERSION } from "../engine/preparation";
import { ENGINE_RULES, GENERIC_PROMPT_VERSION } from "../engine/prompt";
import { sceneGroundingProblem } from "../engine/scene-grounding";
import { momentContext, readWorkInputs } from "../engine/work-inputs";

const randomRun = new URL("../../../llm/releases/2026-10-23-random-verse-check/", import.meta.url);

describe("moment-cast v6 cast policy", () => {
  it("lets plans describe uncast incidental figures and reserves missingCast for recurring named characters", () => {
    expect(MOMENT_CAST_PROMPT_VERSION).toBe("2026-10-26-moment-cast-v10");
    expect(PLAN_SYSTEM).not.toContain("omit unselected figures rather than describing them as background");
    expect(PLAN_SYSTEM).toContain("never describe an available cast member without selecting it");
    expect(PLAN_SYSTEM).toContain("People, crowds, roles and animals with no cast entry may be described by role and situation");
    expect(PLAN_SYSTEM).toContain("Report `missingCast` when the moment requires a named character or group whom the story follows beyond this moment");
    expect(PLAN_SYSTEM).toContain("this applies to secondary characters as well as the main actor");
    expect(PLAN_SYSTEM).toContain("Never report a role, a generic crowd or an animal, a person named only in passing");
    expect(PLAN_SYSTEM).toContain("A recurring named group is not a generic crowd, even when it appears as one.");
    expect(PLAN_SYSTEM).toContain("If an available cast member's presence is uncertain, choose an instant the text establishes rather than reporting it missing.");
    expect(PLAN_SYSTEM).toContain("A moment without an event (a list, law, saying or greeting) still gets a scene");
  });

  it("tells rendering that only selected characters have fixed canon, without banning the plan's incidental figures", () => {
    expect(GENERIC_PROMPT_VERSION).toBe("2026-10-26-generic-v8");
    const rule = ENGINE_RULES.join("\n");
    expect(rule).toContain("Depict the SELECTED CHARACTERS, including groups and no-form subjects, with their canon.");
    expect(rule).toContain("as unnamed incidental figures without fixed appearance");
    expect(rule).not.toContain("Depict only the SELECTED CHARACTERS");
  });

  it("accepts the retained Megiddo reply that anchored a continuing location in the previous verse", async () => {
    const set = JSON.parse(readFileSync(new URL("sample-set.json", randomRun), "utf8"));
    const traces = readFileSync(new URL("provider.ndjson", randomRun), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const sample = set.samples.find((s: { verse: string }) => s.verse === "2-chronicles-35-21");
    const reply = JSON.parse(traces.filter((t: { phase: string; request: { response_format: { json_schema: { name: string } } } }) => t.phase === `s${String(sample.index).padStart(3, "0")}` && t.request.response_format.json_schema.name === "scene_plan").at(-1).response.choices[0].message.content);
    const entries = sample.keys.filter((k: string) => k.startsWith("entry:")).map((k: string) => set.records[k]);
    const castIds = entries.map((e: { recordId: string }) => e.recordId);
    const continuing = entries.filter((e: { payload: { entryKind: string } }) => e.payload.entryKind !== "character").map((e: { recordId: string }) => e.recordId);
    expect(continuing).toContain("megiddo");
    const { work } = await readWorkInputs("bible-web");
    const moment = set.records[`moment:${sample.momentId}`].payload, section = set.records[`section:${sample.sectionId}`].payload;
    const context = momentContext(work, { id: sample.momentId, firstUnit: moment.firstUnit, lastUnit: moment.lastUnit }, { firstUnit: section.firstUnit, lastUnit: section.lastUnit });
    expect(sceneGroundingProblem(reply.grounding, reply.present, context, castIds)).toBe("cast megiddo lacks current-moment evidence");
    expect(sceneGroundingProblem(reply.grounding, reply.present, context, castIds, continuing)).toBeNull();
  });
});
