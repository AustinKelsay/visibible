/**
 * Which prose works every reader may open. Any other work but the Bible is the owner's preview: its pages, image
 * requests and saved images are for an admin session only. The reader's catalog (src/lib/works/catalog.ts) reads
 * this list, so opening a book is this one change, enforced by Convex and the server alike.
 */
export const BIBLE_WORK_ID = "bible-web";

// Holmes opened on the owner's word, 10 November 2026; Alice stays the owner's preview.
export const PUBLIC_PROSE_WORK_IDS: readonly string[] = Object.freeze(["holmes-adventures"]);

/** True for a saved image or work id that only the owner may see. Images without provenance are Bible images. */
export function isOwnerOnlyWork(workId: string | undefined): boolean {
  return workId !== undefined && workId !== BIBLE_WORK_ID && !PUBLIC_PROSE_WORK_IDS.includes(workId);
}
