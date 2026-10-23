/** Evidence checks over retained first failures and non-Bible prose; no provider or live writes. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { withGrounding } from "../../../tests/fixtures/scene-grounding";
import { sceneGroundingProblem, sceneGroundingSchema, type SceneGrounding } from "../engine/scene-grounding";
import { assembleRendering, type AssembleDeps } from "../engine/assemble";
import type { AnalysisRecord, MomentContext, PreparationStore } from "../engine/preparation";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";

const evidence = new URL("../../../llm/releases/2026-10-22-luke-cast-repair/", import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, evidence), "utf8"));
type RetainedScene = { context: MomentContext; result: { plan: { payload: typeof fields & { present: string[] } } } };
const luke = read<RetainedScene>("scene-luke-10-34.json");
const daniel = read<RetainedScene>("scene-daniel-7-9.json");
const snapshot = read<{ records: Array<{ record: AnalysisRecord | null }> }>("final.json");
const samaritan = "the_samaritan", wounded = "wounded_traveler_in_samaritan_parable";
const fields = { primarySubject: "The Samaritan kneeling beside the wounded traveler", action: "holds a bandage against the traveler's wound",
  setting: "roadside", secondaryElements: "oil and wine beside the cloth", mood: "compassion", timeOfDay: "day", composition: "two figures close together" };
const binding = withGrounding({ present: [samaritan, wounded], missingCast: [], ...fields }, "bound up his wounds", {
  [samaritan]: "came to him, and bound up his wounds", [wounded]: "his wounds",
});
binding.grounding.cast[0].contextSource = "previous";
binding.grounding.cast[0].contextQuote = "a certain Samaritan";

async function setup(unitId: string, reply: unknown) {
  const inputs = await readWorkInputs("bible-web");
  const records: AnalysisRecord[] = structuredClone(snapshot.records.flatMap(({ record }: { record: AnalysisRecord | null }) => record ? [record] : []));
  const write = vi.fn<PreparationStore["putDerivedRecord"]>(async (args) => {
    const record = { ...args, version: contentVersion(args.payload) };
    const index = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId);
    if (index < 0) records.push(record); else records[index] = record;
    return { version: record.version };
  });
  const spend = vi.fn<PreparationStore["recordSpend"]>(async () => {});
  const release = vi.fn<PreparationStore["release"]>(async () => {});
  const store: PreparationStore = { getActiveRecord: async (kind, id) => records.find((r) => r.kind === kind && r.recordId === id) ?? null,
    putDerivedRecord: write, recordSpend: spend, claim: async () => ({ held: true }), release };
  const calls: TextModelRequest[] = [];
  const model: TextModel = { id: "scripted", complete: async (request) => {
    calls.push(request);
    return { content: JSON.stringify(reply), model: "scripted", providerRequestId: null, finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 100, costUsd: 0.0004 }, elapsedMs: 1 };
  } };
  const getReference = vi.fn<AssembleDeps["getReference"]>(async () => null);
  const render = (styleId = "classical") => assembleRendering({ inputs, store, model, getReference, listMoments: async () => [], loadReference: async () => new Uint8Array() },
    { workId: "bible-web", unitId, styleId, variationNumber: 1, aspectRatio: "16:9" });
  return { records, write, spend, release, calls, getReference, render };
}

describe("scene source grounding", () => {
  it("chooses one Luke action, resolves its pronoun from the same-section neighbor, and shares only that plan across styles", async () => {
    const { render, records, calls, write } = await setup("luke-10-34", binding);
    const versions = [];
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const result = await render(styleId);
      if (!result.ok) throw new Error(result.message);
      versions.push(result.packet.planVersion);
      expect(result.prepared.plan.payload).toEqual({ present: [samaritan, wounded], ...fields });
      expect(result.canon.map((entry) => entry.entryId)).toEqual([samaritan, wounded]);
      expect(result.prompt).not.toContain("focusQuote");
      expect(result.prompt).not.toContain("contextSource");
      expect(result.prompt).not.toContain("participation");
      expect(result.prompt).not.toContain("Innkeeper in Samaritan parable:");
    }
    expect(new Set(versions).size).toBe(1);
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan"]);
    expect(write).toHaveBeenCalledOnce();
    expect(records.find((r) => r.kind === "plan" && r.recordId === "luke-10-34")?.payload).toMatchObject({ grounding: binding.grounding, plan: fields });
    expect(calls[0].user.indexOf("MOMENT (")).toBeLessThan(calls[0].user.indexOf("SECTION LOOK ("));
    expect(calls[0].system).toContain("choose one representative instant");
    expect(calls[0].system).toContain("A first-person report of seeing or telling is framing evidence");
  });

  it.each([
    ["successive poses", () => ({ ...binding, ...luke.result.plan.payload, grounding: { ...binding.grounding, singleInstant: false } }), "successive instants"],
    ["next-event host", () => {
      const reply = withGrounding({ ...luke.result.plan.payload, missingCast: [] }, "bound up his wounds");
      const host = reply.grounding.cast.find((entry) => entry.entryId === "innkeeper_in_samaritan_parable")!;
      host.momentQuote = "gave them to the host"; host.contextSource = "next"; host.contextQuote = "gave them to the host";
      return reply;
    }, "innkeeper_in_samaritan_parable lacks current-moment evidence"],
    ["framing narrator", () => {
      const reply = withGrounding({ ...daniel.result.plan.payload, missingCast: [] }, "thrones were placed");
      reply.grounding.cast[0].momentQuote = "I watched";
      reply.grounding.cast[0].participation = "framing";
      return reply;
    }, "daniel_prophet_of_babylon is framing"],
    ["neighbor-only assembly", () => {
      const reply = withGrounding({ ...daniel.result.plan.payload, missingCast: [] }, "thrones were placed");
      const assembly = reply.grounding.cast[2];
      assembly.momentQuote = "Thousands of thousands ministered to him";
      assembly.contextSource = "next"; assembly.contextQuote = assembly.momentQuote;
      return reply;
    }, "ministering_assembly_in_daniels_vision lacks current-moment evidence"],
  ])("stops the first structurally valid reported %s without changing the retained plan or loading references", async (label, reply, message) => {
    const unitId = label === "framing narrator" || label === "neighbor-only assembly" ? "daniel-7-9" : "luke-10-34";
    const { render, records, calls, write, spend, release, getReference } = await setup(unitId, reply());
    const before = structuredClone(records.find((r) => r.kind === "plan" && r.recordId === unitId));
    expect(await render()).toMatchObject({ ok: false, reason: "preparation", stage: "plan", retryable: true, message: expect.stringContaining(message) });
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan"]);
    expect(write).not.toHaveBeenCalled();
    expect(getReference).not.toHaveBeenCalled();
    expect(spend).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: "unavailable", costUsd: 0.0004 }));
    expect(release).toHaveBeenCalledOnce();
    expect(records.find((r) => r.kind === "plan" && r.recordId === unitId)).toEqual(before);
  });

  it("rejects the exact old reply without the new evidence contract, preserving it as historical evidence", async () => {
    const { render, calls, records, write } = await setup("luke-10-34", { ...luke.result.plan.payload, missingCast: [] });
    const before = structuredClone(records.find((r) => r.kind === "plan" && r.recordId === "luke-10-34"));
    expect(await render()).toMatchObject({ ok: false, reason: "preparation", stage: "plan" });
    expect(calls).toHaveLength(2); // Existing malformed-contract retry only, not a quality reroll.
    expect(write).not.toHaveBeenCalled();
    expect(records.find((r) => r.kind === "plan" && r.recordId === "luke-10-34")).toEqual(before);
  });

  const prose: MomentContext = { moment: { id: "tale-2", reference: "The Tale ¶2–3", text: "She knelt beside the broken lantern. Then she stood and carried it outside." },
    previous: { text: "Mara entered the workshop carrying a lantern." }, next: { text: "At dawn the merchant arrived at the inn." } };
  const choice = withGrounding({ present: ["mara", "lantern"] }, "She knelt beside the broken lantern.").grounding;
  choice.cast[0].contextSource = "previous"; choice.cast[0].contextQuote = "Mara entered the workshop";

  it("supports an embedded multi-unit prose instant and continuing identity without Bible names or action keyword filters", () => {
    expect(sceneGroundingProblem(choice, ["mara", "lantern"], prose)).toBeNull();
    const nested = { ...prose, moment: { ...prose.moment, text: `The sailor said, ‘${prose.moment.text}’` } };
    expect(sceneGroundingProblem(choice, ["mara", "lantern"], nested)).toBeNull();
  });

  it.each([
    ["missing focus", (g: SceneGrounding) => { g.focusQuote = ""; }],
    ["neighbor used as focus", (g: SceneGrounding) => { g.focusQuote = "the merchant arrived"; }],
    ["changed punctuation", (g: SceneGrounding) => { g.focusQuote = "She knelt, beside the broken lantern"; }],
    ["missing cast evidence", (g: SceneGrounding) => { g.cast.pop(); }],
    ["duplicated evidence", (g: SceneGrounding) => { g.cast[1] = { ...g.cast[0] }; }],
    ["extra evidence", (g: SceneGrounding) => { g.cast.push({ ...g.cast[0], entryId: "merchant" }); }],
    ["invented current quote", (g: SceneGrounding) => { g.cast[0].momentQuote = "Mara repaired the lantern"; }],
    ["blank current quote", (g: SceneGrounding) => { g.cast[0].momentQuote = "  "; }],
    ["wrong neighbor", (g: SceneGrounding) => { g.cast[0].contextSource = "next"; }],
    ["unlabelled context", (g: SceneGrounding) => { g.cast[0].contextSource = "none"; }],
    ["blank context", (g: SceneGrounding) => { g.cast[0].contextQuote = ""; }],
    ["framing", (g: SceneGrounding) => { g.cast[0].participation = "framing"; }],
    ["mentioned", (g: SceneGrounding) => { g.cast[0].participation = "mentioned"; }],
    ["separate event", (g: SceneGrounding) => { g.cast[0].participation = "separate_event"; }],
    ["uncertain", (g: SceneGrounding) => { g.cast[0].participation = "uncertain"; }],
  ])("refuses %s evidence", (_label, change) => {
    const invalid = structuredClone(choice); change(invalid);
    expect(sceneGroundingProblem(invalid, ["mara", "lantern"], prose)).not.toBeNull();
  });

  it("checks only supplied same-section neighbor excerpts, including the 400-character boundary", () => {
    const g = structuredClone(choice);
    const context = { ...prose, previous: { text: `${"x".repeat(380)} Mara entered the workshop. Hidden arrival.` } };
    g.cast[0].contextQuote = "Mara entered";
    expect(sceneGroundingProblem(g, ["mara", "lantern"], context)).toBeNull();
    g.cast[0].contextQuote = "Mara entered the workshop";
    expect(sceneGroundingProblem(g, ["mara", "lantern"], context)).toContain("invalid previous evidence");
    expect(sceneGroundingProblem(choice, ["mara", "lantern"], { ...prose, previous: null })).toContain("invalid previous evidence");
  });

  it("accepts whitespace differences but not invented punctuation, and needs no cast for a landscape", () => {
    const g = structuredClone(choice); g.focusQuote = "She\nknelt beside  the broken lantern.";
    expect(sceneGroundingProblem(g, ["mara", "lantern"], prose)).toBeNull();
    expect(sceneGroundingProblem({ focusQuote: "Clouds drift.", singleInstant: true, cast: [] }, [],
      { moment: { id: "sky-1", reference: "Sky 1", text: "Clouds drift." }, previous: null, next: null })).toBeNull();
    expect(sceneGroundingSchema.safeParse({ ...g, extra: "untrusted" }).success).toBe(false);
  });

  it("cannot disprove a model that falsely calls a narrator in_scene using a real quote", () => {
    const asserted = withGrounding({ present: ["narrator"] }, "I watched").grounding;
    expect(sceneGroundingProblem(asserted, ["narrator"], daniel.context)).toBeNull();
    // This intentional limit keeps scripted success separate from live text and visual acceptance.
  });
});
