/**
 * The one-off cleanup after the lean switch (ADR 0012) deletes stored looks, plans, preparation
 * claims and ledger rows, keeps every other analysis record, and drops look and plan tallies.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const WORK = "bible-web";

afterEach(() => {
  vi.useRealTimers();
});

describe("retirePreparation.run", () => {
  it("deletes looks, plans, claims and ledger rows in batches and keeps the reading pass", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("works", { workId: WORK, workVersion: "w", briefVersion: "b", activeGeneration: 1, nextGeneration: 2, updatedAt: now });
      await ctx.db.insert("analysisGenerations", {
        workId: WORK, generation: 1, status: "active", workVersion: "w", briefVersion: "b", createdAt: now,
        recordCounts: { entry: 1, section: 1, moment: 1, look: 120, plan: 1 },
      });
      const base = { workId: WORK, generation: 1, version: "v", source: "generated" as const, inputs: [], status: "current" as const, createdAt: now };
      await ctx.db.insert("analysisRecords", { ...base, kind: "entry", recordId: "adam",
        payload: { kind: "entry", name: "Adam", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Adam: a man." }] } });
      await ctx.db.insert("analysisRecords", { ...base, kind: "section", recordId: "genesis-2-18",
        payload: { kind: "section", title: "Eden", firstUnit: "genesis-2-18", lastUnit: "genesis-2-25", era: "e", cast: [] } });
      await ctx.db.insert("analysisRecords", { ...base, kind: "moment", recordId: "genesis-2-22",
        payload: { kind: "moment", sectionId: "genesis-2-18", firstUnit: "genesis-2-22", lastUnit: "genesis-2-22" } });
      // More looks than one batch, so the cleanup must schedule itself again.
      for (let i = 0; i < 120; i++) {
        await ctx.db.insert("analysisRecords", { ...base, kind: "look", recordId: `section-${i}`,
          payload: { kind: "look", sectionId: `section-${i}`, place: "p", timeOfDay: "t", weather: "w", light: "l", clothing: "c" } });
      }
      await ctx.db.insert("analysisRecords", { ...base, kind: "plan", recordId: "genesis-2-22", status: "superseded",
        payload: { kind: "plan", momentId: "genesis-2-22", entries: [], plan: { primarySubject: "s", action: "a", setting: "e" } } });
      await ctx.db.insert("preparationLedger", { workId: WORK, kind: "plan", recordId: "genesis-2-22", model: "m", outcome: "ok", createdAt: now });
      await ctx.db.insert("preparationClaims", { workId: WORK, kind: "look", recordId: "section-1", holder: "h", expiresAt: now, createdAt: now });
    });

    const first = await t.mutation(internal.retirePreparation.run, {});
    expect(first).toMatchObject({ done: false, records: 100, ledger: 1, claims: 1 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await t.run(async (ctx) => {
      const kinds = (await ctx.db.query("analysisRecords").collect()).map((r) => r.kind).sort();
      expect(kinds).toEqual(["entry", "moment", "section"]);
      expect(await ctx.db.query("preparationLedger").collect()).toEqual([]);
      expect(await ctx.db.query("preparationClaims").collect()).toEqual([]);
      const [generation] = await ctx.db.query("analysisGenerations").collect();
      expect(generation.recordCounts).toEqual({ entry: 1, section: 1, moment: 1 });
    });
    expect(await t.mutation(internal.retirePreparation.run, {})).toEqual({ done: true, records: 0, ledger: 0, claims: 0, counts: 0 });
  });
});
