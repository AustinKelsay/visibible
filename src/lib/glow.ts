/**
 * The glow behind an unpainted verse (#531): the nearest earlier picture, blurred once into a canvas. A live CSS blur
 * this large is redrawn in patches by Firefox whenever something over it moves (the paint progress bar), and each
 * patch comes out a shade different, so the glow showed rectangular seams.
 *
 * The blur is made by shrinking the picture by halves and growing it back by doubles, each step smoothing between
 * neighbouring pixels. Canvas filters would be simpler, but Safari accepts `context.filter` without applying it.
 */

/** The canvas's shorter side, in pixels: the thumbnail's size (THUMBNAIL_SHORT_EDGE), so a thumbnail is never resized. */
export const GLOW_SHORT_EDGE = 384;
/** Halvings (and as many doublings): five, down to 12 pixels, match the softness of the old `blur-3xl`. */
export const GLOW_STEPS = 5;

type Size = { width: number; height: number };

/**
 * Draws the picture, blurred, into the canvas, sizing the canvas to it. `makeCanvas` gives the scratch canvas the steps
 * alternate with. Does nothing before the picture has a size or without a 2D context.
 */
export function drawGlow(
  canvas: HTMLCanvasElement,
  picture: HTMLImageElement,
  makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): void {
  const shortEdge = Math.min(picture.naturalWidth, picture.naturalHeight);
  if (shortEdge <= 0) return;
  const scale = Math.min(1, GLOW_SHORT_EDGE / shortEdge);
  const full: Size = { width: Math.max(1, Math.round(picture.naturalWidth * scale)), height: Math.max(1, Math.round(picture.naturalHeight * scale)) };
  const scratch = makeCanvas();
  canvas.width = scratch.width = full.width;
  canvas.height = scratch.height = full.height;
  const target = canvas.getContext("2d");
  const other = scratch.getContext("2d");
  if (!target || !other) return;
  for (const context of [target, other]) {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
  }

  const sizes: Size[] = [full];
  for (let step = 0; step < GLOW_STEPS; step += 1) {
    const last = sizes[sizes.length - 1];
    sizes.push({ width: Math.max(1, Math.round(last.width / 2)), height: Math.max(1, Math.round(last.height / 2)) });
  }
  // Down to the smallest and back up through the same sizes. An even number of draws ends in the target canvas.
  const path = [...sizes, ...sizes.slice(0, -1).reverse()];
  target.drawImage(picture, 0, 0, full.width, full.height);
  const contexts = [target, other];
  for (let step = 1; step < path.length; step += 1) {
    const from = contexts[(step - 1) % 2];
    const to = contexts[step % 2];
    to.clearRect(0, 0, full.width, full.height);
    to.drawImage(from.canvas, 0, 0, path[step - 1].width, path[step - 1].height, 0, 0, path[step].width, path[step].height);
  }
}
