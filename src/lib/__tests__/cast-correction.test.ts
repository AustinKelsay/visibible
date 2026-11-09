/** Missing cast repair over real storage and ordinary assembly; scripted plans do not prove model compliance. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { api, internal } from "../../../convex/_generated/api";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { modules } from "../../../tests/convex/modules";
import { createWorkReader } from "../work-input";
import { SHARED_STYLES } from "../work-preparation";
import { createCorrections, type CastEntryAddition } from "../engine/corrections";
import { assembleLean } from "../engine/lean-assemble";
import { readWorkInputs, type WorkInputs } from "../engine/work-inputs";
import { testDepiction } from "../../../tests/fixtures/depiction";

const SECRET = "s".repeat(40), WORK = "cast-fixture";
process.env.CONVEX_SERVER_SECRET = SECRET;
const work = createWorkReader({
  schemaVersion: 1, id: WORK, title: "The court", author: "Fixture", language: "en",
  referenceText: { name: "Fixture", source: "https://example.com", credit: "Fixture", sha256: "0".repeat(64) },
  levels: ["Part", "Unit"], referenceFormats: { Part: "{Part} {Unit}" }, momentMode: "unit",
  divisions: [{ key: "court", label: "Court", level: "Part", units: [
    "The watcher watches the seat.", "The assembly ministers before the seat.", "The watcher leaves.", "The watcher waits outside.",
  ].map((text, i) => ({ number: i + 1, text })) }],
});
const inputs: WorkInputs = {
  work, workVersion: "wv", briefVersion: "bv", depiction: testDepiction(WORK),
  brief: { schemaVersion: 1, workId: WORK, tone: "Quiet", depictionRules: [],
    eras: [{ id: "court", label: "Court", people: "Courtiers", dress: "Robes", buildingsAndObjects: "Stone courts", technology: "Hand tools" }],
    styleIds: ["classical", "watercolor", "icon"] },
  styles: Object.fromEntries(SHARED_STYLES.styles.map((style) => [style.id, { style, version: contentVersion(style) }])),
};
const records = [
  { kind: "entry" as const, recordId: "watcher", payload: { kind: "entry" as const, name: "The watcher", entryKind: "character" as const, stages: [{ id: "main", text: "The watcher: an adult in a blue robe." }] } },
  ...[1, 3].map((n) => ({ kind: "section" as const, recordId: `court-${n}`, payload: { kind: "section" as const, title: `Section ${n}`, firstUnit: `court-${n}`, lastUnit: `court-${n + 1}`, era: "court", cast: [{ entryId: "watcher", stageId: "main" }] } })),
  ...[1, 2, 3, 4].map((n) => ({ kind: "moment" as const, recordId: `court-${n}`, payload: { kind: "moment" as const, sectionId: `court-${n < 3 ? 1 : 3}`, firstUnit: `court-${n}`, lastUnit: `court-${n}` } })),
];

describe("missing cast correction", () => {
  let t: ReturnType<typeof convexTest>;
  let c: ReturnType<typeof createCorrections>;
  let addition: CastEntryAddition;
  const active = (kind: "entry" | "section" | "moment", recordId: string) => t.query(api.analysis.getActiveRecord, { workId: WORK, kind, recordId });
  const add = (overrides: Partial<CastEntryAddition> = {}) => c.addCastEntry({ ...addition, ...overrides }, inputs);
  const state = () => t.run(async (ctx) => ({ records: await ctx.db.query("analysisRecords").collect(), generations: await ctx.db.query("analysisGenerations").collect() }));
  const mutate = (overrides: Partial<CastEntryAddition> = {}) => t.mutation(api.analysis.addCastEntry, { serverSecret: SECRET, workId: WORK, ...addition, ...overrides });

  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    const client = { query: (ref: never, args: never) => t.query(ref, args), mutation: (ref: never, args: never) => t.mutation(ref, args) };
    c = createCorrections(client as never, api.analysis as never, WORK, SECRET, "https://site.test");
    addition = { workVersion: "wv", expectedGeneration: generation, sectionId: "court-1", expectedSectionVersion: (await active("section", "court-1"))!.version,
      entryId: "assembly", stageId: "main", named: false,
      entry: { kind: "entry", name: "The assembly", entryKind: "character", hasForm: true,
        stages: [{ id: "main", text: "The assembly: a typical member is an adult in an undyed robe.", quotes: [{ unit: "court-2", quote: "The assembly ministers before the seat." }] }] } };
  });

  it("adds canon and the stage assignment together, retains history and counts, and makes exact retries harmless", async () => {
    const before = await state();
    const result = await add();
    expect(result.changed).toBe(true);
    expect(await active("entry", "assembly")).toMatchObject({ source: "owner", version: result.entryVersion, payload: addition.entry });
    expect(await active("section", "court-1")).toMatchObject({ source: "owner", version: result.sectionVersion,
      payload: { cast: [{ entryId: "watcher", stageId: "main" }, { entryId: "assembly", stageId: "main", named: false }] } });
    expect(await t.query(api.analysis.getWorkStatus, { workId: WORK })).toMatchObject({ ready: true, activeGeneration: 1 });
    const after = await state();
    expect(after.generations[0].recordCounts).toEqual({ ...before.generations[0].recordCounts, entry: 2 });
    expect(after.records.filter((r) => r.kind === "section" && r.recordId === "court-1")).toContainEqual(expect.objectContaining({ status: "superseded", version: addition.expectedSectionVersion }));
    expect(await add()).toEqual({ ...result, changed: false });
    expect(await state()).toEqual(after);
    await expect(add({ entry: { ...addition.entry, name: "Another identity" } })).rejects.toThrow(/already exists/);
    expect(await state()).toEqual(after);
  });

  it("refuses stale sections, generation/text changes, ID collisions and bad stages without partial writes", async () => {
    const before = await state();
    for (const overrides of [
      { expectedSectionVersion: "stale" }, { expectedGeneration: 2 }, { workVersion: "other" }, { sectionId: "absent" },
      { entryId: "watcher" }, { stageId: "absent" }, { entry: { ...addition.entry, stages: [] } },
      { entry: { ...addition.entry, stages: [...addition.entry.stages, ...addition.entry.stages] } },
      { entry: { ...addition.entry, stages: [{ id: "main", text: "", quotes: addition.entry.stages[0].quotes }] } },
      { entry: { ...addition.entry, stages: [{ id: "main", text: "x".repeat(501), quotes: addition.entry.stages[0].quotes }] } },
      { entry: { ...addition.entry, entryKind: "object" as const, stages: [...addition.entry.stages, { ...addition.entry.stages[0], id: "other" }] } },
    ]) {
      await expect(mutate(overrides)).rejects.toThrow();
      expect(await state()).toEqual(before);
    }
    await expect(t.mutation(api.analysis.addCastEntry, { serverSecret: "bad", workId: WORK, ...addition })).rejects.toThrow();
    expect(await state()).toEqual(before);
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: "new-text", briefVersion: "bv" });
    await expect(mutate({ workVersion: "new-text" })).rejects.toThrow(/matching the reference text/);
    expect(await state()).toEqual(before);
  });

  it("checks exact quotes and section evidence against the imported work before sending a mutation", async () => {
    const mutation = vi.fn();
    const checked = createCorrections({ query: (ref, args) => t.query(ref as never, args as never), mutation }, api.analysis as never, WORK, SECRET, "https://site.test");
    for (const quotes of [[], [{ unit: "court-2", quote: "Invented words" }], [{ unit: "court-2", quote: " " }], [{ unit: "court-99", quote: "Unknown unit" }], [{ unit: "court-3", quote: "The watcher leaves." }]]) {
      await expect(checked.addCastEntry({ ...addition, entry: { ...addition.entry, stages: [{ ...addition.entry.stages[0], quotes }] } }, inputs)).rejects.toThrow();
    }
    await expect(checked.addCastEntry({ ...addition, workVersion: "other" }, inputs)).rejects.toThrow(/reference text/);
    expect(mutation).not.toHaveBeenCalled();
    expect(await active("entry", "assembly")).toBeNull();
  });

  it("puts the added canon in its section's next prompt, and leaves other sections and saved images alone", async () => {
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["png"], { type: "image/png" })));
    await t.mutation(internal.verseImages.saveImageWithStorage, { verseId: "court-1", storageId, model: "lite", generationId: "saved", verseText: "original", translationId: "web" });
    const saved = await t.run(async (ctx) => ctx.db.query("verseImages").collect());
    const render = async (n: number) => {
      const result = await assembleLean({ inputs, getRecord: (kind, recordId) => active(kind, recordId) as never, listMoments: async () => [],
        getReference: async () => null, loadReference: async () => new Uint8Array() }, { workId: WORK, unitId: `court-${n}`, styleId: "classical", aspectRatio: "16:9" });
      if (!result.ok) throw new Error(result.message);
      return result;
    };
    const text = addition.entry.stages[0].text;
    expect((await render(2)).prompt).not.toContain(text);
    await add();
    const after = await render(2);
    expect(after.packet.canon.map((c) => c.entryId)).toEqual(["assembly", "watcher"]);
    expect(after.prompt).toContain(text);
    // The rest of section 1 sees the whole section's cast; section 3 is not touched.
    expect((await render(1)).prompt).toContain(text);
    const other = await render(3);
    expect(other.packet.canon.map((c) => c.entryId)).toEqual(["watcher"]);
    expect(other.prompt).not.toContain(text);
    expect(await t.run(async (ctx) => ctx.db.query("verseImages").collect())).toEqual(saved);
  });

  it("blocks a reread that would lose the new identity, then carries owner versions when that identity survives", async () => {
    const result = await add();
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records });
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation })).rejects.toThrow(/unknown entry assembly/);
    expect(await t.query(api.analysis.getWorkStatus, { workId: WORK })).toMatchObject({ ready: true, activeGeneration: 1 });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records: [{ kind: "entry", recordId: "assembly", payload: { ...addition.entry, name: "Generated name" } }] });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    expect(await active("entry", "assembly")).toMatchObject({ source: "owner", version: result.entryVersion, payload: addition.entry });
    expect(await active("section", "court-1")).toMatchObject({ source: "owner", version: result.sectionVersion });
  });
});

it("binds the Daniel correction to exact WEB evidence and the retained cast gap without applying it", async () => {
  const inputs = await readWorkInputs("bible-web");
  const addition: CastEntryAddition = JSON.parse(readFileSync(new URL("../../../llm/releases/2026-10-22-daniel-cast-correction/addition.json", import.meta.url), "utf8"));
  const before = JSON.parse(readFileSync(new URL("../../../llm/releases/2026-10-22-daniel-effects-v5/before.json", import.meta.url), "utf8"));
  const section = before.records.find((r: { kind: string; recordId: string }) => r.kind === "section" && r.recordId === addition.sectionId);
  expect(addition.expectedSectionVersion).toBe(section.version);
  const mutation = vi.fn(async () => ({ changed: true }));
  const c = createCorrections({ query: async () => section, mutation }, api.analysis as never, "bible-web", SECRET, "https://site.test");
  await c.addCastEntry(addition, inputs);
  expect(mutation).toHaveBeenCalledWith(api.analysis.addCastEntry, { serverSecret: SECRET, workId: "bible-web", ...addition });
  expect(addition.entry.stages[0].quotes?.[0].unit).toBe("daniel-7-10");
  expect(section.payload.cast.some((m: { entryId: string }) => m.entryId === addition.entryId)).toBe(false);
});
