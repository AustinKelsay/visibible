/**
 * Painting a chapter from Contents (#446): the wall reads, for the verses it shows, where each one stands in the
 * reader's bulk job, in one bounded read that only the job's own guest can make.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";

const issuer = "https://guest.example";
beforeEach(() => { vi.stubEnv("GUEST_AUTH_ISSUER", issuer); });
afterEach(() => vi.unstubAllEnvs());

const guest = (t: ReturnType<typeof convexTest>, sid: string) => t.withIdentity({ subject: sid, issuer, guestExpiresAt: Date.now() / 1000 + 300 });

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const sid of ["owner", "other"]) await ctx.db.insert("sessions", { sid, tier: "paid", credits: 100, createdAt: Date.now(), lastSeenAt: Date.now() });
  });
  const owner = guest(t, "owner");
  // The job paints verses 2, 4 and 6 of John 1.
  const verses = [2, 4, 6].map((verse, order) => ({ verseId: `john-1-${verse}`, reference: `John 1:${verse}`, order }));
  const { bulkId } = await owner.mutation(api.bulkGenerations.create, {
    sid: "owner", scopeType: "chapters", scopeLabel: "John 1", startVerseId: "john-1-2", estimatedTotalCredits: 6,
    modelId: "lite", aspectRatio: "16:9", resolution: "1K", translation: "web", verses,
  });
  const set = (verseId: string, status: "generating" | "completed" | "failed", expectedCurrentStatus?: "queued" | "generating") =>
    owner.mutation(api.bulkGenerations.updateVerseStatus, { sid: "owner", bulkGenerationId: bulkId, verseId, status, ...(expectedCurrentStatus ? { expectedCurrentStatus } : {}) });
  return { t, owner, bulkId, set };
}

const chapter = Array.from({ length: 8 }, (_, i) => `john-1-${i + 1}`);

describe("a bulk job's progress on the wall", () => {
  it("returns the job's status for each shown verse it holds, and nothing for the others", async () => {
    const { owner, bulkId, set } = await setup();
    await set("john-1-2", "generating", "queued");
    await set("john-1-2", "completed", "generating");
    await set("john-1-4", "generating", "queued");
    await set("john-1-4", "failed", "generating");
    await set("john-1-6", "generating", "queued");

    expect(await owner.query(api.bulkGenerations.getVerseStatuses, { sid: "owner", bulkGenerationId: bulkId, verseIds: chapter })).toEqual([
      { verseId: "john-1-2", status: "completed" },
      { verseId: "john-1-4", status: "failed" },
      { verseId: "john-1-6", status: "generating" },
    ]);
    expect(await owner.query(api.bulkGenerations.getVerseStatuses, { sid: "owner", bulkGenerationId: bulkId, verseIds: ["john-1-6", "john-1-7"] })).toEqual([
      { verseId: "john-1-6", status: "generating" },
    ]);
  });

  it("shows queued verses before any has started", async () => {
    const { owner, bulkId } = await setup();
    const statuses = await owner.query(api.bulkGenerations.getVerseStatuses, { sid: "owner", bulkGenerationId: bulkId, verseIds: chapter });
    expect(statuses.map((s) => s.status)).toEqual(["queued", "queued", "queued"]);
  });

  it("tells another guest, or nobody, nothing", async () => {
    const { t, bulkId } = await setup();
    expect(await guest(t, "other").query(api.bulkGenerations.getVerseStatuses, { sid: "other", bulkGenerationId: bulkId, verseIds: chapter })).toEqual([]);
    expect(await guest(t, "other").query(api.bulkGenerations.getVerseStatuses, { sid: "owner", bulkGenerationId: bulkId, verseIds: chapter })).toEqual([]);
    expect(await t.query(api.bulkGenerations.getVerseStatuses, { sid: "owner", bulkGenerationId: bulkId, verseIds: chapter })).toEqual([]);
  });

  it("is bounded to one chapter's worth of verses", async () => {
    const { owner, bulkId } = await setup();
    const tooMany = Array.from({ length: 201 }, (_, i) => `psalms-119-${i + 1}`);
    await expect(owner.query(api.bulkGenerations.getVerseStatuses, { sid: "owner", bulkGenerationId: bulkId, verseIds: tooMany })).rejects.toThrow(/at most 200/);
  });
});
