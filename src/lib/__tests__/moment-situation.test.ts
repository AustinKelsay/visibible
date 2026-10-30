/** Real failed input packets: the generated section look is an unrendered guide; owner looks render verbatim (generic-v10). No paid calls or semantic pass claims. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { assembleRendering } from "../engine/assemble";
import { createMemoryPreparationStore } from "../engine/memory-store";
import { momentContext, readWorkInputs } from "../engine/work-inputs";
import { buildRenderingPacket } from "../engine/prompt";
import { selectionReply } from "../../../tests/fixtures/scene-grounding";
import type { TextModelRequest, TextModel } from "../reading-pass/model";
import type { Situation } from "../engine/situation";

const release = new URL("../../../llm/releases/2026-10-25-citation-validation/", import.meta.url);
const set = JSON.parse(readFileSync(new URL("../2026-10-24-rendering-review-check/sample-set.json", release), "utf8"));
const traces = readFileSync(new URL("provider.ndjson", release), "utf8").trim().split("\n").map((line) => JSON.parse(line));
async function setup(id = "r027", options: { importLook?: "generated" | "owner" | "unknown"; includeSituation?: boolean; onPlan?: () => void | Promise<void> } = {}) {
  const sample = set.samples.find((s: { id: string }) => s.id === id);
  const replies = traces.filter((r) => r.phase === `${id}-candidate`);
  const answer = (name: string) => JSON.parse(replies.filter((r) => r.request.response_format.json_schema.name === name).at(-1).response.choices[0].message.content);
  const look = answer("section_look"), plan = answer("scene_plan");
  const records = structuredClone(sample.keys.map((key: string) => set.records[key]));
  records.push({ kind: "look", recordId: sample.sectionId,
    ...(options.importLook === "unknown" ? {} : { source: options.importLook ?? "generated" }), payload: { kind: "look", sectionId: sample.sectionId, ...look } });
  const memory = createMemoryPreparationStore(records);
  const inputs = await readWorkInputs("bible-web");
  const calls: TextModelRequest[] = [];
  // The removed v11 conditions field, used only to show the planner schema now refuses it.
  const situation: Situation = { place: plan.setting, timeOfDay: plan.timeOfDay, weather: "Clear, dry air", light: "Ordinary daylight consistent with the moment's time", clothing: "Source-compatible situational dress; fixed appearance remains in canon" };
  const model: TextModel = { id: "scripted", complete: async (request) => {
    calls.push(request);
    await options.onPlan?.();
    // Retained replies use the old strict format; convert them to the general planner reply, which has no situation.
    const converted = request.schemaName === "section_look" ? look : selectionReply(plan) as Record<string, unknown>;
    const value = options.includeSituation && request.schemaName !== "section_look" ? { ...converted, situation } : converted;
    return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", elapsedMs: 0,
      usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0001 } };
  } };
  const getReference = vi.fn(async () => null);
  const render = (styleId = "classical") => assembleRendering({ inputs, store: memory.store, model, listMoments: memory.listMoments, getReference,
    loadReference: async () => { throw Error("No reference expected"); } }, { workId: "bible-web", unitId: sample.momentId, styleId, variationNumber: 1, aspectRatio: "16:9" });
  return { sample, memory, calls, render, situation, look, plan, getReference, inputs };
}

describe("section look ownership in rendering", () => {
  it.each(["r027", "f019"])("ignores the generated %s look while planning and rendering in every style", async (id) => {
    const probe = await setup(id);
    for (const style of ["classical", "watercolor", "icon"]) {
      const result = await probe.render(style);
      if (!result.ok) throw Error(result.message);
      expect(result.prepared.calls).toBe(style === "classical" ? 1 : 0);
      expect(result.prepared.look).toBeNull();
      // A generated guide is advisory: the plan carries its own setting and time, and no conditions block is rendered.
      expect(result.prepared.situation).toBeNull();
      expect(result.prompt).not.toContain("MOMENT CONDITIONS");
      expect(result.prompt).not.toContain("OWNER LOOK CONSTRAINTS");
      expect(result.prompt).not.toContain(probe.look.place);
      expect(result.prompt).not.toContain(probe.look.light);
      expect(result.prompt).toContain("SCENE PLAN");
      for (const entry of result.canon.filter((c) => c.hasForm)) expect(result.prompt).toContain(entry.text);
      const saved = await probe.memory.store.getActiveRecord("plan", probe.sample.momentId);
      expect(saved?.payload.situation).toBeUndefined();
      expect(saved?.inputs).toContainEqual({ kind: "prompt", recordId: "scene_plan_look_ownership", version: "no-owner-look-v1" });
    }
    const planner = probe.calls.find((c) => c.schemaName === "scene_plan")!;
    expect(planner.user).not.toContain("SECTION LOOK GUIDE");
    expect(planner.user).not.toContain(JSON.stringify(probe.look));
    expect(probe.calls.map((c) => c.schemaName)).toEqual(["scene_plan"]);
    expect(probe.memory.ledger).toHaveLength(1);
  });

  it("refuses a reply that still carries the removed situation field after the bounded schema retry, with no references or plan store", async () => {
    const p = await setup("r027", { includeSituation: true });
    expect(await p.render()).toMatchObject({ ok: false, stage: "plan", message: expect.stringContaining("situation") });
    expect(p.calls.map((c) => c.schemaName)).toEqual(["scene_plan", "scene_plan"]);
    expect(p.memory.has("plan", p.sample.momentId)).toBe(false);
    expect(p.getReference).not.toHaveBeenCalled();
  });

  it.each(["owner", undefined] as const)("invalidates identical look bytes when provenance becomes %s, rendering literal constraints", async (source) => {
    const p = await setup();
    const first = await p.render();
    if (!first.ok) throw Error(first.message);
    expect(first.prepared.situation).toBeNull();
    const record = (await p.memory.store.getActiveRecord("look", p.sample.sectionId))!;
    record.source = source;
    const again = await p.render();
    if (!again.ok) throw Error(again.message);
    expect(again.prepared.calls).toBe(1);
    expect(again.packet.lookVersion).toBe(record.version);
    expect(again.prepared.situation).toEqual(p.look);
    expect(again.prepared.look?.policy).toBe("literal-constraint-v1");
    // The plan is remade for the new ownership even though identical scripted content gives the same content hash.
    const saved = await p.memory.store.getActiveRecord("plan", p.sample.momentId);
    expect(saved?.inputs).toContainEqual({ kind: "prompt", recordId: "scene_plan_look_ownership", version: "literal-constraint-v1" });
    expect(again.prompt).toContain("OWNER LOOK CONSTRAINTS (binding, verbatim)");
    expect(again.prompt).toContain(`Place: ${p.look.place}`);
    expect(p.calls.at(-1)!.user).toContain("OWNER LOOK CONSTRAINTS");
    expect(p.calls.at(-1)!.user).toContain(JSON.stringify(p.look));
    expect(await p.memory.store.getActiveRecord("look", p.sample.sectionId)).toEqual(record);
  });

  it("renders the owner look verbatim from the look record, not from the planner reply", async () => {
    const p = await setup("r027");
    await p.render();
    const record = (await p.memory.store.getActiveRecord("look", p.sample.sectionId))!;
    record.source = "owner";
    const count = p.calls.length;
    const result = await p.render();
    if (!result.ok) throw Error(result.message);
    expect(result.prepared.situation).toEqual(p.look);
    expect(p.calls.slice(count).map((c) => c.schemaName)).toEqual(["scene_plan"]);
    for (const value of Object.values(p.look)) expect(result.prompt).toContain(String(value));
    const saved = await p.memory.store.getActiveRecord("plan", p.sample.momentId);
    expect(saved?.payload.situation).toBeUndefined();
    expect(saved?.payload).not.toHaveProperty("review");
    expect((await p.memory.store.getActiveRecord("look", p.sample.sectionId))?.payload).toEqual(record.payload);
  });

  it("preserves an imported look with unknown provenance as literal constraints despite missing dependency inputs", async () => {
    const p = await setup("r027", { importLook: "unknown" });
    const original = structuredClone(await p.memory.store.getActiveRecord("look", p.sample.sectionId));
    const result = await p.render();
    if (!result.ok) throw Error(result.message);
    expect(result.prepared.calls).toBe(1);
    expect(result.prepared.look?.policy).toBe("literal-constraint-v1");
    expect(result.prepared.situation).toEqual(p.look);
    expect(result.prompt).toContain("OWNER LOOK CONSTRAINTS (binding, verbatim)");
    expect(await p.memory.store.getActiveRecord("look", p.sample.sectionId)).toEqual(original);
    expect(original?.source).toBeUndefined();
    expect(p.calls.map((c) => c.schemaName)).toEqual(["scene_plan"]);
  });

  it("does not store a plan if ownership changes while its planning call is in flight", async () => {
    const p = await setup("r027", { onPlan: async () => {
      (await p.memory.store.getActiveRecord("look", p.sample.sectionId))!.source = "owner";
    } });
    expect(await p.render()).toMatchObject({ ok: false, stage: "look", message: expect.stringContaining("changed during preparation") });
    expect(p.memory.has("plan", p.sample.momentId)).toBe(false);
    expect(p.getReference).not.toHaveBeenCalled();
  });

  it("never renders the shared look directly: no conditions without owner constraints, verbatim owner constraints when given", async () => {
    const p = await setup();
    const context = momentContext(p.inputs.work, { id: p.sample.momentId, firstUnit: p.sample.momentId, lastUnit: p.sample.momentId },
      { firstUnit: p.sample.momentId, lastUnit: p.sample.momentId });
    const base = { work: { id: "bible-web", title: "Bible" }, moment: { id: p.sample.momentId, sectionId: p.sample.sectionId, reference: context.moment.reference, text: context.moment.text },
      brief: p.inputs.brief, briefVersion: p.inputs.briefVersion, eraId: p.inputs.brief.eras[0].id, style: p.inputs.styles.classical.style, styleVersion: "v",
      look: { ...p.look, version: "l" }, plan: { ...p.plan, version: "p" }, canon: [], aspectRatio: "16:9" as const };
    const guided = buildRenderingPacket(base);
    if (!guided.ok) throw Error(guided.error);
    expect(guided.prompt).not.toContain("MOMENT CONDITIONS");
    expect(guided.prompt).not.toContain("OWNER LOOK CONSTRAINTS");
    expect(guided.prompt).not.toContain(p.look.place);
    const owned = buildRenderingPacket({ ...base, situation: { place: p.look.place, timeOfDay: p.look.timeOfDay, weather: p.look.weather, light: p.look.light, clothing: p.look.clothing } });
    if (!owned.ok) throw Error(owned.error);
    expect(owned.prompt).toContain("OWNER LOOK CONSTRAINTS (binding, verbatim)");
    expect(owned.prompt).toContain(`Place: ${p.look.place}`);
    expect(owned.prompt).toContain(`Clothing: ${p.look.clothing}`);
  });
});
