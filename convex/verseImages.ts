import { authenticatedGuest } from "./guestAuth";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { paginationOptsValidator, type OrderedQuery } from "convex/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id, type DataModel, type Doc } from "./_generated/dataModel";
import { validateServerSecret } from "./_helpers/auth";
import { imageProvenanceValidator, renderingPacketValidator } from "./schema";
import { isOwnerOnlyWork } from "./lib/proseWorks";

const generationStatusValidator = v.union(
  v.literal("queued"),
  v.literal("planning"),
  v.literal("generating"),
  v.literal("succeeded"),
  v.literal("failed")
);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MiB hard cap per image
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

const assertAllowedMimeType = (mimeType?: string) => {
  if (!mimeType) {
    throw new ImageValidationError("Image MIME type is missing");
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new ImageValidationError(`Unsupported image MIME type: ${mimeType}`);
  }
};

const assertByteSizeWithinLimit = (bytes: number, source: string) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw new ImageValidationError(`Invalid image size from ${source}`);
  }
  if (bytes > MAX_IMAGE_BYTES) {
    throw new ImageValidationError(
      `Image from ${source} exceeds ${MAX_IMAGE_BYTES} byte limit`
    );
  }
};

const getPublicStorageImageBaseUrl = () => {
  const baseUrl =
    process.env.NOSTR_IMAGE_BASE_URL ||
    process.env.CONVEX_SITE_URL ||
    process.env.CONVEX_CLOUD_URL;
  if (!baseUrl) return null;
  return baseUrl.replace(/\/+$/, "");
};

const getPublicImageUrl = (image: {
  storageId?: Id<"_storage">;
  imageUrl?: string;
}) => {
  if (image.storageId) {
    const baseUrl = getPublicStorageImageBaseUrl();
    if (baseUrl) {
      return `${baseUrl}/image/${encodeURIComponent(image.storageId)}`;
    }
  }
  if (image.imageUrl) {
    return image.imageUrl;
  }

  throw new Error("Verse image is missing a public image URL.");
};

// ---------------------------------------------------------------- art styles (#176)

/** Optional style selection for library reads: one style, or every style but that one. Omitted: all styles. */
const styleFilterArgs = {
  artStyle: v.optional(v.string()),
  otherStyles: v.optional(v.boolean()),
} as const;
type StyleFilterArgs = { artStyle?: string; otherStyles?: boolean };
type StyleFilter = { artStyle: string; otherStyles: boolean };
const ART_STYLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DEFAULT_ART_STYLE_ID = "classical";

function normalizeStyleFilter(args: StyleFilterArgs): StyleFilter | null {
  if (args.artStyle === undefined) {
    if (args.otherStyles) throw new Error("otherStyles needs an artStyle to exclude");
    return null;
  }
  if (!ART_STYLE_ID.test(args.artStyle)) throw new Error("Invalid art style id");
  return { artStyle: args.artStyle, otherStyles: args.otherStyles === true };
}

/** An image without a stored art style is Classical at read time; nothing stored is rewritten. */
export function artStyleOf(image: { artStyleId?: string }): string {
  return image.artStyleId ?? DEFAULT_ART_STYLE_ID;
}

/** Apply the style selection inside the database read, so counts, existence checks and pages agree. */
function withStyleFilter<Q extends OrderedQuery<DataModel["verseImages"]>>(query: Q, filter: StyleFilter | null): Q {
  if (!filter) return query;
  return query.filter((q) => {
    const field = q.field("artStyleId");
    const isStyle = filter.artStyle === DEFAULT_ART_STYLE_ID
      ? q.or(q.eq(field, DEFAULT_ART_STYLE_ID), q.eq(field, undefined))
      : q.eq(field, filter.artStyle);
    return filter.otherStyles ? q.not(isStyle) : isStyle;
  }) as Q;
}

/**
 * Whether any image with a verse id in [prefix, prefix~) exists under the style selection. One style
 * reads the style-leading index (Classical also checks images with no stored style); "other styles"
 * has no bounded index form and scans the range with the filter.
 */
async function existsInVerseRange(ctx: QueryCtx, prefix: string, filter: StyleFilter | null): Promise<boolean> {
  const range = { gte: prefix, lt: `${prefix}~` };
  if (!filter || filter.otherStyles) {
    const hit = await withStyleFilter(ctx.db.query("verseImages")
      .withIndex("by_verse", (q) => q.gte("verseId", range.gte).lt("verseId", range.lt)), filter).first();
    return hit !== null;
  }
  const styleValues: Array<string | undefined> = filter.artStyle === DEFAULT_ART_STYLE_ID ? [undefined, DEFAULT_ART_STYLE_ID] : [filter.artStyle];
  for (const value of styleValues) {
    const hit = await ctx.db.query("verseImages")
      .withIndex("by_artStyle_verse", (q) => q.eq("artStyleId", value).gte("verseId", range.gte).lt("verseId", range.lt)).first();
    if (hit) return true;
  }
  return false;
}

/** Source and style facts every library record reports, truthfully for historical images too. */
function imageSourceFields(image: Pick<Doc<"verseImages">, "artStyleId" | "engine" | "provenance">) {
  return {
    artStyle: artStyleOf(image),
    engine: image.engine,
    requestTranslationId: image.provenance?.requestTranslationId,
  };
}

const toPublicImageRecord = (image: {
  _id: Id<"verseImages">;
  storageId?: Id<"_storage">;
  imageUrl?: string;
  reference?: string;
  model: string;
  translationId?: string;
  aspectRatio?: string;
  imageMimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  createdAt: number;
  artStyleId?: string;
}) => {
  const imageUrl = getPublicImageUrl(image);

  return {
    id: image._id,
    imageUrl,
    reference: image.reference,
    model: image.model,
    artStyle: artStyleOf(image),
    translationId: image.translationId,
    aspectRatio: image.aspectRatio,
    imageMimeType: image.imageMimeType,
    imageWidth: image.imageWidth,
    imageHeight: image.imageHeight,
    createdAt: image.createdAt,
  };
};

/**
 * Saved images of a prose work still in the owner's preview are shown only to an admin session (the guest token's
 * session). The admin check runs once, and only when such an image is found.
 */
async function visibleImageFilter(ctx: QueryCtx) {
  let isAdmin: boolean | undefined;
  return async (image: Doc<"verseImages">) => {
    if (!isOwnerOnlyWork(image.provenance?.workId)) return true;
    isAdmin ??= (await authenticatedGuest(ctx))?.tier === "admin";
    return isAdmin;
  };
}

/** Drop an unopened book's images unless the caller's guest session is an admin. */
async function onlyVisible(ctx: QueryCtx, images: Doc<"verseImages">[]) {
  const visible = await visibleImageFilter(ctx);
  const shown = await Promise.all(images.map(visible));
  return images.filter((_, index) => shown[index]);
}

/**
 * Get image status for all verses in a chapter.
 * Returns an array of verse numbers with their image status.
 */
export const getChapterImageStatus = query({
  args: {
    book: v.string(),
    chapter: v.number(),
    ...styleFilterArgs,
  },
  handler: async (ctx, args) => {
    // Query all verse images that match the book/chapter prefix
    // verseId format is like "genesis-1-1"
    const prefix = `${args.book.toLowerCase()}-${args.chapter}-`;

    // Use a prefix range so the index only scans this chapter's verseIds.
    const images = await onlyVisible(ctx, await withStyleFilter(ctx.db
      .query("verseImages")
      .withIndex("by_verse", (q) =>
        q.gte("verseId", prefix).lt("verseId", `${prefix}~`)
      ), normalizeStyleFilter(args))
      .collect());

    // Count images per verse for this chapter
    const imageCounts = new Map<number, number>();

    for (const image of images) {
      // Extract verse number from verseId (e.g., "genesis-1-15" -> 15)
      const verseStr = image.verseId.slice(prefix.length);
      const verseNum = parseInt(verseStr, 10);
      if (!isNaN(verseNum)) {
        imageCounts.set(verseNum, (imageCounts.get(verseNum) ?? 0) + 1);
      }
    }

    // Return sorted list of verses with their image counts
    return Array.from(imageCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([verse, imageCount]) => ({
        verse,
        imageCount,
      }));
  },
});

/**
 * Get all saved images for a chapter, sorted by verse and newest-first within each verse.
 * Used by the optional chapter gallery view to render mini-galleries per verse.
 */
export const getChapterGallery = query({
  args: {
    book: v.string(),
    chapter: v.number(),
    ...styleFilterArgs,
  },
  handler: async (ctx, args) => {
    const prefix = `${args.book.toLowerCase()}-${args.chapter}-`;

    const images = await onlyVisible(ctx, await withStyleFilter(ctx.db
      .query("verseImages")
      .withIndex("by_verse", (q) =>
        q.gte("verseId", prefix).lt("verseId", `${prefix}~`)
      ), normalizeStyleFilter(args))
      .collect());

    const imageCounts = new Map<number, number>();
    const parsedImages: Array<{ verse: number; image: (typeof images)[number] }> = [];

    for (const image of images) {
      const verseStr = image.verseId.slice(prefix.length);
      const verseNum = parseInt(verseStr, 10);
      if (Number.isNaN(verseNum)) {
        continue;
      }

      imageCounts.set(verseNum, (imageCounts.get(verseNum) ?? 0) + 1);
      parsedImages.push({ verse: verseNum, image });
    }

    const entries = await Promise.all(
      parsedImages
        .sort((a, b) => {
          if (a.verse !== b.verse) {
            return a.verse - b.verse;
          }
          return b.image.createdAt - a.image.createdAt;
        })
        .map(async ({ verse, image }, index, allImages) => {
          let imageUrl = image.imageUrl;
          if (image.storageId) {
            imageUrl = (await ctx.storage.getUrl(image.storageId)) ?? imageUrl;
          }

          const previous = allImages[index - 1];
          const isLatest = !previous || previous.verse !== verse;

          return {
            verse,
            imageCount: imageCounts.get(verse) ?? 0,
            imageId: image._id,
            imageUrl,
            model: image.model,
            artStyle: artStyleOf(image),
            createdAt: image.createdAt,
            isLatest,
          };
        })
    );

    return entries;
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

type BookSlug = (typeof ALL_BOOK_SLUGS)[number];

async function findBooksWithImages(ctx: QueryCtx, filter: StyleFilter | null = null): Promise<BookSlug[]> {
  const checks = await Promise.all(
    ALL_BOOK_SLUGS.map(async (slug) => {
      const exists = await existsInVerseRange(ctx, `${slug}-`, filter);
      return exists ? slug : null;
    })
  );

  return checks.filter((slug): slug is BookSlug => slug !== null);
}

/**
 * Get all book slugs that have at least one image.
 * Used for showing image indicators in the book menu.
 *
 * Performance: Uses parallel prefix scans on the by_verse index instead of
 * a full table scan. Each book check uses the index to find just one record.
 */
export const getBooksWithImages = query({
  args: { ...styleFilterArgs },
  handler: async (ctx, args) => {
    return findBooksWithImages(ctx, normalizeStyleFilter(args));
  },
});

/**
 * Get all chapter numbers that have at least one image for a given book.
 * Used for showing image indicators in the book menu chapter grid.
 */
export const getChaptersWithImages = query({
  args: {
    book: v.string(),
    ...styleFilterArgs,
  },
  handler: async (ctx, args) => {
    const prefix = `${args.book.toLowerCase()}-`;

    // Use prefix range on by_verse index
    const images = await onlyVisible(ctx, await withStyleFilter(ctx.db
      .query("verseImages")
      .withIndex("by_verse", (q) =>
        q.gte("verseId", prefix).lt("verseId", `${prefix}~`)
      ), normalizeStyleFilter(args))
      .collect());

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
 * Public API index data.
 * Exposes only bounded summary information for the public image API.
 */
export const getPublicApiIndex = query({
  args: {
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);

    const books = await findBooksWithImages(ctx);
    return {
      books,
      booksWithImagesCount: books.length,
    };
  },
});

/**
 * Public API discovery query for books with images.
 */
export const getPublicBooksWithImages = query({
  args: {
    serverSecret: v.string(),
    artStyle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    return findBooksWithImages(ctx, normalizeStyleFilter(args));
  },
});

/**
 * Public API discovery query for chapters within a book that have images.
 */
export const getPublicChaptersWithImages = query({
  args: {
    book: v.string(),
    chapterCount: v.number(),
    serverSecret: v.string(),
    artStyle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const filter = normalizeStyleFilter(args);
    const MAX_CHAPTERS = 150;
    if (
      !Number.isInteger(args.chapterCount) ||
      args.chapterCount < 1 ||
      args.chapterCount > MAX_CHAPTERS
    ) {
      throw new Error(`chapterCount must be an integer between 1 and ${MAX_CHAPTERS}`);
    }

    const checks = await Promise.all(
      Array.from({ length: args.chapterCount }, async (_, index) => {
        const chapter = index + 1;
        const exists = await existsInVerseRange(ctx, `${args.book.toLowerCase()}-${chapter}-`, filter);
        return exists ? chapter : null;
      })
    );

    return checks.filter((chapter): chapter is number => chapter !== null);
  },
});

/**
 * Public API latest image lookup for a single verse.
 */
export const getPublicVerseLatestImage = query({
  args: {
    verseId: v.string(),
    serverSecret: v.string(),
    artStyle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);

    const image = await withStyleFilter(ctx.db
      .query("verseImages")
      .withIndex("by_verse", (q) => q.eq("verseId", args.verseId))
      .order("desc"), normalizeStyleFilter(args))
      .first();

    if (!image) return null;

    return toPublicImageRecord(image);
  },
});

/**
 * Public API paginated image history for a verse.
 */
export const listPublicVerseImagesPaginated = query({
  args: {
    verseId: v.string(),
    paginationOpts: paginationOptsValidator,
    serverSecret: v.string(),
    artStyle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);

    const page = await withStyleFilter(ctx.db
      .query("verseImages")
      .withIndex("by_verse", (q) => q.eq("verseId", args.verseId))
      .order("desc"), normalizeStyleFilter(args))
      .paginate(args.paginationOpts);

    const images = page.page.map((image) => toPublicImageRecord(image));

    return {
      page: images,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Public API chapter lookup using one indexed latest-image fetch per verse.
 */
export const getPublicChapterLatestImages = query({
  args: {
    verseIds: v.array(v.string()),
    serverSecret: v.string(),
    artStyle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const filter = normalizeStyleFilter(args);
    const MAX_VERSES = 200;
    if (args.verseIds.length > MAX_VERSES) {
      throw new Error(`verseIds array cannot exceed ${MAX_VERSES} items`);
    }

    const results = await Promise.all(
      args.verseIds.map(async (verseId) => {
        const image = await withStyleFilter(ctx.db
          .query("verseImages")
          .withIndex("by_verse", (q) => q.eq("verseId", verseId))
          .order("desc"), filter)
          .first();

        if (!image) {
          return null;
        }

        return {
          verseId,
          image: toPublicImageRecord(image),
        };
      })
    );

    return results.filter((result): result is NonNullable<typeof result> => result !== null);
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
    ...styleFilterArgs,
  },
  handler: async (ctx, args) => {
    const query = withStyleFilter(ctx.db
      .query("verseImages")
      .withIndex("by_verse", (q) => q.eq("verseId", args.verseId))
      .order("desc"), normalizeStyleFilter(args));

    const found = args.limit
      ? await query.take(args.limit)
      : await query.collect();
    const visible = await visibleImageFilter(ctx);
    const shown = await Promise.all(found.map(visible));
    const images = found.filter((_, index) => shown[index]);

    // Resolve storage URLs (fallback to stored imageUrl if storage object is unavailable)
    const results = await Promise.all(
      images.map(async (image) => {
        let imageUrl = image.imageUrl;
        if (image.storageId) {
          imageUrl =
            (await ctx.storage.getUrl(image.storageId)) ??
            imageUrl;
        }
        return {
          id: image._id,
          imageUrl,
          model: image.model,
          prompt: image.prompt,
          reference: image.reference,
          verseText: image.verseText,
          generationNumber: image.generationNumber,
          promptVersion: image.promptVersion,
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
          ...imageSourceFields(image),
        };
      })
    );

    return results.filter((r) => r.imageUrl);
  },
});

/** Everything the owner needs to review one saved image: its source, style, provenance and URL. Server-only. */
/** The base of public image links, for owner tools whose Convex URL is a custom domain that serves no HTTP actions. */
export const getPublicImageBase = query({
  args: { serverSecret: v.string() },
  handler: async (_ctx, args) => {
    validateServerSecret(args.serverSecret);
    return getPublicStorageImageBaseUrl();
  },
});

export const getImageProvenance = query({
  args: { serverSecret: v.string(), imageId: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const id = ctx.db.normalizeId("verseImages", args.imageId);
    const image = id ? await ctx.db.get(id) : null;
    if (!image) return null;
    const imageUrl = image.storageId ? (await ctx.storage.getUrl(image.storageId)) ?? image.imageUrl ?? null : image.imageUrl ?? null;
    return {
      id: image._id, verseId: image.verseId, reference: image.reference, verseText: image.verseText, translationId: image.translationId, model: image.model, promptVersion: image.promptVersion,
      createdAt: image.createdAt, imageUrl, ...imageSourceFields(image), provenance: image.provenance ?? null,
    };
  },
});

/**
 * Get status for a single image generation request.
 * This is intentionally minimal for safe client-side polling/subscription.
 */
export const getGenerationRequestStatus = query({
  args: {
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const guest = await authenticatedGuest(ctx);
    if (!guest) return null;
    const request = await ctx.db
      .query("imageGenerationRequests")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request || request.sid !== guest.sid) return null;

    return {
      requestId: request.requestId,
      status: request.status,
      error: request.error,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
      durationMs: request.durationMs,
    };
  },
});

async function existingIntentResult(
  ctx: QueryCtx,
  existing: Doc<"imageGenerationRequests">,
  args: { requestId: string; sid: string; inputFingerprint: string }
) {
  if (existing.sid !== args.sid || existing.inputFingerprint !== args.inputFingerprint) {
    return { requestId: args.requestId, status: "failed" as const, alreadyExists: true, conflict: true };
  }
  const generationId = existing.generationId;
  const image = generationId ? await ctx.db.query("verseImages")
    .withIndex("by_generationId", (q) => q.eq("generationId", generationId)).first() : null;
  return {
    requestId: existing.requestId, status: existing.status, alreadyExists: true,
    generationId: existing.generationId, error: existing.error,
    // The engine the request was accepted with: a replay never switches engines or reprices.
    engine: existing.engine ?? ("legacy" as const), artStyleId: existing.artStyleId, engineCommitments: existing.engineCommitments,
    ...(image ? { savedImage: {
      id: image._id, imageUrl: image.storageId ? await ctx.storage.getUrl(image.storageId) : image.imageUrl ?? null,
      model: image.model, creditsCost: image.creditsCost, durationMs: image.durationMs,
      reference: image.reference, translationId: image.translationId, verseText: image.verseText, promptInputs: image.promptInputs,
    } } : {}),
  };
}

/** Authenticated HTTP retry lookup; performed before external catalog/Scripture reads. */
export const getGenerationIntent = query({
  args: { requestId: v.string(), sid: v.string(), inputFingerprint: v.string(), serverSecret: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const existing = await ctx.db.query("imageGenerationRequests")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId)).first();
    return existing ? existingIntentResult(ctx, existing, args) : null;
  },
});

/**
 * Secure action to create a generation request record.
 */
export const createGenerationRequest = mutation({
  args: {
    requestId: v.string(),
    inputFingerprint: v.string(),
    generationId: v.string(),
    executorVersion: v.literal("next-image-v1"),
    // "accepted-maximum-v1" (#60): the hold is the accepted maximum and the charge never passes it. Requests admitted
    // earlier keep "legacy-image-v1".
    billingPolicyVersion: v.union(v.literal("legacy-image-v1"), v.literal("accepted-maximum-v1")),
    quoteId: v.optional(v.string()),
    maximumCreditsCost: v.optional(v.number()),
    engine: v.optional(v.union(v.literal("legacy"), v.literal("generic"))),
    artStyleId: v.optional(v.string()),
    engineCommitments: v.optional(v.object({
      workId: v.string(), momentId: v.string(), briefVersion: v.string(), analysisGeneration: v.number(), promptVersion: v.string(), billingVersion: v.string(),
    })),
    sid: v.string(),
    verseId: v.string(),
    translationId: v.optional(v.string()),
    reference: v.optional(v.string()),
    modelId: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    promptVersion: v.optional(v.string()),
    estimatedCreditsCost: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args): Promise<{
    requestId: string;
    status: "queued" | "planning" | "generating" | "succeeded" | "failed";
    alreadyExists: boolean;
    conflict?: boolean;
    generationId?: string;
    engine?: "legacy" | "generic";
    artStyleId?: string;
    engineCommitments?: { workId: string; momentId: string; briefVersion: string; analysisGeneration: number; promptVersion: string; billingVersion: string };
    error?: string;
    savedImage?: { id: Id<"verseImages">; imageUrl: string | null; model: string; creditsCost?: number; durationMs?: number; reference?: string; translationId?: string; verseText?: string; promptInputs?: Doc<"verseImages">["promptInputs"] };
  }> => {
    validateServerSecret(args.serverSecret);
    const existing = await ctx.db
      .query("imageGenerationRequests")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .first();

    if (existing) return existingIntentResult(ctx, existing, args);
    if (args.engine === "generic" && !args.engineCommitments) {
      throw new Error("A generic-engine request must carry its commitments before it is accepted");
    }

    const now = Date.now();
    const engine = args.engine ?? "legacy";
    await ctx.db.insert("imageGenerationRequests", {
      requestId: args.requestId,
      inputFingerprint: args.inputFingerprint,
      generationId: args.generationId,
      executorVersion: args.executorVersion,
      billingPolicyVersion: args.billingPolicyVersion,
      engine,
      artStyleId: args.artStyleId,
      engineCommitments: args.engineCommitments,
      sid: args.sid,
      verseId: args.verseId,
      translationId: args.translationId,
      reference: args.reference,
      modelId: args.modelId,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      status: "queued",
      promptVersion: args.promptVersion,
      estimatedCreditsCost: args.estimatedCreditsCost,
      estimatedCostUsd: args.estimatedCostUsd,
      quoteId: args.quoteId,
      maximumCreditsCost: args.maximumCreditsCost,
      createdAt: now,
      updatedAt: now,
    });

    return { requestId: args.requestId, generationId: args.generationId, status: "queued", alreadyExists: false, engine, artStyleId: args.artStyleId, engineCommitments: args.engineCommitments };
  },
});

/**
 * Secure action to update generation request lifecycle state.
 */
export const updateGenerationRequest = mutation({
  args: {
    requestId: v.string(),
    status: generationStatusValidator,
    error: v.optional(v.string()),
    generationId: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    usedFallbackEstimate: v.optional(v.boolean()),
    renderingPacket: v.optional(renderingPacketValidator),
    actualCreditsCost: v.optional(v.number()),
    actualCostUsd: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    validateServerSecret(args.serverSecret);
    const request = await ctx.db
      .query("imageGenerationRequests")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      return { success: false, error: "Request not found" };
    }

    if (request.status === "succeeded" || request.status === "failed") {
      return { success: request.status === args.status, ...(request.status !== args.status ? { error: "Request is terminal" } : {}) };
    }
    if (args.generationId && request.generationId && args.generationId !== request.generationId) {
      return { success: false, error: "Billing identity is immutable" };
    }
    const transitions = {
      queued: ["queued", "planning", "generating", "failed"],
      planning: ["planning", "generating", "failed"],
      generating: ["generating", "succeeded", "failed"],
    };
    if (!transitions[request.status].includes(args.status)) {
      return { success: false, error: "Invalid request transition" };
    }
    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.error !== undefined) patch.error = args.error;
    if (args.generationId !== undefined) patch.generationId = args.generationId;
    if (args.providerRequestId !== undefined) patch.providerRequestId = args.providerRequestId;
    if (args.usedFallbackEstimate !== undefined) patch.usedFallbackEstimate = args.usedFallbackEstimate;
    if (args.renderingPacket !== undefined) patch.renderingPacket = args.renderingPacket;
    if (args.actualCreditsCost !== undefined) patch.actualCreditsCost = args.actualCreditsCost;
    if (args.actualCostUsd !== undefined) patch.actualCostUsd = args.actualCostUsd;
    if (args.durationMs !== undefined) patch.durationMs = args.durationMs;

    if (args.status === "planning" || args.status === "generating") {
      patch.startedAt = request.startedAt ?? now;
    }
    if (args.status === "succeeded" || args.status === "failed") {
      patch.completedAt = now;
      if (patch.durationMs === undefined && request.startedAt) {
        patch.durationMs = now - request.startedAt;
      }
    }

    await ctx.db.patch(request._id, patch);
    return { success: true };
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
    generationNumber: v.optional(v.number()),
    promptVersion: v.optional(v.string()),
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
    engine: v.optional(v.union(v.literal("legacy"), v.literal("generic"))),
    provenance: v.optional(imageProvenanceValidator),
    artStyleId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.generationId) {
      const existing = await ctx.db.query("verseImages")
        .withIndex("by_generationId", (q) => q.eq("generationId", args.generationId)).first();
      if (existing) {
        // A losing concurrent upload is disposable only when no image references it.
        if (existing.storageId !== args.storageId) {
          const referenced = await ctx.db.query("verseImages")
            .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId)).first();
          if (!referenced) await ctx.storage.delete(args.storageId);
        }
        return existing._id;
      }
    }
    if (!await ctx.db.system.get(args.storageId)) throw new Error("Image blob not found");
    const id = await ctx.db.insert("verseImages", {
      verseId: args.verseId,
      storageId: args.storageId,
      model: args.model,
      prompt: args.prompt,
      reference: args.reference,
      verseText: args.verseText,
      generationNumber: args.generationNumber,
      promptVersion: args.promptVersion,
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
      engine: args.engine,
      provenance: args.provenance,
      artStyleId: args.artStyleId,
      createdAt: Date.now(),
    });
    return id;
  },
});

/**
 * Internal query to get an image by ID.
 * Used for idempotency checks (e.g., Nostr publication).
 */
export const getImageById = internalQuery({
  args: {
    imageId: v.id("verseImages"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.imageId);
  },
});

/**
 * Public mutation to record that an image was displayed to a visitor.
 * Used for ranking scheduled Nostr posts.
 *
 * This intentionally keeps the server-side signal lightweight: the UI only
 * records one impression per displayed persisted image during a page lifetime,
 * and the mutation trusts that client-side dedupe rather than maintaining
 * per-visitor server state. The count is used as a soft ranking hint for
 * scheduled Nostr publishing, not as a security-sensitive metric.
 */
export const recordImageImpression = mutation({
  args: {
    imageId: v.id("verseImages"),
  },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (!image) {
      return { success: false };
    }

    await ctx.db.patch(args.imageId, {
      impressionCount: (image.impressionCount ?? 0) + 1,
      lastImpressionAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Internal mutation to record a published Nostr event.
 */
export const recordNostrPublication = internalMutation({
  args: {
    imageId: v.id("verseImages"),
    eventId: v.string(),
    relays: v.array(v.string()),
    publishedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.imageId, {
      nostrEventId: args.eventId,
      nostrPublishedAt: args.publishedAt,
      nostrRelays: args.relays,
    });
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
  // Standard base64, padding only at the end (or omitted): anything else would decode to bytes
  // the sender never sent.
  const padded = cleaned.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(cleaned);
  const unpadded = (cleaned.length % 4 === 2 || cleaned.length % 4 === 3) && /^[A-Za-z0-9+/]+$/.test(cleaned);
  if (cleaned.length === 0 || !(padded || unpadded)) {
    throw new ImageValidationError("Invalid base64 image data");
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

const readUint32LEAt = (bytes: Uint8Array, offset: number) =>
  offset + 4 <= bytes.length ? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0 : null;

/** PNG: IHDR first, compressed image data in IDAT, every chunk inside the data, ending in IEND. */
const isCompletePng = (bytes: Uint8Array) => {
  let offset = 8;
  let first = true;
  let dataBytes = 0;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    if (length === null) return false;
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    if (first && (type !== "IHDR" || length !== 13)) return false;
    first = false;
    // Single IDAT chunks may be empty, but the image's compressed stream may not.
    if (type === "IDAT") dataBytes += length;
    if (type === "IEND") return dataBytes > 0;
    offset = end;
  }
  return false;
};

/**
 * JPEG: every marker segment fits, at least one scan, and the walk reaches an end-of-image
 * marker. Entropy-coded data after each scan header runs to the next marker that is neither a
 * stuffed 0xFF00 nor a restart; later segments (tables, comments, further scans) are skipped by
 * their declared lengths, so bytes inside them are never mistaken for the end.
 */
const isCompleteJpeg = (bytes: Uint8Array) => {
  let offset = 2;
  let sawScan = false;
  let entropyBytes = 0;
  while (offset + 2 <= bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd9) return sawScan && entropyBytes > 0;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
    const length = readUint16BE(bytes, offset + 2);
    if (length === null || length < 2 || offset + 2 + length > bytes.length) return false;
    offset += 2 + length;
    if (marker !== 0xda) continue;
    sawScan = true;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; entropyBytes += 1; continue; }
      if (offset + 1 >= bytes.length) return false;
      const next = bytes[offset + 1];
      if (next === 0x00) { offset += 2; entropyBytes += 1; continue; }
      if (next >= 0xd0 && next <= 0xd7) { offset += 2; continue; }
      if (next === 0xff) { offset += 1; continue; }
      break;
    }
  }
  return false;
};

/** GIF: every block inside the data, at least one image, ending in the trailer. */
const isCompleteGif = (bytes: Uint8Array) => {
  if (!matchesAscii(bytes, 0, "GIF87a") && !matchesAscii(bytes, 0, "GIF89a")) return false;
  if (bytes.length < 14) return false;
  let offset = 13;
  if (bytes[10] & 0x80) offset += 3 * 2 ** ((bytes[10] & 0x07) + 1);
  const skipSubBlocks = (at: number) => {
    let position = at;
    while (position < bytes.length) {
      const size = bytes[position];
      position += 1;
      if (size === 0) return position;
      position += size;
    }
    return -1;
  };
  let sawImage = false;
  while (offset < bytes.length) {
    const introducer = bytes[offset];
    if (introducer === 0x3b) return sawImage;
    if (introducer === 0x21) {
      offset = skipSubBlocks(offset + 2);
    } else if (introducer === 0x2c) {
      if (offset + 10 > bytes.length) return false;
      const packed = bytes[offset + 9];
      offset += 10;
      if (packed & 0x80) offset += 3 * 2 ** ((packed & 0x07) + 1);
      offset = skipSubBlocks(offset + 1);
      sawImage = true;
    } else {
      return false;
    }
    if (offset < 0) return false;
  }
  return false;
};

/** Whether a VP8 or VP8L chunk carries an encoded image header, not just its name. */
const isWebpImageChunk = (bytes: Uint8Array, type: string, start: number, size: number) => {
  if (type === "VP8 ") return size >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 0x01 && bytes[start + 5] === 0x2a;
  if (type === "VP8L") return size >= 5 && bytes[start] === 0x2f;
  return false;
};

/**
 * Walks padded RIFF chunks from `from` to exactly `to`; null when one overruns, else whether an
 * encoded image was found. Frames are walked one level deep: a frame inside a frame is invalid.
 */
const walkWebpChunks = (bytes: Uint8Array, from: number, to: number, insideFrame = false): boolean | null => {
  let offset = from;
  let sawImage = false;
  while (offset + 8 <= to) {
    const type = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = readUint32LEAt(bytes, offset + 4);
    if (size === null) return null;
    const start = offset + 8;
    const next = start + size + (size % 2);
    if (next > to) return null;
    if (isWebpImageChunk(bytes, type, start, size)) sawImage = true;
    // An animation frame holds its image in nested chunks after a 16-byte frame header.
    if (type === "ANMF") {
      if (insideFrame || size < 16) return null;
      const nested = walkWebpChunks(bytes, start + 16, start + size, true);
      if (nested === null) return null;
      if (nested) sawImage = true;
    }
    offset = next;
  }
  return offset === to ? sawImage : null;
};

/** WebP: the RIFF size fits the data, its padded chunks fill it exactly, and one holds an encoded image. */
const isCompleteWebp = (bytes: Uint8Array) => {
  const riffSize = readUint32LEAt(bytes, 4);
  if (riffSize === null || riffSize < 4 || riffSize + 8 > bytes.length) return false;
  return walkWebpChunks(bytes, 12, riffSize + 8) === true;
};

/** Whether the bytes hold a whole image of the declared type, not just its header (#80). */
const isCompleteImage = (bytes: Uint8Array, mimeType: string) => {
  if (mimeType === "image/png") return isCompletePng(bytes);
  if (mimeType === "image/jpeg") return isCompleteJpeg(bytes);
  if (mimeType === "image/gif") return isCompleteGif(bytes);
  if (mimeType === "image/webp") return isCompleteWebp(bytes);
  return false;
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
 * Action to save an image from the bytes returned with the provider response (a base64 data
 * URL). The bytes must be a readable image of the declared type; they are stored in Convex
 * storage before the record is written. Remote URLs and invalid data are refused with nothing saved.
 */
export const saveImage = action({
  args: {
    verseId: v.string(),
    imageUrl: v.string(),
    model: v.string(),
    prompt: v.optional(v.string()),
    reference: v.optional(v.string()),
    verseText: v.optional(v.string()),
    generationNumber: v.optional(v.number()),
    promptVersion: v.optional(v.string()),
    translationId: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    creditsCost: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    aspectRatio: v.optional(v.string()),
    generationId: v.optional(v.string()),
    engine: v.optional(v.union(v.literal("legacy"), v.literal("generic"))),
    provenance: v.optional(imageProvenanceValidator),
    artStyleId: v.optional(v.string()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true; type: string; id: Id<"verseImages"> }> => {
    const {
      verseId,
      imageUrl,
      model,
      prompt,
      reference,
      verseText,
      generationNumber,
      promptVersion,
      translationId,
      provider,
      providerRequestId,
      creditsCost,
      costUsd,
      durationMs,
      aspectRatio,
      generationId,
      engine,
      provenance,
      artStyleId,
      serverSecret,
    } = args;
    validateServerSecret(serverSecret);

    const resolvedProvider = provider ?? deriveProvider(model);
    const baseMetadata = {
      prompt,
      reference,
      verseText,
      generationNumber,
      promptVersion,
      translationId,
      provider: resolvedProvider,
      providerRequestId,
      creditsCost,
      costUsd,
      durationMs,
      aspectRatio,
      engine,
      provenance,
      artStyleId,
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

    // Only image bytes returned with the response are stored. Convex's runtime cannot resolve a
    // remote URL's destination, so fetching one could not be kept off private or rebound
    // addresses; such output is refused here rather than saved as a link that later expires.
    if (!imageUrl.startsWith("data:")) {
      throw new ImageValidationError("Only image data returned with the response can be stored; remote image URLs are refused");
    }

    // Parse the data URL
    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new ImageValidationError("Invalid data URL format");
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const maxBase64Length = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4;
    if (base64Data.length > maxBase64Length) {
      throw new ImageValidationError(
        `Image data URL exceeds ${MAX_IMAGE_BYTES} byte limit`
      );
    }

    // Decode base64 without relying on atob/Buffer (not available in Convex).
    const bytes = decodeBase64ToBytes(base64Data);
    const normalizedMimeType = normalizeMimeType(mimeType);
    assertAllowedMimeType(normalizedMimeType);
    assertByteSizeWithinLimit(bytes.length, "data URL");
    // The declared type's parser must read the bytes, and the file must be whole, so a mislabelled,
    // non-image or truncated payload is refused.
    const dimensions = getImageDimensions(bytes, normalizedMimeType);
    if (!dimensions || !isCompleteImage(bytes, normalizedMimeType ?? "")) {
      throw new ImageValidationError(`Image data is not a readable ${normalizedMimeType}`);
    }
    const imageMetadata = {
      ...baseMetadata,
      sourceImageUrl: undefined,
      imageMimeType: normalizedMimeType,
      imageSizeBytes: bytes.length,
      imageWidth: dimensions.width,
      imageHeight: dimensions.height,
    };

    // Create a blob and upload to storage
    const blob = new Blob([bytes], { type: normalizedMimeType });
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
  },
});
