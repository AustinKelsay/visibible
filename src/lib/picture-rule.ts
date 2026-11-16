/**
 * Which picture a spread shows (spec #434): the newest saved picture in the chosen art style; otherwise the newest in
 * another style the reader may see, taking styles in the work's style-set order; otherwise the verse is unpainted.
 *
 * This module holds the client half, the style order. The database half, `newestPictureInStyles` in
 * convex/verseImages.ts, takes the newest picture in the first of these styles that has one; every read that chooses
 * a picture (the spread, its prefetch, the verse marks, Contents tiles, the unpainted glow) passes the same order, from
 * `usePictureStyles()` in src/context/work-scope-context.tsx. The server also drops owner-only styles for anyone but
 * an admin, so a public reader is never shown one whatever the client sends.
 */
import bibleBrief from "../../works/bible-web/brief.json";
import { PUBLIC_GENERIC_STYLE_IDS } from "@/lib/engine/admission";

/** The Bible's style set, in its brief's order. */
export const BIBLE_STYLE_SET: readonly string[] = Object.freeze([...bibleBrief.styleIds]);

/**
 * The styles a reader may see, in the style set's order: the public styles, and owner-only styles too for an admin.
 * Look offers these, and the picture menu lists other styles' pictures from them.
 */
export function visibleArtStyles(styleSet: readonly string[], isAdmin: boolean): string[] {
  return styleSet.filter((id) => isAdmin || PUBLIC_GENERIC_STYLE_IDS.includes(id));
}

/** The order a verse's picture is looked for in: the chosen style first, then the other visible styles in order. */
export function pictureStyleOrder(chosen: string, visible: readonly string[] = []): string[] {
  return [chosen, ...visible.filter((id) => id !== chosen)];
}
