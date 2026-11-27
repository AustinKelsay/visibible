/**
 * The words page's width on a computer: a share of the window, at least enough for a readable column on a tablet held
 * upright, and up to a limit. The spread sets it as the CSS variable
 * `--words-page-width` that its layout reads, and the moving picture uses the same numbers to stop at the page's edge.
 */
const SHARE_OF_WINDOW = 0.4;
const MIN_WIDTH_PX = 352;
const MAX_WIDTH_PX = 600;

export const WORDS_PAGE_WIDTH_CSS = `min(max(${SHARE_OF_WINDOW * 100}vw, ${MIN_WIDTH_PX}px), ${MAX_WIDTH_PX}px)`;

/** The words page's width in pixels for a window this wide. */
export function wordsPageWidthPx(windowWidth: number): number {
  return Math.min(Math.max(windowWidth * SHARE_OF_WINDOW, MIN_WIDTH_PX), MAX_WIDTH_PX);
}
