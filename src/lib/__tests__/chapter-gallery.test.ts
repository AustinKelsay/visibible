import { describe, expect, it } from "vitest";
import { buildChapterGalleryItems } from "@/lib/chapter-gallery";

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
          imageUrl: "https://example.com/10.png",
          imageId: "image-10",
          model: "openai/image",
          createdAt: 200,
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
      hasImage: true,
      imageCount: 1,
      imageUrl: "https://example.com/1.png",
    });
    expect(items[1]).toMatchObject({
      verse: 2,
      hasImage: false,
      imageCount: 0,
      imageUrl: undefined,
    });
    expect(items[2]).toMatchObject({
      verse: 10,
      hasImage: true,
      imageCount: 2,
      imageId: "image-10",
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
        imageUrl: undefined,
        imageId: undefined,
        model: undefined,
        createdAt: undefined,
        hasImage: false,
      },
    ]);
  });
});
