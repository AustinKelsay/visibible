import { describe, expect, it } from "vitest";
import { formatModelId, imageModelDisplayName, shortImageModelName } from "@/lib/image-models";

describe("image model names", () => {
  it("uses the same short names as the settings menu for catalog models", () => {
    expect(imageModelDisplayName("google/gemini-3.1-flash-lite-image")).toBe(
      shortImageModelName("Google: Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)"),
    );
    expect(imageModelDisplayName("google/gemini-3.1-flash-image")).toBe("Nano Banana 2");
    expect(imageModelDisplayName("google/gemini-2.5-flash-image")).toBe("Nano Banana");
  });

  it("falls back to a readable id for unknown models", () => {
    expect(imageModelDisplayName("acme/super-painter-image")).toBe(formatModelId("acme/super-painter-image"));
    expect(imageModelDisplayName("acme/super-painter-image")).toBe("Super Painter");
  });
});
