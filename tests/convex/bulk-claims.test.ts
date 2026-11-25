/**
 * Verse claims (#552): each claim of a bulk verse gets a new number, and a write that carries an older number is
 * refused, so a requeue still in transit from a tab that lost the run cannot undo the claim of the tab that took over.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";

const issuer = "https://guest.example";
beforeEach(() => { vi.stubEnv("GUEST_AUTH_ISSUER", issuer); vi.stubEnv("CONVEX_SERVER_SECRET", "server-only"); });
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => { await ctx.db.insert("sessions", { sid: "owner", tier: "paid", credits: 100, createdAt: Date.now(), lastSeenAt: Date.now() }); });
  const owner = t.withIdentity({ subject: "owner", issuer, guestExpiresAt: Date.now() / 1000 + 300 });
  const verses = [0, 1].map((order) => ({ verseId: `genesis-1-${order + 1}`, reference: `Genesis 1:${order + 1}`, order }));
  const { bulkId } = await owner.mutation(api.bulkGenerations.create, { sid: "owner", scopeType: "verses", scopeLabel: "Genesis 1", startVerseId: "genesis-1-1", estimatedTotalCredits: 4, modelId: "lite", aspectRatio: "16:9", resolution: "1K", translation: "kjv", verses });
  const write = (status: "generating" | "queued" | "completed", expectedCurrentStatus: "queued" | "generating", claim?: number) =>
    owner.mutation(api.bulkGenerations.updateVerseStatus, { sid: "owner", bulkGenerationId: bulkId, verseId: "genesis-1-1", status, expectedCurrentStatus, ...(claim !== undefined ? { claim } : {}) });
  const verse = () => t.run(async (ctx) => (await ctx.db.query("bulkGenerationVerses").withIndex("by_bulk_order", (q) => q.eq("bulkGenerationId", bulkId)).first())!);
  return { owner, bulkId, write, verse };
}

describe("bulk verse claims", () => {
  it("numbers each claim and accepts writes that carry the current number", async () => {
    const { write } = await setup();
    expect(await write("generating", "queued")).toEqual({ updated: true, claim: 1 });
    expect(await write("queued", "generating", 1)).toEqual({ updated: true });
    expect(await write("generating", "queued")).toEqual({ updated: true, claim: 2 });
    expect(await write("completed", "generating", 2)).toEqual({ updated: true });
  });

  it("refuses a requeue from a claim that another tab has since replaced", async () => {
    const { owner, bulkId, write, verse } = await setup();
    // The first tab claims the verse, then is suspended with its requeue still unsent.
    expect(await write("generating", "queued")).toEqual({ updated: true, claim: 1 });
    // The replacement tab takes the lapsed run: it reconciles the interrupted verse and claims it again.
    await owner.mutation(api.bulkGenerations.reconcileInterrupted, { sid: "owner", id: bulkId });
    expect((await verse()).status).toBe("queued");
    expect(await write("generating", "queued")).toEqual({ updated: true, claim: 2 });
    // The first tab's requeue finally lands. Its claim is gone, so it changes nothing.
    expect(await write("queued", "generating", 1)).toEqual({ updated: false });
    expect(await write("completed", "generating", 2)).toEqual({ updated: true });
    expect((await verse()).status).toBe("completed");
  });

  it("still accepts a write that carries no claim number, as a page loaded before claims did", async () => {
    const { write } = await setup();
    await write("generating", "queued");
    expect(await write("queued", "generating")).toEqual({ updated: true });
  });
});
