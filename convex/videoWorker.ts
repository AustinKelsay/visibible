"use node";

// Video buffers can exceed the default runtime memory limit; Node actions have 512 MB.
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  submitVideo,
  pollVideo,
  downloadVideo,
} from "../src/lib/video-provider";

export const process = internalAction({
  args: { id: v.id("videoJobs") },
  handler: async (ctx, args): Promise<void> => {
    const job = await ctx.runMutation(internal.verseVideos.claim, args);
    if (!job) return;
    const ownership = { id: job._id, lease: job.lease };
    try {
      if (job.status === "storing") {
        const blob = await downloadVideo(job.providerId!);
        const storageId = await ctx.storage.store(blob);
        // Never delete on a transport error: the finalization may already have committed.
        await ctx.runMutation(internal.verseVideos.finish, {
          ...ownership,
          storageId,
        });
        return;
      }
      const result =
        job.status === "submitting"
          ? await submitVideo({
              prompt: job.prompt,
              duration: job.duration,
              resolution: job.resolution,
            })
          : await pollVideo(job.providerId!);
      if (result.status === "failed") {
        await ctx.runMutation(internal.verseVideos.retryOrFail, {
          ...ownership,
          terminal: true,
          failureKind: "provider_failure",
        });
      } else {
        await ctx.runMutation(internal.verseVideos.advance, {
          ...ownership,
          providerId: result.id,
          costUsd: result.costUsd,
          ready: result.status === "completed",
        });
      }
    } catch (error) {
      const ambiguous =
        job.status === "submitting" &&
        (!(error instanceof Error) ||
          !("ambiguous" in error) ||
          error.ambiguous !== false);
      await ctx.runMutation(internal.verseVideos.retryOrFail, {
        ...ownership,
        terminal: job.status === "submitting",
        stage: job.status,
        failureKind: ambiguous
          ? "ambiguous_submission"
          : job.status === "storing"
            ? "storage_failure"
            : "provider_request_failure",
      });
    }
  },
});
