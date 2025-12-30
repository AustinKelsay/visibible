import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const chapterThemeValidator = v.object({
  setting: v.string(),
  palette: v.string(),
  elements: v.string(),
  style: v.string(),
});

const verseContextValidator = v.object({
  number: v.number(),
  text: v.string(),
  reference: v.optional(v.string()),
});

const promptInputsValidator = v.object({
  reference: v.optional(v.string()),
  aspectRatio: v.optional(v.string()),
  generationNumber: v.optional(v.number()),
  prevVerse: v.optional(verseContextValidator),
  nextVerse: v.optional(verseContextValidator),
});

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
          prompt: image.prompt,
          reference: image.reference,
          verseText: image.verseText,
          chapterTheme: image.chapterTheme,
          generationNumber: image.generationNumber,
          promptVersion: image.promptVersion,
          promptInputs: image.promptInputs,
          translationId: image.translationId,
          provider: image.provider,
          providerRequestId: image.providerRequestId,
          creditsCost: image.creditsCost,
          costUsd: image.costUsd,
          durationMs: image.durationMs,
          aspectRatio: image.aspectRatio,
          sourceImageUrl: image.sourceImageUrl,
          imageMimeType: image.imageMimeType,
          imageSizeBytes: image.imageSizeBytes,
          imageWidth: image.imageWidth,
          imageHeight: image.imageHeight,
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
        prompt: image.prompt,
        reference: image.reference,
        verseText: image.verseText,
        chapterTheme: image.chapterTheme,
        generationNumber: image.generationNumber,
        promptVersion: image.promptVersion,
        promptInputs: image.promptInputs,
        translationId: image.translationId,
        provider: image.provider,
        providerRequestId: image.providerRequestId,
        creditsCost: image.creditsCost,
        costUsd: image.costUsd,
        durationMs: image.durationMs,
        aspectRatio: image.aspectRatio,
        sourceImageUrl: image.sourceImageUrl,
        imageMimeType: image.imageMimeType,
        imageSizeBytes: image.imageSizeBytes,
        imageWidth: image.imageWidth,
        imageHeight: image.imageHeight,
        createdAt: image.createdAt,
      };
    }

    return null;
  },
});

/**
 * Get image status for all verses in a chapter.
 * Returns an array of verse numbers with their image status.
 */
export const getChapterImageStatus = query({
  args: {
    book: v.string(),
    chapter: v.number(),
  },
  handler: async (ctx, args) => {
    // Query all verse images that match the book/chapter prefix
    // verseId format is like "genesis-1-1"
    const prefix = `${args.book.toLowerCase()}-${args.chapter}-`;

    // Use a prefix range so the index only scans this chapter's verseIds.
    const images = await ctx.db
      .query("verseImages")
      .withIndex("by_verse", (q) =>
        q.gte("verseId", prefix).lt("verseId", `${prefix}~`)
      )
      .collect();

    // Extract unique verses that have images for this chapter
    const versesWithImages = new Set<number>();

    for (const image of images) {
      // Extract verse number from verseId (e.g., "genesis-1-15" -> 15)
      const verseStr = image.verseId.slice(prefix.length);
      const verseNum = parseInt(verseStr, 10);
      if (!isNaN(verseNum)) {
        versesWithImages.add(verseNum);
      }
    }

    // Return sorted list of verses with their status
    // Note: We don't know total verses, so only return verses with images
    return Array.from(versesWithImages)
      .sort((a, b) => a - b)
      .map(verse => ({
        verse,
        hasImage: true,
      }));
  },
});

// All 66 Bible book slugs for efficient existence checks
const ALL_BOOK_SLUGS = [
  // Old Testament (39)
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy",
  "joshua", "judges", "ruth", "1-samuel", "2-samuel",
  "1-kings", "2-kings", "1-chronicles", "2-chronicles", "ezra",
  "nehemiah", "esther", "job", "psalms", "proverbs",
  "ecclesiastes", "song-of-solomon", "isaiah", "jeremiah", "lamentations",
  "ezekiel", "daniel", "hosea", "joel", "amos",
  "obadiah", "jonah", "micah", "nahum", "habakkuk",
  "zephaniah", "haggai", "zechariah", "malachi",
  // New Testament (27)
  "matthew", "mark", "luke", "john", "acts",
  "romans", "1-corinthians", "2-corinthians", "galatians", "ephesians",
  "philippians", "colossians", "1-thessalonians", "2-thessalonians", "1-timothy",
  "2-timothy", "titus", "philemon", "hebrews", "james",
  "1-peter", "2-peter", "1-john", "2-john", "3-john",
  "jude", "revelation",
] as const;

/**
 * Get all book slugs that have at least one image.
 * Used for showing image indicators in the book menu.
 *
 * Performance: Uses parallel prefix scans on the by_verse index instead of
 * a full table scan. Each book check uses the index to find just one record.
 */
export const getBooksWithImages = query({
  args: {},
  handler: async (ctx) => {
    // Check each book in parallel using index prefix scans
    const checks = await Promise.all(
      ALL_BOOK_SLUGS.map(async (slug) => {
        const prefix = `${slug}-`;
        const exists = await ctx.db
          .query("verseImages")
          .withIndex("by_verse", (q) =>
            q.gte("verseId", prefix).lt("verseId", `${prefix}~`)
          )
          .first();
        return exists ? slug : null;
      })
    );

    // Filter out nulls and return books with images
    return checks.filter((slug): slug is typeof ALL_BOOK_SLUGS[number] => slug !== null);
  },
});

/**
 * Get all chapter numbers that have at least one image for a given book.
 * Used for showing image indicators in the book menu chapter grid.
 */
export const getChaptersWithImages = query({
  args: {
    book: v.string(),
  },
  handler: async (ctx, args) => {
    const prefix = `${args.book.toLowerCase()}-`;

    // Use prefix range on by_verse index
    const images = await ctx.db
      .query("verseImages")
      .withIndex("by_verse", (q) =>
        q.gte("verseId", prefix).lt("verseId", `${prefix}~`)
      )
      .collect();

    const chaptersWithImages = new Set<number>();

    for (const image of images) {
      // Extract chapter from verseId: "genesis-1-15" -> 1
      // The suffix after prefix is "chapter-verse"
      const suffix = image.verseId.slice(prefix.length);
      const match = suffix.match(/^(\d+)-\d+$/);
      if (match) {
        chaptersWithImages.add(parseInt(match[1], 10));
      }
    }

    return Array.from(chaptersWithImages).sort((a, b) => a - b);
  },
});

/**
 * Get all images for a verse (for future history feature).
 */
export const getImageHistory = query({
  args: {
    verseId: v.string(),
    limit: v.optional(v.number()),
    // Cache-busting token: changing this value forces Convex to re-run the query
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
          prompt: image.prompt,
          reference: image.reference,
          verseText: image.verseText,
          chapterTheme: image.chapterTheme,
          generationNumber: image.generationNumber,
          promptVersion: image.promptVersion,
          promptInputs: image.promptInputs,
          translationId: image.translationId,
          provider: image.provider,
          providerRequestId: image.providerRequestId,
          creditsCost: image.creditsCost,
          costUsd: image.costUsd,
          durationMs: image.durationMs,
          aspectRatio: image.aspectRatio,
          sourceImageUrl: image.sourceImageUrl,
          imageMimeType: image.imageMimeType,
          imageSizeBytes: image.imageSizeBytes,
          imageWidth: image.imageWidth,
          imageHeight: image.imageHeight,
          createdAt: image.createdAt,
        };
      })
    );

    return results.filter((r) => r.imageUrl);
  },
});

/**
 * Internal lookup to enforce generationId idempotency.
 */
export const getImageByGenerationId = internalQuery({
  args: {
    generationId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("verseImages")
      .withIndex("by_generationId", (q) =>
        q.eq("generationId", args.generationId)
      )
      .first();
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
    prompt: v.optional(v.string()),
    reference: v.optional(v.string()),
    verseText: v.optional(v.string()),
    chapterTheme: v.optional(chapterThemeValidator),
    generationNumber: v.optional(v.number()),
    promptVersion: v.optional(v.string()),
    promptInputs: v.optional(promptInputsValidator),
    translationId: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    creditsCost: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    aspectRatio: v.optional(v.string()),
    sourceImageUrl: v.optional(v.string()),
    imageMimeType: v.optional(v.string()),
    imageSizeBytes: v.optional(v.number()),
    imageWidth: v.optional(v.number()),
    imageHeight: v.optional(v.number()),
    generationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("verseImages", {
      verseId: args.verseId,
      storageId: args.storageId,
      model: args.model,
      prompt: args.prompt,
      reference: args.reference,
      verseText: args.verseText,
      chapterTheme: args.chapterTheme,
      generationNumber: args.generationNumber,
      promptVersion: args.promptVersion,
      promptInputs: args.promptInputs,
      translationId: args.translationId,
      provider: args.provider,
      providerRequestId: args.providerRequestId,
      creditsCost: args.creditsCost,
      costUsd: args.costUsd,
      durationMs: args.durationMs,
      aspectRatio: args.aspectRatio,
      sourceImageUrl: args.sourceImageUrl,
      imageMimeType: args.imageMimeType,
      imageSizeBytes: args.imageSizeBytes,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
      generationId: args.generationId,
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
    prompt: v.optional(v.string()),
    reference: v.optional(v.string()),
    verseText: v.optional(v.string()),
    chapterTheme: v.optional(chapterThemeValidator),
    generationNumber: v.optional(v.number()),
    promptVersion: v.optional(v.string()),
    promptInputs: v.optional(promptInputsValidator),
    translationId: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    creditsCost: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    aspectRatio: v.optional(v.string()),
    sourceImageUrl: v.optional(v.string()),
    imageMimeType: v.optional(v.string()),
    imageSizeBytes: v.optional(v.number()),
    imageWidth: v.optional(v.number()),
    imageHeight: v.optional(v.number()),
    generationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("verseImages", {
      verseId: args.verseId,
      imageUrl: args.imageUrl,
      model: args.model,
      prompt: args.prompt,
      reference: args.reference,
      verseText: args.verseText,
      chapterTheme: args.chapterTheme,
      generationNumber: args.generationNumber,
      promptVersion: args.promptVersion,
      promptInputs: args.promptInputs,
      translationId: args.translationId,
      provider: args.provider,
      providerRequestId: args.providerRequestId,
      creditsCost: args.creditsCost,
      costUsd: args.costUsd,
      durationMs: args.durationMs,
      aspectRatio: args.aspectRatio,
      sourceImageUrl: args.sourceImageUrl,
      imageMimeType: args.imageMimeType,
      imageSizeBytes: args.imageSizeBytes,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
      generationId: args.generationId,
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

const normalizeMimeType = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.split(";")[0]?.trim();
  return trimmed || undefined;
};

const deriveProvider = (model: string) => {
  const provider = model.split("/")[0];
  if (!provider) return undefined;
  return provider.charAt(0).toUpperCase() + provider.slice(1);
};

type ImageDimensions = { width: number; height: number };

const readUint16BE = (bytes: Uint8Array, offset: number) => {
  if (offset + 1 >= bytes.length) return null;
  return (bytes[offset] << 8) | bytes[offset + 1];
};

const readUint16LE = (bytes: Uint8Array, offset: number) => {
  if (offset + 1 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
};

const readUint24LE = (bytes: Uint8Array, offset: number) => {
  if (offset + 2 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
};

const readUint32BE = (bytes: Uint8Array, offset: number) => {
  if (offset + 3 >= bytes.length) return null;
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
};

const matchesAscii = (bytes: Uint8Array, offset: number, value: string) => {
  if (offset + value.length > bytes.length) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (bytes[offset + i] !== value.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};

const parsePngDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) return null;
  }
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  if (!width || !height) return null;
  return { width, height };
};

const parseGifDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  if (bytes.length < 10) return null;
  if (!matchesAscii(bytes, 0, "GIF")) return null;
  const width = readUint16LE(bytes, 6);
  const height = readUint16LE(bytes, 8);
  if (!width || !height) return null;
  return { width, height };
};

const parseJpegDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  if (bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) {
      offset += 1;
    }
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    const length = readUint16BE(bytes, offset);
    if (!length || length < 2) return null;
    const isSOF =
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf;
    if (isSOF) {
      const height = readUint16BE(bytes, offset + 3);
      const width = readUint16BE(bytes, offset + 5);
      if (!width || !height) return null;
      return { width, height };
    }
    offset += length;
  }
  return null;
};

const parseWebpDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  if (bytes.length < 30) return null;
  if (!matchesAscii(bytes, 0, "RIFF") || !matchesAscii(bytes, 8, "WEBP")) {
    return null;
  }
  const chunkType = String.fromCharCode(
    bytes[12],
    bytes[13],
    bytes[14],
    bytes[15]
  );
  const chunkDataStart = 20;

  if (chunkType === "VP8X") {
    const widthMinusOne = readUint24LE(bytes, chunkDataStart + 4);
    const heightMinusOne = readUint24LE(bytes, chunkDataStart + 7);
    if (widthMinusOne === null || heightMinusOne === null) return null;
    return { width: widthMinusOne + 1, height: heightMinusOne + 1 };
  }

  if (chunkType === "VP8 ") {
    const widthRaw = readUint16LE(bytes, chunkDataStart + 6);
    const heightRaw = readUint16LE(bytes, chunkDataStart + 8);
    if (!widthRaw || !heightRaw) return null;
    return { width: widthRaw & 0x3fff, height: heightRaw & 0x3fff };
  }

  if (chunkType === "VP8L") {
    if (bytes[chunkDataStart] !== 0x2f) return null;
    const b0 = bytes[chunkDataStart + 1];
    const b1 = bytes[chunkDataStart + 2];
    const b2 = bytes[chunkDataStart + 3];
    const b3 = bytes[chunkDataStart + 4];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }

  return null;
};

const getImageDimensions = (bytes: Uint8Array, mimeType?: string): ImageDimensions | null => {
  const normalizedType = normalizeMimeType(mimeType);
  if (normalizedType?.includes("png")) return parsePngDimensions(bytes);
  if (normalizedType?.includes("jpeg") || normalizedType?.includes("jpg")) {
    return parseJpegDimensions(bytes);
  }
  if (normalizedType?.includes("gif")) return parseGifDimensions(bytes);
  if (normalizedType?.includes("webp")) return parseWebpDimensions(bytes);

  return (
    parsePngDimensions(bytes) ||
    parseJpegDimensions(bytes) ||
    parseGifDimensions(bytes) ||
    parseWebpDimensions(bytes)
  );
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
    prompt: v.optional(v.string()),
    reference: v.optional(v.string()),
    verseText: v.optional(v.string()),
    chapterTheme: v.optional(chapterThemeValidator),
    generationNumber: v.optional(v.number()),
    promptVersion: v.optional(v.string()),
    promptInputs: v.optional(promptInputsValidator),
    translationId: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    creditsCost: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    aspectRatio: v.optional(v.string()),
    generationId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: true; type: string; id: Id<"verseImages"> }> => {
    const {
      verseId,
      imageUrl,
      model,
      prompt,
      reference,
      verseText,
      chapterTheme,
      generationNumber,
      promptVersion,
      promptInputs,
      translationId,
      provider,
      providerRequestId,
      creditsCost,
      costUsd,
      durationMs,
      aspectRatio,
      generationId,
    } = args;
    const resolvedProvider = provider ?? deriveProvider(model);
    const baseMetadata = {
      prompt,
      reference,
      verseText,
      chapterTheme,
      generationNumber,
      promptVersion,
      promptInputs,
      translationId,
      provider: resolvedProvider,
      providerRequestId,
      creditsCost,
      costUsd,
      durationMs,
      aspectRatio,
    };

    if (generationId) {
      const existing = await ctx.runQuery(
        internal.verseImages.getImageByGenerationId,
        { generationId }
      );

      if (existing) {
        return { success: true, type: "existing", id: existing._id };
      }
    }

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
      const normalizedMimeType = normalizeMimeType(mimeType);
      const dimensions = getImageDimensions(bytes, normalizedMimeType);
      const imageMetadata = {
        ...baseMetadata,
        sourceImageUrl: undefined,
        imageMimeType: normalizedMimeType,
        imageSizeBytes: bytes.length,
        imageWidth: dimensions?.width,
        imageHeight: dimensions?.height,
      };

      // Create a blob and upload to storage
      const blob = new Blob([bytes], { type: mimeType });
      const storageId = await ctx.storage.store(blob);

      // Save to database with storage ID
      const id: Id<"verseImages"> = await ctx.runMutation(internal.verseImages.saveImageWithStorage, {
        verseId,
        storageId,
        model,
        ...imageMetadata,
        generationId,
      });

      return { success: true, type: "storage", id };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      let response: Response;
      try {
        response = await fetch(imageUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const normalizedMimeType = normalizeMimeType(
        response.headers.get("content-type") || blob.type
      );
      const dimensions = getImageDimensions(bytes, normalizedMimeType);
      const imageMetadata = {
        ...baseMetadata,
        sourceImageUrl: imageUrl,
        imageMimeType: normalizedMimeType,
        imageSizeBytes: bytes.length,
        imageWidth: dimensions?.width,
        imageHeight: dimensions?.height,
      };
      const storageId = await ctx.storage.store(blob);

      const id: Id<"verseImages"> = await ctx.runMutation(internal.verseImages.saveImageWithStorage, {
        verseId,
        storageId,
        model,
        ...imageMetadata,
        generationId,
      });

      return { success: true, type: "storage", id };
    } catch (error) {
      console.error("Failed to fetch and store image:", error);
      const imageMetadata = {
        ...baseMetadata,
        sourceImageUrl: imageUrl,
      };
      const id: Id<"verseImages"> = await ctx.runMutation(internal.verseImages.saveImageWithUrl, {
        verseId,
        imageUrl,
        model,
        ...imageMetadata,
        generationId,
      });
      return { success: true, type: "url", id };
    }
  },
});
