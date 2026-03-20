import { describe, expect, it } from "vitest";

import { computeImageGenerationProgress } from "../image-generation-progress";

describe("computeImageGenerationProgress", () => {
  it("starts above zero so the bar feels active immediately", () => {
    expect(computeImageGenerationProgress(0, 12)).toBeGreaterThan(0);
  });

  it("increases as time passes", () => {
    const initial = computeImageGenerationProgress(0, 12);
    const mid = computeImageGenerationProgress(4000, 12);
    const later = computeImageGenerationProgress(12000, 12);

    expect(mid).toBeGreaterThan(initial);
    expect(later).toBeGreaterThan(mid);
  });

  it("caps before 100 percent so we do not imply exact backend timing", () => {
    expect(computeImageGenerationProgress(120000, 12)).toBeLessThan(1);
  });
});
