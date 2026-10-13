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
});
