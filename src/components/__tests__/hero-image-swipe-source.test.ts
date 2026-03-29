import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("HeroImage swipe handling source checks", () => {
  // Intentional source-level safeguard: these assertions protect the wiring
  // between imageSwipeThresholdPx, handleSwipeStart, and handleSwipeEnd.
  it("keeps stable swipe-navigation wiring and threshold guardrails", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/hero-image.tsx"),
      "utf8"
    );

    expect(source).toContain("imageSwipeThresholdPx = 48");
    expect(source).toContain("Math.abs(deltaX) < imageSwipeThresholdPx");
    expect(source).toContain("onTouchStart={handleSwipeStart}");
    expect(source).toContain('onTouchEnd={(event) => handleSwipeEnd(event, "mobile_overlay")}');
    expect(source).toContain('onTouchEnd={(event) => handleSwipeEnd(event, "fullscreen")}');
  });
});
