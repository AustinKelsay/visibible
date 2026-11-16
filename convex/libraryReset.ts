import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * The owner's library reset: deletes every verse image and video, with their stored files, so a deployment starts
 * with an empty shared image library. Reference sheets, style references, analysis, sessions, credits and request
 * records are kept. Run it from the CLI until it reports `done` (see llm/workflow/LIBRARY_RESET.md). Internal only,
 * so no reader or server route can call it.
 */
export const CONFIRM_RESET = "delete every picture and video";
const PAGE_SIZE = 50;
const DRY_RUN_LIMIT = 2000;

export const resetLibraryPage = internalMutation({
  // `before`: the time the reset started. Pictures and videos made after it, during the reset, are kept.
  args: { confirm: v.string(), before: v.number(), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.confirm !== CONFIRM_RESET) throw new Error(`Pass confirm: "${CONFIRM_RESET}"`);

    // A video still being made would lose its record mid-flight, and its reservation with it.
    const activeVideo = await ctx.db.query("videoJobs").withIndex("by_active_nextRun", q => q.eq("active", true)).first();
    if (activeVideo) throw new Error(`Video job ${activeVideo._id} is still running; wait for it to finish`);

    // A dry run counts the whole library (up to a bound well above any library so far); a real page takes 50 rows.
    const limit = args.dryRun ? DRY_RUN_LIMIT : PAGE_SIZE;
    const videos = await ctx.db.query("videoJobs").filter(q => q.lt(q.field("createdAt"), args.before)).take(limit);
    const images = await ctx.db.query("verseImages").withIndex("by_createdAt", q => q.lt("createdAt", args.before))
      .take(limit - videos.length);
    const full = videos.length + images.length === limit;
    const files = [
      ...videos.flatMap(job => job.storageId ? [job.storageId] : []),
      ...images.flatMap(image => [image.storageId, image.thumbnailStorageId].filter(id => id !== undefined)),
    ];

    if (!args.dryRun) {
      for (const id of files) {
        if (await ctx.db.system.get(id)) await ctx.storage.delete(id);
      }
      for (const row of [...videos, ...images]) await ctx.db.delete(row._id);
    }

    // A dry run that fills its bound reports `truncated`: there is more than it counted.
    const done = !full;
    // The Nostr scheduler's state points at images; once they are gone, it starts again from the latest window.
    let schedulerStateCleared = 0;
    if (done && !args.dryRun) {
      for (const state of await ctx.db.query("nostrPublishingState").collect()) {
        await ctx.db.delete(state._id);
        schedulerStateCleared++;
      }
    }

    return {
      videos: videos.length, images: images.length, files: files.length, schedulerStateCleared, done,
      truncated: Boolean(args.dryRun) && full, dryRun: args.dryRun ?? false,
    };
  },
});
