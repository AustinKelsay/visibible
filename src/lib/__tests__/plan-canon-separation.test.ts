/** Retained live failure through ordinary planning; scripted replay is not model-obedience evidence. */
import { withCleanReview } from "../../../tests/fixtures/plan-review";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { FORMLESS_LOOK_PROMPT_VERSION, prepareMoment, type AnalysisRecord, type PreparationStore } from "../engine/preparation";
import { assembleRendering, type AssembleDeps } from "../engine/assemble";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { responseSchema } from "../reading-pass/prompts";
import { selectionReply, withGrounding } from "../../../tests/fixtures/scene-grounding";

const evidence = new URL("../../../llm/releases/2026-10-22-daniel-placement-v4/", import.meta.url);
const input = JSON.parse(readFileSync(new URL("plan-input.json", evidence), "utf8"));
const trace = readFileSync(new URL("text-provider.ndjson", evidence), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const retainedContent: string = trace.find((row) => row.phase === "plan").response.choices[0].message.content;
const retainedPlan = JSON.parse(retainedContent);
const canon = JSON.parse(readFileSync(new URL("canon.json", evidence), "utf8")).result;

async function plan(content = retainedContent, showing?: unknown) {
  const inputs = await readWorkInputs("bible-web");
  const records: AnalysisRecord[] = structuredClone(input.records);
  // Synthetic model assertions deliberately overclaim this real quote's meaning. Keep every
  // retained scene field unchanged to show grounding syntax does not validate its interpretation.
  // Isolate the plan from a look refresh. The separate look regressions
  // replay historical inputs without this marker and exercise ordinary refresh behavior.
  records.find((r) => r.kind === "look")!.inputs.push({ kind: "prompt", recordId: "section_look_formless_presence", version: FORMLESS_LOOK_PROMPT_VERSION });
  if (showing !== undefined) {
    const entry = records.find((r) => r.kind === "entry" && r.recordId === canon.entryId)!;
    entry.payload.stages = (entry.payload.stages as Array<{ id: string }>).map((stage) =>
      stage.id === canon.stages[0].id ? { ...stage, showing } : stage);
    entry.version = contentVersion(entry.payload);
    // Leave the old look's dependency refs alone: ordinary preparation must remake it.
  }
  const frozenLook = records.find((r) => r.kind === "look")!.payload;
  const requests: TextModelRequest[] = [];
  const write = vi.fn<PreparationStore["putDerivedRecord"]>(async (args) => {
    const version = contentVersion(args.payload);
    const index = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId);
    const record = { ...args, version, source: "generated" as const };
    if (index === -1) records.push(record); else records[index] = record;
    return { version };
  });
  const spend = vi.fn<PreparationStore["recordSpend"]>(async () => {});
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => records.find((r) => r.kind === kind && r.recordId === id) ?? null,
    putDerivedRecord: write, claim: async () => ({ held: true }), release: async () => {}, recordSpend: spend,
  };
  const model: TextModel = withCleanReview({ id: "scripted", complete: async (request) => {
    requests.push(request);
    const answer = request.schemaName === "section_look" ? JSON.stringify({ place: frozenLook.place, timeOfDay: frozenLook.timeOfDay,
      weather: frozenLook.weather, light: frozenLook.light, clothing: frozenLook.clothing }) : JSON.stringify(withGrounding({ ...JSON.parse(content), missingCast: [] }, input.context.moment.text));
    return { content: answer, model: "scripted", providerRequestId: null, finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }, elapsedMs: 0 };
  } });
  const result = await prepareMoment({ workId: "bible-web", momentId: "daniel-7-9", store, model,
    brief: inputs.brief, briefVersion: inputs.briefVersion, context: input.context, holder: "canon-separation-test" });
  const getReference = vi.fn<AssembleDeps["getReference"]>(async () => null);
  const render = (styleId: string) => assembleRendering({ inputs, store, model, listMoments: async () => [], getReference,
    loadReference: async () => { throw new Error("No test reference should load"); } },
  { workId: "bible-web", unitId: "daniel-7-9", styleId, variationNumber: 1, aspectRatio: "16:9" });
  return { result, requests, write, spend, render, getReference };
}

describe("no-form plan and canon separation", () => {
  it("keeps source context but no no-form canon in planning while retaining the owner look for rendering", async () => {
    const { result, requests } = await plan();
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.user).toContain(input.context.moment.text);
    expect(request.user).toContain(input.records.find((record: AnalysisRecord) => record.kind === "look").payload.clothing);
    expect(request.user).toContain("OWNER LOOK CONSTRAINTS");
    expect(result.look.version).toBe(input.overlay.frozenLookVersion);
    // Since formless-effects v14 no-form canon never reaches planning; the addendum asks only for the text's effects in plain words.
    expect(request.user).not.toContain(canon.stages[0].text);
    expect(request.user).not.toContain("NO-FORM CANON CONSTRAINTS");
    expect(request.system).toContain("describe in your own plain words only the physical effects the text names");
    // Moment-cast v12: no separate conditions reply; the scene fields carry place and time, and owner constraints stay binding.
    expect(request.system).toContain("The scene fields carry this moment's place, time, light and situational clothing.");
    expect(request.system).toContain("OWNER LOOK CONSTRAINTS, when given instead, are binding: keep the setting and time of day consistent with them.");
    expect(request.system).toContain("Never name it or call it seated, standing, enthroned or riding, and leave out its throne, seat, chariot, robe, train or hem");
    expect(input.request.system).not.toContain("effect names for placement");
    const serialized = responseSchema(request.schema);
    const properties = serialized.properties as Record<string, { description: string }>;
    for (const field of ["primarySubject", "action"]) {
      expect(properties[field].description).toContain("describe only the smoke, cloud, fire, wind or light the text names, never the entry itself");
    }
    expect(properties.timeOfDay.description).toContain("situational light");
  });

  it.each([["historical", undefined], ["structured", canon.stages[0].showing]])("retains the exact schema-valid live restatement with %s canon without silently rewriting or retrying it", async (_label, showing) => {
    const { result, requests, write, spend } = await plan(retainedContent, showing);
    const plans = requests.filter((r) => r.schemaName === "scene_plan");
    expect(plans).toHaveLength(1);
    expect(plans[0].schema.safeParse(selectionReply(withGrounding({ ...retainedPlan, missingCast: [] }, input.context.moment.text))).success).toBe(true);
    expect(result.plan.payload).toEqual(retainedPlan);
    expect(result.plan.payload.primarySubject).toBe("Radiance above an unoccupied fiery throne; Daniel stands below, gazing upward.");
    expect(result.plan.payload.secondaryElements).toContain("soft white cloud");
    expect(result.plan.payload.secondaryElements).toContain("brilliant white light");
    expect(result.present.map((p) => p.entryId)).toEqual(retainedPlan.present);
    expect(write.mock.calls.filter(([args]) => args.kind === "plan")).toHaveLength(1);
    expect(spend.mock.calls.filter(([args]) => args.kind === "plan").map(([args]) => args.outcome)).toEqual(["ok", "review ok"]);
    expect(spend).toHaveBeenCalledWith(expect.objectContaining({ outcome: "ok", costUsd: 0 }));
  });

  it("gives planning no structured canon or effect names for a no-form subject, and keeps its canon out of rendering", async () => {
    const situational = { ...retainedPlan, secondaryElements: "Burning wheels at the throne; Daniel's cloak catches the firelight." };
    const { result, requests, write, render, getReference } = await plan(JSON.stringify(situational), canon.stages[0].showing);
    expect(requests.map((r) => r.schemaName)).toEqual(["scene_plan"]);
    expect(write).toHaveBeenCalledTimes(1); // Canon metadata refreshes the plan while the literal owner look survives.
    expect(result.look.payload).toEqual(Object.fromEntries(["place", "timeOfDay", "weather", "light", "clothing"].map((key) =>
      [key, input.records.find((r: AnalysisRecord) => r.kind === "look").payload[key]])));
    const request = requests[0];
    expect(request.user).not.toContain("effect names for placement");
    expect(request.user).not.toContain(`${canon.entryId} (stage:`);
    for (const phrase of [canon.stages[0].text, "brilliant white radiance", "bright orange fire", "soft white cloud", "brilliant white light"]) {
      expect(request.user).not.toContain(phrase);
      expect(requests[0].user).not.toContain(phrase);
    }
    expect(request.user).toContain(input.context.moment.text);
    const versions = [];
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const rendered = await render(styleId);
      if (!rendered.ok) throw new Error(rendered.message);
      versions.push(rendered.packet.planVersion);
      expect(rendered.canon).toContainEqual(expect.objectContaining({ entryId: canon.entryId, stageId: canon.stages[0].id, text: canon.stages[0].text, hasForm: false }));
      // Rendering never describes the subject (generic-v11): neither its canon nor its name label reaches the prompt.
      const described = canon.stages[0].text.replace(/^[^:\n]{1,80}:\s*/, "");
      expect(described).not.toBe(canon.stages[0].text);
      expect(rendered.prompt).not.toContain(described);
      expect(rendered.prompt).toContain("UNSEEN PRESENCE (binding)");
      expect(rendered.prompt).not.toContain(canon.stages[0].text);
      expect(rendered.prepared.plan.payload).toEqual(situational);
      expect(rendered.context).toEqual(input.context);
      expect(rendered.prompt).not.toContain("effect names for placement");
    }
    expect(new Set(versions).size).toBe(1);
    expect(requests).toHaveLength(1);
    expect(getReference.mock.calls.filter(([kind]) => kind === "sheet").map(([, id]) => id)).not.toContain(`${canon.entryId}:${canon.stages[0].id}`);
  });

  it.each([
    ["empty", []],
    ["malformed", [{ effect: "a figure of light" }]],
    ["stale after a prose edit", [{ effect: "radiance", colour: "gold", brightness: "bright" }]],
  ])("gives planning no no-form canon when showing is %s", async (_label, showing) => {
    const { requests } = await plan(retainedContent, showing);
    expect(requests[0].user).not.toContain(canon.stages[0].text);
    expect(requests[0].user).not.toContain("effect names for placement");
    expect(requests[0].user).toContain(`- ${canon.entryId}: `);
  });

  it("keeps situational colors and lighting and formed characters' clothing without a word filter", async () => {
    const situational = { ...retainedPlan,
      primarySubject: "Radiance spreads above an unoccupied seat; Daniel watches from below.",
      secondaryElements: "Daniel's cloak catches the firelight as he turns toward the seat.",
      timeOfDay: "Night; orange firelight falls across the floor near the seat.",
    };
    const { result, requests } = await plan(JSON.stringify(situational));
    expect(requests).toHaveLength(1);
    expect(result.plan.payload).toEqual(situational);
  });
});
