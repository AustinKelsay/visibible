import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Submit user feedback.
 * Accepts feedback text and optional verse context.
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
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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

    await ctx.db.insert("feedback", {
      message: trimmedMessage,
      sid: args.sid,
      verseContext: args.verseContext,
      userAgent: args.userAgent,
      createdAt: now,
    });

    return { success: true };
  },
});
