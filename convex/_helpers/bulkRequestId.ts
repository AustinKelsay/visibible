/**
 * The request id every bulk item is submitted under. The per-job nonce is random and stored with the
 * job, so a guest who learns a bulk id cannot pre-claim its item ids; the id stays stable across
 * resume and retry, so the route replays instead of repeating. Jobs created before the nonce existed
 * keep the original form. Shared by the Convex module and the browser runner; keep it dependency-free.
 */
export function bulkItemRequestId(bulkId: string, order: number, nonce?: string | null) {
  return nonce ? `bulk-${bulkId}-${nonce}-${order}` : `bulk-${bulkId}-${order}`;
}

/** 16 random bytes as hex; the request id limit (80 characters) leaves room for it. */
export function newBulkRequestNonce() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}
