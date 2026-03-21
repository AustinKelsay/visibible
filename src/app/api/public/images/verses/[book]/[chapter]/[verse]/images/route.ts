import {
  buildPublicImageRecord,
  buildPublicVersePayload,
  createPublicApiContext,
  enforcePublicRateLimit,
  getPublicApiServices,
  getPublicVerseLocation,
  handlePublicApiFailure,
  jsonPublic,
  jsonPublicError,
  publicApiOptionsResponse,
  publicImageHistoryQuerySchema,
  PUBLIC_CONTENT_CACHE_CONTROL,
  queryPublicVerseImagesPaginated,
  serviceUnavailableResponse,
} from "@/lib/public-image-api";

interface VerseImagesRouteProps {
  params: Promise<{ book: string; chapter: string; verse: string }>;
}

export async function GET(request: Request, { params }: VerseImagesRouteProps) {
  const route = "/api/public/images/verses/[book]/[chapter]/[verse]/images";
  const context = createPublicApiContext(request, route);
  const { book, chapter, verse } = await params;
  const location = getPublicVerseLocation(book, chapter, verse);

  if (!location) {
    return jsonPublicError("Not found", {
      status: 404,
      message: "Unknown verse.",
      cacheControl: PUBLIC_CONTENT_CACHE_CONTROL,
    });
  }

  const queryParse = publicImageHistoryQuerySchema.safeParse({
    limit: new URL(request.url).searchParams.get("limit") ?? undefined,
    cursor: new URL(request.url).searchParams.get("cursor") ?? undefined,
  });

  if (!queryParse.success) {
    return jsonPublicError("Bad request", {
      status: 400,
      message: queryParse.error.issues[0]?.message || "Invalid query parameters.",
      cacheControl: "no-store",
    });
  }

  const { convex, serverSecret } = await getPublicApiServices();
  if (!convex || !serverSecret) {
    return serviceUnavailableResponse();
  }

  try {
    const rateLimit = await enforcePublicRateLimit({
      request,
      route,
      endpoint: "public-images-history",
      convex,
      serverSecret,
      context,
    });
    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    const verseId = `${location.book.slug}-${location.chapter}-${location.verse}`;
    const result = await queryPublicVerseImagesPaginated(
      convex,
      serverSecret,
      verseId,
      queryParse.data.cursor ?? null,
      queryParse.data.limit
    );
    const versePayload = buildPublicVersePayload(request, location);

    return jsonPublic(
      {
        verse: versePayload,
        images: result.page
          .map((image) => buildPublicImageRecord(image, versePayload.pageUrl))
          .filter((image): image is NonNullable<typeof image> => image !== null),
        pageInfo: {
          nextCursor: result.isDone ? null : result.continueCursor,
          hasMore: !result.isDone,
        },
      },
      { cacheControl: PUBLIC_CONTENT_CACHE_CONTROL }
    );
  } catch (error) {
    return handlePublicApiFailure({
      context,
      stage: "public_verse_history",
      error,
    });
  }
}

export function OPTIONS() {
  return publicApiOptionsResponse();
}
