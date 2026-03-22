import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("HeroImage passive loading treatment", () => {
  it("reserves the progress loader for generation and uses the skeleton for passive image fetches", () => {
    const filePath = path.resolve(process.cwd(), "src/components/hero-image.tsx");
    const source = readFileSync(filePath, "utf8");

    expect(source).toContain(
      "import { ImageLoadingSkeleton } from \"@/components/image-loading-skeleton\";"
    );
    expect(source).toContain("useSearchParams");
    expect(source).toContain("const requestedImageId = searchParams.get(\"image\");");
    expect(source).toContain("!isGenerating && isImageLoading && !error");
    expect(source).toContain("isQueryLoading && !isGenerating && !error");
    expect(source).toContain("label={generationPhaseLabel}");
  });
});
