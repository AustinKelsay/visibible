/**
 * What the prose reader's pages share: which works the viewer may open, and the book behind a work's pages.
 * A work the viewer may not open, or one without an active analysis, is not found.
 */
import { getConvexClient } from "@/lib/convex-client";
import { canViewProseWork, findProseWork, PROSE_WORKS, type ProseWork } from "./catalog";
import { loadProseBook, type ProseBook } from "./prose-book";
import { isOwnerViewer } from "./viewer";

export const readerPath = (workId: string, momentId?: string) => momentId ? `/read/${workId}/${momentId}` : `/read/${workId}`;

export async function viewableProseWorks(): Promise<{ works: ProseWork[]; isOwner: boolean }> {
  const isOwner = await isOwnerViewer();
  return { works: PROSE_WORKS.filter((work) => canViewProseWork(work, isOwner)), isOwner };
}

/** The book for a page, or null when the page should not be found. */
export async function bookForPage(workId: string): Promise<{ book: ProseBook; ownerPreview: boolean } | null> {
  const work = findProseWork(workId);
  if (!work) return null;
  const isOwner = work.visibility === "public" ? false : await isOwnerViewer();
  if (!canViewProseWork(work, isOwner)) return null;
  const convex = getConvexClient();
  if (!convex) return null;
  const book = await loadProseBook(work, convex);
  return book ? { book, ownerPreview: work.visibility !== "public" } : null;
}
