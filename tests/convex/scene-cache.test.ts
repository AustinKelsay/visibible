import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";

let t = convexTest(schema, modules);
const identity = {
  verseId: "genesis-1-1", translationId: "web", styleProfileId: "classical",
  inputFingerprint: "canonical-input-a", plannerModel: "planner-a", promptVersion: "prompt-a",
  serverSecret: "test-server-secret",
};
const scenePlan = { primarySubject: "Created world", action: "emerging", setting: "cosmos" };
beforeEach(() => { t = convexTest(schema, modules); process.env.CONVEX_SERVER_SECRET = identity.serverSecret; });

describe("scene cache compatibility", () => {
  it("returns a matching plan without mutating hit accounting", async () => {
    await t.mutation(api.verseImages.upsertScenePlanCache, { ...identity, scenePlan });
    const before = await t.run((ctx) => ctx.db.query("scenePlanCache").collect());
    expect(await t.query(api.verseImages.getScenePlanCache, identity)).toMatchObject({ scenePlan });
    expect(await t.run((ctx) => ctx.db.query("scenePlanCache").collect())).toEqual(before);
    expect(await t.mutation(api.verseImages.markScenePlanCacheHit, identity)).toEqual({ success: true });
    expect((await t.query(api.verseImages.getScenePlanCache, identity))?.hitCount).toBe(before[0].hitCount + 1);
  });

  it.each(["verseId", "translationId", "styleProfileId", "inputFingerprint", "plannerModel", "promptVersion"])(
    "misses when %s changes", async (key) => {
      await t.mutation(api.verseImages.upsertScenePlanCache, { ...identity, scenePlan });
      const changed = { ...identity, [key]: "different" };
      expect(await t.query(api.verseImages.getScenePlanCache, changed)).toBeNull();
      expect(await t.mutation(api.verseImages.markScenePlanCacheHit, changed)).toEqual({ success: false });
    }
  );

  it("misses a legacy entry lacking an input fingerprint", async () => {
    const legacy = { ...identity, inputFingerprint: undefined };
    await t.mutation(api.verseImages.upsertScenePlanCache, { ...legacy, scenePlan });
    expect(await t.query(api.verseImages.getScenePlanCache, identity)).toBeNull();
  });

  it("ignores a delayed hit after another input replaces the cached plan", async () => {
    await t.mutation(api.verseImages.upsertScenePlanCache, { ...identity, scenePlan });
    const replacement = { ...identity, inputFingerprint: "canonical-input-b" };
    await t.mutation(api.verseImages.upsertScenePlanCache, { ...replacement, scenePlan });
    const before = await t.query(api.verseImages.getScenePlanCache, replacement);
    expect(await t.mutation(api.verseImages.markScenePlanCacheHit, identity)).toEqual({ success: false });
    expect(await t.query(api.verseImages.getScenePlanCache, replacement)).toEqual(before);
  });
});
