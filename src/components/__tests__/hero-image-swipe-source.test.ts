import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("HeroImage mobile swipe navigation", () => {
  it("wires horizontal touch gestures into the existing image navigation callbacks", () => {
    const filePath = path.resolve(process.cwd(), "src/components/hero-image.tsx");
    const source = readFileSync(filePath, "utf8");

    expect(source).toContain("const imageSwipeThresholdPx = 48;");
    expect(source).toContain("function isInteractiveTouchTarget");
    expect(source).toContain("const handleSwipeStart = useCallback((event: TouchEvent<HTMLDivElement>) => {");
    expect(source).toContain("const handleSwipeEnd = useCallback((");
    expect(source).toContain("Math.abs(deltaX) < imageSwipeThresholdPx || Math.abs(deltaX) <= Math.abs(deltaY)");
    expect(source).toContain("onTouchStart={handleSwipeStart}");
    expect(source).toContain("onTouchEnd={(event) => handleSwipeEnd(event, \"mobile_overlay\")}");
    expect(source).toContain("onTouchEnd={(event) => handleSwipeEnd(event, \"fullscreen\")}");
    expect(source).toContain("goToNextImage(surface);");
    expect(source).toContain("goToPrevImage(surface);");
  });
});
