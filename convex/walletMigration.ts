import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { summarizeGenerationSettlement } from "./sessions";

/** Run explicitly before rolling out pending-hold UI. Never changes monetary fields. */
export const backfillPendingHolds = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("creditLedger")
      .withIndex("by_reason_createdAt", (q) => q.eq("reason", "reservation"))
      .paginate({ cursor: args.cursor ?? null, numItems: 50 });
    let updated = 0;
    let unlinkedReservations = 0;
    for (const row of page.page) {
      if (!row.generationId) { unlinkedReservations++; continue; }
      if (row.pendingReservation !== undefined) continue;
      const entries = await ctx.db.query("creditLedger")
        .withIndex("by_generationId", (q) => q.eq("generationId", row.generationId).eq("sid", row.sid)).collect();
      await ctx.db.patch(row._id, {
        pendingReservation: summarizeGenerationSettlement(entries).state === "reserved",
      });
      updated++;
    }
    return { updated, unlinkedReservations, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});
