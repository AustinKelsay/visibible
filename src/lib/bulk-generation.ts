import type { VerseLocation } from "@/lib/navigation";
import {
  getNextNVerses,
  getVersesInChapterRange,
  getAllVersesInBook,
  formatReference,
  verseLocationToId,
} from "@/lib/navigation";
import { BOOK_BY_SLUG } from "@/data/bible-structure";
import { CREDIT_USD } from "@/lib/image-models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BulkScopeType = "verses" | "chapters" | "book";

export interface BulkScope {
  type: BulkScopeType;
  /** Number of verses (for "verses") or chapters (for "chapters"). Ignored for "book". */
  count: number;
}

export interface BulkQueueItem {
  verseId: string;
  reference: string;
  location?: VerseLocation;
  order: number;
}

export interface BulkCostEstimate {
  totalCredits: number;
  totalUsd: number;
  verseCount: number;
  perVerseCost: number;
}

// ---------------------------------------------------------------------------
// Verse queue building
// ---------------------------------------------------------------------------

/**
 * Build an ordered queue of verses to generate based on scope and current location.
 */
export function buildVerseQueue(
  scope: BulkScope,
  current: VerseLocation
): BulkQueueItem[] {
  let locations: VerseLocation[];

  switch (scope.type) {
    case "verses":
      locations = getNextNVerses(current, scope.count);
      break;

    case "chapters": {
      // From current verse to the end of (current.chapter + count - 1)
      const endChapter = Math.min(
        current.chapter + scope.count - 1,
        current.book.chapters.length
      );
      locations = getVersesInChapterRange(
        current.book.slug,
        current.chapter,
        endChapter,
        current.verse // start after current verse in the first chapter
      );
      break;
    }

    case "book":
      // Book scope intentionally includes the current verse and the full book.
      locations = getAllVersesInBook(current.book.slug);
      break;

    default:
      locations = [];
  }

  return locations.map((loc, index) => ({
    verseId: verseLocationToId(loc),
    reference: formatReference(loc),
    location: loc,
    order: index,
  }));
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the total credit cost for a bulk generation.
 */
export function estimateBulkCost(
  verseCount: number,
  perVerseCost: number
): BulkCostEstimate {
  const totalCredits = Math.ceil(verseCount * perVerseCost);
  return {
    totalCredits,
    totalUsd: +(totalCredits * CREDIT_USD).toFixed(2),
    verseCount,
    perVerseCost,
  };
}

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

/**
 * Get a human-readable label for a bulk scope.
 */
export function scopeLabel(scope: BulkScope, current: VerseLocation): string {
  switch (scope.type) {
    case "verses":
      return `Next ${scope.count} verse${scope.count === 1 ? "" : "s"}`;
    case "chapters":
      return `Next ${scope.count} chapter${scope.count === 1 ? "" : "s"}`;
    case "book":
      return `All of ${current.book.name}`;
    default:
      return "";
  }
}

/**
 * Get the maximum allowed count for a scope type given the current location.
 */
export function getMaxScopeCount(
  scopeType: BulkScopeType,
  current: VerseLocation
): number {
  switch (scopeType) {
    case "verses":
      return 100; // cap at 100 verses per bulk run
    case "chapters": {
      // Remaining chapters in current book (including current)
      return current.book.chapters.length - current.chapter + 1;
    }
    case "book":
      return 1; // always the full book
    default:
      return 1;
  }
}

/**
 * Get the total verse count for a book by slug.
 */
export function getBookVerseCount(bookSlug: string): number {
  const book = BOOK_BY_SLUG[bookSlug.toLowerCase()];
  if (!book) return 0;
  return book.chapters.reduce((sum, v) => sum + v, 0);
}
