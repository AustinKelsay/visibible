/**
 * Bulk engine and style binding (#178): jobs record their style and bind to the engine of their
 * first accepted item; interrupted items are settled from authoritative request state without a
 * second paid attempt; legacy jobs are backfilled idempotently; release counts never call an
 * accepted attempt unstarted.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";

const SECRET = "server-only";
const issuer = "https://guest.example";
beforeEach(() => { vi.stubEnv("GUEST_AUTH_ISSUER", issuer); vi.stubEnv("CONVEX_SERVER_SECRET", SECRET); });
afterEach(() => vi.unstubAllEnvs());

async function setup(artStyleId?: string) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => { await ctx.db.insert("sessions", { sid: "owner", tier: "paid", credits: 100, createdAt: Date.now(), lastSeenAt: Date.now() }); });
  const owner = t.withIdentity({ subject: "owner", issuer, guestExpiresAt: Date.now() / 1000 + 300 });
  const verses = [0, 1, 2, 3].map((order) => ({ verseId: `genesis-1-${order + 1}`, reference: `Genesis 1:${order + 1}`, order }));
  const { bulkId } = await owner.mutation(api.bulkGenerations.create, { sid: "owner", scopeType: "verses", scopeLabel: "Genesis 1", startVerseId: "genesis-1-1", estimatedTotalCredits: 8, modelId: "lite", aspectRatio: "16:9", resolution: "1K", translation: "kjv", verses, ...(artStyleId ? { artStyleId } : {}) });
  const requestFor = async (order: number, status: "generating" | "succeeded" | "failed", engine: "legacy" | "generic" = "legacy", actualCreditsCost?: number) => {
    const requestId = `bulk-${bulkId}-${order}`;
    await t.mutation(api.verseImages.createGenerationRequest, { requestId, sid: "owner", verseId: `genesis-1-${order + 1}`, inputFingerprint: "fp", generationId: `g-${order}`, executorVersion: "next-image-v1", billingPolicyVersion: "legacy-image-v1", serverSecret: SECRET, engine, ...(engine === "generic" ? { engineCommitments: { workId: "bible-web", momentId: "m", briefVersion: "b", analysisGeneration: 1, promptVersion: "p", billingVersion: "v" } } : {}) });
    if (status !== "generating") {
      await t.mutation(api.verseImages.updateGenerationRequest, { requestId, status: "generating", serverSecret: SECRET });
      await t.mutation(api.verseImages.updateGenerationRequest, { requestId, status, serverSecret: SECRET, ...(actualCreditsCost !== undefined ? { actualCreditsCost } : {}), ...(status === "failed" ? { error: "Model returned no image output" } : {}) });
    } else {
      await t.mutation(api.verseImages.updateGenerationRequest, { requestId, status: "generating", serverSecret: SECRET });
    }
  };
  const claim = (verseId: string) => owner.mutation(api.bulkGenerations.updateVerseStatus, { sid: "owner", bulkGenerationId: bulkId, verseId, status: "generating", expectedCurrentStatus: "queued" });
  const job = () => t.run((ctx) => ctx.db.get(bulkId));
  const items = () => t.run(async (ctx) => (await ctx.db.query("bulkGenerationVerses").withIndex("by_bulk_order", (q) => q.eq("bulkGenerationId", bulkId)).collect()).map((i) => [i.order, i.status, i.creditsCost ?? null]));
  return { t, owner, bulkId, requestFor, claim, job, items };
}

describe("bulk engine and style binding", () => {
  it("records the chosen style, binds the engine once, and refuses a different engine on resume", async () => {
    const { owner, bulkId, job } = await setup();
    expect(await job()).toMatchObject({ artStyleId: "classical" });
    expect((await job())!.engine).toBeUndefined();
    expect(await owner.mutation(api.bulkGenerations.bindEngine, { sid: "owner", id: bulkId, engine: "generic" })).toEqual({ bound: true, changed: true });
    expect(await owner.mutation(api.bulkGenerations.bindEngine, { sid: "owner", id: bulkId, engine: "generic" })).toEqual({ bound: true, changed: false });
    await expect(owner.mutation(api.bulkGenerations.bindEngine, { sid: "owner", id: bulkId, engine: "legacy" })).rejects.toThrow(/bound to the generic engine/);
    expect(await job()).toMatchObject({ engine: "generic", artStyleId: "classical" });
  });

  it("records a chosen style and refuses an invalid one", async () => {
    const styled = await setup("watercolor");
    expect(await styled.job()).toMatchObject({ artStyleId: "watercolor" });
    await expect(setup("Water Colour")).rejects.toThrow(/Invalid art style/);
  });

  it("keeps a paused reason until resume", async () => {
    const { owner, bulkId, job } = await setup();
    await owner.mutation(api.bulkGenerations.pause, { sid: "owner", id: bulkId, reason: "engine_unavailable" });
    expect(await job()).toMatchObject({ status: "paused", pausedReason: "engine_unavailable" });
    await owner.mutation(api.bulkGenerations.resume, { sid: "owner", id: bulkId });
    const resumed = await job();
    expect(resumed!.status).toBe("active");
    expect(resumed!.pausedReason).toBeUndefined();
  });

  it("settles interrupted items from request state: saved outcomes kept, accepted work replayed, nothing repeated", async () => {
    const { owner, bulkId, requestFor, claim, job, items } = await setup();
    for (const verse of ["genesis-1-1", "genesis-1-2", "genesis-1-3", "genesis-1-4"]) await claim(verse);
    await requestFor(0, "succeeded", "legacy", 3); // finished while the browser was gone
    await requestFor(1, "failed");                  // failed while the browser was gone
    await requestFor(2, "generating");              // accepted, still running: an uncertain paid attempt
    // order 3: claimed in the job but never admitted
    expect(await owner.mutation(api.bulkGenerations.reconcileInterrupted, { sid: "owner", id: bulkId })).toEqual({ completed: 1, failed: 1, requeued: 2 });
    expect(await items()).toEqual([[0, "completed", 3], [1, "failed", null], [2, "queued", null], [3, "queued", null]]);
    // The succeeded request also binds the job, since the browser never got to.
    expect(await job()).toMatchObject({ completedCount: 1, failedCount: 1, totalCreditsUsed: 3, status: "active", engine: "legacy" });
    // Running it again changes nothing.
    expect(await owner.mutation(api.bulkGenerations.reconcileInterrupted, { sid: "owner", id: bulkId })).toEqual({ completed: 0, failed: 0, requeued: 0 });
    // The release counts tell the accepted attempt (order 2) apart from the unstarted one (order 3).
    const counts = await owner.query(api.bulkGenerations.countItems, { serverSecret: SECRET });
    expect(counts.byEngine.legacy).toEqual({ jobs: 1, unstarted: 1, accepted: 1, succeeded: 0, failed: 0 });
  });

  it("backfills jobs without an engine to legacy and Classical, idempotently, and counts paused generic jobs", async () => {
    const { t, owner, bulkId, job } = await setup();
    expect(await t.mutation(api.bulkGenerations.bindLegacyJobs, { serverSecret: SECRET })).toEqual({ jobs: 1, bound: 1 });
    expect(await job()).toMatchObject({ engine: "legacy", artStyleId: "classical" });
    expect(await t.mutation(api.bulkGenerations.bindLegacyJobs, { serverSecret: SECRET })).toEqual({ jobs: 1, bound: 0 });
    await expect(t.mutation(api.bulkGenerations.bindLegacyJobs, { serverSecret: "wrong" })).rejects.toThrow();
    // A second session's generic job paused for rollback shows up in the counts.
    await t.run(async (ctx) => { await ctx.db.insert("sessions", { sid: "second", tier: "paid", credits: 100, createdAt: Date.now(), lastSeenAt: Date.now() }); });
    const second = t.withIdentity({ subject: "second", issuer, guestExpiresAt: Date.now() / 1000 + 300 });
    const { bulkId: genericId } = await second.mutation(api.bulkGenerations.create, { sid: "second", scopeType: "verses", scopeLabel: "John 3", startVerseId: "john-3-16", estimatedTotalCredits: 2, modelId: "lite", aspectRatio: "16:9", resolution: "1K", translation: "web", artStyleId: "icon", verses: [{ verseId: "john-3-16", reference: "John 3:16", order: 0 }] });
    await second.mutation(api.bulkGenerations.bindEngine, { sid: "second", id: genericId, engine: "generic" });
    await second.mutation(api.bulkGenerations.pause, { sid: "second", id: genericId, reason: "engine_unavailable" });
    const counts = await owner.query(api.bulkGenerations.countItems, { serverSecret: SECRET });
    expect(counts).toMatchObject({ pausedForEngine: 1, byEngine: { legacy: { jobs: 1, unstarted: 4 }, generic: { jobs: 1, unstarted: 1 } } });
    expect(await job()).toMatchObject({ engine: "legacy" });
    expect(await t.run((ctx) => ctx.db.get(bulkId))).toMatchObject({ artStyleId: "classical" });
  });
});
