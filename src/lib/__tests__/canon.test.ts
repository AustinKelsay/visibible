/**
 * Canon drafting (#170) with a scripted model: who gets canon, kinds, stage caps, quote checks,
 * no-form entries, stage assignments, budget reservation, and owner edits surviving a redraft.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { createWorkReader } from "../work-input";
import type { TextModel, TextModelRequest, TextModelResult } from "../reading-pass/model";
import { runReadingPass, emptyState } from "../reading-pass/run";
import { runCanon, emptyCanonState, canonRecords } from "../reading-pass/canon-run";
import { entriesNeedingCanon, checkCanon, mentionUnits } from "../reading-pass/canon";
import { createMemoryAnalysisStore, createConvexAnalysisStore } from "../reading-pass/store";
import { BudgetExceededError } from "../reading-pass/model";

const twoBooks = JSON.parse(readFileSync(new URL("../../../tests/fixtures/works/two-books.json", import.meta.url), "utf8"));

function scriptedModel(script: Record<string, (request: TextModelRequest, calls: TextModelRequest[]) => unknown>, costUsd = 0.001): TextModel & { calls: TextModelRequest[] } {
  const calls: TextModelRequest[] = [];
  return {
    id: "scripted", calls,
    async complete(request): Promise<TextModelResult> {
      calls.push(request);
      const key = Object.keys(script).find((k) => request.label.startsWith(k));
      if (!key) throw new Error(`No script for ${request.label}`);
      const value = script[key](request, calls);
      return { content: typeof value === "string" ? value : JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 100, completionTokens: 50, costUsd }, elapsedMs: 1 };
    },
  };
}

// The reading-pass outputs the canon step builds on (same shapes as the reading-pass tests).
const alphaReading = {
  characters: [
    { id: "jonah", name: "Jonah", aliases: ["the fisherman", "the sailor"], kind: "person", note: "Fisherman of the lake, sent west by the king.", same_person_as: "" },
    { id: "amos", name: "Amos", aliases: [], kind: "person", note: "Jonah's brother.", same_person_as: "" },
    { id: "the_king", name: "the king", aliases: ["king of the city"], kind: "person", note: "King of the city.", same_person_as: "" },
    { id: "the_voice", name: "the voice from the sky", aliases: [], kind: "divine", note: "A voice that speaks to Jonah.", same_person_as: "" },
    { id: "far_away_elder", name: "the elder of the far city", aliases: [], kind: "person", note: "Only spoken of.", same_person_as: "" },
  ],
  locations: [{ id: "the_lake", name: "the lake", aliases: ["the shore"], note: "Jonah's lake." }, { id: "the_palace", name: "the palace", aliases: [], note: "The king's palace." }],
  sections: [
    { start: "1-1", end: "1-3", title: "Jonah at the lake", setting: ["the_lake"], on_stage: ["jonah", "amos", "the_voice"], mentioned_only: ["far_away_elder"] },
    { start: "1-4", end: "2-2", title: "Jonah before the king", setting: ["the_palace"], on_stage: ["jonah", "the_king"], mentioned_only: [] },
  ],
  brief: { tone: "Quiet.", depiction_rules: ["The voice from the sky is never given a face or body."], era: { name: "Lakeside kingdom", people: "Fisherfolk.", dress: "Wool.", buildings_and_objects: "Boats.", technology: "Sail." } },
};
const betaReading = {
  characters: [
    { id: "jonah", name: "Jonah", aliases: ["the sailor"], kind: "person", note: "The same sailor.", same_person_as: "" },
    { id: "the_crowd", name: "the crowd", aliases: [], kind: "group", note: "Crowd on the shore.", same_person_as: "" },
    { id: "the_ship", name: "Jonah's ship", aliases: ["the ship"], kind: "other", note: "The king's ship.", same_person_as: "" },
  ],
  locations: [{ id: "the_lake", name: "the lake", aliases: ["the shore"], note: "The same lake." }],
  sections: [{ start: "1-1", end: "1-3", title: "The return", setting: ["the_lake"], on_stage: ["jonah", "the_crowd", "the_ship"], mentioned_only: [] }],
  brief: { tone: "Quiet.", depiction_rules: [], era: { name: "Lakeside kingdom", people: "Fisherfolk.", dress: "Wool.", buildings_and_objects: "Boats.", technology: "Sail." } },
};
const ruling = (request: TextModelRequest) => {
  const groups = [...request.user.matchAll(/## Group (\d+) \((characters|places)\)\n((?:.*\n?)*?)(?=## Group|$)/g)];
  return { groups: groups.map((m) => {
    const members = [...m[3].matchAll(/^- ([a-z-]+:(?:character|location):[a-z_']+)/gm)].map((x) => x[1]);
    const name = members[0].endsWith(":jonah") ? "Jonah" : "the lake";
    return { group: Number(m[1]), clusters: [{ name, kind: name === "Jonah" ? "person" : "place", note: "same", members }] };
  }) };
};
const briefAnswer = {
  tone: "Quiet, clear and sunlit.", depiction_rules: ["The voice from the sky is never given a face or body."],
  eras: [{ name: "Lakeside kingdom", people: "Fisherfolk and courtiers.", dress: "Wool tunics.", buildings_and_objects: "Stone palace, wooden boats.", technology: "Sail and oar." }],
  assignments: [{ first_section: "alpha-1-1", last_section: "beta-1-1", era: "Lakeside kingdom" }],
  style_set: [{ style_id: "classical", reason: "Grounded." }],
};

async function readFixture() {
  const model = scriptedModel({ "read:alpha": () => alphaReading, "read:beta": () => betaReading, "merge:": ruling, brief: () => briefAnswer });
  return runReadingPass({ workFile: twoBooks, workVersion: "wv1", model, store: null, state: emptyState("two-books", "wv1"), saveState: async () => {}, budgetUsd: 1 });
}

const stage = (id: string, text: string, quotes: Array<{ unit: string; quote: string }> = []) => ({ id, label: id, when: "all", text, source: "mixed" as const, quotes });
const canonFor = (entryId: string, request: TextModelRequest) => {
  const sections = [...request.user.matchAll(/^- ([a-z]+-\d+-\d+): /gm)].map((m) => m[1]);
  const assign = (stageId: string) => sections.map((s) => ({ section: s, stage: stageId }));
  switch (entryId) {
    case "jonah":
      return { kind: "character", has_form: true, appearance_from_text: "The text calls him a fisherman and a sailor.", section_stages: [{ section: "alpha-1-1", stage: "young" }, { section: "alpha-1-4", stage: "young" }, { section: "beta-1-1", stage: "weathered" }],
        stages: [stage("young", "Jonah: a young fisherman, lean, sun-browned, in a grey wool tunic.", [{ unit: "alpha-1-1", quote: "Jonah the fisherman mended his nets" }, { unit: "alpha-1-1", quote: "this is not in the text" }]),
                 stage("weathered", "Jonah: the same man years on, weathered, grey at the temples, in a sailor's blue coat.", [{ unit: "beta-1-2", quote: "Jonah’s ship came home" }])] };
    case "the_voice_from_the_sky":
      return { kind: "character", has_form: false, appearance_from_text: "Only a voice.", section_stages: assign("main"), stages: [stage("main", "The voice from the sky: never a face or body; shown only as light breaking through cloud.")] };
    case "jonah_s_ship":
      return { kind: "object", has_form: true, appearance_from_text: "A ship.", section_stages: assign("a"), stages: [stage("a", "Jonah's ship: a single-masted wooden ship with a red sail."), stage("b", "Jonah's ship: a second form that should be dropped.")] };
    case "the_crowd":
      return { kind: "character", has_form: true, appearance_from_text: "A crowd.", section_stages: assign("main"), stages: [stage("main", "The crowd: a typical member is a fisherfolk villager in undyed wool.")] };
    default:
      return { kind: entryId.includes("lake") || entryId.includes("palace") ? "location" : "character", has_form: true, appearance_from_text: "Supplied.", section_stages: [{ section: sections[0], stage: "nope" }], stages: [stage("main", `${entryId}: a plain description.`)] };
  }
};

describe("canon", () => {
  it("drafts every on-stage entry, keeps the rules in code, and stages a generation that activates", async () => {
    const reading = await readFixture();
    const work = createWorkReader(twoBooks);
    const needed = entriesNeedingCanon(reading.merge!.entries, reading.merge!.sections).map((e) => e.id).sort();
    // The elder is only mentioned, so no canon; the voice, the crowd and the ship all get one.
    expect(needed).toEqual(["amos", "jonah", "jonah_s_ship", "the_crowd", "the_king", "the_lake", "the_palace", "the_voice_from_the_sky"]);

    const model = scriptedModel({ "canon:": (request) => canonFor(request.label.split(":")[1], request) });
    const memory = createMemoryAnalysisStore();
    const brief = reading.brief!.brief;
    const state = await runCanon({ workFile: twoBooks, workVersion: "wv1", brief, briefVersion: "bv1", reading, hints: [{ entryId: "jonah", kind: "character", sourcePath: "x", text: "Jonah always carries a net." }],
      model, store: memory.store, state: emptyCanonState("two-books", "wv1", "bv1"), saveState: async () => {}, budgetUsd: 1, activate: true, parallel: 2 });

    const jonahPrompt = model.calls.find((c) => c.label.startsWith("canon:jonah:"))!;
    expect(jonahPrompt.user).toContain("Jonah always carries a net.");
    expect(jonahPrompt.user).toContain("[alpha-1-1] Jonah the fisherman");
    expect(jonahPrompt.user).toContain("- alpha-1-4: Jonah before the king");
    expect(jonahPrompt.system).toMatch(/never film or television|real actor/);

    const jonah = state.entries.jonah;
    expect(jonah.stages.map((s) => s.id)).toEqual(["young", "weathered"]);
    // The bad quote was dropped and recorded; the good ones stayed.
    expect(jonah.stages[0].quotes).toEqual([{ unit: "alpha-1-1", quote: "Jonah the fisherman mended his nets" }]);
    expect(jonah.problems).toEqual([expect.stringMatching(/quote not found in alpha-1-1/)]);
    expect(jonah.sectionStages).toEqual({ "alpha-1-1": "young", "alpha-1-4": "young", "beta-1-1": "weathered" });
    expect(state.entries.the_voice_from_the_sky.hasForm).toBe(false);
    expect(state.entries.jonah_s_ship.stages).toHaveLength(1);
    expect(state.entries.jonah_s_ship.problems).toContain("2 stages drafted, kept 1");
    expect(state.entries.amos.problems).toContain("section alpha-1-1 assigned to unknown stage nope");
    expect(state.entries.amos.sectionStages).toEqual({ "alpha-1-1": "main" });
    expect(mentionUnits(work, reading.merge!.entries.find((e) => e.id === "jonah")!).map((u) => u.id)).toEqual(["alpha-1-1", "alpha-1-4", "alpha-2-1", "alpha-2-2", "beta-1-1", "beta-1-2", "beta-1-3"]); // beta-1-3 names him by the alias "the sailor"

    // Staged with stages and final cast assignments, attention noted, activated.
    expect(state.staged).toEqual({ generation: 1, records: 9 + 3 + 9, activated: true });
    expect(memory.activated).toEqual([1]);
    expect(memory.attention.map((a) => [a.reason, a.recordId])).toEqual(expect.arrayContaining([["quote_check_failed", "jonah"], ["canon_check", "jonah_s_ship"], ["canon_check", "amos"]]));
    const records = canonRecords(reading, state);
    const section = records.find((r) => r.kind === "section" && r.recordId === "beta-1-1")!;
    expect(section.payload).toMatchObject({ cast: expect.arrayContaining([{ entryId: "jonah", stageId: "weathered", named: true }, { entryId: "the_lake", stageId: "main" }]) });
    const voice = records.find((r) => r.kind === "entry" && r.recordId === "the_voice_from_the_sky")!;
    expect(voice.payload).toMatchObject({ hasForm: false, stages: [expect.objectContaining({ id: "main" })] });

    // In the real store the generation is structurally valid and becomes active and ready.
    const t = convexTest(schema, modules);
    process.env.CONVEX_SERVER_SECRET = "s".repeat(40);
    const client = { mutation: (ref: unknown, args: unknown) => t.mutation(ref as never, args as never) };
    const convexStore = createConvexAnalysisStore(client as never, "s".repeat(40));
    await convexStore.registerWork({ workId: "two-books", workVersion: "wv1", briefVersion: "bv1" });
    const { generation } = await convexStore.stageGeneration({ workId: "two-books", workVersion: "wv1", briefVersion: "bv1" });
    await convexStore.putRecords({ workId: "two-books", generation, records });
    await convexStore.activateGeneration({ workId: "two-books", generation });
    expect((await t.query(api.analysis.getWorkStatus, { workId: "two-books" })).ready).toBe(true);
    // An owner edit survives a redraft: the next candidate carries the owner version forward.
    await t.mutation(api.analysis.correctRecord, { serverSecret: "s".repeat(40), workId: "two-books", kind: "entry", recordId: "amos",
      payload: { kind: "entry", name: "Amos", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Amos: owner-edited look." }] } });
    const next = await convexStore.stageGeneration({ workId: "two-books", workVersion: "wv1", briefVersion: "bv1" });
    await convexStore.putRecords({ workId: "two-books", generation: next.generation, records });
    const activation = await convexStore.activateGeneration({ workId: "two-books", generation: next.generation });
    expect(activation.carriedOwnerVersions).toEqual(["entry/amos"]);
    expect((await t.query(api.analysis.getActiveRecord, { workId: "two-books", kind: "entry", recordId: "amos" }))?.payload).toMatchObject({ stages: [{ text: "Amos: owner-edited look." }] });
  });

  it("re-asks once for over-long text, resumes without redrafting, and reserves in-flight estimates against the budget", async () => {
    const reading = await readFixture();
    const brief = reading.brief!.brief;
    const long = "x".repeat(700);
    const model = scriptedModel({ "canon:": (request, calls) => {
      const id = request.label.split(":")[1];
      if (id === "amos" && calls.filter((c) => c.label.startsWith("canon:amos:")).length === 1) {
        return { ...canonFor("the_crowd", request), stages: [stage("main", `Amos: ${long}`)] };
      }
      if (id === "amos") {
        if (calls.filter((c) => c.label.startsWith("canon:amos:")).length === 2) expect(request.user).toMatch(/Shorten every stage text/);
        return { ...canonFor("the_crowd", request), stages: [stage("main", "Amos: short.")] };
      }
      return canonFor(id, request);
    } });
    const saved: string[] = [];
    const state = await runCanon({ workFile: twoBooks, workVersion: "wv1", brief, briefVersion: "bv1", reading, hints: [], model, store: null,
      state: emptyCanonState("two-books", "wv1", "bv1"), saveState: async (s) => { saved.push(Object.keys(s.entries).join(",")); }, budgetUsd: 1, parallel: 1 });
    expect(state.entries.amos.attempts).toBe(2);
    expect(state.entries.amos.stages[0].text).toBe("Amos: short.");
    const before = model.calls.length;
    await runCanon({ workFile: twoBooks, workVersion: "wv1", brief, briefVersion: "bv1", reading, hints: [], model, store: null, state, saveState: async () => {}, budgetUsd: 1 });
    expect(model.calls.length).toBe(before);
    await runCanon({ workFile: twoBooks, workVersion: "wv1", brief, briefVersion: "bv1", reading, hints: [], model, store: null, state, saveState: async () => {}, budgetUsd: 1, redraft: ["jonah"] });
    expect(model.calls.length).toBe(before + 1);

    // A redraft after staging reaches the store as a new candidate, even when the old one was activated.
    const memory = createMemoryAnalysisStore();
    await runCanon({ workFile: twoBooks, workVersion: "wv1", brief, briefVersion: "bv1", reading, hints: [], model, store: memory.store, state, saveState: async () => {}, budgetUsd: 1, activate: true });
    expect(state.staged).toEqual({ generation: 1, records: expect.any(Number), activated: true });
    await runCanon({ workFile: twoBooks, workVersion: "wv1", brief, briefVersion: "bv1", reading, hints: [], model, store: memory.store, state, saveState: async () => {}, budgetUsd: 1, redraft: ["amos"] });
    expect(state.staged).toEqual({ generation: 2, records: expect.any(Number), activated: false });
    expect(memory.generations[1].records.find((r) => r.kind === "entry" && r.recordId === "amos")!.payload).toMatchObject({ stages: [{ text: "Amos: short." }] });
    expect(memory.activated).toEqual([1]);

    // Four parallel calls each estimated at about $0.0007: a budget of $0.002 admits two, then stops before the third.
    const parallelModel = scriptedModel({ "canon:": (request) => canonFor(request.label.split(":")[1], request) }, 0);
    const fresh = emptyCanonState("two-books", "wv1", "bv1");
    await expect(runCanon({ workFile: twoBooks, workVersion: "wv1", brief, briefVersion: "bv1", reading, hints: [], model: parallelModel, store: null, state: fresh, saveState: async () => {}, budgetUsd: 0.002, parallel: 4 }))
      .rejects.toThrow(BudgetExceededError);
    expect(parallelModel.calls.length).toBeLessThanOrEqual(2);
    await expect(runCanon({ workFile: twoBooks, workVersion: "wv1", brief, briefVersion: "other", reading, hints: [], model, store: null, state, saveState: async () => {}, budgetUsd: 1 })).rejects.toThrow(/Start a new run/);
  });

  it("checks quotes against the exact unit text, ignoring case, spacing and quote marks", () => {
    const work = createWorkReader(twoBooks);
    const entry = { id: "jonah", kind: "character" as const, readingKind: "person", name: "Jonah", aliases: [], note: "", members: ["alpha:character:jonah"] };
    const output = { kind: "character" as const, has_form: true, appearance_from_text: "", section_stages: [],
      stages: [stage("main", "Jonah: x", [{ unit: "beta-1-2", quote: "JONAH'S  ship came home" }, { unit: "beta-1-2", quote: "came home to the sea" }, { unit: "nowhere-1-1", quote: "x" }])] };
    const result = checkCanon(work, entry, output, []);
    expect(result.stages[0].quotes).toEqual([{ unit: "beta-1-2", quote: "JONAH'S  ship came home" }]);
    expect(result.problems).toEqual([expect.stringMatching(/quote not found in beta-1-2/), expect.stringMatching(/unknown unit nowhere-1-1/)]);
  });
});
