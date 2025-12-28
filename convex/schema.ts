import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  verseImages: defineTable({
    // Verse identifier (lowercase, e.g., "genesis-1-1")
    verseId: v.string(),
    // External image URL (for small URLs from OpenRouter)
    imageUrl: v.optional(v.string()),
    // Convex storage ID (for uploaded images, including base64 data)
    storageId: v.optional(v.id("_storage")),
    // The model that generated this image
    model: v.string(),
    // Timestamp for ordering (most recent first)
    createdAt: v.number(),
  })
    // Index for querying all images for a verse sorted by creation time
    .index("by_verse", ["verseId", "createdAt"]),
});
