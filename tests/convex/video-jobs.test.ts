import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";
import type { Id } from "../../convex/_generated/dataModel";

const provider = vi.hoisted(() => ({ submitVideo: vi.fn(), pollVideo: vi.fn(), downloadVideo: vi.fn() }));
vi.mock("../../src/lib/video-provider", () => provider);

const input = {
  serverSecret: "server-only", sid: "viewer", requestId: "request-1", verseId: "genesis-1-1",
  reference: "Genesis 1:1", translation: "KJV", prompt: "A dawn over the waters",
  duration: 5 as const, resolution: "480p" as const, estimatedCostUsd: 0.8,
  estimatedCredits: 100, inputFingerprint: "intent-1",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.stubEnv("CONVEX_SERVER_SECRET", "server-only");
  vi.stubEnv("GUEST_AUTH_ISSUER", "https://guest.example");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup(admin = false) {
  const t = convexTest(schema, modules);
  const sessionId = await t.run(ctx => ctx.db.insert("sessions", { sid: "viewer", tier: admin ? "admin" : "paid", credits: admin ? 0 : 500, createdAt: Date.now(), lastSeenAt: Date.now() }));
  return { t, sessionId };
}

describe("durable video intent and settlement", () => {
  it("enforces the configured video request rate limit", async () => {
    const { t } = await setup();
    const args = { serverSecret: input.serverSecret, identifier: "video-viewer", endpoint: "generate-video" };
    for (let count = 0; count < 3; count += 1) {
      expect((await t.mutation(api.rateLimit.checkRateLimit, args)).allowed).toBe(true);
    }
    expect((await t.mutation(api.rateLimit.checkRateLimit, args)).allowed).toBe(false);
  });
  it("atomically reserves once, rejects changed intent and enforces one active job across verses", async () => {
    const { t, sessionId } = await setup();
    const first = await t.mutation(api.verseVideos.enqueue, input);
    expect(await t.mutation(api.verseVideos.enqueue, input)).toEqual(first);
    await expect(t.mutation(api.verseVideos.enqueue, { ...input, inputFingerprint: "different" })).rejects.toThrow("different video settings");
    await expect(t.query(api.verseVideos.findRequest, { serverSecret: input.serverSecret, sid: input.sid, requestId: input.requestId, inputFingerprint: "different" })).rejects.toThrow("different video settings");
    await expect(t.mutation(api.verseVideos.enqueue, { ...input, requestId: "request-2", verseId: "genesis-1-2" })).rejects.toThrow("already generating");
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(400);
    expect(await t.run(ctx => ctx.db.query("creditLedger").collect())).toHaveLength(1);
  });

  it("rolls back admission when the balance or daily spending cap cannot cover the locked quote", async () => {
    const { t, sessionId } = await setup();
    await t.run(ctx => ctx.db.patch(sessionId, { credits: 99 }));
    await expect(t.mutation(api.verseVideos.enqueue, input)).rejects.toThrow("Insufficient credits");
    await t.run(ctx => ctx.db.patch(sessionId, { credits: 500, dailySpendLimitUsd: 0.5 }));
    await expect(t.mutation(api.verseVideos.enqueue, input)).rejects.toThrow("Daily spending limit exceeded");
    expect(await t.run(ctx => ctx.db.query("videoJobs").collect())).toHaveLength(0);
    expect(await t.run(ctx => ctx.db.query("creditLedger").collect())).toHaveLength(0);
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(500);
  });

  it("refunds ambiguous committed submission without ever reclaiming it for another paid POST", async () => {
    const { t, sessionId } = await setup();
    const result = await t.mutation(api.verseVideos.enqueue, input);
    const id = result.id as Id<"videoJobs">;
    const claim = await t.mutation(internal.verseVideos.claim, { id });
    expect(claim?.status).toBe("submitting");
    expect(await t.mutation(internal.verseVideos.claim, { id })).toBeNull();
    vi.setSystemTime(Date.now() + 4 * 60_000);
    expect(await t.mutation(internal.verseVideos.claim, { id })).toBeNull();
    const job = await t.run(ctx => ctx.db.get(id));
    expect(job?.failureKind).toBe("ambiguous_submission");
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(500);
    await t.mutation(internal.verseVideos.retryOrFail, { id, lease: claim!.lease, terminal: true, failureKind: "late_failure" });
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(500);
    expect(await t.query(api.verseVideos.getHistory, { verseId: input.verseId })).toEqual([]);
  });

  it("publishes only stored completed assets, caps overruns and ignores late failures", async () => {
    const { t, sessionId } = await setup();
    const result = await t.mutation(api.verseVideos.enqueue, input);
    const id = result.id as Id<"videoJobs">;
    const claim = (await t.mutation(internal.verseVideos.claim, { id }))!;
    await t.mutation(internal.verseVideos.advance, { id, lease: claim.lease, providerId: "provider-secret-id", costUsd: 1.5, ready: true });
    expect(await t.query(api.verseVideos.getHistory, { verseId: input.verseId })).toEqual([]);
    const storageClaim = (await t.mutation(internal.verseVideos.claim, { id }))!;
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["video"], { type: "video/mp4" })));
    expect(await t.mutation(internal.verseVideos.finish, { id, lease: storageClaim.lease, storageId })).toBe(true);
    await t.mutation(internal.verseVideos.retryOrFail, { id, lease: storageClaim.lease, terminal: true, failureKind: "late_failure" });
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(400);
    const history = await t.query(api.verseVideos.getHistory, { verseId: input.verseId });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ status: "completed", actualCredits: 100 });
    expect(history[0].videoUrl).toBeTruthy();
    expect(history[0]).not.toHaveProperty("sid");
    expect(history[0]).not.toHaveProperty("providerId");
    expect(history[0]).not.toHaveProperty("prompt");
    expect((await t.run(ctx => ctx.db.get(id)))?.absorbedCostUsd).toBe(0.7);
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.dailySpendUsd).toBe(1.5);
  });

  it("refunds excess actual credits and keeps settlement idempotent", async () => {
    const { t, sessionId } = await setup();
    const result = await t.mutation(api.verseVideos.enqueue, input);
    const id = result.id as Id<"videoJobs">;
    const claim = (await t.mutation(internal.verseVideos.claim, { id }))!;
    await t.mutation(internal.verseVideos.advance, { id, lease: claim.lease, providerId: "video", costUsd: 0.4, ready: true });
    const stored = (await t.mutation(internal.verseVideos.claim, { id }))!;
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["video"])));
    await t.mutation(internal.verseVideos.finish, { id, lease: stored.lease, storageId });
    await t.mutation(internal.verseVideos.finish, { id, lease: stored.lease, storageId });
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(450);
  });

  it("retries storage with a new lease and rejects stale worker completion", async () => {
    const { t } = await setup();
    const result = await t.mutation(api.verseVideos.enqueue, input);
    const id = result.id as Id<"videoJobs">;
    const first = (await t.mutation(internal.verseVideos.claim, { id }))!;
    await t.mutation(internal.verseVideos.advance, { id, lease: first.lease, providerId: "video", ready: true });
    const storing = (await t.mutation(internal.verseVideos.claim, { id }))!;
    await t.mutation(internal.verseVideos.retryOrFail, { id, lease: storing.lease, terminal: false, failureKind: "storage_failure" });
    vi.setSystemTime(Date.now() + 6000);
    const retry = (await t.mutation(internal.verseVideos.claim, { id }))!;
    expect(retry.status).toBe("storing");
    expect(retry.lease).toBeGreaterThan(storing.lease);
    const orphan = await t.run(ctx => ctx.storage.store(new Blob(["stale"])));
    expect(await t.mutation(internal.verseVideos.finish, { id, lease: storing.lease, storageId: orphan })).toBe(false);
    expect((await t.run(ctx => ctx.db.get(id)))?.status).toBe("storing");
  });

  it("protects an old active video hold from generic reconciliation and recovers a missed schedule", async () => {
    const { t, sessionId } = await setup();
    const result = await t.mutation(api.verseVideos.enqueue, input);
    const id = result.id as Id<"videoJobs">;
    vi.setSystemTime(Date.now() + 31 * 60_000);
    await t.mutation(internal.sessions.reconcileStaleReservations, { maxAgeMs: 30 * 60_000, limit: 50 });
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(400);
    expect(await t.mutation(internal.verseVideos.recover, {})).toBe(1);
    expect((await t.run(ctx => ctx.db.get(id)))?.nextRunAt).toBe(Date.now());
  });

  it("never retries a paid submission after an ambiguous network exception", async () => {
    const { t, sessionId } = await setup();
    const result = await t.mutation(api.verseVideos.enqueue, input);
    const id = result.id as Id<"videoJobs">;
    provider.submitVideo.mockRejectedValue(new Error("connection lost after request sent"));
    await t.action(internal.videoWorker.process, { id });
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await t.action(internal.videoWorker.process, { id });
    expect(provider.submitVideo).toHaveBeenCalledTimes(1);
    expect((await t.run(ctx => ctx.db.get(id)))?.failureKind).toBe("ambiguous_submission");
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(500);
  });

  it("continues an accepted job across worker invocations after admission is disabled", async () => {
    const { t, sessionId } = await setup();
    const result = await t.mutation(api.verseVideos.enqueue, input);
    const id = result.id as Id<"videoJobs">;
    provider.submitVideo.mockResolvedValue({ id: "provider-video", status: "processing" });
    await t.action(internal.videoWorker.process, { id });
    vi.stubEnv("ENABLE_VIDEO_GENERATION", "false");
    vi.setSystemTime(Date.now() + 10_001);
    provider.pollVideo.mockRejectedValueOnce(new Error("temporary GET failure"));
    await t.action(internal.videoWorker.process, { id });
    expect((await t.run(ctx => ctx.db.get(id)))?.status).toBe("processing");
    vi.setSystemTime(Date.now() + 5001);
    provider.pollVideo.mockResolvedValue({ id: "provider-video", status: "completed", costUsd: 0.4 });
    await t.action(internal.videoWorker.process, { id });
    provider.downloadVideo.mockResolvedValue(new Blob(["video bytes"], { type: "video/mp4" }));
    await t.action(internal.videoWorker.process, { id });
    expect(provider.submitVideo).toHaveBeenCalledTimes(1);
    expect(provider.downloadVideo).toHaveBeenCalledWith("provider-video");
    expect((await t.run(ctx => ctx.db.get(id)))?.status).toBe("completed");
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(450);
  });

  it("times out an old processing job and keeps its terminal request id immutable", async () => {
    const { t, sessionId } = await setup();
    const result = await t.mutation(api.verseVideos.enqueue, input);
    const id = result.id as Id<"videoJobs">;
    const claim = (await t.mutation(internal.verseVideos.claim, { id }))!;
    await t.mutation(internal.verseVideos.advance, { id, lease: claim.lease, providerId: "provider", ready: false });
    vi.setSystemTime(Date.now() + 46 * 60_000);
    expect(await t.mutation(internal.verseVideos.claim, { id })).toBeNull();
    expect((await t.run(ctx => ctx.db.get(id)))?.failureKind).toBe("timeout");
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(500);
    expect((await t.mutation(api.verseVideos.enqueue, input)).status).toBe("failed");
  });

  it("uses verified guest identity and audits zero-balance admin admission", async () => {
    const { t, sessionId } = await setup(true);
    await t.mutation(api.verseVideos.enqueue, input);
    expect((await t.run(ctx => ctx.db.get(sessionId)))?.credits).toBe(0);
    expect(await t.run(ctx => ctx.db.query("adminAuditLog").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("creditLedger").collect())).toHaveLength(0);
    expect(await t.query(api.verseVideos.getMyJobs, { verseId: input.verseId })).toEqual([]);
    const guest = t.withIdentity({ subject: "viewer", issuer: "https://guest.example", guestExpiresAt: Date.now() / 1000 + 300 });
    expect(await guest.query(api.verseVideos.getMyJobs, { verseId: input.verseId })).toHaveLength(1);
  });
});
