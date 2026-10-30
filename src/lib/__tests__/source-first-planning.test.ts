import { selectionReply } from "../../../tests/fixtures/scene-grounding";
/** Captured shared looks at the production request/assembly seam; scripted replies prove input isolation only. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assembleRendering } from "../engine/assemble";
import { createMemoryPreparationStore } from "../engine/memory-store";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";

const release = new URL("../../../llm/releases/2026-10-23-source-identity-check/", import.meta.url);
const traces = readFileSync(new URL("provider.ndjson", release), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const set = JSON.parse(readFileSync(new URL("../2026-10-23-cast-policy-check/sample-set.json", release), "utf8"));
const sample = set.samples.find((s: { momentId: string }) => s.momentId === "lamentations-4-7");

describe("source-first scene planning", () => {
  it.each([1, 2])("retains look %i as advisory provenance and renders only the plan's own setting and time", async (repeat) => {
    const look = JSON.parse(traces.find((r) => r.phase === `identity-s034-${repeat}` && r.request.response_format.json_schema.name === "section_look").response.choices[0].message.content);
    const memory = createMemoryPreparationStore(sample.keys.map((key: string) => set.records[key]).filter((r: { kind: string }) => r.kind !== "look" && r.kind !== "plan"));
    const inputs = await readWorkInputs("bible-web");
    const calls: TextModelRequest[] = [];
    const fields = { primarySubject: "Unnamed nobles standing together", action: "The nobles stand upright with composed bearing", setting: "an open space",
      secondaryElements: "", mood: "solemn", timeOfDay: "day", composition: "The nobles stand together in one view" };
    const model: TextModel = { id: "scripted", complete: async (request) => {
      calls.push(request);
      const value = request.schemaName === "section_look" ? look : { ...fields, missingCast: [], selectedCast: [], consideredCast: [],
        grounding: { focusQuote: "Her nobles were purer than snow.", instant: "The nobles stand together.", singleInstant: true } };
      // The retained-era reply shape is converted to the general planner reply.
      return { content: JSON.stringify(selectionReply(value)), model: "scripted", providerRequestId: null, finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0001 }, elapsedMs: 0 };
    } };
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const result = await assembleRendering({ inputs, store: memory.store, model, listMoments: memory.listMoments,
        getReference: async () => null, loadReference: async () => { throw Error("No reference expected"); } },
      { workId: "bible-web", unitId: "lamentations-4-7", styleId, variationNumber: 1, aspectRatio: "16:9" });
      if (!result.ok) throw Error(result.message);
      expect(result.prepared.calls).toBe(styleId === "classical" ? 1 : 0);
      expect(result.prepared.look).toBeNull();
      expect(result.prompt).not.toContain(look.clothing);
      expect(result.prompt).not.toContain(look.light);
      expect(result.prompt).not.toContain(look.place);
      // A generated guide renders no conditions block; the plan's own fields carry setting and time.
      expect(result.prepared.situation).toBeNull();
      expect(result.prompt).not.toContain("MOMENT CONDITIONS");
      expect(result.prompt).toContain(`Setting: ${fields.setting}`);
      expect(result.prompt).toContain(`Time of day: ${fields.timeOfDay}`);
      expect(result.prepared.plan.payload).toEqual({ present: [], ...fields });
    }
    const plans = calls.filter((c) => c.schemaName === "scene_plan");
    expect(plans).toHaveLength(1);
    for (const request of plans) {
      expect(request.user).toContain("Her nobles were purer than snow.");
      expect(request.user).toContain("CAST ON STAGE IN THIS SECTION");
      expect(request.user).not.toContain("NO-FORM CANON CONSTRAINTS");
      expect(request.user).not.toContain("SECTION LOOK GUIDE");
      for (const value of Object.values(look)) expect(request.user).not.toContain(value);
    }
    expect((await memory.store.getActiveRecord("plan", sample.momentId))?.payload).toMatchObject({ entries: [], plan: fields });
    expect(memory.ledger).toHaveLength(1);
  });
});
