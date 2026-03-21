import { BIBLE_BOOKS } from "@/data/bible-structure";
import {
  buildPublicBookChaptersUrl,
  createPublicApiContext,
  enforcePublicRateLimit,
  getPublicApiServices,
  handlePublicApiFailure,
  jsonPublic,
  publicApiOptionsResponse,
  PUBLIC_DISCOVERY_CACHE_CONTROL,
  queryPublicBooksWithImages,
  serviceUnavailableResponse,
} from "@/lib/public-image-api";

export async function GET(request: Request) {
  const route = "/api/public/images/books";
  const context = createPublicApiContext(request, route);
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

    const booksWithImages = new Set<string>(await queryPublicBooksWithImages(convex, serverSecret));
    const books = BIBLE_BOOKS
      .filter((book) => booksWithImages.has(book.slug))
      .map((book) => ({
        book: book.slug,
        name: book.name,
        testament: book.testament,
        href: buildPublicBookChaptersUrl(request, book.slug),
      }));

    return jsonPublic({ books }, { cacheControl: PUBLIC_DISCOVERY_CACHE_CONTROL });
  } catch (error) {
    return handlePublicApiFailure({
      context,
      stage: "public_books",
      error,
    });
  }
}

export function OPTIONS() {
  return publicApiOptionsResponse();
}
