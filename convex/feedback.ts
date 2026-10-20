import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { validateServerSecret } from "./_helpers/auth";
import { openReaderReport } from "./_helpers/attention";
import { artStyleOf } from "./verseImages";

/**
 * Submit user feedback.
 * Accepts feedback text and optional verse/image context.
 */
export const submitFeedback = mutation({
  args: {
    message: v.string(),
    sid: v.optional(v.string()),
    verseContext: v.optional(
      v.object({
        book: v.optional(v.string()),
        chapter: v.optional(v.number()),
        verseRange: v.optional(v.string()),
      })
    ),
    imageContext: v.optional(
      v.object({
        imageId: v.optional(v.string()),
        model: v.optional(v.string()),
        provider: v.optional(v.string()),
        aspectRatio: v.optional(v.string()),
        dimensions: v.optional(v.string()),
        creditsCost: v.optional(v.number()),
        costUsd: v.optional(v.number()),
        durationMs: v.optional(v.number()),
        createdAt: v.optional(v.number()),
      })
    ),
    userAgent: v.optional(v.string()),
    /** "image" reports one saved image, resolved here from its id; "general" (default) keeps the existing path. */
    kind: v.optional(v.union(v.literal("general"), v.literal("image"))),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const kind = args.kind ?? "general";
    // Basic validation - message must not be empty
    const trimmedMessage = args.message.trim();
    if (!trimmedMessage) {
      throw new Error("Feedback message cannot be empty");
    }

    // Limit message length (prevent abuse)
    if (trimmedMessage.length > 5000) {
      throw new Error("Feedback message too long (max 5000 characters)");
    }

    const now = Date.now();

    if (kind === "image") {
      // The report is about the exact saved image; nothing the client says about it is trusted.
      const imageId = ctx.db.normalizeId("verseImages", args.imageContext?.imageId ?? "");
      const image = imageId ? await ctx.db.get(imageId) : null;
      // A ConvexError keeps its data in production, where a plain Error's message is redacted.
      if (!imageId || !image) throw new ConvexError({ code: "UNKNOWN_IMAGE", message: "Unknown image" });
      const resolvedImage = {
        verseId: image.verseId, artStyle: artStyleOf(image), engine: image.engine, translationId: image.translationId,
        workId: image.provenance?.workId, momentId: image.provenance?.momentId, provenanceKnown: image.provenance !== undefined,
      };
      const { id: attentionId, reopened } = await openReaderReport(ctx, { workId: resolvedImage.workId ?? "bible-web", imageId, message: trimmedMessage });
      await ctx.db.insert("feedback", {
        message: trimmedMessage, sid: args.sid, verseContext: args.verseContext, userAgent: args.userAgent, createdAt: now,
        kind, imageId, resolvedImage, attentionId,
      });
      return { success: true, kind, attentionId, reopened, artStyle: resolvedImage.artStyle };
    }

    await ctx.db.insert("feedback", {
      message: trimmedMessage,
      sid: args.sid,
      verseContext: args.verseContext,
      imageContext: args.imageContext,
      userAgent: args.userAgent,
      createdAt: now,
      kind,
    });

    return { success: true, kind };
  },
});
