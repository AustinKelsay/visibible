import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("HeroImage impression tracking", () => {
  it("records one Convex impression per displayed persisted image", () => {
    // This intentionally mirrors the repo's existing source-level contract
    // tests for hook wiring. We want to lock in the specific useMutation +
    // ref-dedupe integration without introducing a new RTL/jsdom harness.
    const filePath = path.resolve(process.cwd(), "src/components/hero-image.tsx");
    const source = readFileSync(filePath, "utf8");

    expect(source).toContain(
      "useMutation(\n    api.verseImages.recordImageImpression"
    );
    expect(source).toContain(
      "const trackedImageIdsRef = useRef<Set<Id<\"verseImages\">>>(new Set());"
    );
    expect(source).toContain(
      "trackedImageIdsRef.current.add(currentImage.id);"
    );
    expect(source).toContain(
      "void recordImageImpression({ imageId: currentImage.id }).catch((error) => {"
    );
  });
});
