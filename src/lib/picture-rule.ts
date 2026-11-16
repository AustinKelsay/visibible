/**
 * The art styles a verse's picture is looked for in, in order (spec #434, "Which picture a spread shows"): the chosen
 * style first, then the other styles the reader may see, in the style set's order. The database half,
 * `newestPictureInStyles` in convex/verseImages.ts, takes the newest picture in the first of these styles that has one,
 * and a verse with none is unpainted.
 *
 * `visible` is the style set the reader may see (public styles, plus owner-only styles for an admin). Until Look (#440)
 * supplies it, callers pass nothing and only the chosen style is used.
 */
export function pictureStyleOrder(chosen: string, visible: readonly string[] = []): string[] {
  return [chosen, ...visible.filter((id) => id !== chosen)];
}
