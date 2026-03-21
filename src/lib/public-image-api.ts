import { NextResponse } from "next/server";
import { z } from "zod";
import { BOOK_BY_SLUG, type BibleBook } from "@/data/bible-structure";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { getClientIp, hashIp } from "@/lib/session";
import {
  createRequestObservabilityContext,
  emitMetric,
  logApiFailure,
  logWarn,
  type RequestObservabilityContext,
} from "@/lib/observability";
import { api } from "../../convex/_generated/api";

export const PUBLIC_DISCOVERY_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";
export const PUBLIC_CONTENT_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

export const publicImageHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).optional(),
});

export interface PublicVerseLocation {
  book: BibleBook;
  chapter: number;
  verse: number;
}

type PublicImageRecordInput = {
  id: string;
  imageUrl?: string | null;
  reference?: string | null;
  model?: string | null;
  translationId?: string | null;
  aspectRatio?: string | null;
  imageMimeType?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  createdAt?: number | null;
  [key: string]: unknown;
};

type PublicApiResponseOptions = {
  status?: number;
  cacheControl?: string;
};

type PublicApiErrorResponseOptions = PublicApiResponseOptions & {
  message?: string;
  retryAfter?: number;
};

type PublicRateLimitEndpoint =
  | "public-images-discovery"
  | "public-images-verse"
  | "public-images-history"
  | "public-images-chapter";

type ConvexLikeClient = NonNullable<ReturnType<typeof getConvexClient>>;

export async function queryPublicApiIndex(convex: ConvexLikeClient, serverSecret: string) {
  return convex.query(api.verseImages.getPublicApiIndex, { serverSecret });
}

export async function queryPublicBooksWithImages(convex: ConvexLikeClient, serverSecret: string) {
  return convex.query(api.verseImages.getPublicBooksWithImages, { serverSecret });
}

export async function queryPublicChaptersWithImages(
  convex: ConvexLikeClient,
  serverSecret: string,
  book: string,
  chapterCount: number
) {
  return convex.query(api.verseImages.getPublicChaptersWithImages, {
    book,
    chapterCount,
    serverSecret,
  });
}

export async function queryPublicVerseLatestImage(
  convex: ConvexLikeClient,
  serverSecret: string,
  verseId: string
) {
  return convex.query(api.verseImages.getPublicVerseLatestImage, {
    verseId,
    serverSecret,
  });
}

export async function queryPublicVerseImagesPaginated(
  convex: ConvexLikeClient,
  serverSecret: string,
  verseId: string,
  cursor: string | null,
  limit: number
) {
  return convex.query(api.verseImages.listPublicVerseImagesPaginated, {
    verseId,
    paginationOpts: {
      cursor,
      numItems: limit,
    },
    serverSecret,
  });
}

export async function queryPublicChapterLatestImages(
  convex: ConvexLikeClient,
  serverSecret: string,
  verseIds: string[]
) {
  return convex.query(api.verseImages.getPublicChapterLatestImages, {
    verseIds,
    serverSecret,
  });
}

export function getPublicBook(bookSlug: string): BibleBook | null {
  return BOOK_BY_SLUG[bookSlug.toLowerCase()] ?? null;
}

export function getPublicVerseLocation(
  bookSlug: string,
  chapterValue: string,
  verseValue: string
): PublicVerseLocation | null {
  const book = getPublicBook(bookSlug);
  if (!book) return null;

  const chapter = Number.parseInt(chapterValue, 10);
  const verse = Number.parseInt(verseValue, 10);
  if (!Number.isInteger(chapter) || !Number.isInteger(verse)) return null;
  if (chapter < 1 || chapter > book.chapters.length) return null;
  if (verse < 1 || verse > book.chapters[chapter - 1]) return null;

  return { book, chapter, verse };
}

export function getPublicChapterLocation(
  bookSlug: string,
  chapterValue: string
): { book: BibleBook; chapter: number } | null {
  const book = getPublicBook(bookSlug);
  if (!book) return null;

  const chapter = Number.parseInt(chapterValue, 10);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters.length) {
    return null;
  }

  return { book, chapter };
}

export function buildPublicVerseReference(location: PublicVerseLocation): string {
  return `${location.book.name} ${location.chapter}:${location.verse}`;
}

export function buildPublicVersePageUrl(
  request: Request,
  location: Pick<PublicVerseLocation, "book" | "chapter" | "verse">
): string {
  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
  return `${appBaseUrl}/${location.book.slug}/${location.chapter}/${location.verse}`;
}

export function buildPublicVerseHistoryUrl(
  request: Request,
  location: Pick<PublicVerseLocation, "book" | "chapter" | "verse">
): string {
  const apiBaseUrl = new URL(request.url).origin;
  return `${apiBaseUrl}/api/public/images/verses/${location.book.slug}/${location.chapter}/${location.verse}/images`;
}

export function buildPublicChapterUrl(
  request: Request,
  bookSlug: string,
  chapter: number
): string {
  return `${new URL(request.url).origin}/api/public/images/chapters/${bookSlug}/${chapter}`;
}

export function buildPublicBookChaptersUrl(request: Request, bookSlug: string): string {
  return `${new URL(request.url).origin}/api/public/images/books/${bookSlug}/chapters`;
}

export function buildPublicImageRecord(
  record: PublicImageRecordInput,
  pageUrl: string
): {
  id: string;
  imageUrl: string;
  reference?: string;
  pageUrl: string;
  model?: string;
  translationId?: string;
  aspectRatio?: string;
  imageMimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  createdAt?: number;
} | null {
  if (!record.imageUrl) {
    return null;
  }

  const publicImage: {
    id: string;
    imageUrl: string;
    reference?: string;
    pageUrl: string;
    model?: string;
    translationId?: string;
    aspectRatio?: string;
    imageMimeType?: string;
    imageWidth?: number;
    imageHeight?: number;
    createdAt?: number;
  } = {
    id: record.id,
    imageUrl: record.imageUrl,
    pageUrl,
  };

  if (record.reference) publicImage.reference = record.reference;
  if (record.model) publicImage.model = record.model;
  if (record.translationId) publicImage.translationId = record.translationId;
  if (record.aspectRatio) publicImage.aspectRatio = record.aspectRatio;
  if (record.imageMimeType) publicImage.imageMimeType = record.imageMimeType;
  if (typeof record.imageWidth === "number") publicImage.imageWidth = record.imageWidth;
  if (typeof record.imageHeight === "number") publicImage.imageHeight = record.imageHeight;
  if (typeof record.createdAt === "number") publicImage.createdAt = record.createdAt;

  return publicImage;
}

export function buildPublicVersePayload(
  request: Request,
  location: PublicVerseLocation
): {
  book: string;
  bookName: string;
  chapter: number;
  verse: number;
  reference: string;
  pageUrl: string;
  historyUrl: string;
} {
  return {
    book: location.book.slug,
    bookName: location.book.name,
    chapter: location.chapter,
    verse: location.verse,
    reference: buildPublicVerseReference(location),
    pageUrl: buildPublicVersePageUrl(request, location),
    historyUrl: buildPublicVerseHistoryUrl(request, location),
  };
}

export function createPublicApiContext(request: Request, route: string): RequestObservabilityContext {
  return createRequestObservabilityContext(request, route);
}

export async function getPublicApiServices(): Promise<{
  convex: ConvexLikeClient | null;
  serverSecret: string | null;
}> {
  const convex = getConvexClient();
  if (!convex) {
    return { convex: null, serverSecret: null };
  }

  try {
    return {
      convex,
      serverSecret: getConvexServerSecret(),
    };
  } catch {
    return { convex: null, serverSecret: null };
  }
}

export function jsonPublic<T>(
  data: T,
  options: PublicApiResponseOptions = {}
): NextResponse<{ data: T }> {
  return withPublicApiHeaders(
    NextResponse.json({ data }, { status: options.status ?? 200 }),
    options.cacheControl
  );
}

export function jsonPublicError(
  error: string,
  options: PublicApiErrorResponseOptions
): NextResponse<{ error: string; message?: string }> {
  const response = NextResponse.json(
    {
      error,
      ...(options.message ? { message: options.message } : {}),
    },
    { status: options.status ?? 500 }
  );

  if (options.retryAfter !== undefined) {
    response.headers.set("Retry-After", String(options.retryAfter));
  }

  return withPublicApiHeaders(response, options.cacheControl);
}

export function publicApiOptionsResponse(cacheControl = "public, max-age=300"): NextResponse {
  return withPublicApiHeaders(new NextResponse(null, { status: 204 }), cacheControl);
}

export function withPublicApiHeaders<T extends Response>(response: T, cacheControl?: string): T {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Request-Id");
  if (cacheControl) {
    response.headers.set("Cache-Control", cacheControl);
  }
  return response;
}

export async function enforcePublicRateLimit(args: {
  request: Request;
  route: string;
  endpoint: PublicRateLimitEndpoint;
  convex: ConvexLikeClient;
  serverSecret: string;
  context: RequestObservabilityContext;
}): Promise<
  | { allowed: true }
  | { allowed: false; response: NextResponse<{ error: string; message?: string }> }
> {
  const ipHash = await hashIp(getClientIp(args.request));
  const rateLimitResult = await args.convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: ipHash,
    endpoint: args.endpoint,
    serverSecret: args.serverSecret,
  });

  if (rateLimitResult.allowed) {
    return { allowed: true };
  }

  emitMetric("api_rate_limit_blocks_total", {
    route: args.route,
    endpoint: args.endpoint,
  });
  logWarn("api.rate_limited", {
    route: args.route,
    requestId: args.context.requestId,
    retryAfter: rateLimitResult.retryAfter,
  });

  return {
    allowed: false,
    response: jsonPublicError("Rate limit exceeded", {
      status: 429,
      message: "Too many public image API requests. Please try again later.",
      retryAfter: rateLimitResult.retryAfter,
      cacheControl: "no-store",
    }),
  };
}

export function serviceUnavailableResponse(): NextResponse<{ error: string; message?: string }> {
  return jsonPublicError("Service unavailable", {
    status: 503,
    message: "Public image API is temporarily unavailable.",
    cacheControl: "no-store",
  });
}

export function handlePublicApiFailure(args: {
  context: RequestObservabilityContext;
  stage: string;
  error: unknown;
}): NextResponse<{ error: string; message?: string }> {
  logApiFailure({
    context: args.context,
    stage: args.stage,
    error: args.error,
    statusCode: 500,
  });

  return jsonPublicError("Internal server error", {
    status: 500,
    message: "Failed to serve the public image API request.",
    cacheControl: "no-store",
  });
}
