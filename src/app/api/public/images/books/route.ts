import { BIBLE_BOOKS } from "@/data/bible-structure";
import {
  buildPublicBookChaptersUrl,
  createPublicApiContext,
  enforcePublicRateLimit,
  getPublicApiServices,
  handlePublicApiFailure,
  jsonPublic,
  jsonPublicError,
  parsePublicStyleFilter,
  publicApiOptionsResponse,
  PUBLIC_DISCOVERY_CACHE_CONTROL,
  queryPublicBooksWithImages,
  serviceUnavailableResponse,
  trackPublicApiRequest,
} from "@/lib/public-image-api";

export async function GET(request: Request) {
  const route = "/api/public/images/books";
  const context = createPublicApiContext(request, route);
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

    const booksWithImages = new Set<string>(await queryPublicBooksWithImages(convex, serverSecret, style.filter));
    const books = BIBLE_BOOKS
      .filter((book) => booksWithImages.has(book.slug))
      .map((book) => ({
        book: book.slug,
        name: book.name,
        testament: book.testament,
        href: buildPublicBookChaptersUrl(request, book.slug),
      }));

    trackPublicApiRequest({
      context,
      endpoint: "public-images-discovery",
      statusCode: 200,
      outcome: "success",
    });

    return jsonPublic({ ...(style.filter.artStyle ? { artStyle: style.filter.artStyle } : {}), books }, { cacheControl: PUBLIC_DISCOVERY_CACHE_CONTROL });
  } catch (error) {
    return handlePublicApiFailure({
      context,
      endpoint: "public-images-discovery",
      stage: "public_books",
      error,
    });
  }
}

export function OPTIONS() {
  return publicApiOptionsResponse();
}
