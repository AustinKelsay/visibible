import { convexTest } from "convex-test";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";
const intent = {
  requestId: "stable-intent", sid: "owner", verseId: "genesis-1-1",
  inputFingerprint: "fingerprint", generationId: "billing-one",
  executorVersion: "next-image-v1" as const, billingPolicyVersion: "legacy-image-v1" as const,
  serverSecret: "test-secret",
};
beforeEach(() => vi.stubEnv("CONVEX_SERVER_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());
describe("generation intent invariants", () => {
  it("atomically claims one billing identity and pins the executor and policy", async () => {
    const t = convexTest(schema, modules);
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => t.mutation(api.verseImages.createGenerationRequest, {
      ...intent, generationId: `billing-${i}`,
    })));
    expect(results.filter((result) => !result.alreadyExists)).toHaveLength(1);
    expect(new Set(results.map((result) => result.generationId)).size).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("imageGenerationRequests").collect())).toEqual([
      expect.objectContaining({ executorVersion: "next-image-v1", billingPolicyVersion: "legacy-image-v1" }),
    ]);
  });
  it("does not expose or reuse another owner's intent", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.verseImages.createGenerationRequest, intent);
    const result = await t.mutation(api.verseImages.createGenerationRequest, { ...intent, sid: "other-owner" });
    expect(result.conflict).toBe(true);
    expect(result.generationId).toBeUndefined();
    expect(result.savedImage).toBeUndefined();
  });
  it("rejects backwards progress and preserves a terminal result byte-for-byte", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.verseImages.createGenerationRequest, intent);
    const update = (status: "planning" | "generating" | "succeeded" | "failed", extra = {}) =>
      t.mutation(api.verseImages.updateGenerationRequest, { requestId: intent.requestId, serverSecret: intent.serverSecret, status, ...extra });
    await update("generating");
    expect((await update("planning")).success).toBe(false);
    expect((await update("generating", { generationId: "replacement" })).success).toBe(false);
    await update("succeeded", { durationMs: 100 });
    const before = await t.run((ctx) => ctx.db.query("imageGenerationRequests").first());
    expect((await update("failed", { error: "Late transport failure" })).success).toBe(false);
    expect((await update("generating")).success).toBe(false);
    expect((await update("succeeded", { durationMs: 900 })).success).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("imageGenerationRequests").first())).toEqual(before);
  });

  it("binds the engine at admission and replays it unchanged when defaults or switches move", async () => {
    const t = convexTest(schema, modules);
    const commitments = { workId: "bible-web", momentId: "genesis-1-1", briefVersion: "bv", analysisGeneration: 2, promptVersion: "2026-10-20-generic-v1", billingVersion: "google-output-tokens-2026-09-08" };
    const first = await t.mutation(api.verseImages.createGenerationRequest, { ...intent, engine: "generic", artStyleId: "icon", engineCommitments: commitments });
    expect(first).toMatchObject({ alreadyExists: false, engine: "generic", artStyleId: "icon", engineCommitments: commitments });
    // The same request later, with the server now defaulting to legacy: the accepted engine wins and nothing is repriced.
    const replay = await t.mutation(api.verseImages.createGenerationRequest, { ...intent, engine: "legacy", artStyleId: "classical", estimatedCreditsCost: 99 });
    expect(replay).toMatchObject({ alreadyExists: true, engine: "generic", artStyleId: "icon", engineCommitments: commitments, generationId: "billing-one" });
    expect(await t.query(api.verseImages.getGenerationIntent, { requestId: intent.requestId, sid: intent.sid, inputFingerprint: intent.inputFingerprint, serverSecret: intent.serverSecret })).toMatchObject({ engine: "generic" });
    const stored = await t.run((ctx) => ctx.db.query("imageGenerationRequests").collect());
    expect(stored[0]).toMatchObject({ engine: "generic" });
    expect(stored[0].estimatedCreditsCost).toBeUndefined();
    // Historical requests without an engine read as legacy; a legacy admission records it explicitly.
    const legacy = await t.mutation(api.verseImages.createGenerationRequest, { ...intent, requestId: "legacy-one", generationId: "billing-two" });
    expect(legacy.engine).toBe("legacy");
    await t.run(async (ctx) => { const doc = (await ctx.db.query("imageGenerationRequests").withIndex("by_requestId", (q) => q.eq("requestId", "legacy-one")).first())!; await ctx.db.patch(doc._id, { engine: undefined }); });
    expect((await t.mutation(api.verseImages.createGenerationRequest, { ...intent, requestId: "legacy-one", generationId: "billing-three", engine: "generic", engineCommitments: commitments })).engine).toBe("legacy");
  });

  it("refuses a generic admission without commitments and treats a different style as a payload conflict", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.verseImages.createGenerationRequest, { ...intent, engine: "generic", artStyleId: "icon" })).rejects.toThrow(/commitments/);
    await t.mutation(api.verseImages.createGenerationRequest, { ...intent, engine: "legacy", artStyleId: "classical" });
    // The style is part of the input fingerprint the route computes, so a changed style is a different fingerprint.
    const conflict = await t.mutation(api.verseImages.createGenerationRequest, { ...intent, inputFingerprint: "fingerprint-with-icon", engine: "legacy", artStyleId: "icon" });
    expect(conflict.conflict).toBe(true);
  });
});
