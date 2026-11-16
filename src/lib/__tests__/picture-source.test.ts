import { describe, expect, it } from "vitest";
import { previewSource } from "@/lib/picture-source";

describe("previewSource", () => {
  it("prefers a picture's thumbnail and falls back to the full picture when it has none", () => {
    expect(previewSource({ imageUrl: "https://x/full.png", thumbnailUrl: "https://x/thumb.webp" })).toBe("https://x/thumb.webp");
    expect(previewSource({ imageUrl: "https://x/full.png", thumbnailUrl: null })).toBe("https://x/full.png");
    expect(previewSource({ imageUrl: "https://x/full.png" })).toBe("https://x/full.png");
    expect(previewSource({ imageUrl: null, thumbnailUrl: null })).toBeNull();
  });
});
