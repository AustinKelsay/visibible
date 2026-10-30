/** Exact replies from the stopped text comparison; no provider calls or new semantic scores. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { invalidReview, planReviewSystem, planReviewUser, reviewPlan, type PlanReviewProblem } from "../engine/plan-review";
import { prepareMoment } from "../engine/preparation";
import { createMemoryPreparationStore } from "../engine/memory-store";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import type { WorkBrief } from "../work-preparation";
import { cases } from "../../../llm/releases/2026-10-24-rendering-review-check/controls.mjs";
import { testDepiction } from "../../../tests/fixtures/depiction";

const PLAN_REVIEW_SYSTEM = planReviewSystem(testDepiction("citation-test"));

const traces = readFileSync(new URL("../../../llm/releases/2026-10-24-rendering-review-check/provider.ndjson", import.meta.url), "utf8")
  .trim().split("\n").map((line) => JSON.parse(line)).filter((row) => row.phase === "look-time-candidate");
const input = cases.find((c) => c.id === "look-time")!.input;
const problem = (planQuote: string): PlanReviewProblem => ({ kind: "look_conflict", entryId: "", planQuote, reason: "Citation boundary probe only." });

describe("look review citations", () => {
  it.each(traces.map((trace, index) => ({ trace, index })))("accepts retained JSON citation $index on its first review attempt", async ({ trace }) => {
    const spend = vi.fn(async () => {});
    const complete = vi.fn(async () => ({ content: trace.response.choices[0].message.content, model: "recorded", providerRequestId: null,
      finishReason: "stop", usage: { promptTokens: 1, completionTokens: 1, costUsd: trace.measuredUsageUsd }, elapsedMs: 0 }));
    // Since review v10 only owner look constraints are reviewed as look input; historical citations still validate.
    expect(PLAN_REVIEW_SYSTEM).toContain("OWNER LOOK CONSTRAINTS");
    expect(trace.request.messages[0].content).toContain("verbatim section look");
    expect(planReviewUser(input)).toBe(trace.request.messages[1].content);
    const result = await reviewPlan({ id: "recorded", complete }, spend, "look-time", input);
    expect(result).toEqual(JSON.parse(trace.response.choices[0].message.content));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: "review problems", costUsd: trace.measuredUsageUsd }));
  });

  it.each(["night", '"night"'])("keeps plain and complete JSON string citations valid: %s", (quote) => {
    expect(invalidReview([problem(quote)], input)).toBeNull();
  });

  it.each([
    '"timeOfDay":"day"',
    '"weather":"night"',
    '"timeOfDay"',
    '"timeOfDay":"night","weather":"clear"',
    'timeOfDay":"nigh',
    '["night"]',
    '{"timeOfDay":"night"}',
    "",
  ])("rejects an unsupported, partial or cross-field JSON citation: %s", (quote) => {
    expect(invalidReview([problem(quote)], input)).toBe("look_conflict quote is not in the look");
  });

  it("validates escaped content against the actual field and leaves other checks strict", () => {
    const quoted = structuredClone(input);
    quoted.rendering!.look.clothing = 'plain "linen" garments';
    expect(invalidReview([problem('"clothing":"plain \\"linen\\" garments"')], quoted)).toBeNull();
    expect(invalidReview([{ ...problem('"timeOfDay":"night"'), entryId: "unknown" }], input)).toBe("look_conflict names unknown cast unknown");
    expect(invalidReview([{ ...problem('"timeOfDay":"midday"'), kind: "outside_instant" }], input)).toBe("outside_instant quote is not in the plan");
    quoted.rendering!.look.clothing = "";
    expect(invalidReview([problem('"clothing":""')], quoted)).toBe("look_conflict quote is not in the look");
  });

  it("keeps the plan and notes a literal owner-constraint conflict after two accounted calls, without a re-plan", async () => {
    const memory = createMemoryPreparationStore([
      { kind: "section", recordId: "section", payload: { kind: "section", title: input.sectionTitle, era: "era", firstUnit: "constructed", lastUnit: "constructed", cast: [] } },
      { kind: "moment", recordId: "constructed", payload: { kind: "moment", sectionId: "section", firstUnit: "constructed", lastUnit: "constructed" } },
    ]);
    const brief: WorkBrief = { schemaVersion: 1, workId: "citation-test", tone: "Quiet.", depictionRules: [{ text: input.rules }],
      eras: [{ id: "era", label: "Ancient", people: "Travelers", dress: "Linen", buildingsAndObjects: "Stone", technology: "Hand tools" }], styleIds: ["classical"] };
    await memory.store.putDerivedRecord({ kind: "look", recordId: "section", payload: { kind: "look", sectionId: "section", ...input.rendering!.look }, inputs: [] });
    (await memory.store.getActiveRecord("look", "section"))!.source = "owner";
    const calls: TextModelRequest[] = [];
    const model: TextModel = { id: "recorded", complete: async (request) => {
      calls.push(request);
      const content = request.schemaName === "plan_review" ? traces[0].response.choices[0].message.content
        : JSON.stringify(request.schemaName === "section_look" ? input.rendering!.look : {
          focusQuote: input.context.moment.text, instant: "The traveler stands still at midday.",
          selectedCast: [], ...input.fields,
        });
      return { content, model: "recorded", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0001 }, elapsedMs: 0 };
    } };
    const prepared = await prepareMoment({ workId: brief.workId, depiction: testDepiction(brief.workId), momentId: "constructed", store: memory.store, model, brief, briefVersion: "brief", context: input.context });
    // A re-plan cannot change owner text, so the conflict is recorded instead of re-planned or refused.
    expect(calls.map((c) => c.schemaName)).toEqual(["scene_plan", "plan_review"]);
    expect(calls[1].user).toContain("OWNER LOOK CONSTRAINTS (binding verbatim rendering input)");
    expect(prepared.situation).toEqual(input.rendering!.look);
    const stored = await memory.store.getActiveRecord("plan", "constructed");
    expect(stored?.payload.review).toEqual({ rounds: 1, notes: [expect.stringMatching(/^noted: look_conflict: /)] });
    expect((await memory.store.getActiveRecord("look", "section"))?.payload).toEqual({ kind: "look", sectionId: "section", ...input.rendering!.look });
    expect(memory.ledger.map((entry) => entry.outcome)).toEqual(["ok", "review problems"]);
  });
});
