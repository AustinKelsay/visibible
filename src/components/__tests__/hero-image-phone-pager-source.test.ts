import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("HeroImage phone pager placement", () => {
  // Source-level contract, like the other hero-image source tests: rendering HeroImage needs the
  // full session, generation and Convex stack.
  const source = readFileSync(path.resolve(process.cwd(), "src/components/hero-image.tsx"), "utf8");

  it("keeps image navigation available but off the stage while an error or generation shows", () => {
    expect(source).toContain("const showPhonePager = showControls && totalImages > 1;");
    expect(source).toContain("const phonePagerBelow = isGenerating || Boolean(error);");
    // On the painting only when nothing else is drawn on it
    expect(source).toContain("{showPhonePager && !phonePagerBelow && (");
    // Under the painting, still usable, while Try Again or the progress label is showing
    expect(source).toContain("{showPhonePager && phonePagerBelow && (");
    expect(source.match(/\{phonePager\}/g)).toHaveLength(2);
  });
});
