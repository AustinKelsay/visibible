import {
  buildPublicChapterUrl,
  createPublicApiContext,
  enforcePublicRateLimit,
  getPublicApiServices,
  getPublicBook,
  handlePublicApiFailure,
  jsonPublic,
  jsonPublicError,
  publicApiOptionsResponse,
  PUBLIC_DISCOVERY_CACHE_CONTROL,
  queryPublicChaptersWithImages,
  serviceUnavailableResponse,
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
    return jsonPublicError("Not found", {
      status: 404,
      message: "Unknown book.",
      cacheControl: PUBLIC_DISCOVERY_CACHE_CONTROL,
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
      book.chapters.length
    );

    return jsonPublic(
      {
        book: book.slug,
        name: book.name,
        chapters,
        hrefTemplate: buildPublicChapterUrl(request, book.slug, 0).replace(/\/0$/, "/{chapter}"),
      },
      { cacheControl: PUBLIC_DISCOVERY_CACHE_CONTROL }
    );
  } catch (error) {
    return handlePublicApiFailure({
      context,
      stage: "public_book_chapters",
      error,
    });
  }
}

export function OPTIONS() {
  return publicApiOptionsResponse();
}
