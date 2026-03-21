import {
  buildPublicImageRecord,
  buildPublicVerseHistoryUrl,
  buildPublicVersePageUrl,
  buildPublicVerseReference,
  createPublicApiContext,
  enforcePublicRateLimit,
  getPublicApiServices,
  getPublicChapterLocation,
  handlePublicApiFailure,
  jsonPublic,
  jsonPublicError,
  publicApiOptionsResponse,
  PUBLIC_CONTENT_CACHE_CONTROL,
  queryPublicChapterLatestImages,
  serviceUnavailableResponse,
} from "@/lib/public-image-api";

interface ChapterRouteProps {
  params: Promise<{ book: string; chapter: string }>;
}

export async function GET(request: Request, { params }: ChapterRouteProps) {
  const route = "/api/public/images/chapters/[book]/[chapter]";
  const context = createPublicApiContext(request, route);
  const { book: bookSlug, chapter: chapterValue } = await params;
  const location = getPublicChapterLocation(bookSlug, chapterValue);

  if (!location) {
    return jsonPublicError("Not found", {
      status: 404,
      message: "Unknown chapter.",
      cacheControl: PUBLIC_CONTENT_CACHE_CONTROL,
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
      endpoint: "public-images-chapter",
      convex,
      serverSecret,
      context,
    });
    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    const verseIds = Array.from({ length: location.book.chapters[location.chapter - 1] }, (_, index) =>
      `${location.book.slug}-${location.chapter}-${index + 1}`
    );
    const chapterImages = await queryPublicChapterLatestImages(convex, serverSecret, verseIds);
    const byVerseId = new Map(chapterImages.map((entry) => [entry.verseId, entry.image]));

    const verses = verseIds
      .map((verseId, index) => {
        const verseNumber = index + 1;
        const verseLocation = {
          book: location.book,
          chapter: location.chapter,
          verse: verseNumber,
        };
        const image = byVerseId.get(verseId);
        if (!image) return null;
        const pageUrl = buildPublicVersePageUrl(request, verseLocation);

        return {
          verse: verseNumber,
          reference: buildPublicVerseReference(verseLocation),
          pageUrl,
          historyUrl: buildPublicVerseHistoryUrl(request, verseLocation),
          image: buildPublicImageRecord(image, pageUrl),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.image !== null);

    return jsonPublic(
      {
        book: location.book.slug,
        bookName: location.book.name,
        chapter: location.chapter,
        referencePrefix: `${location.book.name} ${location.chapter}`,
        verses,
      },
      { cacheControl: PUBLIC_CONTENT_CACHE_CONTROL }
    );
  } catch (error) {
    return handlePublicApiFailure({
      context,
      stage: "public_chapter_latest_images",
      error,
    });
  }
}

export function OPTIONS() {
  return publicApiOptionsResponse();
}
