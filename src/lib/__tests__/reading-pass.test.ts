/**
 * Reading pass (#169) with a scripted text model: reading, bounded retries, merge rulings with
 * same-name hints, moments, the draft brief with its style set, budget and resume.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { createWorkReader } from "../work-input";
import type { TextModel, TextModelRequest, TextModelResult } from "../reading-pass/model";
import { runReadingPass, emptyState, planReadingPass, BudgetExceededError, analysisRecords, type ReadingPassState } from "../reading-pass/run";
import { createMemoryAnalysisStore, createConvexAnalysisStore } from "../reading-pass/store";
import { readDivision, rootDivisions } from "../reading-pass/division";
import { splitLongRun } from "../reading-pass/moments";

const twoBooks = JSON.parse(readFileSync(new URL("../../../tests/fixtures/works/two-books.json", import.meta.url), "utf8"));
const voyage = JSON.parse(readFileSync(new URL("../../../tests/fixtures/nested-work.json", import.meta.url), "utf8"));

type Script = (request: TextModelRequest, calls: TextModelRequest[]) => unknown;

/** A model that answers from a script keyed by request label prefix, recording every request. */
function scriptedModel(script: Record<string, Script>, costUsd = 0.001): TextModel & { calls: TextModelRequest[] } {
  const calls: TextModelRequest[] = [];
  return {
    id: "scripted",
    calls,
    async complete(request): Promise<TextModelResult> {
      calls.push(request);
      const key = Object.keys(script).find((k) => request.label.startsWith(k));
      if (!key) throw new Error(`No script for ${request.label}`);
      const value = script[key](request, calls);
      return { content: typeof value === "string" ? value : JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop",
        usage: { promptTokens: 100, completionTokens: 50, costUsd }, elapsedMs: 1 };
    },
  };
}

const alphaReading = {
  characters: [
    { id: "jonah", name: "Jonah", aliases: ["the fisherman", "the sailor"], kind: "person", note: "Fisherman of the lake, brother of Amos, sent west by the king.", same_person_as: "" },
    { id: "amos", name: "Amos", aliases: [], kind: "person", note: "Jonah's brother from the hills.", same_person_as: "" },
    { id: "the_king", name: "the king", aliases: ["king of the city"], kind: "person", note: "King of the city who sends Jonah west.", same_person_as: "" },
    { id: "messenger", name: "the messenger", aliases: [], kind: "person", note: "The king's messenger.", same_person_as: "" },
  ],
  locations: [
    { id: "the_lake", name: "the lake", aliases: ["the shore"], note: "Lake where Jonah fishes." },
    { id: "the_palace", name: "the palace", aliases: [], note: "The king's palace in the city." },
  ],
  sections: [
    { start: "1-1", end: "1-3", title: "Jonah at the lake", setting: ["the_lake"], on_stage: ["jonah", "amos", "messenger"], mentioned_only: ["the_king"] },
    { start: "1-4", end: "2-2", title: "Jonah before the king", setting: ["the_palace"], on_stage: ["jonah", "the_king"], mentioned_only: [] },
  ],
  brief: { tone: "Quiet and clear.", depiction_rules: ["Jonah always carries a net."], era: { name: "Lakeside kingdom", people: "Fisherfolk and courtiers.", dress: "Wool tunics.", buildings_and_objects: "Stone palace, wooden boats.", technology: "Sail and oar." } },
};
const betaReading = {
  characters: [
    { id: "jonah", name: "Jonah", aliases: ["the sailor"], kind: "person", note: "The sailor whose ship comes home; the same fisherman as before.", same_person_as: "" },
    { id: "the_king", name: "the king", aliases: ["the new king"], kind: "person", note: "A new king who did not know Jonah; succeeds the earlier king.", same_person_as: "" },
    { id: "the_crowd", name: "the crowd", aliases: [], kind: "group", note: "Crowd on the shore.", same_person_as: "" },
  ],
  locations: [{ id: "the_lake", name: "the lake", aliases: ["the shore"], note: "The same lake." }],
  sections: [{ start: "1-1", end: "1-3", title: "The return", setting: ["the_lake"], on_stage: ["jonah", "the_crowd"], mentioned_only: ["the_king"] }],
  brief: { tone: "Quiet and clear.", depiction_rules: [], era: { name: "Lakeside kingdom", people: "Fisherfolk.", dress: "Wool tunics.", buildings_and_objects: "Boats.", technology: "Sail and oar." } },
};
const ruling = (request: TextModelRequest) => {
  // Keep the two kings apart, join Jonah's entries; group numbering follows the prompt headings.
  const groups = [...request.user.matchAll(/## Group (\d+) \((characters|places)\)\n((?:.*\n?)*?)(?=## Group|$)/g)].map((m) => ({ n: Number(m[1]), body: m[3] }));
  return { groups: groups.map((g) => {
    const members = [...g.body.matchAll(/^- ([a-z-]+:(?:character|location):[a-z_]+)/gm)].map((x) => x[1]);
    if (members.every((m) => m.endsWith(":the_king"))) {
      return { group: g.n, clusters: members.map((m) => ({ name: m.startsWith("alpha") ? "the king of the city" : "the new king", kind: "person", note: m.startsWith("alpha") ? "First king" : "Second king, successor", members: [m] })) };
    }
    const name = members[0].endsWith(":jonah") ? "Jonah" : members[0].endsWith(":the_lake") ? "the lake" : members[0].split(":")[1];
    return { group: g.n, clusters: [{ name, kind: members[0].endsWith(":the_lake") ? "place" : "person", note: "One and the same", members }] };
  }) };
};
const briefAnswer = {
  tone: "Quiet, clear and sunlit.",
  depiction_rules: ["Jonah always carries a net.", "Royalty wears a plain circlet, never a jewelled crown."],
  eras: [{ name: "Lakeside kingdom", people: "Fisherfolk and courtiers.", dress: "Wool tunics.", buildings_and_objects: "Stone palace, wooden boats.", technology: "Sail and oar." }],
  assignments: [{ first_section: "alpha-1-1", last_section: "beta-1-1", era: "Lakeside kingdom" }],
  style_set: [{ style_id: "classical", reason: "Grounded, painterly." }, { style_id: "watercolor", reason: "Airy lakeside light." }, { style_id: "neon", reason: "invented" }],
};
const happyScript: Record<string, Script> = { "read:alpha": () => alphaReading, "read:beta": () => betaReading, "merge:": ruling, brief: () => briefAnswer };

describe("reading pass", () => {
  it("reads, merges with same-name hints, drafts the brief and stages a candidate that cannot activate", async () => {
    const model = scriptedModel(happyScript);
    const memory = createMemoryAnalysisStore();
    const saves: number[] = [];
    const state = await runReadingPass({ workFile: twoBooks, workVersion: "wv1", model, store: memory.store, state: emptyState("two-books", "wv1"),
      saveState: async (s) => { saves.push(s.ledger.length); }, budgetUsd: 1,
      hints: { sectionTargets: { alpha: 2, beta: 1 }, sameNames: { "the king": { individuals: 2, kind: "person", byBook: { alpha: 1, beta: 1 } } } } });

    // Section targets came from the hints (6 units / 2 sections = 3 per section).
    expect(model.calls[0].system).toContain("Aim for roughly 2 sections");
    expect(model.calls[0].user).toContain("[1-1] Jonah the fisherman");
    // The merge prompt carried the same-name hint and the ruling kept the kings apart.
    const mergeCall = model.calls.find((c) => c.label.startsWith("merge:"))!;
    expect(mergeCall.user).toMatch(/hint: the reference index lists 2 distinct individuals named "the king"/);
    const names = state.merge!.entries.map((e) => e.name).sort();
    expect(names).toEqual(["Amos", "Jonah", "the crowd", "the king of the city", "the lake", "the messenger", "the new king", "the palace"]);
    const jonah = state.merge!.entries.find((e) => e.name === "Jonah")!;
    expect(jonah.members).toEqual(["alpha:character:jonah", "beta:character:jonah"]);
    expect(jonah.aliases).toEqual(expect.arrayContaining(["the fisherman", "the sailor"]));
    // Section casts use merged ids, and "named" is decided from the text.
    const first = state.merge!.sections[0];
    // "a messenger" is a description, not a name, so the messenger is on stage but unnamed.
    expect(first.onStage).toEqual([{ id: "jonah", named: true }, { id: "amos", named: true }, { id: "the_messenger", named: false }]);
    expect(state.merge!.sections[2].mentionedOnly).toEqual(["the_new_king"]);
    // Unit-mode moments: one per unit, inside their section.
    expect(Object.values(state.moments).flat()).toHaveLength(9);
    expect(state.moments.alpha[3]).toMatchObject({ firstUnitId: "alpha-1-4", sectionId: "alpha-1-4" });
    // The draft brief: validated, style set from the library only, the Jonah rule routed to canon.
    expect(state.brief!.brief.styleIds).toEqual(["classical", "watercolor"]);
    expect(state.brief!.styleReasons.map((s) => s.styleId)).toEqual(["classical", "watercolor"]);
    expect(state.brief!.brief.depictionRules.map((r) => r.text)).toEqual(["Royalty wears a plain circlet, never a jewelled crown."]);
    expect(state.brief!.canonHints).toEqual([expect.objectContaining({ entryId: "jonah", text: "Jonah always carries a net." })]);
    expect(state.brief!.sectionEras).toEqual({ "alpha-1-1": "lakeside-kingdom", "alpha-1-4": "lakeside-kingdom", "beta-1-1": "lakeside-kingdom" });
    expect(state.brief!.validationErrors).toEqual([]);
    // Spend recorded; state saved after every call.
    expect(state.ledger).toHaveLength(4);
    expect(saves.length).toBeGreaterThanOrEqual(4);
    // Staged into the store with stage-less entries.
    expect(state.staged).toEqual({ generation: 1, records: 8 + 3 + 9 });
    const entry = memory.generations[0].records.find((r) => r.kind === "entry" && r.recordId === "jonah")!;
    expect(entry.payload).toMatchObject({ kind: "entry", entryKind: "character", aliases: expect.arrayContaining(["the sailor"]), stages: [] });

    // The same records in the real store cannot be activated before canon exists.
    const t = convexTest(schema, modules);
    process.env.CONVEX_SERVER_SECRET = "s".repeat(40);
    const client = { mutation: (ref: unknown, args: unknown) => t.mutation(ref as never, args as never) };
    const convexStore = createConvexAnalysisStore(client as never, "s".repeat(40));
    await convexStore.registerWork({ workId: "two-books", workVersion: "wv1", briefVersion: "draft" });
    const { generation } = await convexStore.stageGeneration({ workId: "two-books", workVersion: "wv1", briefVersion: "draft" });
    await convexStore.putRecords({ workId: "two-books", generation, records: analysisRecords(state) });
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: "s".repeat(40), workId: "two-books", generation })).rejects.toThrow(/stages/);
    expect((await t.query(api.analysis.getWorkStatus, { workId: "two-books" })).ready).toBe(false);
  });

  it("retries an empty division coarser and malformed ranges with feedback, within three attempts", async () => {
    const work = createWorkReader(twoBooks);
    const alpha = rootDivisions(work)[0];
    const model = scriptedModel({ "read:alpha": (request, calls) => {
      if (calls.length === 1) return { ...alphaReading, sections: [] };
      if (calls.length === 2) {
        expect(request.system).toContain("averaging about 5 units"); // coarser than the 3 the hint gave
        return { ...alphaReading, sections: [{ ...alphaReading.sections[0], end: "1-2" }, { ...alphaReading.sections[1], start: "2-1" }] }; // gap at 1-3..1-4
      }
      expect(request.user).toContain("units 1-3 to 1-4 belong to no section");
      return alphaReading;
    } });
    const reading = await readDivision({ work, division: alpha, model, unitsPerSection: 3 });
    expect(reading.attempts.map((a) => [a.unitsPerSection, a.problems])).toEqual([[3, ["no sections returned"]], [5, ["units 1-3 to 1-4 belong to no section"]], [5, []]]);
    expect(reading.sections.map((s) => [s.firstUnitId, s.lastUnitId])).toEqual([["alpha-1-1", "alpha-1-3"], ["alpha-1-4", "alpha-2-2"]]);

    const stubborn = scriptedModel({ "read:alpha": () => ({ ...alphaReading, sections: [{ ...alphaReading.sections[0], start: "1-3", end: "1-1" }] }) });
    await expect(readDivision({ work, division: alpha, model: stubborn, unitsPerSection: 3 })).rejects.toThrow(/could not be read in 3 attempts.*inverted/);
  });

  it("stops before a call that would pass the budget and resumes without repeating completed calls", async () => {
    const model = scriptedModel(happyScript, 0.01);
    const saved: ReadingPassState[] = [];
    const saveState = async (s: ReadingPassState) => { saved.push(JSON.parse(JSON.stringify(s))); };
    const memory = createMemoryAnalysisStore();
    const cheap = { ...twoBooks };
    await expect(runReadingPass({ workFile: cheap, workVersion: "wv1", model, store: memory.store, state: emptyState("two-books", "wv1"), saveState, budgetUsd: 0.0105 }))
      .rejects.toThrow(BudgetExceededError);
    expect(model.calls.map((c) => c.label)).toEqual(["read:alpha:1"]);
    const resumed = saved[saved.length - 1];
    expect(Object.keys(resumed.readings)).toEqual(["alpha"]);
    expect(resumed.ledger).toHaveLength(1);

    const plan = planReadingPass(createWorkReader(twoBooks), resumed, {});
    expect(plan.divisions.map((d) => [d.id, d.done])).toEqual([["alpha", true], ["beta", false]]);
    expect(plan.remainingCalls).toBe(3);

    const state = await runReadingPass({ workFile: twoBooks, workVersion: "wv1", model, store: memory.store, state: resumed, saveState, budgetUsd: 1 });
    expect(model.calls.map((c) => c.label)).toEqual(["read:alpha:1", "read:beta:1", "merge:0", "brief"]);
    expect(state.staged?.generation).toBe(1);
    await expect(runReadingPass({ workFile: twoBooks, workVersion: "wv2", model, store: memory.store, state, saveState, budgetUsd: 1 })).rejects.toThrow(/Start a new run/);
  });

  it("reads prose moments inside sections and splits long runs at paragraph boundaries", async () => {
    const work = createWorkReader(voyage);
    const divisions = rootDivisions(work);
    const local = (id: string, division: string) => id.slice(division.length + 1);
    const reading = (division: { id: string; units: readonly { id: string }[] }) => ({
      characters: [{ id: "the_captain", name: "the captain", aliases: [], kind: "person", note: "Captain.", same_person_as: "" }], locations: [],
      sections: [{ start: local(division.units[0].id, division.id), end: local(division.units[division.units.length - 1].id, division.id), title: `All of ${division.id}`, setting: [], on_stage: ["the_captain"], mentioned_only: [] }],
      brief: { tone: "Salt and wind.", depiction_rules: [], era: { name: "Age of sail", people: "Sailors.", dress: "Oilskins.", buildings_and_objects: "Ships.", technology: "Sail." } },
    });
    const model = scriptedModel({
      "read:": (request) => reading(divisions.find((d) => request.label.startsWith(`read:${d.id}:`))!),
      "merge:": ruling,
      "moments:": (request, calls) => {
        const division = divisions.find((d) => request.label.startsWith(`moments:${d.id}:`))!;
        const first = local(division.units[0].id, division.id);
        const last = local(division.units[division.units.length - 1].id, division.id);
        const attempt = calls.filter((c) => c.label.startsWith(`moments:${division.id}:`)).length;
        if (division.id === "voyage" && attempt === 1) return { moments: [{ section_start: first, start: first, end: local(division.units[1].id, division.id), summary: "a" }] }; // incomplete
        if (division.id === "voyage") expect(request.user).toMatch(/belong to no moment/);
        return { moments: [{ section_start: first, start: first, end: last, summary: "all" }] };
      },
      brief: () => ({ tone: "Salt and wind.", depiction_rules: [], eras: [{ name: "Age of sail", people: "Sailors.", dress: "Oilskins.", buildings_and_objects: "Ships.", technology: "Sail." }],
        assignments: [{ first_section: divisions[0].units[0].id, last_section: divisions[1].units[0].id, era: "Age of sail" }], style_set: [{ style_id: "watercolor", reason: "sea" }] }),
    });
    const state = await runReadingPass({ workFile: voyage, workVersion: "v", model, store: null, state: emptyState("nested-prose", "v"), saveState: async () => {}, budgetUsd: 1 });
    const moments = state.moments.voyage;
    expect(moments[0].firstUnitId).toBe(divisions[0].units[0].id);
    expect(moments[moments.length - 1].lastUnitId).toBe(divisions[0].units[divisions[0].units.length - 1].id);
    expect(moments.every((m) => m.sectionId === divisions[0].units[0].id)).toBe(true);
    expect(model.calls.filter((c) => c.label.startsWith("moments:voyage")).length).toBe(2);
    expect(state.staged).toBeNull();

    const long = Array.from({ length: 6 }, (_, i) => ({ ...divisions[0].units[0], id: `u${i}`, text: Array(250).fill("word").join(" ") }));
    const pieces = splitLongRun(long as never, 600);
    expect(pieces.map((p) => p.length)).toEqual([2, 2, 2]);
    expect(pieces.flat().map((u) => u.id)).toEqual(long.map((u) => u.id));
  });
});
