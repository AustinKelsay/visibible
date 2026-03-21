import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { NostrPublishResult } from "./nostr";
import {
  getLatestCompletedWindowStart,
  getWindowEnd,
  hasSchedulerLockExpired,
  NOSTR_PUBLISHING_STATE_KEY,
  pickScheduledNostrCandidate,
} from "./lib/nostrScheduling";

type EligibleScheduledImage = {
  imageId: Id<"verseImages">;
  verseId: string;
  reference: string;
  verseText: string;
  storageId: Id<"_storage">;
  imageMimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  impressionCount?: number;
  lastImpressionAt?: number;
  createdAt: number;
};

type TerminalPublishOutcome =
  | "published"
  | "already_published"
  | "image_missing"
  | "record_failed";

type ClaimScheduledImageResult =
  | {
      status: "already_processed";
    }
  | {
      status: "in_progress";
      imageId: Id<"verseImages"> | undefined;
    }
  | {
      status: "no_candidates";
    }
  | {
      status: "claimed";
      candidate: EligibleScheduledImage;
      claimStartedAt: number;
    };

type ScheduledWindowRunResult =
  | {
      windowStart: number;
      status: "already_processed" | "in_progress" | "no_candidates";
    }
  | {
      windowStart: number;
      imageId: Id<"verseImages">;
      outcome: NostrPublishResult["outcome"];
    };

function isTerminalPublishOutcome(
  outcome: NostrPublishResult["outcome"]
): outcome is TerminalPublishOutcome {
  return (
    outcome === "published" ||
    outcome === "already_published" ||
    outcome === "image_missing"
  );
}

function toEligibleScheduledImage(
  image: Doc<"verseImages"> | null,
  windowStart: number,
  windowEnd: number
): EligibleScheduledImage | null {
  if (!image) return null;
  if (image.createdAt < windowStart || image.createdAt >= windowEnd) return null;
  if (!image.storageId || !image.reference || !image.verseText) return null;
  if (image.nostrEventId) return null;

  return {
    imageId: image._id,
    verseId: image.verseId,
    reference: image.reference,
    verseText: image.verseText,
    storageId: image.storageId,
    imageMimeType: image.imageMimeType,
    imageWidth: image.imageWidth,
    imageHeight: image.imageHeight,
    impressionCount: image.impressionCount,
    lastImpressionAt: image.lastImpressionAt,
    createdAt: image.createdAt,
  };
}

export const claimScheduledImageForWindow = internalMutation({
  args: {
    windowStart: v.number(),
    windowEnd: v.number(),
    now: v.number(),
    randomValue: v.number(),
  },
  handler: async (ctx, args): Promise<ClaimScheduledImageResult> => {
    const state = await ctx.db
      .query("nostrPublishingState")
      .withIndex("by_key", (q) => q.eq("key", NOSTR_PUBLISHING_STATE_KEY))
      .unique();

    if (
      state?.lastProcessedWindowStart !== undefined &&
      state.lastProcessedWindowStart >= args.windowStart
    ) {
      return { status: "already_processed" as const };
    }

    const isProcessingSameWindow =
      state?.processingWindowStart === args.windowStart;
    if (
      isProcessingSameWindow &&
      !hasSchedulerLockExpired(state.processingStartedAt, args.now)
    ) {
      return {
        status: "in_progress" as const,
        imageId: state.processingImageId,
      };
    }

    let candidate: EligibleScheduledImage | null = null;

    if (isProcessingSameWindow && state?.processingImageId) {
      const lockedImage = await ctx.db.get(state.processingImageId);
      candidate = toEligibleScheduledImage(
        lockedImage,
        args.windowStart,
        args.windowEnd
      );
    }

    if (!candidate) {
      const windowImages = await ctx.db
        .query("verseImages")
        .withIndex("by_createdAt", (q) =>
          q.gte("createdAt", args.windowStart).lt("createdAt", args.windowEnd)
        )
        .collect();

      const eligibleCandidates = windowImages
        .map((image) =>
          toEligibleScheduledImage(image, args.windowStart, args.windowEnd)
        )
        .filter(
          (image): image is EligibleScheduledImage => image !== null
        );

      candidate = pickScheduledNostrCandidate(
        eligibleCandidates,
        args.randomValue
      );
    }

    const nextState = {
      key: NOSTR_PUBLISHING_STATE_KEY,
      updatedAt: args.now,
    };

    if (!candidate) {
      if (state) {
        await ctx.db.patch(state._id, {
          ...nextState,
          lastProcessedWindowStart: args.windowStart,
          processingWindowStart: undefined,
          processingStartedAt: undefined,
          processingImageId: undefined,
          lastOutcome: "no_candidates",
        });
      } else {
        await ctx.db.insert("nostrPublishingState", {
          ...nextState,
          lastProcessedWindowStart: args.windowStart,
          lastOutcome: "no_candidates",
        });
      }

      return { status: "no_candidates" as const };
    }

    const processingPatch = {
      ...nextState,
      processingWindowStart: args.windowStart,
      processingStartedAt: args.now,
      processingImageId: candidate.imageId,
      lastOutcome: "processing",
    };

    if (state) {
      await ctx.db.patch(state._id, processingPatch);
    } else {
      await ctx.db.insert("nostrPublishingState", processingPatch);
    }

    return {
      status: "claimed" as const,
      candidate,
      claimStartedAt: args.now,
    };
  },
});

export const completeScheduledWindow = internalMutation({
  args: {
    windowStart: v.number(),
    imageId: v.id("verseImages"),
    claimStartedAt: v.number(),
    outcome: v.union(
      v.literal("published"),
      v.literal("already_published"),
      v.literal("image_missing"),
      v.literal("record_failed")
    ),
    completedAt: v.number(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const state = await ctx.db
      .query("nostrPublishingState")
      .withIndex("by_key", (q) => q.eq("key", NOSTR_PUBLISHING_STATE_KEY))
      .unique();

    if (
      !state ||
      state.processingWindowStart !== args.windowStart ||
      state.processingImageId !== args.imageId ||
      state.processingStartedAt !== args.claimStartedAt
    ) {
      return { success: false };
    }

    await ctx.db.patch(state._id, {
      key: NOSTR_PUBLISHING_STATE_KEY,
      lastProcessedWindowStart: args.windowStart,
      processingWindowStart: undefined,
      processingStartedAt: undefined,
      processingImageId: undefined,
      lastOutcome: args.outcome,
      lastPublishedImageId:
        args.outcome === "published" ||
        args.outcome === "already_published" ||
        args.outcome === "record_failed"
          ? args.imageId
          : undefined,
      lastPublishedAt:
        args.outcome === "published" || args.outcome === "record_failed"
          ? args.completedAt
          : state.lastPublishedAt,
      updatedAt: args.completedAt,
    });

    return { success: true };
  },
});

export const recordScheduledWindowFailure = internalMutation({
  args: {
    windowStart: v.number(),
    imageId: v.id("verseImages"),
    claimStartedAt: v.number(),
    failedAt: v.number(),
    outcome: v.union(
      v.literal("config_missing"),
      v.literal("publish_failed")
    ),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const state = await ctx.db
      .query("nostrPublishingState")
      .withIndex("by_key", (q) => q.eq("key", NOSTR_PUBLISHING_STATE_KEY))
      .unique();

    if (
      !state ||
      state.processingWindowStart !== args.windowStart ||
      state.processingImageId !== args.imageId ||
      state.processingStartedAt !== args.claimStartedAt
    ) {
      return { success: false };
    }

    await ctx.db.patch(state._id, {
      key: NOSTR_PUBLISHING_STATE_KEY,
      processingStartedAt: args.failedAt,
      lastOutcome: args.outcome,
      updatedAt: args.failedAt,
    });

    return { success: true };
  },
});

export const publishTopImageForLatestWindow = internalAction({
  args: {
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ScheduledWindowRunResult> => {
    const now = args.now ?? Date.now();
    const windowStart = getLatestCompletedWindowStart(now);
    const windowEnd = getWindowEnd(windowStart);

    const claimResult: ClaimScheduledImageResult = await ctx.runMutation(
      internal.nostrScheduler.claimScheduledImageForWindow,
      {
        windowStart,
        windowEnd,
        now,
        randomValue: Math.random(),
      }
    );

    if (claimResult.status !== "claimed") {
      console.log(
        `[Nostr Scheduler] Window ${windowStart} skipped with status ${claimResult.status}`
      );
      return {
        windowStart,
        status: claimResult.status,
      };
    }

    const publishResult: NostrPublishResult = await ctx.runAction(
      internal.nostr.publishToNostr,
      {
      imageId: claimResult.candidate.imageId,
      verseId: claimResult.candidate.verseId,
      reference: claimResult.candidate.reference,
      verseText: claimResult.candidate.verseText,
      storageId: claimResult.candidate.storageId,
      imageMimeType: claimResult.candidate.imageMimeType,
      imageWidth: claimResult.candidate.imageWidth,
      imageHeight: claimResult.candidate.imageHeight,
      }
    );

    if (isTerminalPublishOutcome(publishResult.outcome)) {
      await ctx.runMutation(
        internal.nostrScheduler.completeScheduledWindow,
        {
          windowStart,
          imageId: claimResult.candidate.imageId,
          claimStartedAt: claimResult.claimStartedAt,
          outcome: publishResult.outcome,
          completedAt: now,
        }
      );
    } else {
      await ctx.runMutation(
        internal.nostrScheduler.recordScheduledWindowFailure,
        {
          windowStart,
          imageId: claimResult.candidate.imageId,
          claimStartedAt: claimResult.claimStartedAt,
          failedAt: now,
          outcome: publishResult.outcome,
        }
      );
    }

    console.log(
      `[Nostr Scheduler] Window ${windowStart} handled with outcome ${publishResult.outcome}`
    );

    return {
      windowStart,
      imageId: claimResult.candidate.imageId,
      outcome: publishResult.outcome,
    };
  },
});
