import { describe, expect, it } from "vitest";
import { buildChapterGalleryItems, buildFlatChapterGalleryItems } from "@/lib/chapter-gallery";

describe("buildChapterGalleryItems", () => {
  it("returns every verse in chapter order and fills placeholders when images are missing", () => {
    const items = buildChapterGalleryItems({
      book: "genesis",
      chapter: 1,
      verses: [
        { verse: 1, text: "In the beginning" },
        { verse: 2, text: "The earth was formless" },
        { verse: 10, text: "God called the dry land Earth" },
      ],
      galleryImages: [
        {
          verse: 10,
          imageCount: 2,
          imageUrl: "https://example.com/10-latest.png",
          imageId: "image-10-latest",
          model: "openai/image",
          createdAt: 250,
          isLatest: true,
        },
        {
          verse: 10,
          imageCount: 2,
          imageUrl: "https://example.com/10-older.png",
          imageId: "image-10-older",
          model: "openai/image",
          createdAt: 200,
          isLatest: false,
        },
        {
          verse: 1,
          imageCount: 1,
          imageUrl: "https://example.com/1.png",
          imageId: "image-1",
          model: "openai/image",
          createdAt: 100,
        },
      ],
    });

    expect(items.map((item) => item.verse)).toEqual([1, 2, 10]);
    expect(items.map((item) => item.href)).toEqual([
      "/genesis/1/1",
      "/genesis/1/2",
      "/genesis/1/10",
    ]);

    expect(items[0]).toMatchObject({
      verse: 1,
      hasImages: true,
      imageCount: 1,
      cards: [
        {
          imageUrl: "https://example.com/1.png",
          isPlaceholder: false,
          isLatest: true,
        },
      ],
    });
    expect(items[1]).toMatchObject({
      verse: 2,
      hasImages: false,
      imageCount: 0,
      cards: [
        {
          isPlaceholder: true,
        },
      ],
    });
    expect(items[2]).toMatchObject({
      verse: 10,
      hasImages: true,
      imageCount: 2,
      cards: [
        {
          imageId: "image-10-latest",
          isLatest: true,
        },
        {
          imageId: "image-10-older",
          isLatest: false,
        },
      ],
    });
  });

  it("keeps verse text even when Convex returns no gallery images", () => {
    const items = buildChapterGalleryItems({
      book: "john",
      chapter: 3,
      verses: [
        { verse: 16, text: "For God so loved the world" },
      ],
      galleryImages: null,
    });

    expect(items).toEqual([
      {
        verse: 16,
        text: "For God so loved the world",
        href: "/john/3/16",
        imageCount: 0,
        hasImages: false,
        cards: [
          {
            isLatest: false,
            isPlaceholder: true,
          },
        ],
      },
    ]);
  });

  it("flattens grouped verse cards into a default all-images gallery stream", () => {
    const items = buildFlatChapterGalleryItems({
      book: "genesis",
      chapter: 1,
      verses: [
        { verse: 1, text: "In the beginning" },
        { verse: 2, text: "The earth was formless" },
      ],
      galleryImages: [
        {
          verse: 1,
          imageCount: 2,
          imageUrl: "https://example.com/1-latest.png",
          imageId: "image-1-latest",
          model: "openai/image",
          createdAt: 250,
          isLatest: true,
        },
        {
          verse: 1,
          imageCount: 2,
          imageUrl: "https://example.com/1-older.png",
          imageId: "image-1-older",
          model: "openai/image",
          createdAt: 200,
          isLatest: false,
        },
      ],
    });

    expect(items).toMatchObject([
      {
        verse: 1,
        href: "/genesis/1/1",
        cardIndex: 0,
        imageId: "image-1-latest",
        isLatest: true,
        isPlaceholder: false,
      },
      {
        verse: 1,
        href: "/genesis/1/1",
        cardIndex: 1,
        imageId: "image-1-older",
        isLatest: false,
        isPlaceholder: false,
      },
      {
        verse: 2,
        href: "/genesis/1/2",
        cardIndex: 0,
        hasImages: false,
        isPlaceholder: true,
      },
    ]);
  });
});
