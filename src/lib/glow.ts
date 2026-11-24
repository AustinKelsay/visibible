/**
 * The glow behind an unpainted verse (#531): the nearest earlier picture, blurred once into a canvas. A live CSS blur
 * this large is redrawn in patches by Firefox whenever something over it moves (the paint progress bar), and each
 * patch comes out a shade different, so the glow showed rectangular seams.
 */

/** The canvas's shorter side, in pixels: the thumbnail's size (THUMBNAIL_SHORT_EDGE), so a thumbnail is never resized. */
export const GLOW_SHORT_EDGE = 384;
/** The blur at that size. Stretched to cover a reader's screen, it matches the old `blur-3xl` (64 CSS pixels). */
export const GLOW_BLUR = 24;
/** Where the canvas cannot blur (Safari before 18), the shorter side of a copy small enough that stretching softens it. */
const UNBLURRED_SHORT_EDGE = 12;

/** Draws the picture, blurred, into the canvas, sizing the canvas to it. Does nothing before the picture has a size. */
export function drawGlow(canvas: HTMLCanvasElement, picture: HTMLImageElement): void {
  const context = canvas.getContext("2d");
  const shortEdge = Math.min(picture.naturalWidth, picture.naturalHeight);
  if (!context || shortEdge <= 0) return;
  const blur = `blur(${GLOW_BLUR}px)`;
  context.filter = blur;
  const canBlur = context.filter === blur;
  const scale = Math.min(1, (canBlur ? GLOW_SHORT_EDGE : UNBLURRED_SHORT_EDGE) / shortEdge);
  // Resizing a canvas resets its context, filter included, so the filter is set again after.
  canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
  if (canBlur) context.filter = blur;
  context.drawImage(picture, 0, 0, canvas.width, canvas.height);
}
