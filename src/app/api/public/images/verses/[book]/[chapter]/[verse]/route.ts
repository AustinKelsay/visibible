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
  PUBLIC_CONTENT_CACHE_CONTROL,
  queryPublicVerseLatestImage,
  serviceUnavailableResponse,
  trackPublicApiRequest,
} from "@/lib/public-image-api";

interface VerseRouteProps {
  params: Promise<{ book: string; chapter: string; verse: string }>;
}

export async function GET(request: Request, { params }: VerseRouteProps) {
  const route = "/api/public/images/verses/[book]/[chapter]/[verse]";
  const context = createPublicApiContext(request, route);
  const { book, chapter, verse } = await params;

  const { convex, serverSecret } = await getPublicApiServices();
  if (!convex || !serverSecret) {
    return serviceUnavailableResponse({
      context,
      endpoint: "public-images-verse",
    });
  }

  try {
    const location = getPublicVerseLocation(book, chapter, verse);

    if (!location) {
      trackPublicApiRequest({
        context,
        endpoint: "public-images-verse",
        statusCode: 404,
        outcome: "not_found",
      });
      return jsonPublicError("Not found", {
        status: 404,
        message: "Unknown verse.",
        cacheControl: PUBLIC_CONTENT_CACHE_CONTROL,
      });
    }

    const rateLimit = await enforcePublicRateLimit({
      request,
      route,
      endpoint: "public-images-verse",
      convex,
      serverSecret,
      context,
    });
    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    const verseId = `${location.book.slug}-${location.chapter}-${location.verse}`;
    const latestImage = await queryPublicVerseLatestImage(convex, serverSecret, verseId);

    if (!latestImage) {
      trackPublicApiRequest({
        context,
        endpoint: "public-images-verse",
        statusCode: 404,
        outcome: "not_found",
      });
      return jsonPublicError("Not found", {
        status: 404,
        message: "No saved image exists for that verse yet.",
        cacheControl: PUBLIC_CONTENT_CACHE_CONTROL,
      });
    }

    const versePayload = buildPublicVersePayload(request, location);
    const payload = {
      verse: versePayload,
      image: buildPublicImageRecord(latestImage, versePayload.pageUrl),
    };

    trackPublicApiRequest({
      context,
      endpoint: "public-images-verse",
      statusCode: 200,
      outcome: "success",
    });

    return jsonPublic(payload, { cacheControl: PUBLIC_CONTENT_CACHE_CONTROL });
  } catch (error) {
    return handlePublicApiFailure({
      context,
      endpoint: "public-images-verse",
      stage: "public_verse_latest_image",
      error,
    });
  }
}

export function OPTIONS() {
  return publicApiOptionsResponse();
}
