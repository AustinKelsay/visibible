import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

/**
 * Get the most recent image for a verse.
 * Returns the image URL (either direct URL or from storage).
 */
export const getLatestImage = query({
  args: {
    verseId: v.string(),
  },
  handler: async (ctx, args) => {
    const image = await ctx.db
      .query("verseImages")
      .withIndex("by_verse", (q) => q.eq("verseId", args.verseId))
      .order("desc")
      .first();

    if (!image) return null;

    // If we have a storage ID, get the URL from storage
    if (image.storageId) {
      const url = await ctx.storage.getUrl(image.storageId);
      if (url) {
        return {
          id: image._id,
          imageUrl: url,
          model: image.model,
          createdAt: image.createdAt,
        };
      }
    }

    // Fall back to direct URL if available
    if (image.imageUrl) {
      return {
        id: image._id,
        imageUrl: image.imageUrl,
        model: image.model,
        createdAt: image.createdAt,
      };
    }

    return null;
  },
});

/**
 * Get all images for a verse (for future history feature).
 */
export const getImageHistory = query({
  args: {
    verseId: v.string(),
    limit: v.optional(v.number()),
    refreshToken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("verseImages")
      .withIndex("by_verse", (q) => q.eq("verseId", args.verseId))
      .order("desc");

    const images = args.limit
      ? await query.take(args.limit)
      : await query.collect();

    // Resolve storage URLs
    const results = await Promise.all(
      images.map(async (image) => {
        let imageUrl = image.imageUrl;
        if (image.storageId) {
          const url = await ctx.storage.getUrl(image.storageId);
          if (url) imageUrl = url;
        }
        return {
          id: image._id,
          imageUrl,
          model: image.model,
          createdAt: image.createdAt,
        };
      })
    );

    return results.filter((r) => r.imageUrl);
  },
});

/**
 * Internal mutation to save image with storage ID.
 */
export const saveImageWithStorage = internalMutation({
  args: {
    verseId: v.string(),
    storageId: v.id("_storage"),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("verseImages", {
      verseId: args.verseId,
      storageId: args.storageId,
      model: args.model,
      createdAt: Date.now(),
    });
    return id;
  },
});

/**
 * Internal mutation to save image with direct URL.
 */
export const saveImageWithUrl = internalMutation({
  args: {
    verseId: v.string(),
    imageUrl: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("verseImages", {
      verseId: args.verseId,
      imageUrl: args.imageUrl,
      model: args.model,
      createdAt: Date.now(),
    });
    return id;
  },
});

const BASE64_LOOKUP = (() => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  lookup.fill(255);
  for (let i = 0; i < chars.length; i += 1) {
    lookup[chars.charCodeAt(i)] = i;
  }
  return lookup;
})();

const decodeBase64ToBytes = (base64: string) => {
  const cleaned = base64.replace(/[\r\n\s]/g, "");
  if (cleaned.length % 4 === 1) {
    throw new Error("Invalid base64 string");
  }

  let bufferLength = (cleaned.length * 3) / 4;
  if (cleaned.endsWith("==")) {
    bufferLength -= 2;
  } else if (cleaned.endsWith("=")) {
    bufferLength -= 1;
  }

  const bytes = new Uint8Array(bufferLength);
  let offset = 0;

  for (let i = 0; i < cleaned.length; i += 4) {
    const encoded1 = BASE64_LOOKUP[cleaned.charCodeAt(i)];
    const encoded2 = BASE64_LOOKUP[cleaned.charCodeAt(i + 1)];
    const encoded3 =
      cleaned[i + 2] === "=" ? 0 : BASE64_LOOKUP[cleaned.charCodeAt(i + 2)];
    const encoded4 =
      cleaned[i + 3] === "=" ? 0 : BASE64_LOOKUP[cleaned.charCodeAt(i + 3)];

    if (
      encoded1 === 255 ||
      encoded2 === 255 ||
      encoded3 === 255 ||
      encoded4 === 255
    ) {
      throw new Error("Invalid base64 string");
    }

    const triplet =
      (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
    if (offset < bytes.length) {
      bytes[offset] = (triplet >> 16) & 0xff;
      offset += 1;
    }
    if (offset < bytes.length) {
      bytes[offset] = (triplet >> 8) & 0xff;
      offset += 1;
    }
    if (offset < bytes.length) {
      bytes[offset] = triplet & 0xff;
      offset += 1;
    }
  }

  return bytes;
};

/**
 * Action to save an image. Handles both regular URLs and base64 data URLs.
 * For base64 data URLs, uploads to Convex storage first.
 * For regular URLs, stores in Convex storage when possible with URL fallback.
 */
export const saveImage = action({
  args: {
    verseId: v.string(),
    imageUrl: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true; type: string; id: Id<"verseImages"> }> => {
    const { verseId, imageUrl, model } = args;

    // Check if this is a base64 data URL
    if (imageUrl.startsWith("data:")) {
      // Parse the data URL
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error("Invalid data URL format");
      }

      const mimeType = matches[1];
      const base64Data = matches[2];

      // Decode base64 without relying on atob/Buffer (not available in Convex).
      const bytes = decodeBase64ToBytes(base64Data);

      // Create a blob and upload to storage
      const blob = new Blob([bytes], { type: mimeType });
      const storageId = await ctx.storage.store(blob);

      // Save to database with storage ID
      const id: Id<"verseImages"> = await ctx.runMutation(internal.verseImages.saveImageWithStorage, {
        verseId,
        storageId,
        model,
      });

      return { success: true, type: "storage", id };
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const blob = await response.blob();
      const storageId = await ctx.storage.store(blob);

      const id: Id<"verseImages"> = await ctx.runMutation(internal.verseImages.saveImageWithStorage, {
        verseId,
        storageId,
        model,
      });

      return { success: true, type: "storage", id };
    } catch (error) {
      console.error("Failed to fetch and store image:", error);
      const id: Id<"verseImages"> = await ctx.runMutation(internal.verseImages.saveImageWithUrl, {
        verseId,
        imageUrl,
        model,
      });
      return { success: true, type: "url", id };
    }
  },
});
