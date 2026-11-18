/**
 * Bulk item request ids (SECURITY-REVIEW F22): a random per-job nonce keeps them unguessable from the
 * bulk id, they stay stable per item across retries, differ across jobs, and rows made before the
 * nonce existed keep the old form and still reconcile.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";
import { bulkItemRequestId } from "../../convex/_helpers/bulkRequestId";

const SECRET = "server-only";
const issuer = "https://guest.example";
beforeEach(() => { vi.stubEnv("GUEST_AUTH_ISSUER", issuer); vi.stubEnv("CONVEX_SERVER_SECRET", SECRET); });
afterEach(() => vi.unstubAllEnvs());

const verses = [0, 1].map((order) => ({ verseId: `genesis-1-${order + 1}`, reference: `Genesis 1:${order + 1}`, order }));
const args = { sid: "owner", scopeType: "verses" as const, scopeLabel: "Genesis 1", startVerseId: "genesis-1-1", estimatedTotalCredits: 2, modelId: "lite", aspectRatio: "16:9", resolution: "1K", translation: "kjv", verses };

async function start() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => { await ctx.db.insert("sessions", { sid: "owner", tier: "paid", credits: 100, createdAt: Date.now(), lastSeenAt: Date.now() }); });
  const owner = t.withIdentity({ subject: "owner", issuer, guestExpiresAt: Date.now() / 1000 + 300 });
  return { t, owner };
}

describe("bulk item request ids", () => {
  it("are stable per item, distinct across items and jobs, and not derivable from the bulk id", async () => {
    const { t, owner } = await start();
    const first = await owner.mutation(api.bulkGenerations.create, args);
    expect(first.requestNonce).toMatch(/^[0-9a-f]{32}$/);
    const stored = await t.run((ctx) => ctx.db.get(first.bulkId));
    expect(stored?.requestNonce).toBe(first.requestNonce);
    // Stable: reading the job again (a resume or retry) yields the same id for the same item.
    const again = await owner.query(api.bulkGenerations.get, { id: first.bulkId, sid: "owner" });
    expect(bulkItemRequestId(first.bulkId, 0, again?.requestNonce)).toBe(bulkItemRequestId(first.bulkId, 0, first.requestNonce));
    expect(bulkItemRequestId(first.bulkId, 0, first.requestNonce)).not.toBe(bulkItemRequestId(first.bulkId, 1, first.requestNonce));
    expect(bulkItemRequestId(first.bulkId, 0, first.requestNonce)).not.toBe(`bulk-${first.bulkId}-0`);
    // Real Convex ids are 32 characters; the route accepts request ids of 8 to 80.
    expect(bulkItemRequestId("k".repeat(32), 99999, first.requestNonce)).toMatch(/^[a-zA-Z0-9_-]{8,80}$/);

    await owner.mutation(api.bulkGenerations.cancel, { sid: "owner", id: first.bulkId });
    const second = await owner.mutation(api.bulkGenerations.create, args);
    expect(second.requestNonce).not.toBe(first.requestNonce);
  });

  it("keeps the old form for a job without a nonce and still reconciles its items", async () => {
    expect(bulkItemRequestId("abc", 3)).toBe("bulk-abc-3");
    const { t, owner } = await start();
    const { bulkId } = await owner.mutation(api.bulkGenerations.create, args);
    await t.run((ctx) => ctx.db.patch(bulkId, { requestNonce: undefined }));
    await owner.mutation(api.bulkGenerations.updateVerseStatus, { sid: "owner", bulkGenerationId: bulkId, verseId: "genesis-1-1", status: "generating", expectedCurrentStatus: "queued" });
    const requestId = `bulk-${bulkId}-0`;
    await t.mutation(api.verseImages.createGenerationRequest, { requestId, sid: "owner", verseId: "genesis-1-1", inputFingerprint: "fp", generationId: "g-0", executorVersion: "next-image-v1", billingPolicyVersion: "legacy-image-v1", serverSecret: SECRET, engine: "legacy" });
    await t.mutation(api.verseImages.updateGenerationRequest, { requestId, status: "generating", serverSecret: SECRET });
    await t.mutation(api.verseImages.updateGenerationRequest, { requestId, status: "failed", serverSecret: SECRET, error: "Model returned no image output" });
    expect(await owner.mutation(api.bulkGenerations.reconcileInterrupted, { sid: "owner", id: bulkId })).toEqual({ completed: 0, failed: 1, requeued: 0 });
  });
});
