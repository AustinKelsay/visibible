/**
 * Structural safeguards over retained failed Luke inputs; scripted replies prove no live model compliance. Forgiving
 * preparation has no missingCast report: uncast people are drawn as unnamed roles, and repeated IDs are dropped.
 */
import { withPlanningReply } from "../../../tests/fixtures/planning-model";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { assembleRendering, type AssembleDeps } from "../engine/assemble";
import { createMemoryPreparationStore } from "../engine/memory-store";
import type { AnalysisRecord, PreparationStore } from "../engine/preparation";
import { readWorkInputs, type WorkInputs } from "../engine/work-inputs";
import { createWorkReader } from "../work-input";
import { SHARED_STYLES } from "../work-preparation";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { withCurrentLookMarker, withGrounding } from "../../../tests/fixtures/scene-grounding";
import { testDepiction } from "../../../tests/fixtures/depiction";

const snapshot = JSON.parse(readFileSync(new URL("../../../llm/releases/2026-10-22-owner-request-check/after-prepared.json", import.meta.url), "utf8"));
const retained = snapshot.rows.find((r: { unitId: string }) => r.unitId === "luke-10-33");
const fields = { primarySubject: "A traveler helping a wounded man", action: "stops beside him", setting: "road", secondaryElements: "stones", mood: "compassion", timeOfDay: "day", composition: "two figures" };
const grounded = (present: string[]) => withGrounding({ present, ...fields }, "was moved with compassion");

async function setup(reply: unknown, correctSource = false) {
  const inputs = await readWorkInputs("bible-web");
  const records: AnalysisRecord[] = structuredClone(retained.records.map((r: { record: AnalysisRecord }) => withCurrentLookMarker(r.record)));
  if (correctSource) {
    // Fixture-only source repair. Production records and retained failure artifacts are untouched.
    const section = records.find((r) => r.kind === "section")!;
    const payload = section.payload as typeof section.payload & { cast: Array<{ entryId: string; stageId: string }>; mentionedOnly: string[] };
    for (const [id, name, text, unit, quote] of [
      ["the_samaritan", "Samaritan traveler", "Samaritan traveler: middle-aged man in a plain travel tunic and cloak.", "luke-10-33", "a certain Samaritan"],
      ["wounded_traveler", "Wounded traveler", "Wounded traveler: adult man in a torn travel tunic.", "luke-10-30", "A certain man was going down from Jerusalem to Jericho"],
    ]) {
      expect(inputs.work.getUnit(unit).text).toContain(quote);
      const entry = { kind: "entry" as const, name, entryKind: "character", hasForm: true, stages: [{ id: "main", text, quotes: [{ unit, quote }] }] };
      records.push({ kind: "entry", recordId: id, version: contentVersion(entry), inputs: [], payload: entry });
      payload.cast.push({ entryId: id, stageId: "main" });
      payload.mentionedOnly = payload.mentionedOnly.filter((entryId) => entryId !== id);
    }
    section.version = contentVersion(section.payload);
  }
  const write = vi.fn<PreparationStore["putDerivedRecord"]>(async (args) => {
    const record = { ...args, source: "generated" as const, version: contentVersion(args.payload) };
    const index = records.findIndex((r) => r.kind === args.kind && r.recordId === args.recordId);
    if (index < 0) records.push(record); else records[index] = record;
    return { version: record.version };
  });
  const spend = vi.fn<PreparationStore["recordSpend"]>(async () => {});
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => records.find((r) => r.kind === kind && r.recordId === id) ?? null,
    putDerivedRecord: write, recordSpend: spend, claim: async () => ({ held: true }), release: async () => {},
  };
  const calls: TextModelRequest[] = [];
  const model: TextModel = withPlanningReply({ id: "scripted", complete: async (request) => {
    calls.push(request);
    const value = request.schemaName === "section_look" ? retained.prepared.look?.payload : reply;
    return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 50, costUsd: 0.0004 }, elapsedMs: 1 };
  } });
  const getReference = vi.fn<AssembleDeps["getReference"]>(async () => null);
  const deps: AssembleDeps = { inputs, store, model, getReference, listMoments: async () => [], loadReference: async () => { throw new Error("No reference should load"); } };
  const render = (styleId = "classical") => assembleRendering(deps, { workId: "bible-web", unitId: "luke-10-33", styleId, variationNumber: 1, aspectRatio: "16:9" });
  return { records, calls, write, spend, getReference, deps, render };
}

describe("required moment cast", () => {
  it("plans the actual incomplete Luke cast with unnamed roles instead of stopping for missing canon", async () => {
    // Formerly refused through missingCast; the planner now describes uncast people as unnamed roles.
    const { render, calls, write, records } = await setup(grounded([]));
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(result.canon).toEqual([]);
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan"]);
    expect(write).toHaveBeenCalledOnce();
    const stored = records.find((r) => r.kind === "plan")!.payload;
    expect(stored).toMatchObject({ entries: [], plan: fields });
    expect(stored).not.toHaveProperty("missingCast");
    expect(calls[0].user).toContain("lawyer_who_tests_jesus_luke_10");
    expect(calls[0].user).toContain(retained.context.moment.text);
    expect((calls[0].schema as unknown as { shape: Record<string, unknown> }).shape).not.toHaveProperty("missingCast");
  });

  it("drops a repeated cast ID and stores the plan once", async () => {
    const lawyer = "lawyer_who_tests_jesus_luke_10";
    const { render, calls, write } = await setup(grounded([lawyer, lawyer]));
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(result.prepared.present.map((p) => p.entryId)).toEqual([lawyer]);
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan"]);
    expect(write).toHaveBeenCalledOnce();
  });

  it.each([
    ["a cast ID outside the section", { present: ["the_samaritan"], ...fields }],
    ["a missing scene field", { present: [], ...Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "action")) }],
  ])("rejects a reply with %s after the malformed-reply retry, storing nothing", async (_label, reply) => {
    const { render, calls, write, getReference } = await setup(reply);
    expect(await render()).toMatchObject({ ok: false, reason: "preparation", stage: "plan" });
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan", "scene_plan"]);
    expect(write).not.toHaveBeenCalled();
    expect(getReference).not.toHaveBeenCalled();
  });

  it("carries corrected actor canon across styles without selecting the framing speakers or persisting missingCast", async () => {
    const { render, calls } = await setup(grounded(["the_samaritan", "wounded_traveler"]), true);
    const versions = [];
    for (const style of ["classical", "watercolor", "icon"]) {
      const result = await render(style);
      if (!result.ok) throw new Error(result.message);
      versions.push(result.packet.planVersion);
      expect(result.canon.map((entry) => entry.entryId)).toEqual(["the_samaritan", "wounded_traveler"]);
      expect(result.prepared.plan.payload).toEqual({ present: ["the_samaritan", "wounded_traveler"], ...fields });
      expect(result.prompt).not.toContain("Lawyer who tests Jesus:");
      expect(result.prompt).not.toContain("Jesus: man of about thirty");
    }
    expect(new Set(versions).size).toBe(1);
    expect(calls.map((r) => r.schemaName)).toEqual(["scene_plan"]);
  });

  it("refuses canon that changes after planning rather than selecting another stage or omitting it", async () => {
    const { render, deps, getReference } = await setup(grounded(["the_samaritan"]), true);
    const read = deps.store.getActiveRecord;
    let reads = 0;
    deps.store.getActiveRecord = async (kind, id) => {
      const record = await read(kind, id);
      return kind === "entry" && id === "the_samaritan" && ++reads > 1 && record ? { ...record, version: "changed" } : record;
    };
    expect(await render()).toMatchObject({ ok: false, reason: "preparation", retryable: true, message: expect.stringContaining("canon changed for the_samaritan") });
    expect(getReference).not.toHaveBeenCalled();
  });

  it("refuses a stage reassigned during preparation even when the entry version and both stages survive", async () => {
    const { render, deps, records, getReference } = await setup(grounded(["the_samaritan"]), true);
    const entry = records.find((record) => record.kind === "entry" && record.recordId === "the_samaritan")!;
    (entry.payload.stages as Array<{ id: string; text: string }>).push({ id: "later", text: "Samaritan traveler: older man in a travel cloak." });
    entry.version = contentVersion(entry.payload);
    const read = deps.store.getActiveRecord;
    let sectionReads = 0;
    deps.store.getActiveRecord = async (kind, id) => {
      const record = await read(kind, id);
      if (kind !== "section" || ++sectionReads < 3 || !record) return record;
      const payload = { ...record.payload, cast: (record.payload.cast as Array<{ entryId: string; stageId: string }>).map((member) =>
        member.entryId === "the_samaritan" ? { ...member, stageId: "later" } : member) };
      return { ...record, payload, version: contentVersion(payload) };
    };
    expect(await render()).toMatchObject({ ok: false, reason: "preparation", retryable: true,
      message: expect.stringContaining("section cast changed") });
    expect(getReference).not.toHaveBeenCalled();
  });

  it("refuses a missing section entry before any preparation call or reference lookup", async () => {
    const { render, records, calls, getReference } = await setup(grounded([]));
    records.splice(records.findIndex((record) => record.kind === "entry"), 1);
    expect(await render()).toMatchObject({ ok: false, reason: "preparation", stage: "plan", message: expect.stringContaining("missing canon entry") });
    expect(calls).toHaveLength(0);
    expect(getReference).not.toHaveBeenCalled();
  });

  it("allows an empty cast for a landscape and drops an invented ID", async () => {
    const work = createWorkReader({ schemaVersion: 1, id: "sky", title: "Sky", author: "Fixture", language: "en",
      referenceText: { name: "Fixture", source: "https://example.com", credit: "Test", sha256: "0".repeat(64) },
      levels: ["Part", "Line"], referenceFormats: { Part: "{Part} {Line}" }, momentMode: "unit",
      divisions: [{ key: "sky", label: "Sky", level: "Part", units: [{ number: 1, text: "Clouds drift above a still field." }] }] });
    const inputs: WorkInputs = { work, workVersion: "wv", briefVersion: "bv", depiction: testDepiction("sky"),
      brief: { schemaVersion: 1, workId: "sky", tone: "Quiet", depictionRules: [], styleIds: ["classical"], eras: [{ id: "rural", label: "Rural", people: "None", dress: "None", buildingsAndObjects: "Fields", technology: "None" }] },
      styles: { classical: { style: SHARED_STYLES.get("classical"), version: "sv" } } };
    const memory = createMemoryPreparationStore([
      { kind: "section", recordId: "sky-1", payload: { kind: "section", firstUnit: "sky-1", lastUnit: "sky-1", title: "Clouds", cast: [] } },
      { kind: "moment", recordId: "sky-1", payload: { kind: "moment", firstUnit: "sky-1", lastUnit: "sky-1", sectionId: "sky-1" } },
    ]);
    const model: TextModel = withPlanningReply({ id: "scripted", complete: async (request) => {
      const value = request.schemaName === "section_look" ? { place: "field", timeOfDay: "day", weather: "cloudy", light: "diffuse", clothing: "" } : withGrounding({ present: ["invented"], ...fields, primarySubject: "Clouds", action: "drift" }, "Clouds drift above a still field.");
      return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }, elapsedMs: 0 };
    } });
    const result = await assembleRendering({ inputs, store: memory.store, model, listMoments: memory.listMoments, getReference: async () => null, loadReference: async () => new Uint8Array() },
      { workId: "sky", unitId: "sky-1", styleId: "classical", variationNumber: 1, aspectRatio: "16:9" });
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.canon).toEqual([]); expect(result.prepared.present).toEqual([]); }
  });
});
