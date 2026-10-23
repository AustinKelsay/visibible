/**
 * Lazy looks and plans (#171) over the real Convex analysis module with a scripted model:
 * reuse across styles and translations, section boundaries, selected cast and stages, targeted
 * invalidation, concurrent misses, failures without fallback, and recorded owner spend.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { prepareMoment, createConvexPreparationStore, PreparationUnavailableError, type MomentContext } from "../engine/preparation";
import type { TextModel, TextModelRequest, TextModelResult } from "../reading-pass/model";
import type { WorkBrief } from "../work-preparation";
import { withGrounding } from "../../../tests/fixtures/scene-grounding";

const SECRET = "s".repeat(40);
process.env.CONVEX_SERVER_SECRET = SECRET;
const WORK = "two-books";
const brief: WorkBrief = {
  schemaVersion: 1, workId: WORK, tone: "Quiet and clear.", depictionRules: [{ text: "Royalty wears a plain circlet." }],
  eras: [{ id: "lakeside", label: "Lakeside kingdom", people: "Fisherfolk.", dress: "Wool.", buildingsAndObjects: "Boats.", technology: "Sail." }], styleIds: ["classical"],
};

function scriptedModel(answer: (request: TextModelRequest) => unknown, costUsd = 0.0005) {
  const calls: TextModelRequest[] = [];
  const model: TextModel & { calls: TextModelRequest[] } = {
    id: "scripted", calls,
    async complete(request): Promise<TextModelResult> {
      calls.push(request);
      const value = answer(request);
      if (value instanceof Error) throw value;
      return { content: typeof value === "string" ? value : JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 100, completionTokens: 40, costUsd }, elapsedMs: 2 };
    },
  };
  return model;
}
const lookAnswer = { place: "Lakeshore with two boats", timeOfDay: "dawn", weather: "calm", light: "low sun", clothing: "wool tunics" };
const planAnswer = (present: string[]) => ({ present, missingCast: [], primarySubject: "Jonah kneeling", action: "mends nets", setting: "shore", secondaryElements: "boats", mood: "quiet", timeOfDay: "dawn", composition: "wide" });
const defaultAnswer = (request: TextModelRequest) => request.label.startsWith("look:") ? lookAnswer : withGrounding(planAnswer(["jonah"]), `Text of ${request.label.split(":")[1]}.`);

const records = [
  { kind: "entry" as const, recordId: "jonah", payload: { kind: "entry" as const, name: "Jonah", entryKind: "character" as const, hasForm: true, stages: [{ id: "young", text: "Jonah: young fisherman." }, { id: "old", text: "Jonah: weathered sailor." }] } },
  { kind: "entry" as const, recordId: "amos", payload: { kind: "entry" as const, name: "Amos", entryKind: "character" as const, hasForm: true, stages: [{ id: "main", text: "Amos: a hill farmer." }] } },
  { kind: "section" as const, recordId: "alpha-1-1", payload: { kind: "section" as const, title: "Jonah at the lake", firstUnit: "alpha-1-1", lastUnit: "alpha-1-3", era: "lakeside", cast: [{ entryId: "jonah", stageId: "old" }, { entryId: "amos", stageId: "main" }] } },
  { kind: "section" as const, recordId: "alpha-1-4", payload: { kind: "section" as const, title: "Before the king", firstUnit: "alpha-1-4", lastUnit: "alpha-1-4", era: "lakeside", cast: [{ entryId: "jonah", stageId: "young" }] } },
  { kind: "moment" as const, recordId: "alpha-1-1", payload: { kind: "moment" as const, sectionId: "alpha-1-1", firstUnit: "alpha-1-1", lastUnit: "alpha-1-1" } },
  { kind: "moment" as const, recordId: "alpha-1-2", payload: { kind: "moment" as const, sectionId: "alpha-1-1", firstUnit: "alpha-1-2", lastUnit: "alpha-1-3" } },
  { kind: "moment" as const, recordId: "alpha-1-4", payload: { kind: "moment" as const, sectionId: "alpha-1-4", firstUnit: "alpha-1-4", lastUnit: "alpha-1-4" } },
];
const context = (id: string, previous: string | null, next: string | null): MomentContext => ({ moment: { id, reference: id, text: `Text of ${id}.` }, previous: previous ? { text: previous } : null, next: next ? { text: next } : null });

describe("lazy looks and plans", () => {
  let t: ReturnType<typeof convexTest>;
  let client: { query: (ref: unknown, args: unknown) => Promise<unknown>; mutation: (ref: unknown, args: unknown) => Promise<unknown> };
  beforeEach(async () => {
    t = convexTest(schema, modules);
    client = { query: (ref, args) => t.query(ref as never, args as never), mutation: (ref, args) => t.mutation(ref as never, args as never) };
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
  });
  const store = () => createConvexPreparationStore(client, api.analysis as unknown as Record<string, unknown>, WORK, SECRET);
  const fast = { now: () => Date.now(), sleep: async () => {} };

  it("makes the look once per section and the plan once per moment, shared by every style and translation", async () => {
    const model = scriptedModel(defaultAnswer);
    const first = await prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-1", null, "Text of alpha-1-2."), ...fast });
    expect(first.calls).toBe(2);
    expect(first.look.payload).toEqual(lookAnswer);
    // The planner chose Jonah only; the stage comes from the section's assignment, not the first stage.
    expect(first.present).toEqual([{ entryId: "jonah", stageId: "old", version: expect.any(String) }]);
    expect(first.plan.payload.present).toEqual(["jonah"]);
    const saved = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "alpha-1-1" });
    if (saved?.payload.kind !== "plan") throw new Error("Missing stored plan");
    expect(saved.payload.grounding).toEqual(withGrounding(planAnswer(["jonah"]), "Text of alpha-1-1.").grounding);
    expect(saved.payload.plan).not.toHaveProperty("grounding");
    expect(model.calls[1].user).toContain("NEXT: Text of alpha-1-2.");
    expect(model.calls[1].user).toContain("PREVIOUS: (section starts here)");
    expect(model.calls[1].user).not.toMatch(/style|classical/i);

    // Second moment of the same section: the look is reused, only a plan is made.
    const second = await prepareMoment({ workId: WORK, momentId: "alpha-1-2", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-2", "Text of alpha-1-1.", null), ...fast });
    expect(second.calls).toBe(1);
    expect(second.look.version).toBe(first.look.version);
    // Any later request for the first moment, whatever the style or translation, makes no call.
    const again = await prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), ...fast });
    expect(again.calls).toBe(0);
    expect(again.plan.version).toBe(first.plan.version);
    // A moment in the next section gets its own look and the section's own stage for Jonah.
    const third = await prepareMoment({ workId: WORK, momentId: "alpha-1-4", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-4", null, null), ...fast });
    expect(third.calls).toBe(2);
    expect(third.present).toEqual([{ entryId: "jonah", stageId: "young", version: expect.any(String) }]);
    const spend = await t.query(api.analysis.getPreparationSpend, { workId: WORK });
    expect(spend.calls).toBe(5);
    expect(spend.costUsd).toBeCloseTo(0.0025, 6);
  });

  it("uses a reassigned canon stage even when the refreshed look has identical content", async () => {
    const model = scriptedModel(defaultAnswer);
    const options = { workId: WORK, momentId: "alpha-1-1", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), ...fast };
    const first = await prepareMoment(options);
    const section = records.find((record) => record.kind === "section" && record.recordId === "alpha-1-1")!;
    if (section.payload.kind !== "section") throw new Error("Missing section fixture");
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "section", recordId: section.recordId,
      payload: { ...section.payload, cast: [{ entryId: "jonah", stageId: "young" }, { entryId: "amos", stageId: "main" }] } });
    const changed = await prepareMoment(options);
    expect(changed.look.version).toBe(first.look.version);
    expect(changed.present).toEqual([{ entryId: "jonah", stageId: "young", version: expect.any(String) }]);
    expect(changed.calls).toBe(2);
    expect(model.calls.map((call) => call.schemaName)).toEqual(["section_look", "scene_plan", "section_look", "scene_plan"]);
  });

  it("remakes only what an owner edit or a cleared plan invalidates", async () => {
    const model = scriptedModel(defaultAnswer);
    const first = await prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), ...fast });
    // Owner edits the look: the plan named the old look version, so only the plan is remade.
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "look", recordId: "alpha-1-1", payload: { kind: "look", sectionId: "alpha-1-1", ...lookAnswer, weather: "storm" } });
    const afterLookEdit = await prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), ...fast });
    expect(afterLookEdit.calls).toBe(1);
    expect(afterLookEdit.look.payload.weather).toBe("storm");
    expect(afterLookEdit.look.version).not.toBe(first.look.version);
    expect(model.calls[model.calls.length - 1].user).toContain("weather: storm");
    // The owner's look version is kept, never overwritten by a remake.
    const stored = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "look", recordId: "alpha-1-1" });
    expect(stored?.source).toBe("owner");
    // A canon edit to Jonah invalidates both the look and the plan of his section.
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "jonah", payload: { kind: "entry", name: "Jonah", entryKind: "character", hasForm: true, stages: [{ id: "young", text: "Jonah: edited." }, { id: "old", text: "Jonah: edited, older." }] } });
    const afterCanonEdit = await prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), ...fast });
    expect(afterCanonEdit.calls).toBe(2);
    // Clearing the plan creates a future replan and leaves the look alone.
    await t.mutation(api.analysis.clearRecord, { serverSecret: SECRET, workId: WORK, kind: "plan", recordId: "alpha-1-1" });
    const afterClear = await prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), ...fast });
    expect(afterClear.calls).toBe(1);
    expect(afterClear.look.version).toBe(afterCanonEdit.look.version);
    // A brief version change invalidates too, and the legacy scene plan cache is untouched throughout.
    const afterBrief = await prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model, brief, briefVersion: "bv2", context: context("alpha-1-1", null, null), ...fast });
    expect(afterBrief.calls).toBe(2);
    expect(await t.run(async (ctx) => ctx.db.query("scenePlanCache").collect())).toEqual([]);
  });

  it("funds a concurrent miss once and lets the other caller wait for the record", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const model = scriptedModel(defaultAnswer);
    const slow: TextModel = { id: "slow", complete: async (request) => { await gate; return model.complete(request); } };
    const a = prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model: slow, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), holder: "a", ...fast });
    const b = prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model: slow, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), holder: "b", ...fast });
    await new Promise((r) => setTimeout(r, 20));
    expect(await t.query(api.analysis.getPreparationStatus, { workId: WORK, momentId: "alpha-1-1" })).toMatchObject({ ready: false, look: "preparing", plan: "missing" });
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(model.calls).toHaveLength(2);
    expect(ra.plan.version).toBe(rb.plan.version);
    expect(ra.calls + rb.calls).toBe(2);
    expect(await t.query(api.analysis.getPreparationStatus, { workId: WORK, momentId: "alpha-1-1" })).toMatchObject({ ready: true, look: "ready", plan: "ready" });
  });

  it("raises a retryable error when a required look or plan cannot be made, with no fallback and nothing stored", async () => {
    const failing = scriptedModel(() => new Error("provider down"));
    await expect(prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model: failing, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), ...fast })).rejects.toThrow(PreparationUnavailableError);
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "look", recordId: "alpha-1-1" })).toBeNull();
    const invalid = scriptedModel((request) => request.label.startsWith("look:") ? lookAnswer : "not json");
    await expect(prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model: invalid, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), ...fast })).rejects.toMatchObject({ stage: "plan", retryable: true });
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "alpha-1-1" })).toBeNull();
    // Spend is recorded for the failed attempts too; the claim is released so a retry can proceed.
    expect((await t.query(api.analysis.getPreparationSpend, { workId: WORK })).calls).toBe(5);
    expect(await t.query(api.analysis.getPreparationStatus, { workId: WORK, momentId: "alpha-1-1" })).toMatchObject({ look: "ready", plan: "missing" });
    await expect(prepareMoment({ workId: WORK, momentId: "nope", store: store(), model: invalid, brief, briefVersion: "bv", context: context("nope", null, null), ...fast })).rejects.toThrow(/unknown moment/);
  });

  it("waits for another instance's claim instead of paying again, and gives up with a retryable error", async () => {
    const model = scriptedModel(defaultAnswer);
    let clock = 1_000_000;
    const fakeClock = { now: () => clock, sleep: async (ms: number) => { clock += ms; } };
    // Another instance holds the look claim and never finishes: this caller waits out the window, then reports retryable.
    await t.mutation(api.analysis.claimPreparation, { serverSecret: SECRET, workId: WORK, kind: "look", recordId: "alpha-1-1", holder: "other", ttlMs: 10 * 60_000 });
    await expect(prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), holder: "me", ...fakeClock }))
      .rejects.toThrow(/another request is still preparing/);
    expect(model.calls).toHaveLength(0);
    // The other instance finishes while this caller waits: the record is picked up and no call is funded here.
    const sleepThenWrite = { now: () => clock, sleep: async (ms: number) => {
      clock += ms;
      const existing = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "look", recordId: "alpha-1-1" });
      if (!existing) {
        const section = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "section", recordId: "alpha-1-1" });
        const jonah = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" });
        const amos = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "amos" });
        await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind: "look", recordId: "alpha-1-1", payload: { kind: "look", sectionId: "alpha-1-1", ...lookAnswer },
          inputs: [{ kind: "section", recordId: "alpha-1-1", version: section!.version }, { kind: "brief", recordId: WORK, version: "bv" }, { kind: "entry", recordId: "jonah", version: jonah!.version }, { kind: "entry", recordId: "amos", version: amos!.version }] });
        await t.mutation(api.analysis.releasePreparation, { serverSecret: SECRET, workId: WORK, kind: "look", recordId: "alpha-1-1", holder: "other" });
      }
    } };
    const result = await prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: store(), model, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), holder: "me", ...sleepThenWrite });
    expect(result.calls).toBe(1); // only the plan
    expect(result.look.payload).toEqual(lookAnswer);
  });

  it("does not pay again when another instance finished between the first read and the claim", async () => {
    const model = scriptedModel(defaultAnswer);
    let written = false;
    const base = store();
    // Simulate the race: the other instance's record lands exactly when this caller's claim is taken.
    const racing = { ...base, claim: async (kind: "look" | "plan", recordId: string, holder: string, ttlMs: number) => {
      if (kind === "look" && !written) {
        written = true;
        const section = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "section", recordId: "alpha-1-1" });
        const jonah = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" });
        const amos = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "amos" });
        await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind: "look", recordId: "alpha-1-1", payload: { kind: "look", sectionId: "alpha-1-1", ...lookAnswer },
          inputs: [{ kind: "section", recordId: "alpha-1-1", version: section!.version }, { kind: "brief", recordId: WORK, version: "bv" }, { kind: "entry", recordId: "jonah", version: jonah!.version }, { kind: "entry", recordId: "amos", version: amos!.version }] });
      }
      return base.claim(kind, recordId, holder, ttlMs);
    } };
    const result = await prepareMoment({ workId: WORK, momentId: "alpha-1-1", store: racing, model, brief, briefVersion: "bv", context: context("alpha-1-1", null, null), ...fast });
    expect(result.calls).toBe(1); // the plan only; the look was found after the claim
    expect(model.calls.map((c) => c.label.split(":")[0])).toEqual(["plan"]);
  });
});
