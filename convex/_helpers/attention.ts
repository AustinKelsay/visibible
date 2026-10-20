/**
 * Attention items (#179, #180): one open item per (work, reason, kind, record). Checker items
 * count repeats; reader image reports also keep every message with its time, and a report on a
 * closed item reopens it while keeping the previous closure in its history.
 */
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const READER_REPORT_REASON = "reader_report";
/** The only ways a reader report may be closed. "source corrected" must link a new input version and a check. */
export const READER_REPORT_DISPOSITIONS = Object.freeze(["source corrected", "isolated rendering error", "accepted limitation", "dismissed"]);
const MAX_KEPT_REPORTS = 50;
const MAX_HISTORY = 100;

export async function openAttention(
  ctx: MutationCtx,
  item: { workId: string; reason: string; kind?: string; recordId?: string; generation?: number; detail?: string },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("attentionItems")
    .withIndex("by_work_reason_kind_recordId", (q) =>
      q.eq("workId", item.workId).eq("reason", item.reason).eq("kind", item.kind).eq("recordId", item.recordId),
    )
    .collect();
  const open = existing.find((a) => a.status === "open");
  if (open) {
    await ctx.db.patch(open._id, { count: open.count + 1, lastActivityAt: now, detail: item.detail ?? open.detail, generation: item.generation ?? open.generation });
    return open._id;
  }
  return ctx.db.insert("attentionItems", { ...item, status: "open", count: 1, createdAt: now, lastActivityAt: now });
}

/** A reader's report on one saved image: grouped per image, reopening a closed item with its history kept. */
export async function openReaderReport(
  ctx: MutationCtx,
  report: { workId: string; imageId: Id<"verseImages">; message: string },
) {
  const now = Date.now();
  const recordId = String(report.imageId);
  const existing = await ctx.db
    .query("attentionItems")
    .withIndex("by_work_reason_kind_recordId", (q) =>
      q.eq("workId", report.workId).eq("reason", READER_REPORT_REASON).eq("kind", "image").eq("recordId", recordId),
    )
    .collect();
  const current = existing.find((a) => a.status === "open") ?? existing.sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0];
  const entry = { at: now, message: report.message };
  if (current) {
    const reports = [...(current.reports ?? []), entry].slice(-MAX_KEPT_REPORTS);
    const reopened = current.status === "closed";
    const history = [...(current.history ?? []), { at: now, event: reopened ? "reopened" : "reported", ...(reopened && current.disposition ? { disposition: current.disposition } : {}) }].slice(-MAX_HISTORY);
    await ctx.db.patch(current._id, { status: "open", count: current.count + 1, lastActivityAt: now, detail: report.message.slice(0, 200), reports, history, closedAt: undefined });
    return { id: current._id, reopened };
  }
  const id = await ctx.db.insert("attentionItems", {
    workId: report.workId, reason: READER_REPORT_REASON, kind: "image", recordId, imageId: report.imageId, detail: report.message.slice(0, 200),
    status: "open", count: 1, createdAt: now, lastActivityAt: now, reports: [entry], history: [{ at: now, event: "reported" }],
  });
  return { id, reopened: false };
}
