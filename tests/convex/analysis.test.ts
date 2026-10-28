/**
 * Analysis storage lifecycle (#168): candidate generations, activation, owner versions,
 * stale dependents, references and attention, exercised through the Convex handlers.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";
import { listAnalysisRecords } from "../../src/lib/engine/analysis-records";
import { activateCandidate } from "../../convex/analysis";

const SECRET = "test-server-secret-with-at-least-32-chars";
process.env.CONVEX_SERVER_SECRET = SECRET;

type RecordInput = FunctionArgs<typeof api.analysis.putRecords>["records"][number];

const WORK = "holmes-adventures";
const BRIEF_V1 = "brief-v1";
const WORK_V1 = "work-v1";

function section(firstUnit: string, lastUnit: string, cast: Array<{ entryId: string; stageId: string }> = []): RecordInput {
  return { kind: "section", recordId: firstUnit, payload: { kind: "section", title: `Section ${firstUnit}`, firstUnit, lastUnit, era: "victorian", cast } };
}
function moment(firstUnit: string, lastUnit: string, sectionId: string): RecordInput {
  return { kind: "moment", recordId: firstUnit, payload: { kind: "moment", sectionId, firstUnit, lastUnit } };
}
function entry(recordId: string, name: string, stages = [{ id: "main", text: `${name}: a figure.` }]): RecordInput {
  return { kind: "entry", recordId, payload: { kind: "entry", name, entryKind: "character", hasForm: true, stages } };
}

const minimalRecords = (): RecordInput[] => [
  entry("sherlock_holmes", "Sherlock Holmes"),
  section("a-scandal-in-bohemia-1", "a-scandal-in-bohemia-14", [{ entryId: "sherlock_holmes", stageId: "main" }]),
  moment("a-scandal-in-bohemia-1", "a-scandal-in-bohemia-2", "a-scandal-in-bohemia-1"),
];

describe("analysis generations", () => {
  let t: ReturnType<typeof convexTest>;
  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  async function prepare(records = minimalRecords(), versions = { workVersion: WORK_V1, briefVersion: BRIEF_V1 }) {
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, ...versions });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, ...versions });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records });
    return generation;
  }

  it("serves only the active generation after a complete candidate is activated", async () => {
    const generation = await prepare();
    const before = await t.query(api.analysis.getWorkStatus, { workId: WORK });
    expect(before.ready).toBe(false);
    expect(before.activeGeneration).toBeNull();
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "section", recordId: "a-scandal-in-bohemia-1" })).toBeNull();

    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });

    const after = await t.query(api.analysis.getWorkStatus, { workId: WORK });
    expect(after.ready).toBe(true);
    expect(after.activeGeneration).toBe(generation);
    const record = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "section", recordId: "a-scandal-in-bohemia-1" });
    expect(record?.payload).toMatchObject({ title: "Section a-scandal-in-bohemia-1" });
    expect(record?.source).toBe("generated");
    expect(record?.version).toMatch(/^[0-9a-f]{32}$/);
    expect(record?.generation).toBe(generation);
    expect((await t.query(api.analysis.listActiveRecords, { workId: WORK, kind: "entry" })).map((r) => r.recordId)).toEqual(["sherlock_holmes"]);
  });

  it("rejects an unauthenticated preparation write", async () => {
    await expect(t.mutation(api.analysis.registerWork, { serverSecret: "wrong", workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 })).rejects.toThrow();
  });

  it("keeps the active generation serving when a reread is incomplete or structurally invalid", async () => {
    const first = await prepare();
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: first });

    const { generation: reread } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 });
    // A moment pointing at a section that does not exist in the candidate.
    await expect(t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation: reread, records: [
      entry("sherlock_holmes", "Sherlock Holmes"),
      moment("a-scandal-in-bohemia-1", "a-scandal-in-bohemia-2", "a-scandal-in-bohemia-99"),
    ] })).rejects.toThrow(/unknown section/);
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: reread })).rejects.toThrow(/unknown section|no story sections/);

    const status = await t.query(api.analysis.getWorkStatus, { workId: WORK });
    expect(status.activeGeneration).toBe(first);
    expect(status.candidateGeneration).toBe(reread);
    expect(status.ready).toBe(true);
    const section = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "section", recordId: "a-scandal-in-bohemia-1" });
    expect(section?.generation).toBe(first);
  });

  it("refuses to activate a generation read against another work or brief version", async () => {
    const generation = await prepare(minimalRecords(), { workVersion: WORK_V1, briefVersion: "brief-v0" });
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 });
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation })).rejects.toThrow(/brief brief-v0/);
    expect((await t.query(api.analysis.getWorkStatus, { workId: WORK })).ready).toBe(false);

    const { generation: again } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: "work-v0", briefVersion: BRIEF_V1 });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation: again, records: minimalRecords() });
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: again })).rejects.toThrow(/work work-v0/);
    await t.mutation(api.analysis.abandonGeneration, { serverSecret: SECRET, workId: WORK, generation: again, note: "read against a stale work file" });
    expect((await t.query(api.analysis.getWorkStatus, { workId: WORK })).candidateGeneration).toBeNull();
    expect((await t.query(api.analysis.getGeneration, { workId: WORK, generation: again }))?.status).toBe("abandoned");
  });

  it("marks a work not ready when the deployed brief changes after activation", async () => {
    const generation = await prepare();
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: "brief-v2" });
    const status = await t.query(api.analysis.getWorkStatus, { workId: WORK });
    expect(status.ready).toBe(false);
    expect(status.reasons.join(" ")).toMatch(/brief/);
    // The old generation still serves while a compatible reread is prepared.
    expect(status.activeGeneration).toBe(generation);
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "sherlock_holmes" })).not.toBeNull();
  });

  it("lets only the latest candidate activate when two rereads compete", async () => {
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 });
    const { generation: a } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation: a, records: minimalRecords() });
    const { generation: b } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 });
    expect(b).toBe(a + 1);
    await expect(t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation: a, records: minimalRecords() })).rejects.toThrow(/not an open candidate/);
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: a })).rejects.toThrow(/not the open candidate/);
    expect((await t.query(api.analysis.getGeneration, { workId: WORK, generation: a }))?.status).toBe("abandoned");
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation: b, records: minimalRecords() });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: b });
    expect((await t.query(api.analysis.getWorkStatus, { workId: WORK })).activeGeneration).toBe(b);
  });

  it("keeps owner versions across a reread and lists the ones whose record vanished", async () => {
    const first = await prepare([...minimalRecords(), entry("dr_watson", "Dr. Watson")]);
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: first });
    const edited = { kind: "entry" as const, name: "Sherlock Holmes", entryKind: "character" as const, hasForm: true, stages: [{ id: "main", text: "Sherlock Holmes: lean, hawk-nosed, in a grey dressing-gown." }] };
    const correction = await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "sherlock_holmes", payload: edited });
    expect(correction.changed).toBe(true);
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "dr_watson", payload: { ...edited, name: "Dr. Watson" } });

    // Reread: Holmes is read again with new generated text; Watson's slug vanishes.
    const { generation: reread } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation: reread, records: [
      entry("sherlock_holmes", "Sherlock Holmes", [{ id: "main", text: "Sherlock Holmes: a different generated look." }]),
      section("a-scandal-in-bohemia-1", "a-scandal-in-bohemia-14", [{ entryId: "sherlock_holmes", stageId: "main" }]),
      moment("a-scandal-in-bohemia-1", "a-scandal-in-bohemia-2", "a-scandal-in-bohemia-1"),
    ] });
    const result = await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: reread });
    expect(result.carriedOwnerVersions).toEqual(["entry/sherlock_holmes"]);
    expect(result.unmatchedOwnerVersions).toEqual(["entry/dr_watson"]);

    const holmes = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "sherlock_holmes" });
    expect(holmes?.source).toBe("owner");
    expect(holmes?.version).toBe(correction.version);
    expect(holmes?.payload).toMatchObject({ stages: [{ text: expect.stringContaining("dressing-gown") }] });
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "dr_watson" })).toBeNull();

    const attention = await t.query(api.analysis.listAttention, { workId: WORK });
    expect(attention).toHaveLength(1);
    expect(attention[0]).toMatchObject({ reason: "unmatched_owner_edit", kind: "entry", recordId: "dr_watson", generation: first });

    // The retired generation stays readable for provenance.
    const old = await t.query(api.analysis.getRecordVersion, { workId: WORK, generation: first, kind: "entry", recordId: "dr_watson", version: attention[0].detail!.match(/version ([0-9a-f]+)/)![1] });
    expect(old?.payload).toMatchObject({ name: "Dr. Watson" });
    expect((await t.query(api.analysis.getGeneration, { workId: WORK, generation: first }))?.status).toBe("retired");
    const history = await t.query(api.analysis.listRecordHistory, { workId: WORK, kind: "entry", recordId: "dr_watson" });
    expect(history.map((h) => [h.generation, h.source, h.status])).toEqual([[first, "owner", "retired"], [first, "generated", "superseded"]]);
  });

  it("finds dependents that named an older input version after an owner edit", async () => {
    const generation = await prepare();
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    const look = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "section", recordId: "a-scandal-in-bohemia-1" });
    const lookPayload = { kind: "look" as const, sectionId: "a-scandal-in-bohemia-1", place: "Baker Street sitting-room", timeOfDay: "night", weather: "fog", light: "gaslight", clothing: "dressing-gown" };
    const { version: lookVersion } = await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind: "look", recordId: "a-scandal-in-bohemia-1", payload: lookPayload,
      inputs: [{ kind: "section", recordId: "a-scandal-in-bohemia-1", version: look!.version }] });
    const planPayload = { kind: "plan" as const, momentId: "a-scandal-in-bohemia-1", entries: [{ entryId: "sherlock_holmes", stageId: "main" }],
      plan: { primarySubject: "Holmes by the fire", action: "gazes at the fire", setting: "sitting-room" } };
    await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind: "plan", recordId: "a-scandal-in-bohemia-1", payload: planPayload,
      inputs: [{ kind: "look", recordId: "a-scandal-in-bohemia-1", version: lookVersion }, { kind: "moment", recordId: "a-scandal-in-bohemia-1", version: "x" }] });
    expect(await t.query(api.analysis.listStaleDependents, { workId: WORK, kind: "look", recordId: "a-scandal-in-bohemia-1" })).toEqual([]);

    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "look", recordId: "a-scandal-in-bohemia-1", payload: { ...lookPayload, weather: "snow" } });
    const stale = await t.query(api.analysis.listStaleDependents, { workId: WORK, kind: "look", recordId: "a-scandal-in-bohemia-1" });
    expect(stale).toEqual([expect.objectContaining({ kind: "plan", recordId: "a-scandal-in-bohemia-1", usedVersion: lookVersion })]);

    await t.mutation(api.analysis.clearRecord, { serverSecret: SECRET, workId: WORK, kind: "plan", recordId: "a-scandal-in-bohemia-1" });
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "a-scandal-in-bohemia-1" })).toBeNull();

    // A sheet made from the old canon version shows up as stale too, with its pin state.
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    const holmes = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "sherlock_holmes" });
    await t.mutation(api.analysis.putReference, { serverSecret: SECRET, workId: WORK, kind: "sheet", recordId: "sherlock_holmes:main", storageId,
      inputs: [{ kind: "entry", recordId: "sherlock_holmes", version: holmes!.version }] });
    expect(await t.query(api.analysis.listStaleDependents, { workId: WORK, kind: "entry", recordId: "sherlock_holmes" })).toEqual([]);
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "sherlock_holmes",
      payload: { kind: "entry", name: "Sherlock Holmes", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Sherlock Holmes: corrected." }] } });
    expect(await t.query(api.analysis.listStaleDependents, { workId: WORK, kind: "entry", recordId: "sherlock_holmes" })).toEqual([
      expect.objectContaining({ kind: "sheet", recordId: "sherlock_holmes:main", usedVersion: holmes!.version, pinned: false }),
    ]);
  });

  it("never touches saved image records when analysis changes", async () => {
    const imageId = await t.run(async (ctx) => ctx.db.insert("verseImages", { verseId: "luke-5-8", model: "legacy", createdAt: 1, imageUrl: "https://example.test/old.jpg" }));
    const before = await t.run(async (ctx) => ctx.db.get(imageId));
    const first = await prepare();
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: first });
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "sherlock_holmes",
      payload: { kind: "entry", name: "Sherlock Holmes", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "edited" }] } });
    const { generation: reread } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation: reread, records: minimalRecords() });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: reread });
    expect(await t.run(async (ctx) => ctx.db.get(imageId))).toEqual(before);
  });

  it("records references with their inputs and lets a pin override staleness", async () => {
    const generation = await prepare();
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["jpeg-bytes"], { type: "image/jpeg" })));
    const inputs = [{ kind: "entry", recordId: "sherlock_holmes", version: "v-old" }];
    await t.mutation(api.analysis.putReference, { serverSecret: SECRET, workId: WORK, kind: "sheet", recordId: "sherlock_holmes:main", storageId, inputs, verdict: "pass" });
    const fresh = await t.query(api.analysis.getReference, { workId: WORK, kind: "sheet", recordId: "sherlock_holmes:main", expectedInputs: inputs });
    expect(fresh).toMatchObject({ storageId, stale: false, pinned: false });
    const newer = [{ kind: "entry", recordId: "sherlock_holmes", version: "v-new" }];
    expect((await t.query(api.analysis.getReference, { workId: WORK, kind: "sheet", recordId: "sherlock_holmes:main", expectedInputs: newer }))?.stale).toBe(true);
    await t.mutation(api.analysis.pinReference, { serverSecret: SECRET, workId: WORK, kind: "sheet", recordId: "sherlock_holmes:main", pinned: true });
    expect((await t.query(api.analysis.getReference, { workId: WORK, kind: "sheet", recordId: "sherlock_holmes:main", expectedInputs: newer }))?.stale).toBe(false);
    await expect(t.mutation(api.analysis.putReference, { serverSecret: SECRET, workId: WORK, kind: "sheet", recordId: "sherlock_holmes:main", storageId, inputs: newer })).rejects.toThrow(/pinned/);
  });

  it("stays ready with open attention items and no references", async () => {
    const generation = await prepare();
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    const { id } = await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: WORK, reason: "sheet_failed", kind: "sheet", recordId: "sherlock_holmes:main", detail: "three tries" });
    await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: WORK, reason: "sheet_failed", kind: "sheet", recordId: "sherlock_holmes:main" });
    expect((await t.query(api.analysis.getWorkStatus, { workId: WORK })).ready).toBe(true);
    const open = await t.query(api.analysis.listAttention, { workId: WORK });
    expect(open).toEqual([expect.objectContaining({ id, count: 2, status: "open" })]);
    await t.mutation(api.analysis.closeAttention, { serverSecret: SECRET, id, disposition: "dismissed" });
    expect(await t.query(api.analysis.listAttention, { workId: WORK })).toEqual([]);
    expect(await t.query(api.analysis.listAttention, { workId: WORK, status: "closed" })).toEqual([expect.objectContaining({ id, disposition: "dismissed" })]);
  });

  it("drops extra object stages at the structural check rather than serving them", async () => {
    const generation = await prepare([
      ...minimalRecords(),
      { kind: "entry", recordId: "the_ark", payload: { kind: "entry", name: "The ark", entryKind: "object", stages: [{ id: "a", text: "a" }, { id: "b", text: "b" }] } },
    ]);
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation })).rejects.toThrow(/the_ark: 2 stages/);
  });

  it("checks structure on what would actually serve, owner versions included", async () => {
    const first = await prepare();
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: first });
    // The owner keeps Holmes to one stage "main".
    await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "sherlock_holmes",
      payload: { kind: "entry", name: "Sherlock Holmes", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Sherlock Holmes: owner text." }] } });
    // The reread gives Holmes a "young" stage and a section cast that uses it; alone it is valid.
    const { generation: reread } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation: reread, records: [
      entry("sherlock_holmes", "Sherlock Holmes", [{ id: "main", text: "a" }, { id: "young", text: "b" }]),
      section("a-scandal-in-bohemia-1", "a-scandal-in-bohemia-14", [{ entryId: "sherlock_holmes", stageId: "young" }]),
      moment("a-scandal-in-bohemia-1", "a-scandal-in-bohemia-2", "a-scandal-in-bohemia-1"),
    ] });
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: reread })).rejects.toThrow(/no stage young/);
    const status = await t.query(api.analysis.getWorkStatus, { workId: WORK });
    expect(status.activeGeneration).toBe(first);
    expect(status.candidateGeneration).toBe(reread);
    expect(await t.query(api.analysis.listAttention, { workId: WORK })).toEqual([]);
  });

  it("validates moments while staging, counts rewrites once, and still checks legacy candidates", async () => {
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: WORK_V1, briefVersion: BRIEF_V1 });
    const put = (records: RecordInput[]) => t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records });
    await expect(put([moment("wrong-id", "end", "missing")])).rejects.toThrow(/unknown section/);
    await expect(put([{ ...moment("first", "end", "section"), recordId: "wrong" }])).rejects.toThrow(/first unit/);
    // The section may follow the moment within the same atomic batch.
    await put([moment("first", "end", "section"), section("section", "end"), entry("holmes", "Holmes")]);
    await put([moment("first", "other-end", "section")]);
    expect((await t.query(api.analysis.getGeneration, { workId: WORK, generation }))?.counts).toEqual({ moment: 1, section: 1, entry: 1 });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("analysisGenerations").first();
      await ctx.db.patch(row!._id, { recordCounts: undefined });
    });
    await put([moment("broken", "end", "missing")]);
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation })).rejects.toThrow(/unknown section missing/);
  });

  it("activates and serves a 31,102-moment work, then retires it without losing an owner edit", async () => {
    vi.useFakeTimers();
    try {
      const first = await prepare();
      // Seed the scale fixture directly: the separate staging test exercises write validation.
      // 31,102 moments + 2,790 sections exceed a single Convex transaction's scan limit.
      await t.run(async (ctx) => {
        for (let i = 1; i < 2790; i++) {
          const record = section(`section-${i}`, `end-${i}`);
          await ctx.db.insert("analysisRecords", { ...record, workId: WORK, generation: first, version: "fixture", source: "generated", inputs: [], status: "current", createdAt: 1 });
        }
        for (let i = 1; i < 31102; i++) {
          const record = moment(`unit-${i}`, `unit-${i}`, "a-scandal-in-bohemia-1");
          await ctx.db.insert("analysisRecords", { ...record, workId: WORK, generation: first, version: "fixture", source: "generated", inputs: [], status: "current", createdAt: 1 });
        }
        const row = await ctx.db.query("analysisGenerations").first();
        await ctx.db.patch(row!._id, { recordCounts: { moment: 31102, section: 2790, entry: 1 } });
      });
      // convex-test does not enforce production scan limits. Apply a read budget to the real
      // activation handler so the old full-generation collect fails this regression.
      let scanned = 0;
      const bounded = <T extends object>(target: T): T => new Proxy(target, {
        get(object, property) {
          const value = Reflect.get(object, property);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            const result = Reflect.apply(value, object, args);
            if (["query", "withIndex", "filter", "order"].includes(String(property))) return bounded(result);
            if (["collect", "take", "unique", "first", "get"].includes(String(property))) return Promise.resolve(result).then((rows) => {
              scanned += Array.isArray(rows) ? rows.length : rows ? 1 : 0;
              if (scanned > 32000) throw new Error("Transaction scanned more than 32,000 documents");
              return rows;
            });
            return result;
          };
        },
      });
      const setProtocol = (enabled: boolean) => t.run(async (ctx) => {
        const row = await ctx.db.query("analysisGenerations").first();
        await ctx.db.patch(row!._id, { recordCounts: enabled ? { moment: 31102, section: 2790, entry: 1 } : undefined });
      });
      await setProtocol(false);
      await expect(t.run((ctx) => activateCandidate({ ...ctx, db: bounded(ctx.db) }, { serverSecret: SECRET, workId: WORK, generation: first }))).rejects.toThrow(/32,000 documents/);
      expect((await t.query(api.analysis.getWorkStatus, { workId: WORK })).activeGeneration).toBeNull();
      await setProtocol(true);
      scanned = 0;
      await t.run((ctx) => activateCandidate({ ...ctx, db: bounded(ctx.db) }, { serverSecret: SECRET, workId: WORK, generation: first }));
      expect(scanned).toBeLessThan(5000);
      expect((await t.query(api.analysis.getGeneration, { workId: WORK, generation: first }))?.counts).toEqual({ moment: 31102, section: 2790, entry: 1 });
      expect(await t.query(api.analysis.listActiveRecords, { workId: WORK, kind: "entry" })).toHaveLength(1);
      const list = await listAnalysisRecords(t, WORK, first, "moment");
      expect(list).toHaveLength(31102);
      expect(new Set(list.map((r) => r.recordId)).size).toBe(31102);
      await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind: "plan", recordId: "unit-31101", payload: { kind: "plan", momentId: "unit-31101", entries: [{ entryId: "sherlock_holmes", stageId: "main" }], plan: { primarySubject: "Holmes", action: "reads", setting: "room" } }, inputs: [] });
      expect((await t.query(api.analysis.getGeneration, { workId: WORK, generation: first }))?.counts.plan).toBe(1);
      await t.mutation(api.analysis.clearRecord, { serverSecret: SECRET, workId: WORK, kind: "plan", recordId: "unit-31101" });
      expect((await t.query(api.analysis.getGeneration, { workId: WORK, generation: first }))?.counts.plan).toBe(0);
      const correction = await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "moment", recordId: "a-scandal-in-bohemia-1", payload: { kind: "moment", sectionId: "a-scandal-in-bohemia-1", firstUnit: "a-scandal-in-bohemia-1", lastUnit: "owner-end" } });
      const second = await prepare();
      const result = await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation: second });
      expect(result.carriedOwnerVersions).toEqual(["moment/a-scandal-in-bohemia-1"]);
      expect((await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "moment", recordId: "a-scandal-in-bohemia-1" }))?.version).toBe(correction.version);
      await expect(t.query(api.analysis.listActiveRecordsPage, { workId: WORK, generation: first, kind: "moment", cursor: null })).rejects.toThrow(/generation changed/);
      for (let page = 0; page < 150 && vi.getTimerCount() > 0; page++) {
        vi.runAllTimers();
        await t.finishInProgressScheduledFunctions();
      }
      expect(vi.getTimerCount()).toBe(0);
      expect((await t.query(api.analysis.listRecordHistory, { workId: WORK, kind: "moment", recordId: "unit-31101" }))[0].status).toBe("retired");
      expect(await t.query(api.analysis.getRecordVersion, { workId: WORK, generation: first, kind: "moment", recordId: "unit-31101", version: "fixture" })).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  }, 240000); // About 40 s locally; CI with coverage took 100 s after the 28 October schema additions.
});
