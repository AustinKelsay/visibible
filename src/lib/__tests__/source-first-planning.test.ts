import { withSituation } from "../../../tests/fixtures/scene-grounding";
/** Captured shared looks at the production request/assembly seam; scripted replies prove input isolation only. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reviewReply } from "../../../tests/fixtures/plan-review";
import { assembleRendering } from "../engine/assemble";
import { createMemoryPreparationStore } from "../engine/memory-store";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";

const release = new URL("../../../llm/releases/2026-10-23-source-identity-check/", import.meta.url);
const traces = readFileSync(new URL("provider.ndjson", release), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const set = JSON.parse(readFileSync(new URL("../2026-10-23-cast-policy-check/sample-set.json", release), "utf8"));
const sample = set.samples.find((s: { momentId: string }) => s.momentId === "lamentations-4-7");

describe("source-first scene planning", () => {
  it.each([1, 2])("retains look %i as advisory provenance while rendering only resolved conditions", async (repeat) => {
    const look = JSON.parse(traces.find((r) => r.phase === `identity-s034-${repeat}` && r.request.response_format.json_schema.name === "section_look").response.choices[0].message.content);
    const memory = createMemoryPreparationStore(sample.keys.map((key: string) => set.records[key]).filter((r: { kind: string }) => r.kind !== "look" && r.kind !== "plan"));
    const inputs = await readWorkInputs("bible-web");
    const calls: TextModelRequest[] = [];
    let reviews = 0;
    const fields = { primarySubject: "Unnamed nobles standing together", action: "The nobles stand upright with composed bearing", setting: "an open space",
      secondaryElements: "", mood: "solemn", timeOfDay: "day", composition: "The nobles stand together in one view" };
    const model: TextModel = { id: "scripted", complete: async (request) => {
      calls.push(request);
      // Exercise the real re-plan too. This scripted problem is a pipeline probe, not a semantic score.
      if (request.schemaName === "plan_review") return reviewReply(++reviews === 1 ? [{ kind: "outside_instant", entryId: "", planQuote: fields.primarySubject, reason: "Scripted review probe; choose another source-supported instant." }] : []);
      const value = request.schemaName === "section_look" ? look : { ...fields, missingCast: [], selectedCast: [], consideredCast: [],
        grounding: { focusQuote: "Her nobles were purer than snow.", instant: "The nobles stand together.", singleInstant: true } };
      return { content: JSON.stringify(withSituation(value)), model: "scripted", providerRequestId: null, finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0001 }, elapsedMs: 0 };
    } };
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const result = await assembleRendering({ inputs, store: memory.store, model, listMoments: memory.listMoments,
        getReference: async () => null, loadReference: async () => { throw Error("No reference expected"); } },
      { workId: "bible-web", unitId: "lamentations-4-7", styleId, variationNumber: 1, aspectRatio: "16:9" });
      if (!result.ok) throw Error(result.message);
      expect(result.prepared.calls).toBe(styleId === "classical" ? 5 : 0);
      expect(result.prepared.look.payload).toEqual(look);
      expect(result.prompt).not.toContain(look.clothing);
      expect(result.prompt).not.toContain(look.light);
      expect(result.prompt).toContain(result.prepared.situation.light);
      expect(result.prepared.plan.payload).toEqual({ present: [], ...fields });
    }
    const plans = calls.filter((c) => c.schemaName === "scene_plan");
    expect(plans).toHaveLength(2);
    for (const request of plans) {
      expect(request.user).toContain("Her nobles were purer than snow.");
      expect(request.user).toContain("CAST ON STAGE IN THIS SECTION");
      expect(request.user).toContain("NO-FORM CANON CONSTRAINTS");
      expect(request.user).toContain("SECTION LOOK GUIDE (advisory; not rendered)");
      for (const value of Object.values(look)) expect(request.user).toContain(value);
    }
    expect(plans[1].user).toContain("A PREVIOUS PLAN FOR THIS MOMENT WAS REJECTED");
    expect((await memory.store.getActiveRecord("plan", sample.momentId))?.payload).toMatchObject({ entries: [], plan: fields, review: { rounds: 2 } });
    expect(memory.ledger).toHaveLength(5);
  });
});
