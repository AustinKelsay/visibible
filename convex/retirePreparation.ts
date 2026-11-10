/**
 * One-off cleanup after the switch to the lean engine (ADR 0012). Deletes what the full engine's
 * lazy preparation stored: section looks and scene plans in `analysisRecords`, preparation claims
 * and the preparation spend ledger, and drops the look and plan tallies from generation counts.
 * The schema can only stop accepting these rows once none are left.
 *
 * Run once per deployment with `npx convex run retirePreparation:run`; it deletes in batches and
 * schedules itself until nothing is left. Production's rows are archived in
 * llm/releases/2026-11-10-remove-preparation/. Delete this file with the schema change that follows.
 */
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const BATCH = 100;

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    let records = 0;
    for (const work of await ctx.db.query("works").collect()) {
      for (const kind of ["look", "plan"] as const) {
        if (records >= BATCH) break;
        const rows = await ctx.db.query("analysisRecords")
          .withIndex("by_work_kind_recordId", (q) => q.eq("workId", work.workId).eq("kind", kind))
          .take(BATCH - records);
        for (const row of rows) await ctx.db.delete(row._id);
        records += rows.length;
      }
    }
    const ledger = await ctx.db.query("preparationLedger").take(BATCH);
    for (const row of ledger) await ctx.db.delete(row._id);
    const claims = await ctx.db.query("preparationClaims").take(BATCH);
    for (const row of claims) await ctx.db.delete(row._id);

    if (records + ledger.length + claims.length > 0) {
      await ctx.scheduler.runAfter(0, internal.retirePreparation.run, {});
      return { done: false, records, ledger: ledger.length, claims: claims.length, counts: 0 };
    }
    let counts = 0;
    for (const generation of await ctx.db.query("analysisGenerations").collect()) {
      if (!generation.recordCounts || !("look" in generation.recordCounts || "plan" in generation.recordCounts)) continue;
      const { look, plan, ...rest } = generation.recordCounts;
      void look;
      void plan;
      await ctx.db.patch(generation._id, { recordCounts: rest });
      counts++;
    }
    return { done: true, records: 0, ledger: 0, claims: 0, counts };
  },
});
