/**
 * Which prose works every reader may open. Any other work but the Bible is the owner's preview: its pages, image
 * requests and saved images are for an admin session only. The reader's catalog (src/lib/works/catalog.ts) reads
 * this list, and Convex and the server both enforce it.
 *
 * visibible.com serves only the Bible to readers. Holmes and Alice are here to verify that the engine and reader work
 * for any work; other books launch on a separate site built from this codebase, which can open them in its own copy.
 */
export const BIBLE_WORK_ID = "bible-web";

export const PUBLIC_PROSE_WORK_IDS: readonly string[] = Object.freeze([]);

/** True for a saved image or work id that only the owner may see. Images without provenance are Bible images. */
export function isOwnerOnlyWork(workId: string | undefined): boolean {
  return workId !== undefined && workId !== BIBLE_WORK_ID && !PUBLIC_PROSE_WORK_IDS.includes(workId);
}
