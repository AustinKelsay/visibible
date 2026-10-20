/**
 * Release rehearsal (#182): the retirement dry-run inventory over real request and bulk records,
 * the readiness matrix the release checks, and the rollback stance of a paused generic job.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";
import { classifyForRetirement } from "../../src/lib/engine/retirement";

const SECRET = "server-only";
const issuer = "https://guest.example";
beforeEach(() => { vi.stubEnv("GUEST_AUTH_ISSUER", issuer); vi.stubEnv("CONVEX_SERVER_SECRET", SECRET); });
afterEach(() => vi.unstubAllEnvs());

describe("retirement inventory", () => {
  it("classifies accepted obligations, uncertain attempts and cancellation candidates per engine without changing anything", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => { await ctx.db.insert("sessions", { sid: "owner", tier: "paid", credits: 100, createdAt: Date.now(), lastSeenAt: Date.now() }); });
    const owner = t.withIdentity({ subject: "owner", issuer, guestExpiresAt: Date.now() / 1000 + 300 });
    const request = async (requestId: string, engine: "legacy" | "generic" | null, status: "queued" | "planning" | "generating" | "succeeded" | "failed") => {
      await t.mutation(api.verseImages.createGenerationRequest, { requestId, sid: "owner", verseId: "genesis-1-1", inputFingerprint: "fp", generationId: `g-${requestId}`, executorVersion: "next-image-v1", billingPolicyVersion: "legacy-image-v1", serverSecret: SECRET,
        ...(engine ? { engine } : {}), ...(engine === "generic" ? { engineCommitments: { workId: "bible-web", momentId: "m", briefVersion: "b", analysisGeneration: 1, promptVersion: "p", billingVersion: "v" } } : {}) });
      for (const step of status === "queued" ? [] : status === "planning" ? ["planning"] : status === "generating" ? ["generating"] : ["generating", status]) {
        await t.mutation(api.verseImages.updateGenerationRequest, { requestId, status: step as "planning" | "generating" | "succeeded" | "failed", serverSecret: SECRET });
      }
    };
    await request("legacy-queued", "legacy", "queued");
    await request("legacy-flight", "legacy", "generating");
    await request("legacy-done", "legacy", "succeeded");
    await request("historical", null, "generating");
    await request("generic-flight", "generic", "generating");
    await request("generic-failed", "generic", "failed");
    // A legacy bulk job: one item admitted and in flight (bulk-<id>-0), one never admitted.
    const { bulkId } = await owner.mutation(api.bulkGenerations.create, { sid: "owner", scopeType: "verses", scopeLabel: "G", startVerseId: "genesis-1-1", estimatedTotalCredits: 4, modelId: "lite", aspectRatio: "16:9", resolution: "1K", translation: "web", verses: [0, 1].map((order) => ({ verseId: `genesis-1-${order + 1}`, reference: `Genesis 1:${order + 1}`, order })) });
    await t.mutation(api.bulkGenerations.bindLegacyJobs, { serverSecret: SECRET });
    await owner.mutation(api.bulkGenerations.updateVerseStatus, { sid: "owner", bulkGenerationId: bulkId, verseId: "genesis-1-1", status: "generating", expectedCurrentStatus: "queued" });
    await request(`bulk-${bulkId}-0`, "legacy", "generating");

    const requests = await t.query(api.verseImages.countRequestsByEngine, { serverSecret: SECRET });
    expect(requests).toEqual({
      legacy: { queued: 1, planning: 0, generating: 3, succeeded: 1, failed: 0 }, // the historical request reads as legacy; the bulk item's request is in flight
      generic: { queued: 0, planning: 0, generating: 1, succeeded: 0, failed: 1 },
    });
    const bulk = await t.query(api.bulkGenerations.countItems, { serverSecret: SECRET });
    expect(bulk.byEngine.legacy).toEqual({ jobs: 1, unstarted: 1, accepted: 1, succeeded: 0, failed: 0 });
    const inventory = classifyForRetirement(requests, bulk);
    expect(inventory.acceptedObligations.legacy).toEqual({ requestsInFlight: 3, requestsQueued: 1, bulkItemsAccepted: 1, total: 5 });
    expect(inventory.uncertain).toEqual({ legacy: 3, generic: 1, unbound: 0 });
    expect(inventory.cancellationCandidates).toEqual([{ engine: "legacy", unstartedBulkItems: 1, jobs: 1 }]);
    expect(inventory.readyToRetire).toEqual({ legacy: false, reasons: ["legacy still has 5 accepted obligation(s) to finish or reconcile"] });
    await expect(t.query(api.verseImages.countRequestsByEngine, { serverSecret: "wrong" })).rejects.toThrow();
    // Nothing was changed by counting.
    expect((await t.run((ctx) => ctx.db.query("imageGenerationRequests").collect())).map((r) => r.status).sort()).toEqual(["failed", "generating", "generating", "generating", "generating", "queued", "succeeded"]);
  });

  it("reads an empty deployment as ready to retire legacy once nothing is unbound", () => {
    expect(classifyForRetirement({}, { byEngine: {}, pausedForEngine: 0 }).readyToRetire).toEqual({ legacy: true, reasons: [] });
    expect(classifyForRetirement({ generic: { queued: 2, planning: 0, generating: 0, succeeded: 0, failed: 0 } }, { byEngine: { unbound: { jobs: 1, unstarted: 3, accepted: 0, succeeded: 0, failed: 0 } }, pausedForEngine: 0 }).readyToRetire.reasons)
      .toEqual(["1 bulk job(s) are not bound to an engine; run bindLegacyJobs"]);
  });
});

describe("readiness matrix", () => {
  it("requires registered inputs, a brief and a complete active analysis read against them, while optional references and attention never gate", async () => {
    const t = convexTest(schema, modules);
    const status = () => t.query(api.analysis.getWorkStatus, { workId: "bible-web" });
    expect(await status()).toMatchObject({ exists: false, ready: false });
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: "bible-web", workVersion: "wv" });
    expect((await status()).reasons).toEqual(["no approved brief registered", "no active analysis generation"]);
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: "bible-web", workVersion: "wv", briefVersion: "bv" });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: "bible-web", workVersion: "wv", briefVersion: "bv" });
    // A cast member without a canon stage is structurally incomplete: activation is refused and the work stays not ready.
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: "bible-web", generation, records: [
      { kind: "entry", recordId: "adam", payload: { kind: "entry", name: "Adam", entryKind: "character", stages: [] } },
      { kind: "section", recordId: "genesis-1-1", payload: { kind: "section", title: "Creation", firstUnit: "genesis-1-1", lastUnit: "genesis-1-1", era: "creation", cast: [{ entryId: "adam", stageId: "main" }] } },
      { kind: "moment", recordId: "genesis-1-1", payload: { kind: "moment", sectionId: "genesis-1-1", firstUnit: "genesis-1-1", lastUnit: "genesis-1-1" } },
    ] });
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: "bible-web", generation })).rejects.toThrow();
    expect((await status()).ready).toBe(false);
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: "bible-web", generation, records: [
      { kind: "entry", recordId: "adam", payload: { kind: "entry", name: "Adam", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Adam: young." }] } },
    ] });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: "bible-web", generation });
    expect((await status()).ready).toBe(true);
    // A failed sheet and an open report are ordinary attention, not gates.
    await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: "bible-web", reason: "sheet_failed", kind: "sheet", recordId: "adam:main" });
    expect((await status()).ready).toBe(true);
    // Deploying a changed brief without a reread makes the work not ready again; rollback keeps the old analysis serving to replays.
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: "bible-web", workVersion: "wv", briefVersion: "bv2" });
    expect((await status()).reasons).toEqual(["active generation was read against brief bv, deployed is bv2"]);
    expect(await t.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: "moment", recordId: "genesis-1-1" })).not.toBeNull();
  });
});
