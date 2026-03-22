import {
  createPublicApiContext,
  enforcePublicRateLimit,
  getPublicApiServices,
  handlePublicApiFailure,
  jsonPublic,
  publicApiOptionsResponse,
  PUBLIC_DISCOVERY_CACHE_CONTROL,
  queryPublicApiIndex,
  serviceUnavailableResponse,
  trackPublicApiRequest,
} from "@/lib/public-image-api";

export async function GET(request: Request) {
  const route = "/api/public/images";
  const context = createPublicApiContext(request, route);
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

    const index = await queryPublicApiIndex(convex, serverSecret);

    trackPublicApiRequest({
      context,
      endpoint: "public-images-discovery",
      statusCode: 200,
      outcome: "success",
    });

    return jsonPublic(
      {
        version: "v1",
        name: "Visibible Public Image API",
        description: "Read-only public access to already-generated verse images.",
        booksWithImagesCount: index.booksWithImagesCount,
        capabilities: {
          books: true,
          chapters: true,
          verseLatest: true,
          verseHistory: true,
          chapterLatestPerVerse: true,
        },
        links: {
          books: `${new URL(request.url).origin}/api/public/images/books`,
          verseTemplate:
            `${new URL(request.url).origin}/api/public/images/verses/{book}/{chapter}/{verse}`,
          verseHistoryTemplate:
            `${new URL(request.url).origin}/api/public/images/verses/{book}/{chapter}/{verse}/images`,
          chapterTemplate:
            `${new URL(request.url).origin}/api/public/images/chapters/{book}/{chapter}`,
        },
      },
      { cacheControl: PUBLIC_DISCOVERY_CACHE_CONTROL }
    );
  } catch (error) {
    return handlePublicApiFailure({
      context,
      endpoint: "public-images-discovery",
      stage: "public_api_index",
      error,
    });
  }
}

export function OPTIONS() {
  return publicApiOptionsResponse();
}
