import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export async function closePendingHolds(ctx: MutationCtx, entries: Doc<"creditLedger">[]) {
  for (const entry of entries) {
    if (entry.reason === "reservation" && entry.pendingReservation !== false) {
      await ctx.db.patch(entry._id, { pendingReservation: false });
    }
  }
}
