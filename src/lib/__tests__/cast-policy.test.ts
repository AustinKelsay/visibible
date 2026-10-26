/** Cast policy: uncast incidental figures, no missing-cast stop (moment-cast v11) and continuing locations. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAN_SYSTEM, MOMENT_CAST_PROMPT_VERSION } from "../engine/preparation";
import { ENGINE_RULES, GENERIC_PROMPT_VERSION } from "../engine/prompt";
import { sceneGroundingProblem } from "../engine/scene-grounding";
import { momentContext, readWorkInputs } from "../engine/work-inputs";

const randomRun = new URL("../../../llm/releases/2026-10-23-random-verse-check/", import.meta.url);

describe("cast policy", () => {
  it("lets plans describe uncast incidental figures and never stops for missing canon", () => {
    expect(MOMENT_CAST_PROMPT_VERSION).toBe("2026-10-27-moment-cast-v11");
    expect(PLAN_SYSTEM).not.toContain("omit unselected figures rather than describing them as background");
    expect(PLAN_SYSTEM).toContain("list every section cast entry that will be visible");
    expect(PLAN_SYSTEM).toContain("Anyone without a cast entry may appear as an unnamed role or crowd when the moment needs them.");
    expect(PLAN_SYSTEM).toContain("If it has no event (a list, law, saying or greeting), illustrate its content or setting.");
    // The forgiving contract has no missing-cast report: a named person without canon is drawn generically.
    expect(PLAN_SYSTEM).not.toContain("missingCast");
    expect(PLAN_SYSTEM).not.toContain("preparation will stop");
  });

  it("tells rendering that only selected characters have fixed canon, without banning the plan's incidental figures", () => {
    expect(GENERIC_PROMPT_VERSION).toBe("2026-10-27-generic-v9");
    const rule = ENGINE_RULES.join("\n");
    expect(rule).toContain("Show the SELECTED CHARACTERS with their canon.");
    expect(rule).toContain("Anyone else appears only as an unnamed figure the scene plan describes.");
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
