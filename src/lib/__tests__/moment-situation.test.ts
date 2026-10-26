/** Real failed input packets with hand-authored new conditions. No paid calls or semantic pass claims. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { assembleRendering } from "../engine/assemble";
import { createMemoryPreparationStore } from "../engine/memory-store";
import { momentContext, readWorkInputs } from "../engine/work-inputs";
import { buildRenderingPacket } from "../engine/prompt";
import { reviewReply } from "../../../tests/fixtures/plan-review";
import { selectionReply } from "../../../tests/fixtures/scene-grounding";
import type { TextModelRequest, TextModel } from "../reading-pass/model";
import type { PlanReviewProblem } from "../engine/plan-review";
import type { Situation } from "../engine/situation";

const release = new URL("../../../llm/releases/2026-10-25-citation-validation/", import.meta.url);
const set = JSON.parse(readFileSync(new URL("../2026-10-24-rendering-review-check/sample-set.json", release), "utf8"));
const traces = readFileSync(new URL("provider.ndjson", release), "utf8").trim().split("\n").map((line) => JSON.parse(line));
async function setup(id = "r027", options: { importLook?: "generated" | "owner" | "unknown"; omitSituation?: boolean; ignoreOwner?: boolean; reports?: PlanReviewProblem[][]; onReview?: () => void | Promise<void> } = {}) {
  const sample = set.samples.find((s: { id: string }) => s.id === id);
  const replies = traces.filter((r) => r.phase === `${id}-candidate`);
  const answer = (name: string) => JSON.parse(replies.filter((r) => r.request.response_format.json_schema.name === name).at(-1).response.choices[0].message.content);
  const look = answer("section_look"), plan = answer("scene_plan");
  const records = structuredClone(sample.keys.map((key: string) => set.records[key]));
  if (options.importLook) records.push({ kind: "look", recordId: sample.sectionId,
    ...(options.importLook === "unknown" ? {} : { source: options.importLook }), payload: { kind: "look", sectionId: sample.sectionId, ...look } });
  const memory = createMemoryPreparationStore(records);
  const inputs = await readWorkInputs("bible-web");
  const calls: TextModelRequest[] = [];
  // A designed target, not another model's outcome or a rescoring of the old refusal.
  const situation: Situation = { place: plan.setting, timeOfDay: plan.timeOfDay, weather: "Clear, dry air", light: "Ordinary daylight consistent with the moment's time", clothing: "Source-compatible situational dress; fixed appearance remains in canon" };
  let reviews = 0;
  const model: TextModel = { id: "scripted", complete: async (request) => {
    calls.push(request);
    if (request.schemaName === "plan_review") {
      await options.onReview?.();
      return reviewReply(options.reports?.[Math.min(reviews++, options.reports.length - 1)] ?? []);
    }
    const owner = request.user.match(/OWNER LOOK CONSTRAINTS[^\n]*:\n(\{[^\n]*\})/);
    // Retained replies use the old strict format; convert them to the general planner reply.
    const converted = request.schemaName === "section_look" ? look : selectionReply({ ...plan,
      situation: owner && !options.ignoreOwner ? JSON.parse(owner[1]) : situation }) as Record<string, unknown>;
    const value = options.omitSituation && request.schemaName !== "section_look" ? Object.fromEntries(Object.entries(converted).filter(([key]) => key !== "situation")) : converted;
    return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", elapsedMs: 0,
      usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0001 } };
  } };
  const getReference = vi.fn(async () => null);
  const render = (styleId = "classical") => assembleRendering({ inputs, store: memory.store, model, listMoments: memory.listMoments, getReference,
    loadReference: async () => { throw Error("No reference expected"); } }, { workId: "bible-web", unitId: sample.momentId, styleId, variationNumber: 1, aspectRatio: "16:9" });
  return { sample, memory, calls, render, situation, look, plan, getReference, inputs };
}

describe("resolved moment conditions", () => {
  it.each(["r027", "f019"])("retains failed %s look as a guide while reviewing and rendering one resolved situation in every style", async (id) => {
    const probe = await setup(id);
    for (const style of ["classical", "watercolor", "icon"]) {
      const result = await probe.render(style);
      if (!result.ok) throw Error(result.message);
      expect(result.prepared.calls).toBe(style === "classical" ? 3 : 0);
      expect(result.prepared.look.payload).toEqual(probe.look);
      expect(result.prepared.situation).toEqual(probe.situation);
      expect(result.prompt).toContain(`Place: ${probe.situation.place}`);
      expect(result.prompt).toContain(probe.situation.light);
      expect(result.prompt).not.toContain(probe.look.place);
      expect(result.prompt).not.toContain(probe.look.light);
      for (const entry of result.canon) expect(result.prompt).toContain(entry.text);
      const saved = await probe.memory.store.getActiveRecord("plan", probe.sample.momentId);
      expect(saved?.payload.situation).toEqual(probe.situation);
      expect(saved?.inputs).toContainEqual({ kind: "prompt", recordId: "scene_plan_look_ownership", version: "generated-guide-v1" });
    }
    const planner = probe.calls.find((c) => c.schemaName === "scene_plan")!;
    expect(planner.user).toContain("SECTION LOOK GUIDE (a suggestion; keep what fits this moment)");
    expect(planner.user).toContain(JSON.stringify(probe.look));
    const review = probe.calls.find((c) => c.schemaName === "plan_review")!;
    expect(review.user).toContain(JSON.stringify(probe.situation));
    expect(review.user).not.toContain(probe.look.light);
    expect(probe.memory.ledger).toHaveLength(3);
  });

  it("refuses a missing situation after the bounded schema retry with no review, references or plan store", async () => {
    const p = await setup("r027", { omitSituation: true });
    expect(await p.render()).toMatchObject({ ok: false, stage: "plan", message: expect.stringContaining("situation") });
    expect(p.calls.map((c) => c.schemaName)).toEqual(["section_look", "scene_plan", "scene_plan"]);
    expect(p.memory.has("plan", p.sample.momentId)).toBe(false);
    expect(p.getReference).not.toHaveBeenCalled();
  });

  it.each(["owner", undefined] as const)("invalidates identical look bytes when provenance becomes %s, preserving literal constraints", async (source) => {
    const p = await setup();
    const first = await p.render();
    if (!first.ok) throw Error(first.message);
    const record = (await p.memory.store.getActiveRecord("look", p.sample.sectionId))!;
    record.source = source;
    const again = await p.render();
    if (!again.ok) throw Error(again.message);
    expect(again.prepared.calls).toBe(2);
    expect(again.packet.lookVersion).toBe(first.packet.lookVersion);
    expect(again.prepared.situation).toEqual(p.look);
    expect(again.packet.planVersion).not.toBe(first.packet.planVersion);
    expect(again.prepared.look.policy).toBe("literal-constraint-v1");
    expect(again.prompt).toContain(p.look.place);
    expect(p.calls.at(-2)!.user).toContain("OWNER LOOK CONSTRAINTS (copy all values exactly)");
    expect(await p.memory.store.getActiveRecord("look", p.sample.sectionId)).toEqual(record);
  });

  it("restores a reinterpreted owner look verbatim and notes it, instead of refusing", async () => {
    const p = await setup("r027", { ignoreOwner: true });
    await p.render();
    const record = (await p.memory.store.getActiveRecord("look", p.sample.sectionId))!;
    record.source = "owner";
    const count = p.calls.length;
    const result = await p.render();
    if (!result.ok) throw Error(result.message);
    expect(result.prepared.situation).toEqual(p.look);
    expect(p.calls.slice(count).map((c) => c.schemaName)).toEqual(["scene_plan", "plan_review"]);
    expect(p.calls.at(-1)!.user).toContain(JSON.stringify(p.look));
    const saved = await p.memory.store.getActiveRecord("plan", p.sample.momentId);
    expect((saved?.payload.review as { notes?: string[] }).notes).toContain("owner look constraints restored verbatim");
    expect((await p.memory.store.getActiveRecord("look", p.sample.sectionId))?.payload).toEqual(record.payload);
  });

  it("preserves an imported look with unknown provenance as literal constraints despite missing dependency inputs", async () => {
    const p = await setup("r027", { importLook: "unknown" });
    const original = structuredClone(await p.memory.store.getActiveRecord("look", p.sample.sectionId));
    const result = await p.render();
    if (!result.ok) throw Error(result.message);
    expect(result.prepared.calls).toBe(2);
    expect(result.prepared.look.policy).toBe("literal-constraint-v1");
    expect(result.prepared.situation).toEqual(p.look);
    expect(await p.memory.store.getActiveRecord("look", p.sample.sectionId)).toEqual(original);
    expect(original?.source).toBeUndefined();
    expect(p.calls.map((c) => c.schemaName)).toEqual(["scene_plan", "plan_review"]);
  });

  it("notes a literal owner constraint conflict without a re-plan and keeps the owner text", async () => {
    const problem: PlanReviewProblem = { kind: "look_conflict", entryId: "", planQuote: "Shore of the Red Sea", reason: "Scripted owner-place contradiction, not a new semantic judgment." };
    const p = await setup("r027", { reports: [[], [problem]] });
    await p.render();
    (await p.memory.store.getActiveRecord("look", p.sample.sectionId))!.source = "owner";
    const count = p.calls.length;
    p.getReference.mockClear();
    const result = await p.render();
    if (!result.ok) throw Error(result.message);
    expect(result.prepared.situation).toEqual(p.look);
    expect(p.calls.slice(count).map((c) => c.schemaName)).toEqual(["scene_plan", "plan_review"]);
    const saved = await p.memory.store.getActiveRecord("plan", p.sample.momentId);
    const review = saved?.payload.review as { rounds: number; problems?: unknown; notes?: string[] };
    expect(review.rounds).toBe(1);
    expect(review.problems).toBeUndefined();
    expect(review.notes?.some((note) => note.startsWith("noted: look_conflict"))).toBe(true);
    expect(p.getReference).toHaveBeenCalled();
  });

  it("does not store a plan if ownership changes while its review is in flight", async () => {
    const p = await setup("r027", { onReview: async () => {
      (await p.memory.store.getActiveRecord("look", p.sample.sectionId))!.source = "owner";
    } });
    expect(await p.render()).toMatchObject({ ok: false, stage: "look", message: expect.stringContaining("changed during preparation") });
    expect(p.memory.has("plan", p.sample.momentId)).toBe(false);
    expect(p.getReference).not.toHaveBeenCalled();
  });

  it("rejects old direct rendering inputs instead of falling back to the shared look", async () => {
    const p = await setup();
    const context = momentContext(p.inputs.work, { id: p.sample.momentId, firstUnit: p.sample.momentId, lastUnit: p.sample.momentId },
      { firstUnit: p.sample.momentId, lastUnit: p.sample.momentId });
    expect(buildRenderingPacket({ work: { id: "bible-web", title: "Bible" }, moment: { id: p.sample.momentId, sectionId: p.sample.sectionId, reference: context.moment.reference, text: context.moment.text },
      brief: p.inputs.brief, briefVersion: p.inputs.briefVersion, eraId: p.inputs.brief.eras[0].id, style: p.inputs.styles.classical.style, styleVersion: "v",
      look: { ...p.look, version: "l" }, plan: { ...p.plan, version: "p" }, canon: [], aspectRatio: "16:9" }))
      .toMatchObject({ ok: false, error: "Reviewed moment conditions are required for rendering." });
  });
});
