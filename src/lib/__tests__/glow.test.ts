import { describe, expect, it } from "vitest";
import { drawGlow, GLOW_CSS_PIXELS, GLOW_SHORT_EDGE, GLOW_STEPS } from "@/lib/glow";

type Draw = { into: string; source: unknown; to: [number, number] };

/**
 * Canvases whose 2D contexts record each draw: which canvas it lands in, what it reads, and the size it draws at. `area`
 * is the CSS box the on-screen canvas covers (0×0 before layout).
 */
function fakeCanvases(area = { width: 0, height: 0 }) {
  const draws: Draw[] = [];
  const make = (name: string) => {
    const canvas = { name, width: 300, height: 150, clientWidth: area.width, clientHeight: area.height } as unknown as HTMLCanvasElement & { name: string };
    const context = {
      canvas,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      clearRect: () => {},
      drawImage: (source: unknown, ...args: number[]) => {
        draws.push({ into: name, source: (source as { name?: string }).name ?? source, to: [args.at(-2)!, args.at(-1)!] });
      },
    };
    (canvas as unknown as { getContext: () => unknown }).getContext = () => context;
    return { canvas, context };
  };
  const target = make("target");
  const scratch = make("scratch");
  return { target, scratch, draws, makeCanvas: () => scratch.canvas };
}

const picture = { naturalWidth: 1376, naturalHeight: 768 } as HTMLImageElement;

describe("drawGlow", () => {
  it("draws the picture at the thumbnail's size, shrinks it by halves and grows it back into the canvas", () => {
    const { target, scratch, draws, makeCanvas } = fakeCanvases();
    drawGlow(target.canvas, picture, makeCanvas);

    expect([target.canvas.width, target.canvas.height]).toEqual([688, GLOW_SHORT_EDGE]);
    expect([scratch.canvas.width, scratch.canvas.height]).toEqual([688, GLOW_SHORT_EDGE]);
    expect(draws[0]).toEqual({ into: "target", source: picture, to: [688, 384] });
    expect(draws.map((draw) => draw.to)).toEqual([
      [688, 384], [344, 192], [172, 96], [86, 48], [43, 24], [22, 12],
      [43, 24], [86, 48], [172, 96], [344, 192], [688, 384],
    ]);
    expect(draws).toHaveLength(1 + 2 * GLOW_STEPS);
    // Each step reads the canvas the one before drew into, and the last lands in the canvas on screen.
    for (let step = 1; step < draws.length; step += 1) expect(draws[step].source).toBe(draws[step - 1].into);
    expect(draws.at(-1)?.into).toBe("target");
    expect(target.context.imageSmoothingEnabled && scratch.context.imageSmoothingEnabled).toBe(true);
  });

  it("keeps the thumbnail's size over a large screen's picture area", () => {
    const { target, makeCanvas } = fakeCanvases({ width: 1920, height: 1200 });
    drawGlow(target.canvas, picture, makeCanvas);

    expect([target.canvas.width, target.canvas.height]).toEqual([688, GLOW_SHORT_EDGE]);
  });

  it("draws smaller over a phone's picture area, so the same steps blur as much of the screen as before", () => {
    const { target, draws, makeCanvas } = fakeCanvases({ width: 390, height: 390 });
    drawGlow(target.canvas, picture, makeCanvas);

    // The picture covers 390 CSS pixels on its shorter side, so the canvas's shorter side is 390 / GLOW_CSS_PIXELS.
    expect(target.canvas.height).toBe(Math.round(390 / GLOW_CSS_PIXELS));
    expect(target.canvas.width).toBe(Math.round((1376 * 390) / 768 / GLOW_CSS_PIXELS));
    expect(draws.at(-1)?.to).toEqual([target.canvas.width, target.canvas.height]);
  });

  it("never enlarges a picture smaller than the thumbnail", () => {
    const { target, draws, makeCanvas } = fakeCanvases();
    drawGlow(target.canvas, { naturalWidth: 320, naturalHeight: 180 } as HTMLImageElement, makeCanvas);

    expect([target.canvas.width, target.canvas.height]).toEqual([320, 180]);
    expect(draws.at(-1)?.to).toEqual([320, 180]);
  });

  it("does nothing before the picture has a size", () => {
    const { target, draws, makeCanvas } = fakeCanvases();
    drawGlow(target.canvas, { naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement, makeCanvas);

    expect(draws).toEqual([]);
  });
});
