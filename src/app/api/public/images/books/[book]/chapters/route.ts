import {
  buildPublicChapterUrlTemplate,
  createPublicApiContext,
  enforcePublicRateLimit,
  getPublicApiServices,
  getPublicBook,
  handlePublicApiFailure,
  jsonPublic,
  jsonPublicError,
  parsePublicStyleFilter,
  publicApiOptionsResponse,
  PUBLIC_DISCOVERY_CACHE_CONTROL,
  queryPublicChaptersWithImages,
  serviceUnavailableResponse,
  trackPublicApiRequest,
} from "@/lib/public-image-api";

interface ChaptersRouteProps {
  params: Promise<{ book: string }>;
}

export async function GET(request: Request, { params }: ChaptersRouteProps) {
  const route = "/api/public/images/books/[book]/chapters";
  const context = createPublicApiContext(request, route);
  const { book: bookSlug } = await params;
  const book = getPublicBook(bookSlug);

  if (!book) {
    trackPublicApiRequest({
      context,
      endpoint: "public-images-discovery",
      statusCode: 404,
      outcome: "not_found",
    });
    return jsonPublicError("Not found", {
      status: 404,
      message: "Unknown book.",
      cacheControl: PUBLIC_DISCOVERY_CACHE_CONTROL,
    });
  }

  const style = parsePublicStyleFilter(request);
  if (!style.ok) {
    trackPublicApiRequest({
      context,
      endpoint: "public-images-discovery",
      statusCode: 400,
      outcome: "error",
    });
    return jsonPublicError("Bad request", {
      status: 400,
      message: style.message,
      cacheControl: "no-store",
    });
  }
  const { convex, serverSecret } = await getPublicApiServices();
  if (!convex || !serverSecret) {
    return serviceUnavailableResponse({
      context,
      endpoint: "public-images-discovery",
    });
  }

  try {
    const rateLimit = await enforcePublicRateLimit({
      request,
      route,
      endpoint: "public-images-discovery",
      convex,
      serverSecret,
      context,
    });
    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    const chapters = await queryPublicChaptersWithImages(
      convex,
      serverSecret,
      book.slug,
      book.chapters.length,
      style.filter
    );

    trackPublicApiRequest({
      context,
      endpoint: "public-images-discovery",
      statusCode: 200,
      outcome: "success",
    });

    return jsonPublic(
      {
        book: book.slug,
        name: book.name,
        ...(style.filter.artStyle ? { artStyle: style.filter.artStyle } : {}),
        chapters,
        hrefTemplate: buildPublicChapterUrlTemplate(request, book.slug),
      },
      { cacheControl: PUBLIC_DISCOVERY_CACHE_CONTROL }
    );
  } catch (error) {
    return handlePublicApiFailure({
      context,
      endpoint: "public-images-discovery",
      stage: "public_book_chapters",
      error,
    });
  }
}

export function OPTIONS() {
  return publicApiOptionsResponse();
}
