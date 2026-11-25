import type { VerseLocation } from "@/lib/navigation";
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
  /** Request ids the item has spent on provider outages (see convex/_helpers/bulkRequestId.ts). */
  attempt?: number;
}

export interface BulkCostEstimate {
  totalCredits: number;
  totalUsd: number;
  verseCount: number;
  perVerseCost: number;
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
