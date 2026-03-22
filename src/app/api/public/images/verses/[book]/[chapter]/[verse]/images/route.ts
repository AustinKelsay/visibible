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
  trackPublicApiRequest,
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
    trackPublicApiRequest({
      context,
      endpoint: "public-images-history",
      statusCode: 404,
      outcome: "not_found",
    });
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
    trackPublicApiRequest({
      context,
      endpoint: "public-images-history",
      statusCode: 400,
      outcome: "error",
    });
    return jsonPublicError("Bad request", {
      status: 400,
      message: queryParse.error.issues[0]?.message || "Invalid query parameters.",
      cacheControl: "no-store",
    });
  }

  const { convex, serverSecret } = await getPublicApiServices();
  if (!convex || !serverSecret) {
    return serviceUnavailableResponse({
      context,
      endpoint: "public-images-history",
    });
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
    const payload = {
      verse: versePayload,
      images: result.page.map((image) => buildPublicImageRecord(image, versePayload.pageUrl)),
      pageInfo: {
        nextCursor: result.isDone ? null : result.continueCursor,
        hasMore: !result.isDone,
      },
    };

    trackPublicApiRequest({
      context,
      endpoint: "public-images-history",
      statusCode: 200,
      outcome: "success",
    });

    return jsonPublic(payload, { cacheControl: PUBLIC_CONTENT_CACHE_CONTROL });
  } catch (error) {
    return handlePublicApiFailure({
      context,
      endpoint: "public-images-history",
      stage: "public_verse_history",
      error,
    });
  }
}

export function OPTIONS() {
  return publicApiOptionsResponse();
}
