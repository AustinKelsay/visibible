import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getClientIp: vi.fn(() => "203.0.113.5"),
  hashIp: vi.fn(async () => "hashed-public-ip"),
}));

vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => null),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));

let buildPublicImageRecord: typeof import("@/lib/public-image-api").buildPublicImageRecord;
let buildPublicChapterUrlTemplate: typeof import("@/lib/public-image-api").buildPublicChapterUrlTemplate;
let getPublicVerseLocation: typeof import("@/lib/public-image-api").getPublicVerseLocation;

beforeAll(async () => {
  const publicImageApi = await import("@/lib/public-image-api");
  buildPublicImageRecord = publicImageApi.buildPublicImageRecord;
  buildPublicChapterUrlTemplate = publicImageApi.buildPublicChapterUrlTemplate;
  getPublicVerseLocation = publicImageApi.getPublicVerseLocation;
});

describe("public image API helpers", () => {
  it("buildPublicImageRecord strips private fields", () => {
    const image = buildPublicImageRecord(
      {
        id: "image-1",
        imageUrl: "https://actions.example.com/image/abc123",
        reference: "Genesis 1:1",
        model: "google/gemini-2.5-flash-image",
        translationId: "web",
        aspectRatio: "16:9",
        imageMimeType: "image/png",
        imageWidth: 1024,
        imageHeight: 768,
        createdAt: 123456789,
        prompt: "private prompt",
        promptInputs: { secret: true },
        creditsCost: 42,
        costUsd: 0.42,
        providerRequestId: "private-id",
        sourceImageUrl: "https://provider.example.com/raw.png",
      },
      "https://visibible.com/genesis/1/1"
    );

    expect(image).toEqual({
      id: "image-1",
      imageUrl: "https://actions.example.com/image/abc123",
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
  });

  it("validates verse locations against bible structure", () => {
    expect(getPublicVerseLocation("genesis", "1", "1")).toMatchObject({
      chapter: 1,
      verse: 1,
    });
    expect(getPublicVerseLocation("genesis", "1", "999")).toBeNull();
    expect(getPublicVerseLocation("unknown", "1", "1")).toBeNull();
  });

  it("throws when a public image record is missing imageUrl", () => {
    expect(() =>
      buildPublicImageRecord(
        {
          id: "image-1",
          reference: "Genesis 1:1",
        },
        "https://visibible.com/genesis/1/1"
      )
    ).toThrow("Public image record is missing imageUrl.");
  });

  it("builds explicit chapter URL templates without regex replacement", () => {
    expect(
      buildPublicChapterUrlTemplate(
        new Request("http://localhost:3000/api/public/images/books/genesis/chapters"),
        "genesis"
      )
    ).toBe("http://localhost:3000/api/public/images/chapters/genesis/{chapter}");
  });
});
