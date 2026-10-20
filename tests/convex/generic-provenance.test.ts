/** Generic-engine persistence (#175): packet snapshots on requests, provenance on saved images, reference blob URLs. */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";

const SECRET = "s".repeat(40);
process.env.CONVEX_SERVER_SECRET = SECRET;
const packet = {
  promptVersion: "2026-10-20-generic-v1", workId: "bible-web", momentId: "genesis-1-1", sectionId: "genesis-1-1", eraId: "creation", styleId: "watercolor", styleVersion: "sv", briefVersion: "bv",
  lookVersion: "lv", planVersion: "pv", canon: [{ entryId: "adam", stageId: "main", version: "av" }],
  references: [{ kind: "sheet" as const, id: "adam:main", storageId: "st", version: "rv", caption: "Image 1: Adam's reference sheet" }],
  flags: { variationIncluded: false, neighborsIncluded: true, styleDetailIncluded: true, lookDetailIncluded: true }, budget: { maxChars: 8000, finalChars: 4200 },
};
const { flags: _flags, budget: _budget, ...packetFields } = packet;
void _flags; void _budget;
const provenance = { ...packetFields, analysisGeneration: 1, references: [{ kind: "sheet" as const, id: "adam:main", version: "rv" }], requestTranslationId: "kjv" };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("generic provenance", () => {
  it("persists the rendering packet on the request before generation and keeps it through settlement", async () => {
    const t = convexTest(schema, modules);
    const base = { requestId: "r1", sid: "sid", verseId: "genesis-1-1", inputFingerprint: "fp", generationId: "g1", executorVersion: "next-image-v1" as const, billingPolicyVersion: "legacy-image-v1" as const, serverSecret: SECRET };
    await t.mutation(api.verseImages.createGenerationRequest, { ...base, engine: "generic", artStyleId: "watercolor", engineCommitments: { workId: "bible-web", momentId: "genesis-1-1", briefVersion: "bv", analysisGeneration: 1, promptVersion: packet.promptVersion, billingVersion: "google-output-tokens-2026-09-08" } });
    expect(await t.mutation(api.verseImages.updateGenerationRequest, { requestId: "r1", status: "generating", renderingPacket: packet, serverSecret: SECRET })).toEqual({ success: true });
    await t.mutation(api.verseImages.updateGenerationRequest, { requestId: "r1", status: "succeeded", actualCreditsCost: 2, serverSecret: SECRET });
    const [request] = await t.run((ctx) => ctx.db.query("imageGenerationRequests").collect());
    expect(request.renderingPacket).toEqual(packet);
    expect(request.status).toBe("succeeded");
  });

  it("saves engine and provenance with a stored image, idempotently by generation id, and leaves legacy saves without them", async () => {
    const t = convexTest(schema, modules);
    const args = { verseId: "genesis-1-1", imageUrl: `data:image/png;base64,${PNG}`, model: "google/gemini-3.1-flash-lite-image", translationId: "web", verseText: "In the beginning, God created the heavens and the earth.", generationId: "g1", serverSecret: SECRET };
    const saved = await t.action(api.verseImages.saveImage, { ...args, engine: "generic", provenance });
    const again = await t.action(api.verseImages.saveImage, { ...args, engine: "generic", provenance: { ...provenance, requestTranslationId: "web" } });
    expect(again.id).toBe(saved.id);
    const legacy = await t.action(api.verseImages.saveImage, { ...args, generationId: "g2" });
    const rows = await t.run((ctx) => ctx.db.query("verseImages").collect());
    expect(rows).toHaveLength(2);
    const generic = rows.find((r) => r._id === saved.id)!;
    expect(generic).toMatchObject({ engine: "generic", translationId: "web", provenance });
    expect(generic.storageId).toBeDefined();
    const other = rows.find((r) => r._id === legacy.id)!;
    expect(other.engine).toBeUndefined();
    expect(other.provenance).toBeUndefined();
  });

  it("serves a reference blob URL only to the server and null for a missing blob", async () => {
    const t = convexTest(schema, modules);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" })));
    const located = await t.query(api.analysis.getReferenceBlobUrl, { serverSecret: SECRET, storageId });
    expect(located).toMatchObject({ url: expect.any(String), size: 3 });
    await t.run((ctx) => ctx.storage.delete(storageId));
    expect(await t.query(api.analysis.getReferenceBlobUrl, { serverSecret: SECRET, storageId })).toBeNull();
    await expect(t.query(api.analysis.getReferenceBlobUrl, { serverSecret: "wrong", storageId })).rejects.toThrow();
  });
});
