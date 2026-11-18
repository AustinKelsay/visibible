/**
 * Nostr retry after a partial publish (SECURITY-REVIEW F23). snstr's relay client is replaced by a
 * fake that never opens a socket; event building and signing stay real, so the event ids are real.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const published: { id: string; created_at: number; content: string }[] = [];
let failNext = 0;

vi.mock("snstr", async (importOriginal) => {
  const real = await importOriginal<typeof import("snstr")>();
  class FakeNostr {
    constructor(public relays: string[]) {}
    async connectToRelays() {}
    disconnectFromRelays() {}
    async publishEvent(event: { id: string; created_at: number; content: string }) {
      published.push(event);
      if (failNext > 0) {
        failNext -= 1;
        throw new Error("one relay took it, then the publish threw");
      }
    }
  }
  return { ...real, Nostr: FakeNostr };
});

const KEY = "1".repeat(63) + "2";

beforeEach(() => {
  published.length = 0;
  failNext = 0;
  vi.stubEnv("NOSTR_PUBLISHING_ENABLED", "true");
  vi.stubEnv("NOSTR_PRIVATE_KEY", KEY);
  vi.stubEnv("NOSTR_IMAGE_BASE_URL", "https://images.example");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function image(t: ReturnType<typeof convexTest>, verseId = "genesis-1-1") {
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["dummy-image"])));
  const imageId = (await t.mutation(internal.verseImages.saveImageWithStorage, {
    verseId, storageId, model: "dummy", reference: "Genesis 1:1", generationId: `g-${verseId}`, verseText: "In the beginning", translationId: "web",
  }))!;
  return { imageId, storageId, args: { imageId, storageId, verseId, reference: "Genesis 1:1", verseText: "In the beginning" } };
}

it("rebuilds the same event on retry after a failed publish, so relays dedupe it", async () => {
  const t = convexTest(schema, modules);
  const { args } = await image(t);
  const now = vi.spyOn(Date, "now");

  now.mockReturnValue(1_800_000_000_000);
  failNext = 1;
  expect(await t.action(internal.nostr.publishToNostr, args)).toMatchObject({ outcome: "publish_failed" });

  now.mockReturnValue(1_800_000_000_000 + 3 * 3_600_000); // the retry window comes hours later
  const retry = await t.action(internal.nostr.publishToNostr, args);
  expect(retry).toMatchObject({ outcome: "published" });

  expect(published).toHaveLength(2);
  expect(published[1].id).toBe(published[0].id);
  expect(published[1].created_at).toBe(1_800_000_000);
  expect(retry).toMatchObject({ eventId: published[0].id });
});

it("keeps distinct images distinct", async () => {
  const t = convexTest(schema, modules);
  const a = await image(t, "genesis-1-1");
  const b = await image(t, "genesis-1-2");
  await t.action(internal.nostr.publishToNostr, { ...b.args, verseText: "And the earth was without form" });
  await t.action(internal.nostr.publishToNostr, a.args);
  expect(new Set(published.map((e) => e.id)).size).toBe(2);
});
