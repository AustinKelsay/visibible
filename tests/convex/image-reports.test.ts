/**
 * Reader image reports (#180): server-resolved provenance that ignores client claims, one
 * attention item per saved image with every message, reopening with history, the four
 * dispositions with their links, and the untouched general feedback path.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const SECRET = "s".repeat(40);
process.env.CONVEX_SERVER_SECRET = SECRET;
process.env.CONVEX_SITE_URL = "https://actions.example.com";
const WORK = "bible-web";

async function seed() {
  const t = convexTest(schema, modules);
  await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
  const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, workVersion: "wv", briefVersion: "bv" });
  await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records: [
    { kind: "entry", recordId: "adam", payload: { kind: "entry", name: "Adam", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Adam: young." }] } },
    { kind: "section", recordId: "genesis-1-1", payload: { kind: "section", title: "Creation", firstUnit: "genesis-1-1", lastUnit: "genesis-1-1", cast: [{ entryId: "adam", stageId: "main" }] } },
    { kind: "moment", recordId: "genesis-1-1", payload: { kind: "moment", sectionId: "genesis-1-1", firstUnit: "genesis-1-1", lastUnit: "genesis-1-1" } },
  ] });
  await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
  const adam = (await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "entry", recordId: "adam" }))!;
  const blob = () => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1])], { type: "image/png" })));
  const generic = await t.mutation(internal.verseImages.saveImageWithStorage, {
    verseId: "genesis-1-1", storageId: await blob(), model: "lite", generationId: "g1", verseText: "WEB text", translationId: "web", engine: "generic", artStyleId: "watercolor",
    provenance: { workId: WORK, momentId: "genesis-1-1", sectionId: "genesis-1-1", eraId: "creation", styleId: "watercolor", styleVersion: "sv", briefVersion: "bv", lookVersion: "lv", planVersion: "pv", promptVersion: "p", analysisGeneration: generation, canon: [{ entryId: "adam", stageId: "main", version: adam.version }], references: [], requestTranslationId: "kjv" },
  });
  const legacy = await t.mutation(internal.verseImages.saveImageWithStorage, { verseId: "genesis-1-2", storageId: await blob(), model: "old", generationId: "g2", verseText: "Reader text", translationId: "kjv" });
  return { t, generic, legacy, adamVersion: adam.version };
}
const submit = (t: ReturnType<typeof convexTest>, args: Record<string, unknown>) =>
  t.mutation(api.feedback.submitFeedback, { serverSecret: SECRET, message: "wrong hat", ...args } as never);

describe("reader image reports", () => {
  it("resolves the exact saved image server-side, ignoring client claims, and keeps legacy provenance unknown", async () => {
    const { t, generic, legacy } = await seed();
    const result = await submit(t, { kind: "image", imageContext: { imageId: generic, model: "spoofed", aspectRatio: "1:1" } });
    expect(result).toMatchObject({ success: true, kind: "image", reopened: false, artStyle: "watercolor" });
    const [row] = await t.run((ctx) => ctx.db.query("feedback").collect());
    expect(row).toMatchObject({ kind: "image", imageId: generic, resolvedImage: { verseId: "genesis-1-1", artStyle: "watercolor", engine: "generic", translationId: "web", workId: WORK, momentId: "genesis-1-1", provenanceKnown: true } });
    expect(row.imageContext).toBeUndefined();
    const legacyResult = await submit(t, { kind: "image", imageContext: { imageId: legacy } });
    expect(legacyResult).toMatchObject({ artStyle: "classical" });
    const rows = await t.run((ctx) => ctx.db.query("feedback").collect());
    expect(rows[1].resolvedImage).toMatchObject({ verseId: "genesis-1-2", artStyle: "classical", translationId: "kjv", provenanceKnown: false });
    expect(rows[1].resolvedImage!.workId).toBeUndefined();
    await expect(submit(t, { kind: "image", imageContext: { imageId: "not-an-id" } })).rejects.toThrow(/Unknown image/);
    await expect(submit(t, { kind: "image" })).rejects.toThrow(/Unknown image/);
    // General feedback keeps its path: stored with the client context, no attention item.
    await submit(t, { message: "love it", imageContext: { imageId: generic, model: "lite" }, verseContext: { book: "Genesis", chapter: 1 } });
    const general = (await t.run((ctx) => ctx.db.query("feedback").collect()))[2];
    expect(general).toMatchObject({ kind: "general", imageContext: { imageId: generic, model: "lite" } });
    expect(general.attentionId).toBeUndefined();
    expect(await t.query(api.analysis.listAttention, { workId: WORK })).toHaveLength(2);
  });

  it("groups every message for one image in one item, counts concurrent first reports once, and reopens with history", async () => {
    const { t, generic } = await seed();
    await Promise.all([submit(t, { kind: "image", imageContext: { imageId: generic }, message: "first" }), submit(t, { kind: "image", imageContext: { imageId: generic }, message: "second" })]);
    const [item] = await t.query(api.analysis.listAttention, { workId: WORK });
    expect(item).toMatchObject({ reason: "reader_report", kind: "image", recordId: generic, count: 2, imageId: generic });
    expect(item.reports!.map((r) => r.message).sort()).toEqual(["first", "second"]);
    expect(await t.query(api.analysis.listAttention, { workId: WORK })).toHaveLength(1);
    await t.mutation(api.analysis.closeAttention, { serverSecret: SECRET, id: item.id, disposition: "accepted limitation" });
    const again = await submit(t, { kind: "image", imageContext: { imageId: generic }, message: "third" });
    expect(again).toMatchObject({ attentionId: item.id, reopened: true });
    const reopened = await t.query(api.analysis.getAttentionItem, { serverSecret: SECRET, id: item.id });
    expect(reopened).toMatchObject({ status: "open", count: 3, disposition: "accepted limitation", closure: { disposition: "accepted limitation" } });
    expect(reopened!.history!.map((h) => h.event)).toEqual(["reported", "reported", "closed", "reopened"]);
    expect(reopened!.history![3]).toMatchObject({ disposition: "accepted limitation" });
    expect(reopened!.reports).toHaveLength(3);
  });

  it("closes only with a valid disposition; source corrected needs an existing version and a check; edits never close a report", async () => {
    const { t, generic, adamVersion } = await seed();
    await submit(t, { kind: "image", imageContext: { imageId: generic } });
    const [item] = await t.query(api.analysis.listAttention, { workId: WORK });
    const close = (args: Record<string, unknown>) => t.mutation(api.analysis.closeAttention, { serverSecret: SECRET, id: item.id, ...args } as never);
    await expect(close({ disposition: "fixed" })).rejects.toThrow(/one of/);
    await expect(close({ disposition: "source corrected" })).rejects.toThrow(/must link/);
    await expect(close({ disposition: "source corrected", correction: { kind: "entry", recordId: "adam", version: "0".repeat(32) }, check: "Regenerated Genesis 1:1; hat gone" })).rejects.toThrow(/No entry adam with version/);
    // An owner edit creates the new version but leaves the report open.
    const edited = await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "adam", expectedVersion: adamVersion, payload: { kind: "entry", name: "Adam", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Adam: young, bareheaded." }] } });
    await t.mutation(api.analysis.closeAttentionFor, { serverSecret: SECRET, workId: WORK, kind: "entry", recordId: "adam", disposition: "source corrected" });
    expect((await t.query(api.analysis.listAttention, { workId: WORK }))).toHaveLength(1);
    expect(await close({ disposition: "source corrected", correction: { kind: "entry", recordId: "adam", version: edited.version }, check: "Regenerated Genesis 1:1 twice; no hat" })).toEqual({ closed: true });
    const closed = await t.query(api.analysis.getAttentionItem, { serverSecret: SECRET, id: item.id });
    expect(closed).toMatchObject({ status: "closed", closure: { disposition: "source corrected", correction: { kind: "entry", recordId: "adam", version: edited.version }, check: "Regenerated Genesis 1:1 twice; no hat" } });
    // The saved image and its provenance are unchanged.
    const image = await t.query(api.verseImages.getImageProvenance, { serverSecret: SECRET, imageId: generic });
    expect(image).toMatchObject({ artStyle: "watercolor", engine: "generic", translationId: "web", provenance: { canon: [{ entryId: "adam", version: adamVersion }] } });
    expect(image!.imageUrl).toEqual(expect.any(String));
    expect(await t.query(api.verseImages.getImageProvenance, { serverSecret: SECRET, imageId: "missing" })).toBeNull();
  });
});
