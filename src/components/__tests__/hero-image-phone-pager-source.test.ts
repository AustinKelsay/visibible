import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("HeroImage phone pager placement", () => {
  // Source-level contract, like the other hero-image source tests: rendering HeroImage needs the
  // full session, generation and Convex stack.
  const source = readFileSync(path.resolve(process.cwd(), "src/components/hero-image.tsx"), "utf8");

  it("moves one pager under the painting while an error or generation shows", () => {
    expect(source).toContain("const showPhonePager = showControls && totalImages > 1;");
    expect(source).toContain("const phonePagerBelow = isGenerating || Boolean(error) || showPhonePricingNote;");
    // One element whose classes change, so keyboard focus survives the move
    expect(source.match(/\{phonePager\}/g)).toHaveLength(1);
    expect(source).toContain('? "sm:hidden flex justify-center bg-[var(--image-stage)] py-2"');
    expect(source).toContain(': "sm:hidden absolute inset-x-0 bottom-3 z-20 flex justify-center"');
  });

  it("tells phone readers why generation is off when a saved image is showing", () => {
    expect(source).toContain("const showPhonePricingNote = Boolean(pricingUnavailable) && Boolean(displayImage?.url);");
    expect(source).toContain("{showPhonePricingNote ? (");
    expect(source).toContain('<p className="sm:hidden px-4 py-2 text-center text-xs text-[var(--muted)]">{pricingUnavailable}</p>');
  });
});
