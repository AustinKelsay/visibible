/** Scripted reviews verify cache refresh and canon delivery; live semantic checks are retained separately. */
import { describe, expect, it } from "vitest";
import { reviewReply } from "../../../tests/fixtures/plan-review";
import { withGrounding } from "../../../tests/fixtures/scene-grounding";
import { assembleRendering } from "../engine/assemble";
import { createMemoryPreparationStore } from "../engine/memory-store";
import { prepareMoment } from "../engine/preparation";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { createWorkReader } from "../work-input";
import type { WorkInputs } from "../engine/work-inputs";
import { SHARED_STYLES } from "../work-preparation";

const text = "The Presence shone above the camp as the witness stood nearby.";
const fields = { primarySubject: "The witness stands in the camp", action: "radiance spreads above the camp",
  setting: "open ground", secondaryElements: "", mood: "reverent", timeOfDay: "day", composition: "wide view of the witness beneath the radiance" };
const reply = (selected: boolean) => withGrounding({ missingCast: [], present: selected ? ["witness", "presence"] : ["witness"], ...fields }, text);
const problem = { kind: "unselected_figure", entryId: "presence", planQuote: "radiance spreads above the camp", reason: "The radiance represents the unselected no-form Presence." };

async function setup(repair: boolean) {
  const inputs: WorkInputs = {
    work: createWorkReader({ schemaVersion: 1, id: "presence-work", title: "Presence", author: "Fixture", language: "en",
      referenceText: { name: "Fixture", source: "https://example.com", credit: "Test", sha256: "0".repeat(64) },
      levels: ["Part", "Line"], referenceFormats: { Part: "{Part} {Line}" }, momentMode: "unit",
      divisions: [{ key: "m", label: "Camp", level: "Part", units: [{ number: 1, text }] }] }),
    workVersion: "wv", briefVersion: "bv",
    brief: { schemaVersion: 1, workId: "presence-work", tone: "Quiet", depictionRules: [], styleIds: ["classical"], eras: [{ id: "camp", label: "Camp", people: "Witness", dress: "plain tunic", buildingsAndObjects: "tents", technology: "None" }] },
    styles: { classical: { style: SHARED_STYLES.get("classical"), version: "sv" } },
  };
  const memory = createMemoryPreparationStore([
    { kind: "moment", recordId: "m-1", payload: { kind: "moment", sectionId: "s1", firstUnit: "m-1", lastUnit: "m-1" } },
    { kind: "section", recordId: "s1", payload: { kind: "section", title: "Camp", firstUnit: "m-1", lastUnit: "m-1", cast: [{ entryId: "presence", stageId: "main" }, { entryId: "witness", stageId: "main" }] } },
    { kind: "entry", recordId: "presence", payload: { kind: "entry", name: "Presence", entryKind: "character", hasForm: false, stages: [{ id: "main", text: "Presence: radiance above the camp, without a body or human form." }] } },
    { kind: "entry", recordId: "witness", payload: { kind: "entry", name: "Witness", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Witness: an adult in a plain tunic." }] } },
  ]);
  const completion = (value: unknown) => ({ content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }, elapsedMs: 0 });
  // Seed a formerly accepted plan with the old dependency versions. Only prompt invalidation
  // can cause assembly to re-review this cached omission; the source and look stay the same.
  await prepareMoment({ workId: "presence-work", momentId: "m-1", store: memory.store, brief: inputs.brief, briefVersion: inputs.briefVersion,
    context: { moment: { id: "m-1", reference: "1", text }, previous: null, next: null },
    model: { id: "scripted", complete: async (r) => r.schemaName === "plan_review" ? reviewReply([]) : completion(r.schemaName === "section_look" ? { place: "camp", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "plain tunic" } : reply(false)) } });
  const old = (await memory.store.getActiveRecord("plan", "m-1"))!;
  await memory.store.putDerivedRecord({ kind: "plan", recordId: "m-1", payload: { ...old.payload, kind: "plan" },
    inputs: old.inputs.map((input) => input.recordId === "scene_plan_review" ? { ...input, version: "2026-10-23-plan-review-v2" }
      : input.recordId === "scene_plan_formless_presence" ? { ...input, version: "2026-10-22-formless-effects-v5" } : input) });
  const calls: TextModelRequest[] = [];
  let plans = 0, reviews = 0;
  const model: TextModel = { id: "scripted", complete: async (request) => {
    calls.push(request);
    if (request.schemaName === "plan_review") return reviewReply(++reviews === 1 || !repair ? [problem] : []);
    return completion(reply(++plans === 2 && repair));
  } };
  const render = () => assembleRendering({ inputs, store: memory.store, model, listMoments: memory.listMoments,
    getReference: async () => null, loadReference: async () => new Uint8Array() },
  { workId: "presence-work", unitId: "m-1", styleId: "classical", variationNumber: 1, aspectRatio: "16:9" });
  return { render, calls, store: memory.store };
}

describe("no-form cast selection", () => {
  it("refreshes a cached omitted presence, re-plans once, and delivers its canon and no-form rules to rendering", async () => {
    const { render, calls, store } = await setup(true);
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "plan_review", "scene_plan", "plan_review"]);
    expect(calls[2].user).toContain(problem.reason);
    expect(result.canon.find((c) => c.entryId === "presence")).toMatchObject({ hasForm: false });
    expect(result.prompt).toContain("Presence: represent only through the non-figurative presence");
    expect(result.prompt).toContain("Presence: radiance above the camp, without a body or human form.");
    expect((await store.getActiveRecord("plan", "m-1"))!.payload).toMatchObject({ review: { rounds: 2, problems: [problem] } });
    await render();
    expect(calls).toHaveLength(4);
  });

  it("stops before rendering when the replacement still omits the no-form cast", async () => {
    const { render, calls, store } = await setup(false);
    expect(await render()).toMatchObject({ ok: false, reason: "preparation", stage: "plan", retryable: true,
      message: expect.stringContaining("plan review: unselected_figure presence") });
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "plan_review", "scene_plan", "plan_review"]);
    expect((await store.getActiveRecord("plan", "m-1"))!.payload).toMatchObject({ review: { rounds: 1 } });
  });
});
