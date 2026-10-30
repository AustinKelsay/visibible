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
import { readDivision, rootDivisions, type DivisionReading } from "../reading-pass/division";
import { mergeCasts, MAX_MERGE_MEMBERS_PER_CALL } from "../reading-pass/merge";
import { splitLongRun } from "../reading-pass/moments";
import { responseSchema } from "../reading-pass/prompts";
import { contentVersion } from "../../../convex/_helpers/contentVersion";

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

function exactRuling(request: TextModelRequest, split = false) {
  return { groups: [...request.user.matchAll(/## Group (\d+) \((?:characters|places)\)\n([\s\S]*?)(?=## Group|$)/g)].map((match) => {
    const members = [...match[2].matchAll(/^- (\S+) \| /gm)].map((m) => m[1]);
    return { group: Number(match[1]), clusters: (split ? members.map((m) => [m]) : [members]).map((keys) => ({ name: keys[0].split(":").at(-1)!, kind: "person", note: "Fixture identity ruling.", members: keys })) };
  }) };
}

function castReading(divisionId: string, characters: DivisionReading["characters"]): DivisionReading {
  return { divisionId, label: divisionId, unitCount: 0, characters, locations: [], sections: [], brief: alphaReading.brief, attempts: [] };
}

describe("bounded identity rulings", () => {
  it("constrains each group's provider schema to its own member keys, not other keys in the same batch", async () => {
    const characters = ["ada", "bea"].map((id) => ({ id, name: id, aliases: [], kind: "person" as const, note: "Same person in both books.", same_person_as: "" }));
    const model = scriptedModel({ "merge:": (request) => {
      const answer = exactRuling(request);
      expect(request.schema.safeParse(answer).success).toBe(true);
      const providerSchema = responseSchema(request.schema);
      expect(providerSchema).toHaveProperty("properties.groups.items.anyOf");
      expect(providerSchema).not.toHaveProperty("properties.groups.items.oneOf");
      const foreign = structuredClone(answer);
      foreign.groups[0].clusters[0].members.push(answer.groups[1].clusters[0].members[0]);
      expect(request.schema.safeParse(foreign).success).toBe(false);
      const wrongGroup = structuredClone(answer);
      wrongGroup.groups[0].group = 99;
      expect(request.schema.safeParse(wrongGroup).success).toBe(false);
      return answer;
    } });
    const result = await mergeCasts({ workTitle: "Ada and Bea", workAuthor: "Fixture", readings: [castReading("alpha", characters), castReading("beta", characters)], model, groupsPerCall: 2 });
    expect(result.entries).toHaveLength(2);
    expect(model.calls).toHaveLength(1);
  });

  it("uses one constrained group per request by default, without a union grammar", async () => {
    const characters = ["ada", "bea"].map((id) => ({ id, name: id, aliases: [], kind: "person" as const, note: "Same person across books.", same_person_as: "" }));
    const model = scriptedModel({ "merge:": (request) => {
      const answer = exactRuling(request);
      expect(answer.groups).toHaveLength(1);
      expect(request.schema.safeParse(answer).success).toBe(true);
      expect(JSON.stringify(responseSchema(request.schema))).not.toMatch(/"(?:anyOf|oneOf)"/);
      return answer;
    } });
    const result = await mergeCasts({ workTitle: "Ada and Bea", workAuthor: "Fixture", readings: [castReading("alpha", characters), castReading("beta", characters)], model });
    expect(result.entries).toHaveLength(2);
    expect(model.calls.map((call) => call.label)).toEqual(["merge:0", "merge:1"]);
  });

  it("keeps overlapping aliases separate until ruled, and bounds long alias chains by member count", async () => {
    const characters = Array.from({ length: 180 }, (_, i) => ({ id: `person${i}`, name: `Person${i}`, aliases: [`link${i}`, `link${i + 1}`], kind: "person" as const, note: `Distinct person ${i}.`, same_person_as: "" }));
    const model = scriptedModel({ "merge:": (request) => {
      expect([...request.user.matchAll(/^- \S+ \| /gm)].length).toBeLessThanOrEqual(MAX_MERGE_MEMBERS_PER_CALL);
      // Shared aliases are candidates, not evidence that these 180 people are one person.
      return exactRuling(request, true);
    } });
    const result = await mergeCasts({ workTitle: "Alias chain", workAuthor: "Fixture", readings: [castReading("alpha", characters)], model });
    expect(result.entries).toHaveLength(180);
    expect(result.groups.every((g) => g.members.length === 2)).toBe(true);
    expect(result.unplaced).toEqual([]);
    expect(model.calls.length).toBeGreaterThan(1);
  });

  it("retries omitted, duplicate and foreign members, then refuses incomplete rulings rather than inventing singletons", async () => {
    const characters = [{ id: "ada", name: "Ada", aliases: [], kind: "person" as const, note: "One person.", same_person_as: "" }];
    const readings = [castReading("alpha", characters), castReading("beta", characters)];
    const repaired = scriptedModel({ "merge:": (request, calls) => {
      const answer = exactRuling(request);
      if (calls.length === 1) answer.groups[0].clusters[0].members.pop();
      else {
        expect(request.user).toContain("missing member beta:character:ada");
        expect(request.user).toContain('Previous answer:\n{"groups":');
      }
      return answer;
    } });
    expect((await mergeCasts({ workTitle: "Ada", workAuthor: "Fixture", readings, model: repaired })).entries).toHaveLength(1);
    expect(repaired.calls).toHaveLength(2);
    for (const fault of ["missing", "duplicate", "foreign", "group"] as const) {
      const model = scriptedModel({ "merge:": (request) => {
        const answer = exactRuling(request);
        const cluster = answer.groups[0].clusters[0];
        if (fault === "missing") cluster.members.pop();
        if (fault === "duplicate") cluster.members.push(cluster.members[0]);
        if (fault === "foreign") cluster.members.push("other:character:ada");
        if (fault === "group") answer.groups[0].group = 99;
        return answer;
      } });
      await expect(mergeCasts({ workTitle: "Ada", workAuthor: "Fixture", readings, model })).rejects.toThrow(/Merge ruling failed after 3 attempts/);
      expect(model.calls).toHaveLength(3);
    }
  });

  it("refuses an oversized single alias before a paid call", async () => {
    const readings = [castReading("alpha", Array.from({ length: 151 }, (_, i) => ({ id: `p${i}`, name: "the king", aliases: [], kind: "person" as const, note: "Different kings.", same_person_as: "" })))];
    const model = scriptedModel({ "merge:": (request) => exactRuling(request) });
    await expect(mergeCasts({ workTitle: "Kings", workAuthor: "Fixture", readings, model })).rejects.toThrow(/151 members.*150-member limit/);
    expect(model.calls).toHaveLength(0);
  });

  it("resolves contradictory partial joins with a complete partition that can split the old component", async () => {
    const characters = [
      { id: "ada", name: "Ada", aliases: ["left", "right"] },
      { id: "bea", name: "Bea", aliases: ["left", "middle"] },
      { id: "cara", name: "Cara", aliases: ["right", "middle"] },
    ].map((c) => ({ ...c, kind: "person" as const, note: "Distinct individuals.", same_person_as: "" }));
    const model = scriptedModel({ "merge:": (request) => {
      const answer = exactRuling(request, request.label.startsWith("merge:reconcile:"));
      if (request.label.startsWith("merge:reconcile:")) expect(request.user).toContain("appearance stages are drafted later");
      const first = answer.groups[0].clusters[0];
      if (request.label === "merge:0") answer.groups[0].clusters = first.members.map((member) => ({ ...first, members: [member] }));
      return answer;
    } });
    const result = await mergeCasts({ workTitle: "Conflicting aliases", workAuthor: "Fixture", readings: [castReading("alpha", characters)], model });
    expect(result.entries).toHaveLength(3);
    expect(result.entries.every((entry) => entry.members.length === 1)).toBe(true);
    expect(result.reconciliations).toHaveLength(1);
    expect(result.reconciliations![0].members).toHaveLength(3);
    expect(result.groups).toHaveLength(3); // Original partial decisions remain audit evidence.
    expect(model.calls.filter((call) => call.label.startsWith("merge:reconcile:"))).toHaveLength(1);
  });

  it("stops an oversized conflicting component before any reconciliation call", async () => {
    const characters = Array.from({ length: 151 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, aliases: [`link${i}`, `link${i + 1}`, ...(i === 0 || i === 150 ? ["ends"] : [])], kind: "person" as const, note: "Different people.", same_person_as: "" }));
    const model = scriptedModel({ "merge:": (request) => exactRuling(request, request.user.includes("alpha:character:p0 |") && request.user.includes("alpha:character:p150 |")) });
    await expect(mergeCasts({ workTitle: "Large conflict", workAuthor: "Fixture", readings: [castReading("alpha", characters)], model })).rejects.toThrow(/Conflicting identity component has 151 members.*150-member reconciliation limit/);
    expect(model.calls.some((call) => call.label.startsWith("merge:reconcile:"))).toBe(false);
  });

});
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
    const mergeCall = model.calls.find((c) => c.label.startsWith("merge:") && c.user.includes("hint:"))!;
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
    expect(state.ledger).toHaveLength(6);
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
    expect(model.calls.map((c) => c.label)).toEqual(["read:alpha:1", "read:beta:1", "merge:0", "merge:1", "merge:2", "brief"]);
    expect(state.staged?.generation).toBe(1);
    await expect(runReadingPass({ workFile: twoBooks, workVersion: "wv2", model, store: memory.store, state, saveState, budgetUsd: 1 })).rejects.toThrow(/Start a new run/);
  });

  it("does not reuse identity rulings cached before reasoning was enabled", async () => {
    const model = scriptedModel(happyScript);
    const state = emptyState("two-books", "v1");
    const options = { workFile: twoBooks, workVersion: "v1", store: null, state, saveState: async () => {}, budgetUsd: 1 };
    await runReadingPass({ ...options, model });
    const requests = model.calls.filter((request) => request.label.startsWith("merge:"));
    state.merge = null;
    state.mergeResponses = Object.fromEntries(requests.map((request, i) => [
      contentVersion({ model: model.id, system: request.system, user: request.user, schemaName: request.schemaName, schema: responseSchema(request.schema), maxTokens: request.maxTokens }),
      state.mergeAttempts![i].result,
    ]));
    const resumed = scriptedModel({ "merge:": ruling });
    await runReadingPass({ ...options, model: resumed });
    expect(resumed.calls.map((request) => request.label)).toEqual(["merge:0", "merge:1", "merge:2"]);
    expect(resumed.calls.every((request) => request.reasoningEffort === "high")).toBe(true);
  });

  it("reserves the merge's full output allowance before spending on reasoning", async () => {
    const work = createWorkReader(twoBooks);
    const state = emptyState("two-books", "v1");
    const reader = scriptedModel(happyScript);
    for (const division of rootDivisions(work)) state.readings[division.id] = await readDivision({ work, division, model: reader });
    const model = scriptedModel(happyScript);
    await expect(runReadingPass({ workFile: twoBooks, workVersion: "v1", store: null, state, saveState: async () => {}, model, budgetUsd: 0.01 }))
      .rejects.toThrow(BudgetExceededError);
    expect(model.calls).toHaveLength(0);
    expect(state.ledger).toHaveLength(0);
    expect(state.merge).toBeNull();
  });

  it("resumes an interrupted cast merge from retained responses without repeating completed paid batches", async () => {
    const characters = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Person${i}`, aliases: [], kind: "person" as const, note: `Same person ${i} across both books.`, same_person_as: "" }));
    const reading = (source: typeof alphaReading | typeof betaReading) => ({ ...source, characters, locations: [], sections: source.sections.map((s) => ({ ...s, setting: [], on_stage: ["p0"], mentioned_only: [] })) });
    const model = scriptedModel({
      "read:alpha": () => reading(alphaReading), "read:beta": () => reading(betaReading),
      "merge:": (request) => {
        if (request.label === "merge:1") throw new Error("connection lost");
        const answer = exactRuling(request);
        if (request.label === "merge:0") answer.groups[0].clusters[0].members.pop();
        return answer;
      },
    });
    const state = emptyState("two-books", "v1");
    const options = { workFile: twoBooks, workVersion: "v1", store: null, state, saveState: async () => {}, budgetUsd: 1 };
    await expect(runReadingPass({ ...options, model })).rejects.toThrow("connection lost");
    expect(Object.keys(state.mergeResponses ?? {})).toHaveLength(1);
    expect(state.mergeAttempts).toHaveLength(2);
    expect(state.ledger.map((entry) => entry.label)).toEqual(["read:alpha:1", "read:beta:1", "merge:0", "merge:0:2"]);
    const resumed = scriptedModel({ "merge:": (request) => exactRuling(request), brief: () => briefAnswer });
    const result = await runReadingPass({ ...options, state: JSON.parse(JSON.stringify(state)), model: resumed });
    expect(resumed.calls.map((request) => request.label)).toEqual([...Array.from({ length: 29 }, (_, i) => `merge:${i + 1}`), "brief"]);
    expect(result.merge?.entries).toHaveLength(30);
  });

  it("retains rejected merge answers for audit but asks for a fresh ruling when the same run resumes", async () => {
    const model = scriptedModel({ ...happyScript, "merge:": () => ({ groups: [] }) });
    const state = emptyState("two-books", "v1");
    const options = { workFile: twoBooks, workVersion: "v1", store: null, state, saveState: async () => {}, budgetUsd: 1 };
    await expect(runReadingPass({ ...options, model })).rejects.toThrow(/Merge ruling failed after 3 attempts/);
    expect(Object.keys(state.mergeResponses ?? {})).toHaveLength(0);
    expect(state.mergeAttempts).toHaveLength(3);
    expect(state.merge).toBeNull();
    const resumed = scriptedModel({ "merge:": ruling, brief: () => briefAnswer });
    const result = await runReadingPass({ ...options, state: JSON.parse(JSON.stringify(state)), model: resumed });
    expect(resumed.calls.map((request) => request.label)).toEqual(["merge:0", "merge:1", "merge:2", "brief"]);
    expect(result.merge?.unplaced).toEqual([]);
    expect(result.mergeAttempts).toHaveLength(6);
    expect(result.ledger.filter((entry) => entry.label.startsWith("merge:"))).toHaveLength(6);
  });

  it("retains initial batches when reconciliation fails, then resumes only the complete reconciliation", async () => {
    const common: DivisionReading["characters"] = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Person${i}`, aliases: [], kind: "person", note: `Same person ${i} in both books.`, same_person_as: "" }));
    const conflicting = [
      { id: "ada", name: "Ada", aliases: ["left", "right"] },
      { id: "bea", name: "Bea", aliases: ["left", "middle"] },
      { id: "cara", name: "Cara", aliases: ["right", "middle"] },
    ].map((entry) => ({ ...entry, kind: "person" as const, note: "Distinct people.", same_person_as: "" }));
    const reading = (source: typeof alphaReading | typeof betaReading, characters: typeof common) => ({ ...source, characters, locations: [], sections: source.sections.map((section) => ({ ...section, setting: [], on_stage: ["p0"], mentioned_only: [] })) });
    const model = scriptedModel({
      "read:alpha": () => reading(alphaReading, [...conflicting, ...common]), "read:beta": () => reading(betaReading, common),
      "merge:": (request) => {
        if (request.label.startsWith("merge:reconcile:")) return { groups: [] };
        const answer = exactRuling(request);
        if (request.label === "merge:0") {
          const cluster = answer.groups[0].clusters[0];
          answer.groups[0].clusters = cluster.members.map((member) => ({ ...cluster, members: [member] }));
        }
        return answer;
      },
    });
    const state = emptyState("two-books", "v1");
    const options = { workFile: twoBooks, workVersion: "v1", store: null, state, saveState: async () => {}, budgetUsd: 1 };
    await expect(runReadingPass({ ...options, model })).rejects.toThrow(/Merge ruling failed after 3 attempts/);
    expect(state.merge).toBeNull();
    expect(state.mergeAttempts).toHaveLength(36);
    expect(Object.keys(state.mergeResponses ?? {})).toHaveLength(33);
    const resumed = scriptedModel({ "merge:": (request) => exactRuling(request, true), brief: () => briefAnswer });
    const result = await runReadingPass({ ...options, state: JSON.parse(JSON.stringify(state)), model: resumed });
    expect(resumed.calls.map((request) => request.label)).toEqual(["merge:reconcile:alpha:character:ada", "brief"]);
    expect(result.mergeAttempts).toHaveLength(37);
    expect(result.merge?.entries).toHaveLength(33); // Thirty cached common joins and three distinct aliases.
    expect(result.merge?.reconciliations).toHaveLength(1);
  });

  it("reuses a completed reconciliation after a later component loses its connection", async () => {
    const characters = ["a", "b"].flatMap((prefix) => [
      { id: `${prefix}_ada`, name: `${prefix}ada`, aliases: [`${prefix}_left`, `${prefix}_right`] },
      { id: `${prefix}_bea`, name: `${prefix}bea`, aliases: [`${prefix}_left`, `${prefix}_middle`] },
      { id: `${prefix}_cara`, name: `${prefix}cara`, aliases: [`${prefix}_right`, `${prefix}_middle`] },
    ].map((entry) => ({ ...entry, kind: "person" as const, note: "Different individuals.", same_person_as: "" })));
    const read = (source: typeof alphaReading | typeof betaReading, alpha: boolean) => ({ ...source, characters: alpha ? characters : [], locations: [], sections: source.sections.map((section) => ({ ...section, setting: [], on_stage: alpha ? ["a_ada"] : [], mentioned_only: [] })) });
    const model = scriptedModel({
      "read:alpha": () => read(alphaReading, true), "read:beta": () => read(betaReading, false),
      "merge:": (request) => {
        if (request.label === "merge:reconcile:alpha:character:b_ada") throw new Error("connection lost");
        return exactRuling(request, request.label === "merge:0" || request.label === "merge:3" || request.label.startsWith("merge:reconcile:"));
      },
    });
    const state = emptyState("two-books", "v1");
    const options = { workFile: twoBooks, workVersion: "v1", store: null, state, saveState: async () => {}, budgetUsd: 1 };
    await expect(runReadingPass({ ...options, model })).rejects.toThrow("connection lost");
    expect(state.merge).toBeNull();
    expect(state.mergeAttempts).toHaveLength(7);
    expect(Object.keys(state.mergeResponses ?? {})).toHaveLength(7);
    const resumed = scriptedModel({ "merge:": (request) => exactRuling(request, true), brief: () => briefAnswer });
    const result = await runReadingPass({ ...options, state: JSON.parse(JSON.stringify(state)), model: resumed });
    expect(resumed.calls.map((request) => request.label)).toEqual(["merge:reconcile:alpha:character:b_ada", "brief"]);
    expect(result.mergeAttempts).toHaveLength(8);
    expect(result.merge?.entries).toHaveLength(6);
    expect(result.merge?.reconciliations).toHaveLength(2);
  });

  it("rejects a character marked both on-stage and mentioned-only and carries the conflict into its bounded repair", async () => {
    const work = createWorkReader(twoBooks);
    const division = rootDivisions(work)[0];
    const rejected = { ...alphaReading, sections: alphaReading.sections.map((s, i) => i === 0 ? { ...s, mentioned_only: [...s.mentioned_only, "jonah"] } : s) };
    const model = scriptedModel({ "read:alpha": (request, calls) => {
      if (calls.length === 1) return rejected;
      expect(request.user).toContain("assigns jonah to both on_stage and mentioned_only");
      return alphaReading;
    } });
    const result = await readDivision({ work, division, model });
    expect(result.attempts).toHaveLength(2);
    expect(result.sections[0].onStage.map((entry) => entry.id)).toContain("jonah");
    expect(result.sections[0].mentionedOnly).not.toContain("jonah");
  });

  it("carries the rejected answer into cast repairs and still rejects partial replacement sections", async () => {
    const work = createWorkReader(twoBooks);
    const division = rootDivisions(work)[0];
    const rejected = { ...alphaReading, sections: alphaReading.sections.map((s, i) => i === 0 ? { ...s, on_stage: [...s.on_stage, "undefined_placeholder"], mentioned_only: [...s.mentioned_only, "the_lake"] } : s) };
    const model = scriptedModel({ "read:alpha": (request, calls) => {
      if (calls.length === 1) return rejected;
      expect(request.user).toContain(JSON.stringify(rejected));
      expect(request.user).toContain("unknown character id undefined_placeholder");
      expect(request.user).toContain("mentioned_only contains location id the_lake; only characters belong");
      expect(request.user).toContain("FULL corrected JSON object, not a patch");
      expect(request.user).toContain("Every unit from 1-1 through 2-2 must still be covered");
      return alphaReading;
    } });
    const reading = await readDivision({ work, division, model });
    expect(reading.attempts).toHaveLength(2);
    expect(reading.sections).toHaveLength(2);
    expect(reading.sections.at(-1)?.lastUnitId).toBe("alpha-2-2");

    const partial = scriptedModel({ "read:alpha": (_request, calls) => calls.length === 1 ? rejected : { ...alphaReading, sections: [alphaReading.sections[0]] } });
    await expect(readDivision({ work, division, model: partial })).rejects.toThrow(/units 1-4 to 2-2 belong to no section/);
    expect(partial.calls).toHaveLength(3);
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
