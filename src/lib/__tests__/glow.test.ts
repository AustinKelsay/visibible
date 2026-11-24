import { describe, expect, it } from "vitest";
import { drawGlow, GLOW_BLUR, GLOW_SHORT_EDGE } from "@/lib/glow";

/** A 2D context that records what is drawn. `filters: false` acts as a browser without canvas filters (Safari before 18). */
function fakeCanvas({ filters = true } = {}) {
  const drawn: unknown[][] = [];
  let filter = "none";
  const context = {
    get filter() { return filter; },
    set filter(value: string) { if (filters) filter = value; },
    drawImage: (...args: unknown[]) => { drawn.push([...args, filter]); },
  };
  const canvas = { width: 300, height: 150, getContext: () => context };
  return { canvas: canvas as unknown as HTMLCanvasElement, drawn };
}

const picture = { naturalWidth: 1376, naturalHeight: 768 } as HTMLImageElement;

describe("drawGlow", () => {
  it("blurs the picture once into the canvas at the thumbnail's size", () => {
    const { canvas, drawn } = fakeCanvas();
    drawGlow(canvas, picture);

    expect(Math.min(canvas.width, canvas.height)).toBe(GLOW_SHORT_EDGE);
    expect(canvas.width).toBe(688);
    expect(drawn).toEqual([[picture, 0, 0, 688, GLOW_SHORT_EDGE, `blur(${GLOW_BLUR}px)`]]);
  });

  it("never enlarges a picture smaller than the thumbnail", () => {
    const { canvas } = fakeCanvas();
    drawGlow(canvas, { naturalWidth: 320, naturalHeight: 180 } as HTMLImageElement);

    expect([canvas.width, canvas.height]).toEqual([320, 180]);
  });

  it("draws a tiny copy, softened by being stretched, where the canvas cannot blur", () => {
    const { canvas, drawn } = fakeCanvas({ filters: false });
    drawGlow(canvas, picture);

    expect(Math.min(canvas.width, canvas.height)).toBeLessThanOrEqual(16);
    expect(drawn).toEqual([[picture, 0, 0, canvas.width, canvas.height, "none"]]);
  });

  it("does nothing without a 2D context or before the picture has a size", () => {
    const { canvas, drawn } = fakeCanvas();
    drawGlow({ ...canvas, getContext: () => null } as unknown as HTMLCanvasElement, picture);
    drawGlow(canvas, { naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement);

    expect(drawn).toEqual([]);
  });
});
