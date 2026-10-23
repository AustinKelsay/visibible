/** Evidence checks over retained first failures and non-Bible prose; no provider or live writes. */
import { withCleanReview } from "../../../tests/fixtures/plan-review";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { withGrounding } from "../../../tests/fixtures/scene-grounding";
import { sceneGroundingProblem, sceneGroundingSchema, type SceneGrounding } from "../engine/scene-grounding";
import { assembleRendering, type AssembleDeps } from "../engine/assemble";
import type { AnalysisRecord, MomentContext, PreparationStore } from "../engine/preparation";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { responseSchema } from "../reading-pass/prompts";

const evidence = new URL("../../../llm/releases/2026-10-22-luke-cast-repair/", import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, evidence), "utf8"));
type RetainedScene = { context: MomentContext; result: { plan: { payload: typeof fields & { present: string[] } } } };
const luke = read<RetainedScene>("scene-luke-10-34.json");
const daniel = read<RetainedScene>("scene-daniel-7-9.json");
const snapshot = read<{ records: Array<{ record: AnalysisRecord | null }> }>("final.json");
const samaritan = "the_samaritan", wounded = "wounded_traveler_in_samaritan_parable";
const sectionCast = (sectionId: string) => (snapshot.records.find((r) => r.record?.kind === "section" && r.record.recordId === sectionId)!.record!.payload as unknown as { cast: Array<{ entryId: string }> }).cast.map((c) => c.entryId);
const lukeCast = sectionCast("luke-10-25"), danielCast = sectionCast("daniel-7-9");
const taleCast = ["mara", "lantern"];
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
  const model: TextModel = withCleanReview({ id: "scripted", complete: async (request) => {
    calls.push(request);
    return { content: JSON.stringify(reply), model: "scripted", providerRequestId: null, finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 100, costUsd: 0.0004 }, elapsedMs: 1 };
  } });
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
  ])("re-plans a reported %s once with the reason, then stops without changing the retained plan or loading references", async (label, reply, message) => {
    const unitId = label === "framing narrator" || label === "neighbor-only assembly" ? "daniel-7-9" : "luke-10-34";
    const { render, records, calls, write, spend, release, getReference } = await setup(unitId, reply());
    const before = structuredClone(records.find((r) => r.kind === "plan" && r.recordId === unitId));
    expect(await render()).toMatchObject({ ok: false, reason: "preparation", stage: "plan", retryable: true, message: expect.stringContaining(message) });
    // The scripted planner repeats the same reply, so the single re-plan is refused for the same reason.
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "scene_plan"]);
    expect(calls[0].user).not.toContain("WAS REJECTED");
    const feedback = calls[1].user.slice(calls[0].user.length);
    expect(calls[1].user.startsWith(calls[0].user)).toBe(true);
    expect(feedback).toMatch(/^\n\nA PREVIOUS PLAN FOR THIS MOMENT WAS REJECTED\. Write a new plan that fixes every problem below and keeps what was correct:\n- evidence: /);
    expect(feedback).toContain(message);
    expect(write).not.toHaveBeenCalled();
    expect(getReference).not.toHaveBeenCalled();
    expect(spend.mock.calls.map(([entry]) => entry)).toEqual([expect.objectContaining({ outcome: "unavailable", costUsd: 0.0004 }), expect.objectContaining({ outcome: "unavailable", costUsd: 0.0004 })]);
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
    expect(sceneGroundingProblem(choice, ["mara", "lantern"], prose, taleCast)).toBeNull();
    const nested = { ...prose, moment: { ...prose.moment, text: `The sailor said, ‘${prose.moment.text}’` } };
    expect(sceneGroundingProblem(choice, ["mara", "lantern"], nested, taleCast)).toBeNull();
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
    expect(sceneGroundingProblem(invalid, ["mara", "lantern"], prose, taleCast)).not.toBeNull();
  });

  it("checks only supplied same-section neighbor excerpts, including the 400-character boundary", () => {
    const g = structuredClone(choice);
    const context = { ...prose, previous: { text: `${"x".repeat(380)} Mara entered the workshop. Hidden arrival.` } };
    g.cast[0].contextQuote = "Mara entered";
    expect(sceneGroundingProblem(g, ["mara", "lantern"], context, taleCast)).toBeNull();
    g.cast[0].contextQuote = "Mara entered the workshop";
    expect(sceneGroundingProblem(g, ["mara", "lantern"], context, taleCast)).toContain("invalid previous evidence");
    expect(sceneGroundingProblem(choice, ["mara", "lantern"], { ...prose, previous: null }, taleCast)).toContain("invalid previous evidence");
  });

  it("accepts whitespace differences but not invented punctuation, and needs no cast for a landscape", () => {
    const g = structuredClone(choice); g.focusQuote = "She\nknelt beside  the broken lantern.";
    expect(sceneGroundingProblem(g, ["mara", "lantern"], prose, taleCast)).toBeNull();
    expect(sceneGroundingProblem({ focusQuote: "Clouds drift.", singleInstant: true, cast: [], instant: "Clouds drift across an empty sky." }, [],
      { moment: { id: "sky-1", reference: "Sky 1", text: "Clouds drift." }, previous: null, next: null }, [])).toBeNull();
    expect(sceneGroundingSchema.safeParse({ ...g, extra: "untrusted" }).success).toBe(false);
  });

  it("cannot disprove a model that falsely calls a narrator in_scene using a real quote", () => {
    const asserted = withGrounding({ present: ["narrator"] }, "I watched").grounding;
    expect(sceneGroundingProblem(asserted, ["narrator"], daniel.context, ["narrator"])).toBeNull();
    // This intentional limit keeps scripted success separate from live text and visual acceptance.
  });
});

const live = new URL("../../../llm/releases/2026-10-23-grounded-plan-check/", import.meta.url);
const readLive = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, live), "utf8"));
type LiveReply = { present: string[]; grounding: Omit<SceneGrounding, "instant"> } & Record<string, unknown>;
const liveReplies = readFileSync(new URL("provider.ndjson", live), "utf8").trim().split("\n")
  .map((line) => JSON.parse(line) as { phase: string; response: { choices: Array<{ message: { content: string } }> } })
  .map((trace) => ({ phase: trace.phase, reply: JSON.parse(trace.response.choices[0].message.content) as LiveReply }));
const liveReply = (unit: string) => liveReplies.find((trace) => trace.phase === `prepare:${unit}`)!.reply;

describe("moment-cast v4 stated instant and quote fragments", () => {
  it("still refuses the retained Daniel 7:10 v3 neighbor quote joined without a mark, and accepts it with an ellipsis", () => {
    const scene = readLive<{ context: MomentContext; error: { message: string } }>("scene-daniel-7-10.json");
    expect(scene.error.message).toContain("the_ancient_of_days has invalid previous evidence");
    const reply = liveReply("daniel-7-10");
    expect(reply.grounding.cast[0].contextQuote).toBe("one who was Ancient of Days sat. His throne was fiery flames, and its wheels burning fire.");
    const grounding = { ...reply.grounding, instant: "The fiery stream flows from before the seat; the assembly stands in ranks." };
    expect(sceneGroundingProblem(grounding, reply.present, scene.context, danielCast)).toBe("cast the_ancient_of_days has invalid previous evidence");
    const marked = structuredClone(grounding);
    marked.cast[0].contextQuote = "one who was Ancient of Days sat. … His throne was fiery flames, and its wheels burning fire.";
    expect(sceneGroundingProblem(marked, reply.present, scene.context, danielCast)).toBeNull();
  });

  const tale: MomentContext = { moment: { id: "tale-4", reference: "The Tale ¶4", text: "She knelt beside the broken lantern. It was quiet. Then she stood and carried it outside." },
    previous: null, next: { text: "At dawn the merchant arrived at the inn." } };
  const focus = (focusQuote: string): SceneGrounding => ({ focusQuote, cast: [], instant: "She kneels beside the lantern.", singleInstant: true });

  it.each([
    ["an ellipsis", "She knelt … carried it outside.", true],
    ["three periods", "She knelt beside...lantern.", true],
    ["a skipped sentence marked by an ellipsis", "She knelt beside the broken lantern. … Then she stood", true],
    ["an unmarked skipped sentence", "She knelt beside the broken lantern. Then she stood", false],
    ["reordered fragments", "Then she stood. She knelt beside the broken lantern.", false],
    ["an invented fragment", "She knelt … and smiled.", false],
    ["a fragment from the next unit", "She knelt … the merchant arrived", false],
    ["only an ellipsis", " … ", false],
    ["a changed word inside a fragment", "She knelt beside the lantern. … Then she stood", false],
    ["a fragment ending inside a word", "She knelt beside the brok … lantern.", false],
    ["a fragment starting inside a word", "She knelt … roken lantern.", false],
  ])("checks a quote joined at %s", (_label, quote, valid) => {
    expect(sceneGroundingProblem(focus(quote), [], tale, []) === null).toBe(valid);
  });

  it("matches whole words only, skipping a partial-word occurrence to find a later whole one", () => {
    const manor: MomentContext = { moment: { id: "tale-6", reference: "The Tale ¶6", text: "Manor lantern. A man held the lantern." }, previous: null, next: null };
    expect(sceneGroundingProblem(focus("Man … lantern."), [], manor, [])).toBe("scene focus is not quoted from the current moment");
    expect(sceneGroundingProblem(focus("anor lantern."), [], manor, [])).toBe("scene focus is not quoted from the current moment");
    expect(sceneGroundingProblem(focus("man … the lantern."), [], manor, [])).toBeNull();
  });

  it("keeps contractions whole while allowing a possessive's stem", () => {
    const refusal: MomentContext = { moment: { id: "tale-7", reference: "The Tale ¶7", text: "He can’t go. The Samaritan's animal waited." }, previous: null, next: null };
    expect(sceneGroundingProblem(focus("He can … go."), [], refusal, [])).toBe("scene focus is not quoted from the current moment");
    expect(sceneGroundingProblem(focus("t go."), [], refusal, [])).toBe("scene focus is not quoted from the current moment");
    expect(sceneGroundingProblem(focus("He can’t go."), [], refusal, [])).toBeNull();
    expect(sceneGroundingProblem(focus("The Samaritan … waited."), [], refusal, [])).toBeNull();
  });

  it("never treats an abbreviation as an implicit elision point", () => {
    const doctor: MomentContext = { moment: { id: "tale-5", reference: "The Tale ¶5", text: "Dr. Mary said John arrived." }, previous: null, next: null };
    expect(sceneGroundingProblem(focus("Dr. John arrived."), [], doctor, [])).toBe("scene focus is not quoted from the current moment");
    expect(sceneGroundingProblem(focus("Dr. Mary said John arrived."), [], doctor, [])).toBeNull();
  });

  it("refuses a blank stated instant on the first reply", () => {
    expect(sceneGroundingProblem({ ...focus("She knelt"), instant: "  " }, [], tale, [])).toBe("scene instant is not stated");
  });

  it("cannot detect the retained Luke 10:33 pose contradiction: a stated instant is guidance, not validation", () => {
    const scene = readLive<{ context: MomentContext; stored: { payload: { plan: Record<string, string> } } }>("scene-luke-10-33.json");
    const reply = liveReply("luke-10-33");
    expect(scene.stored.payload.plan.primarySubject).toContain("kneeling beside");
    expect(scene.stored.payload.plan.action).toContain("halting his steps");
    const grounding = { ...reply.grounding, instant: "The Samaritan halts on the road, turning toward the wounded man." };
    expect(sceneGroundingProblem(grounding, reply.present, scene.context, lukeCast)).toBeNull();
  });

  it("asks for the stated instant after cast evidence, before scene prose, and ties formed fields to it", async () => {
    const { render, calls } = await setup("luke-10-34", binding);
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    const schema = responseSchema(calls[0].schema) as { required: string[]; properties: Record<string, { required?: string[]; description?: string }> };
    expect(schema.required[0]).toBe("grounding");
    expect(schema.properties.grounding.required).toEqual(["focusQuote", "cast", "instant", "singleInstant"]);
    for (const key of ["primarySubject", "action", "composition"]) expect(schema.properties[key].description).toMatch(/grounding\.instant|same instant/);
    expect(calls[0].system).toContain("state that instant once in `grounding.instant`");
    expect(calls[0].system).toContain("separated by an ellipsis (…)");
    expect(result.prompt).not.toContain(binding.grounding.instant);
  });
});
