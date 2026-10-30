/**
 * Owner corrections (#179) over the real Convex analysis module: attention listing with links,
 * inspection, stale-guarded edits that close checker items but not reader reports, pins, plan
 * clearing, wipe variants with owner versions carried into the next activation, and untouched
 * saved images.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { createCorrections } from "../engine/corrections";
import { testDepiction } from "../../../tests/fixtures/depiction";

const SECRET = "s".repeat(40);
process.env.CONVEX_SERVER_SECRET = SECRET;
const WORK = "two-books";
const records = [
  { kind: "entry" as const, recordId: "jonah", payload: { kind: "entry" as const, name: "Jonah", entryKind: "character" as const, hasForm: true, stages: [{ id: "young", text: "Jonah: young." }, { id: "old", text: "Jonah: old." }] } },
  { kind: "section" as const, recordId: "s1", payload: { kind: "section" as const, title: "One", firstUnit: "s1", lastUnit: "s1", era: "e", cast: [{ entryId: "jonah", stageId: "young" }] } },
  { kind: "moment" as const, recordId: "s1", payload: { kind: "moment" as const, sectionId: "s1", firstUnit: "s1", lastUnit: "s1" } },
];

describe("owner corrections", () => {
  let t: ReturnType<typeof convexTest>;
  let c: ReturnType<typeof createCorrections>;
  const client = () => ({ query: (ref: unknown, args: unknown) => t.query(ref as never, args as never), mutation: (ref: unknown, args: unknown) => t.mutation(ref as never, args as never) });
  const activate = async (gen?: number) => {
    const { generation } = gen ? { generation: gen } : await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    return generation;
  };
  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
    await activate();
    c = createCorrections(client() as never, api.analysis as never, WORK, SECRET, "https://site.test", { getImageProvenance: api.verseImages.getImageProvenance });
  });

  it("lists, inspects and resolves reader image reports with the image's own provenance", async () => {
    process.env.CONVEX_SITE_URL = "https://site.test";
    const { internal } = await import("../../../convex/_generated/api");
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["png"], { type: "image/png" })));
    const provenance = { workId: WORK, momentId: "s1", sectionId: "s1", eraId: "e", styleId: "icon", styleVersion: "sv", briefVersion: "bv", lookVersion: "lv", planVersion: "pv", promptVersion: "p", analysisGeneration: 1, canon: [], references: [], requestTranslationId: "web" };
    const imageId = await t.mutation(internal.verseImages.saveImageWithStorage, { verseId: "s1", storageId, model: "lite", generationId: "g1", verseText: "text", translationId: "web", engine: "generic", artStyleId: "icon", provenance });
    await t.mutation(api.feedback.submitFeedback, { serverSecret: SECRET, message: "halo has letters", kind: "image", imageContext: { imageId } });
    const rows = await c.reports();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "reader", count: 1, verseId: "s1", artStyle: "icon", engine: "generic", translationId: "web", imageMissing: false });
    expect(rows[0].link).toEqual(expect.any(String));
    const full = await c.report(rows[0].id);
    expect(full.item.reports).toEqual([{ at: expect.any(Number), message: "halo has letters" }]);
    expect(full.image).toMatchObject({ artStyle: "icon", provenance: { workId: WORK, styleId: "icon" } });
    await expect(c.resolve(rows[0].id, { disposition: "fixed it" })).rejects.toThrow(/one of/);
    await expect(c.resolve(rows[0].id, { disposition: "source corrected" })).rejects.toThrow(/must link/);
    const entry = (await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" }))!;
    expect(await c.resolve(rows[0].id, { disposition: "source corrected", correction: { kind: "entry", recordId: "jonah", version: entry.version }, check: "two regenerations clean" })).toEqual({ closed: true });
    expect(await c.reports()).toEqual([]);
    expect((await c.reports("closed"))[0]).toMatchObject({ disposition: "source corrected" });
  });

  it("lists attention with links and sources, inspects an entry, and dismisses an item", async () => {
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    await t.mutation(api.analysis.putReference, { serverSecret: SECRET, workId: WORK, kind: "sheet", recordId: "jonah:young", storageId, inputs: [{ kind: "entry", recordId: "jonah", version: "v" }] });
    await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: WORK, reason: "canon_note", kind: "sheet", recordId: "jonah:young", detail: "beard greyer than canon" });
    await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: WORK, reason: "reader_report", kind: "image", recordId: "img-1", detail: "wrong hat" });
    const rows = await c.attention();
    expect(rows.map((r) => [r.reason, r.source, r.link])).toEqual(expect.arrayContaining([
      ["canon_note", "checker", `https://site.test/image/${encodeURIComponent(storageId)}`], ["reader_report", "reader", null],
    ]));
    const inspected = await c.inspect("jonah");
    expect(inspected.entry.version).toMatch(/^[0-9a-f]{32}$/);
    expect(inspected.references).toEqual([{ stageId: "young", pinned: false, url: `https://site.test/image/${encodeURIComponent(storageId)}` }, { stageId: "old", pinned: false, url: null }]);
    expect(inspected.attention.map((a) => a.reason)).toEqual(["canon_note"]);
    await c.dismiss(rows.find((r) => r.reason === "reader_report")!.id, "isolated rendering error");
    expect((await c.attention("closed")).map((r) => r.disposition)).toEqual(["isolated rendering error"]);
  });

  it("edits one stage as an owner version, refuses a stale edit, closes checker items but never a reader report, and lists stale dependents", async () => {
    await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: WORK, reason: "quote_check_failed", kind: "entry", recordId: "jonah", detail: "x" });
    await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: WORK, reason: "reader_report", kind: "entry", recordId: "jonah", detail: "looks wrong" });
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    const before = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" });
    await t.mutation(api.analysis.putReference, { serverSecret: SECRET, workId: WORK, kind: "sheet", recordId: "jonah:young", storageId, inputs: [{ kind: "entry", recordId: "jonah", version: before!.version }] });

    const result = await c.editStage("jonah", "young", "Jonah: young, owner-edited.");
    expect(result.changed).toBe(true);
    expect(result.closedAttention).toBe(1);
    expect(result.staleDependents).toEqual([expect.objectContaining({ kind: "sheet", recordId: "jonah:young" })]);
    const after = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" });
    expect(after).toMatchObject({ source: "owner", payload: { stages: [{ id: "young", text: "Jonah: young, owner-edited." }, { id: "old", text: "Jonah: old." }] } });
    expect((await c.attention()).map((a) => a.reason)).toEqual(["reader_report"]);
    // A command that saw the older version is refused; a retry of the same edit is harmless.
    await expect(c.editStage("jonah", "young", "Jonah: another edit.", before!.version)).rejects.toThrow(/Stale edit/);
    expect((await c.editStage("jonah", "young", "Jonah: young, owner-edited.", before!.version)).changed).toBe(false);
    await expect(c.editStage("jonah", "nope", "x")).rejects.toThrow(/no stage nope/);
  });

  it("corrects an entry's kind as an owner version, refusing an unknown kind, a multi-stage object or a stale edit", async () => {
    const before = (await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" }))!;
    await expect(c.setKind("jonah", "city")).rejects.toThrow(/one of character, location, object/);
    // Jonah has two stages; an object has one.
    await expect(c.setKind("jonah", "object")).rejects.toThrow(/An object has one stage; jonah has 2/);
    expect(await c.setKind("jonah", "location")).toMatchObject({ changed: true, previous: "character", entryKind: "location", staleDependents: [] });
    expect((await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" }))).toMatchObject({ source: "owner", payload: { ...before.payload, entryKind: "location" } });
    await expect(c.setKind("jonah", "character", before.version)).rejects.toThrow(/Stale edit/);
  });

  it("sets an entry's depiction as an owner version, refusing a mode the work has no wording for, an unknown mode or another work's profile", async () => {
    const plan = { kind: "plan" as const, momentId: "s1", entries: [{ entryId: "jonah", stageId: "young" }],
      plan: { primarySubject: "Jonah", action: "rows", setting: "lake", secondaryElements: "", mood: "calm", timeOfDay: "dawn", composition: "wide" } };
    const before = (await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" }))!;
    await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind: "plan", recordId: "s1", payload: plan, inputs: [{ kind: "entry", recordId: "jonah", version: before.version }] });
    const withEffects = testDepiction(WORK);
    const withoutEffects = testDepiction(WORK, { withoutEffects: true });
    await expect(c.setDepiction("jonah", "effects", withoutEffects)).rejects.toThrow(/two-books has no wording for subjects without form/);
    await expect(c.setDepiction("jonah", "symbol", withEffects)).rejects.toThrow(/one of form, effects/);
    await expect(c.setDepiction("jonah", "effects", testDepiction("bible-web"))).rejects.toThrow(/bible-web was given for two-books/);
    const result = await c.setDepiction("jonah", "effects", withEffects);
    expect(result).toMatchObject({ changed: true, previous: "form", depiction: "effects", staleDependents: [{ kind: "plan", recordId: "s1" }] });
    const after = (await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" }))!;
    expect(after).toMatchObject({ source: "owner", payload: { ...before.payload, hasForm: false } });
    await expect(c.setDepiction("jonah", "form", withEffects, before.version)).rejects.toThrow(/Stale edit/);
    // Back to drawn: a work without such subjects can always draw an entry from its canon.
    expect(await c.setDepiction("jonah", "form", withoutEffects)).toMatchObject({ previous: "effects", depiction: "form" });
    expect((await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" }))!.payload).toMatchObject({ hasForm: true });
  });

  it("removes a wrongly assigned cast member as an owner section version, refusing an unassigned entry or a stale edit", async () => {
    const before = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "section", recordId: "s1" });
    await expect(c.removeCast("s1", "nineveh")).rejects.toThrow(/does not assign nineveh/);
    await expect(c.removeCast("s1", "jonah", "stale-version")).rejects.toThrow(/Stale edit/);
    const removed = await c.removeCast("s1", "jonah");
    expect(removed).toMatchObject({ changed: true, previousVersion: before!.version, removed: "jonah", cast: [] });
    const after = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "section", recordId: "s1" });
    expect(after).toMatchObject({ source: "owner", payload: { cast: [] } });
    // The entry itself is untouched.
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" })).not.toBeNull();
  });

  it("edits a look, pins and unpins, and clears a plan rather than editing it", async () => {
    await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind: "look", recordId: "s1", payload: { kind: "look", sectionId: "s1", place: "shore", timeOfDay: "dawn", weather: "calm", light: "low", clothing: "wool" }, inputs: [] });
    await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK, kind: "plan", recordId: "s1", payload: { kind: "plan", momentId: "s1", entries: [], plan: { primarySubject: "a", action: "b", setting: "c" } }, inputs: [{ kind: "look", recordId: "s1", version: (await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "look", recordId: "s1" }))!.version }] });
    await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: WORK, reason: "canon_check", kind: "look", recordId: "s1", detail: "restates canon" });
    const edited = await c.editLook("s1", { weather: "storm" });
    expect(edited.staleDependents).toEqual([expect.objectContaining({ kind: "plan", recordId: "s1" })]);
    expect(edited.closedAttention).toBe(1);
    expect((await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "look", recordId: "s1" }))?.payload).toMatchObject({ weather: "storm", place: "shore" });
    expect(await c.clearPlan("s1")).toEqual({ cleared: true });
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "s1" })).toBeNull();
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    await t.mutation(api.analysis.putReference, { serverSecret: SECRET, workId: WORK, kind: "styleReference", recordId: "icon", storageId, inputs: [{ kind: "style", recordId: "icon", version: "i1" }] });
    await c.pin("styleReference", "icon", true);
    expect((await t.query(api.analysis.getReference, { workId: WORK, kind: "styleReference", recordId: "icon", expectedInputs: [{ kind: "style", recordId: "icon", version: "i2" }] }))?.stale).toBe(false);
    await c.pin("styleReference", "icon", false);
    expect((await t.query(api.analysis.getReference, { workId: WORK, kind: "styleReference", recordId: "icon", expectedInputs: [{ kind: "style", recordId: "icon", version: "i2" }] }))?.stale).toBe(true);
  });

  it("wipes generated analysis, keeps owner versions for the next activation unless told otherwise, and leaves saved images and spend alone", async () => {
    const imageId = await t.run(async (ctx) => ctx.db.insert("verseImages", { verseId: "s1", model: "legacy", createdAt: 1, imageUrl: "https://example.test/old.jpg" }));
    await t.mutation(api.analysis.recordPreparationSpend, { serverSecret: SECRET, workId: WORK, kind: "plan", recordId: "s1", model: "m", outcome: "ok", costUsd: 0.001 });
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    await t.mutation(api.analysis.putReference, { serverSecret: SECRET, workId: WORK, kind: "sheet", recordId: "jonah:young", storageId, inputs: [] });
    await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: WORK, reason: "reader_report", kind: "image", recordId: "img", detail: "r" });
    await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: WORK, reason: "sheet_failed", kind: "sheet", recordId: "x", detail: "f" });
    await c.editStage("jonah", "old", "Jonah: old, owner-edited.");

    const counts = await c.wipe({ includingOwner: false });
    expect(counts).toMatchObject({ ownerKept: 1, references: 1, attention: 1 });
    expect(counts.records).toBeGreaterThan(0);
    expect((await c.status()).ready).toBe(false);
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "section", recordId: "s1" })).toBeNull();
    expect(await t.run(async (ctx) => ctx.storage.get(storageId))).toBeNull();
    expect((await t.query(api.analysis.listAttention, { workId: WORK })).map((a) => a.reason)).toEqual(["reader_report"]);
    expect(await t.run(async (ctx) => ctx.db.get(imageId))).toMatchObject({ imageUrl: "https://example.test/old.jpg" });
    expect((await t.query(api.analysis.getPreparationSpend, { workId: WORK })).calls).toBe(1);
    // A reread after the wipe carries the owner version forward.
    const generation = await activate();
    expect(generation).toBe(2);
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" })).toMatchObject({ source: "owner", payload: { stages: [expect.anything(), { id: "old", text: "Jonah: old, owner-edited." }] } });
    expect((await c.status()).ready).toBe(true);
    // Wiping with owner versions included leaves nothing to carry.
    await c.wipe({ includingOwner: true });
    await activate();
    expect(await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "jonah" })).toMatchObject({ source: "generated" });
    await expect(t.mutation(api.analysis.wipeWork, { serverSecret: SECRET, workId: WORK, confirmation: "wrong", includingOwner: false })).rejects.toThrow(/Confirmation/);
    await expect(t.mutation(api.analysis.wipeWork, { serverSecret: "nope", workId: WORK, confirmation: WORK, includingOwner: false })).rejects.toThrow();
  });
});
