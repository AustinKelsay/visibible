import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockPublicImage = {
  id: string;
  imageUrl?: string | null;
  reference?: string;
  model?: string;
  translationId?: string;
  aspectRatio?: string;
  imageMimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  createdAt?: number;
  prompt?: string;
  costUsd?: number;
};

type MockPaginatedImages = {
  page: MockPublicImage[];
  continueCursor: string;
  isDone: boolean;
};

type MockChapterImage = {
  verseId: string;
  image: MockPublicImage;
};

type MockState = {
  apiIndex: { booksWithImagesCount: number; books: string[] };
  books: string[];
  chapters: number[];
  latestImage: MockPublicImage | null;
  paginatedImages: MockPaginatedImages;
  chapterImages: MockChapterImage[];
  discoveryResponses: unknown[];
  rateLimitByEndpoint: Record<string, { allowed: boolean; retryAfter?: number }>;
  callHistory: Array<{ method: string; action: string; args: unknown }>;
};

function createMockLatestImage(): MockPublicImage {
  return {
    id: "image-1",
    imageUrl: "https://actions.example.com/image/storage-1",
    reference: "Genesis 1:1",
    model: "google/gemini-2.5-flash-image",
    translationId: "web",
    aspectRatio: "16:9",
    imageMimeType: "image/png",
    imageWidth: 1024,
    imageHeight: 768,
    createdAt: 123456789,
    prompt: "should not leak",
    costUsd: 0.42,
  };
}

const mockState: MockState = {
  apiIndex: { booksWithImagesCount: 2, books: ["genesis", "john"] },
  books: ["genesis", "john"],
  chapters: [1, 3],
  latestImage: createMockLatestImage(),
  paginatedImages: {
    page: [createMockLatestImage()],
    continueCursor: "next-cursor",
    isDone: false,
  },
  chapterImages: [
    {
      verseId: "genesis-1-1",
      image: {
        id: "image-1",
        imageUrl: "https://actions.example.com/image/storage-1",
        reference: "Genesis 1:1",
        model: "google/gemini-2.5-flash-image",
        translationId: "web",
        aspectRatio: "16:9",
        imageMimeType: "image/png",
        imageWidth: 1024,
        imageHeight: 768,
        createdAt: 123456789,
      },
    },
    {
      verseId: "genesis-1-3",
      image: {
        id: "image-3",
        imageUrl: "https://actions.example.com/image/storage-3",
        reference: "Genesis 1:3",
        model: "google/gemini-2.5-flash-image",
        translationId: "web",
        aspectRatio: "4:3",
        imageMimeType: "image/webp",
        imageWidth: 800,
        imageHeight: 600,
        createdAt: 123456999,
      },
    },
  ],
  discoveryResponses: [] as unknown[],
  rateLimitByEndpoint: {} as Record<string, { allowed: boolean; retryAfter?: number }>,
  callHistory: [] as Array<{ method: string; action: string; args: unknown }>,
};

const mockConvex = {
  query: vi.fn(async (apiPath: { _path: string }, args: Record<string, unknown>) => {
    mockState.callHistory.push({ method: "query", action: apiPath._path, args });

    if ("verseIds" in args) {
      return mockState.chapterImages;
    }

    if ("verseId" in args && "paginationOpts" in args) {
      return mockState.paginatedImages;
    }

    if ("verseId" in args) {
      return mockState.latestImage;
    }

    if ("book" in args && "chapterCount" in args) {
      return mockState.chapters;
    }

    if (Object.keys(args).length === 1 && "serverSecret" in args) {
      return mockState.discoveryResponses.shift() ?? null;
    }

    return null;
  }),
  mutation: vi.fn(async (apiPath: { _path: string }, args: Record<string, unknown>) => {
    mockState.callHistory.push({ method: "mutation", action: apiPath._path, args });
    const endpoint = String(args.endpoint);
    return mockState.rateLimitByEndpoint[endpoint] ?? { allowed: true, retryAfter: 0 };
  }),
};

vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => mockConvex),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

vi.mock("@/lib/session", () => ({
  getClientIp: vi.fn(() => "203.0.113.5"),
  hashIp: vi.fn(async () => "hashed-public-ip"),
}));

describe("public image API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.apiIndex = { booksWithImagesCount: 2, books: ["genesis", "john"] };
    mockState.books = ["genesis", "john"];
    mockState.chapters = [1, 3];
    mockState.latestImage = createMockLatestImage();
    mockState.paginatedImages = {
      page: [createMockLatestImage()],
      continueCursor: "next-cursor",
      isDone: false,
    };
    mockState.chapterImages = [
      {
        verseId: "genesis-1-1",
        image: {
          id: "image-1",
          imageUrl: "https://actions.example.com/image/storage-1",
          reference: "Genesis 1:1",
          model: "google/gemini-2.5-flash-image",
          translationId: "web",
          aspectRatio: "16:9",
          imageMimeType: "image/png",
          imageWidth: 1024,
          imageHeight: 768,
          createdAt: 123456789,
        },
      },
      {
        verseId: "genesis-1-3",
        image: {
          id: "image-3",
          imageUrl: "https://actions.example.com/image/storage-3",
          reference: "Genesis 1:3",
          model: "google/gemini-2.5-flash-image",
          translationId: "web",
          aspectRatio: "4:3",
          imageMimeType: "image/webp",
          imageWidth: 800,
          imageHeight: 600,
          createdAt: 123456999,
        },
      },
    ];
    mockState.discoveryResponses = [];
    mockState.rateLimitByEndpoint = {};
    mockState.callHistory = [];
    process.env.NEXT_PUBLIC_APP_URL = "https://visibible.com";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns CORS headers for OPTIONS requests", async () => {
    const { OPTIONS } = await import("../../public/images/route");
    const response = OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
  });

  it("returns the public API index with discovery metadata", async () => {
    mockState.discoveryResponses = [mockState.apiIndex];
    const { GET } = await import("../../public/images/route");
    const response = await GET(
      new Request("http://localhost:3000/api/public/images", { method: "GET" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=3600"
    );
    const body = await response.json();
    expect(body.data.version).toBe("v1");
    expect(body.data.booksWithImagesCount).toBe(2);
  });

  it("returns discovery data for books and chapters", async () => {
    mockState.discoveryResponses = [mockState.books];
    const booksRoute = await import("../../public/images/books/route");
    const chaptersRoute = await import("../../public/images/books/[book]/chapters/route");

    const booksResponse = await booksRoute.GET(
      new Request("http://localhost:3000/api/public/images/books", { method: "GET" })
    );
    expect(booksResponse.status).toBe(200);
    const booksBody = await booksResponse.json();
    expect(booksBody.data.books).toEqual([
      {
        book: "genesis",
        name: "Genesis",
        testament: "old",
        href: "http://localhost:3000/api/public/images/books/genesis/chapters",
      },
      {
        book: "john",
        name: "John",
        testament: "new",
        href: "http://localhost:3000/api/public/images/books/john/chapters",
      },
    ]);

    const chaptersResponse = await chaptersRoute.GET(
      new Request("http://localhost:3000/api/public/images/books/genesis/chapters", {
        method: "GET",
      }),
      { params: Promise.resolve({ book: "genesis" }) }
    );
    expect(chaptersResponse.status).toBe(200);
    const chaptersBody = await chaptersResponse.json();
    expect(chaptersBody.data.chapters).toEqual([1, 3]);
    expect(chaptersBody.data.hrefTemplate).toBe(
      "http://localhost:3000/api/public/images/chapters/genesis/{chapter}"
    );
  });

  it("returns 404 for invalid verse locations", async () => {
    const { GET } = await import("../../public/images/verses/[book]/[chapter]/[verse]/route");
    const response = await GET(
      new Request("http://localhost:3000/api/public/images/verses/genesis/1/999", {
        method: "GET",
      }),
      { params: Promise.resolve({ book: "genesis", chapter: "1", verse: "999" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Not found",
      message: "Unknown verse.",
    });
  });

  it("returns the latest public image for a verse without leaking private fields", async () => {
    const { GET } = await import("../../public/images/verses/[book]/[chapter]/[verse]/route");
    const response = await GET(
      new Request("http://localhost:3000/api/public/images/verses/genesis/1/1", {
        method: "GET",
      }),
      { params: Promise.resolve({ book: "genesis", chapter: "1", verse: "1" }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300"
    );
    const body = await response.json();
    expect(body.data.verse.reference).toBe("Genesis 1:1");
    expect(body.data.image).toEqual({
      id: "image-1",
      imageUrl: "https://actions.example.com/image/storage-1",
      reference: "Genesis 1:1",
      pageUrl: "https://visibible.com/genesis/1/1",
      model: "google/gemini-2.5-flash-image",
      translationId: "web",
      aspectRatio: "16:9",
      imageMimeType: "image/png",
      imageWidth: 1024,
      imageHeight: 768,
      createdAt: 123456789,
    });
    expect(body.data.image).not.toHaveProperty("prompt");
    expect(body.data.image).not.toHaveProperty("costUsd");
  });

  it("returns 404 when a verse has no saved image", async () => {
    mockState.latestImage = null;
    const { GET } = await import("../../public/images/verses/[book]/[chapter]/[verse]/route");
    const response = await GET(
      new Request("http://localhost:3000/api/public/images/verses/genesis/1/1", {
        method: "GET",
      }),
      { params: Promise.resolve({ book: "genesis", chapter: "1", verse: "1" }) }
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Not found");
    expect(body.message).toContain("No saved image");
  });

  it("returns 500 when latest-image projection fails", async () => {
    mockState.latestImage = {
      id: "image-broken",
      reference: "Genesis 1:1",
      model: "google/gemini-2.5-flash-image",
    };
    const { GET } = await import("../../public/images/verses/[book]/[chapter]/[verse]/route");
    const response = await GET(
      new Request("http://localhost:3000/api/public/images/verses/genesis/1/1", {
        method: "GET",
      }),
      { params: Promise.resolve({ book: "genesis", chapter: "1", verse: "1" }) }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      message: "Failed to serve the public image API request.",
    });
  });

  it("forwards pagination limit and cursor to Convex", async () => {
    const { GET } = await import(
      "../../public/images/verses/[book]/[chapter]/[verse]/images/route"
    );
    const response = await GET(
      new Request(
        "http://localhost:3000/api/public/images/verses/genesis/1/1/images?limit=5&cursor=abc123",
        { method: "GET" }
      ),
      { params: Promise.resolve({ book: "genesis", chapter: "1", verse: "1" }) }
    );

    expect(response.status).toBe(200);
    const queryCall = mockState.callHistory.find(
      (call) =>
        call.method === "query" &&
        typeof call.args === "object" &&
        call.args !== null &&
        "paginationOpts" in call.args
    );
    expect(queryCall).toBeDefined();
    expect(queryCall?.args).toMatchObject({
      verseId: "genesis-1-1",
      paginationOpts: {
        cursor: "abc123",
        numItems: 5,
      },
    });

    const body = await response.json();
    expect(body.data.pageInfo).toEqual({
      nextCursor: "next-cursor",
      hasMore: true,
    });
  });

  it("returns 500 when paginated history contains an unprojectable image", async () => {
    mockState.paginatedImages = {
      page: [{ id: "image-broken", reference: "Genesis 1:1" }],
      continueCursor: "next-cursor",
      isDone: false,
    };
    const { GET } = await import(
      "../../public/images/verses/[book]/[chapter]/[verse]/images/route"
    );
    const response = await GET(
      new Request(
        "http://localhost:3000/api/public/images/verses/genesis/1/1/images?limit=5",
        { method: "GET" }
      ),
      { params: Promise.resolve({ book: "genesis", chapter: "1", verse: "1" }) }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      message: "Failed to serve the public image API request.",
    });
  });

  it("returns latest images per verse for chapter view", async () => {
    const { GET } = await import("../../public/images/chapters/[book]/[chapter]/route");
    const response = await GET(
      new Request("http://localhost:3000/api/public/images/chapters/genesis/1", {
        method: "GET",
      }),
      { params: Promise.resolve({ book: "genesis", chapter: "1" }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.referencePrefix).toBe("Genesis 1");
    expect(body.data.verses).toHaveLength(2);
    expect(body.data.verses[0]).toMatchObject({
      verse: 1,
      reference: "Genesis 1:1",
      historyUrl: "http://localhost:3000/api/public/images/verses/genesis/1/1/images",
    });
    expect(body.data.verses[1]).toMatchObject({
      verse: 3,
      reference: "Genesis 1:3",
    });
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    mockState.rateLimitByEndpoint["public-images-discovery"] = {
      allowed: false,
      retryAfter: 27,
    };
    const { GET } = await import("../../public/images/books/route");
    const response = await GET(
      new Request("http://localhost:3000/api/public/images/books", { method: "GET" })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("27");
    const body = await response.json();
    expect(body.error).toBe("Rate limit exceeded");
  });
});
