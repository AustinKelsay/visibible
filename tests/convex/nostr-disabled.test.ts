import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { modules } from "./modules";

afterEach(() => vi.unstubAllEnvs());

it.each([undefined, "false", "TRUE", "1"])("does not publish or claim work when enabled=%s, even with a configured key", async (enabled) => {
  vi.stubEnv("NOSTR_PUBLISHING_ENABLED", enabled);
  vi.stubEnv("NOSTR_PRIVATE_KEY", "dummy-key-must-not-be-used");
  const t = convexTest(schema, modules);
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["dummy-image"])));
  const imageId = await t.mutation(internal.verseImages.saveImageWithStorage, {
    verseId: "genesis-1-1", storageId, model: "dummy", reference: "Genesis 1:1", generationId: "dummy",
    verseText: "dummy text", translationId: "web",
  });
  const before = await t.run(async (ctx) => ({ image: await ctx.db.get(imageId), state: await ctx.db.query("nostrPublishingState").collect() }));
  expect(await t.action(internal.nostr.publishToNostr, {
    imageId, storageId, verseId: "genesis-1-1", reference: "Genesis 1:1", verseText: "dummy text",
  })).toEqual({ outcome: "config_missing", reason: "publishing_disabled" });
  expect(await t.action(internal.nostrScheduler.publishTopImageForLatestWindow, {})).toMatchObject({ status: "disabled" });
  const after = await t.run(async (ctx) => ({ image: await ctx.db.get(imageId), state: await ctx.db.query("nostrPublishingState").collect() }));
  expect(after).toEqual(before);
});
