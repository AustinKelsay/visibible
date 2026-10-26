import { withSituation } from "../../../tests/fixtures/scene-grounding";
/** Captured false-clean plans with scripted adverse reviews; live semantic obedience is evaluated separately. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { reviewReply } from "../../../tests/fixtures/plan-review";
import { selectionReply } from "../../../tests/fixtures/scene-grounding";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../engine/preparation";
import { type ReviewInput } from "../engine/plan-review";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";

const release = new URL("../../../llm/releases/2026-10-23-single-selection-check/", import.meta.url);
const rows = readFileSync(new URL("results.ndjson", release), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const set = JSON.parse(readFileSync(new URL("../2026-10-23-cast-policy-check/sample-set.json", release), "utf8"));
const cases = JSON.parse(readFileSync(new URL("../2026-10-23-source-identity-check/review-cases.json", release), "utf8")) as Array<{ id: string; input: ReviewInput }>;
const priest = "the_priests_of_jerusalem";

async function setup(repeat: number, repair: boolean) {
  const row = rows.find((r) => r.id === `selection-s034-${repeat}`), payload = row.result.stored.payload;
  const sample = set.samples.find((s: { momentId: string }) => s.momentId === "lamentations-4-7");
  const records: AnalysisRecord[] = structuredClone(sample.keys.map((key: string) => set.records[key]));
  const writes: AnalysisRecord[] = [], calls: TextModelRequest[] = [], spend: string[] = [];
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
    claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (entry) => { spend.push(entry.outcome); },
    putDerivedRecord: async (args) => {
      const record = { ...structuredClone(args), source: "generated", version: contentVersion(args.payload) } as AnalysisRecord;
      const index = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId);
      if (index < 0) records.push(record); else records[index] = record;
      writes.push(record); return { version: record.version };
    },
  };
  const problem = { kind: "outside_instant", entryId: priest, planQuote: payload.plan.primarySubject,
    reason: "The source identifies nobles; neither this moment nor its neighbors identifies them as priests." };
  const captured = selectionReply({ ...payload.plan, missingCast: [], present: payload.entries.map((e: { entryId: string }) => e.entryId), grounding: payload.grounding });
  const replacement = { ...payload.plan, primarySubject: "Unnamed nobles standing together", action: "They stand upright with composed bearing",
    setting: "an open space", secondaryElements: "", composition: "the nobles together in one view", missingCast: [],
    selectedCast: [], consideredCast: [], grounding: { focusQuote: "Her nobles were purer than snow.", instant: "The nobles stand together.", singleInstant: true } };
  let plans = 0, reviews = 0;
  const model: TextModel = { id: "scripted", complete: async (request) => {
    calls.push(request);
    if (request.schemaName === "plan_review") return reviewReply(++reviews === 2 && repair ? [] : [problem]);
    const value = request.schemaName === "section_look"
      ? { place: "Jerusalem", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "plain robes" }
      : ++plans === 2 && repair ? replacement : captured;
    return { content: JSON.stringify(withSituation(value)), model: "scripted", providerRequestId: null, finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0001 }, elapsedMs: 0 };
  } };
  const inputs = await readWorkInputs("bible-web");
  const run = () => prepareMoment({ workId: "bible-web", momentId: "lamentations-4-7", store, model, brief: inputs.brief, briefVersion: inputs.briefVersion,
    context: cases.find((c) => c.id === `retained-priest-${repeat}`)!.input.context });
  return { run, calls, writes, spend, problem, captured };
}

describe("source identity review over retained false-clean plans", () => {
  it.each([1, 2])("refuses retained plan %i after exactly one re-plan when the identity review repeats", async (repeat) => {
    const { run, calls, writes, spend } = await setup(repeat, false);
    await expect(run()).rejects.toThrow(`plan review: outside_instant ${priest}`);
    expect(calls.filter((c) => c.schemaName === "scene_plan")).toHaveLength(2);
    expect(calls.filter((c) => c.schemaName === "plan_review")).toHaveLength(2);
    expect(writes.filter((w) => w.kind === "plan")).toHaveLength(0);
    expect(spend.filter((s) => s === "review problems")).toHaveLength(2);
    // The reviewer sees the actual rendering fields and IDs, without the planner's identity rationale.
    const firstReview = calls.find((c) => c.schemaName === "plan_review")!;
    expect(firstReview.user).toContain("Her nobles were purer than snow.");
    expect(firstReview.user).toContain(`present: ${priest}`);
    expect(firstReview.user).not.toContain("momentQuote");
  });

  it("stores a source-supported incidental replacement without inserting a priest or other cast ID", async () => {
    const { run, calls, writes, problem } = await setup(2, true);
    const result = await run();
    expect(result.present).toEqual([]);
    expect(calls.filter((c) => c.schemaName === "scene_plan")[1].user).toContain(problem.reason);
    expect(writes.find((w) => w.kind === "plan")!.payload).toMatchObject({ entries: [], plan: { primarySubject: "Unnamed nobles standing together" }, review: { rounds: 2, problems: [problem] } });
  });
});
