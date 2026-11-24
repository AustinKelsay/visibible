/**
 * The request id a bulk item is submitted under. It is stable across resume, so the route replays an admitted request
 * instead of repeating it. `attempt` counts the ids the item has spent on provider outages: such a request ended
 * failed and replays as a failure, so the item's next submission needs a new id. The first id has no suffix, which
 * keeps the ids of items from before attempts existed.
 */
export function bulkItemRequestId(bulkId: string, order: number, attempt = 0): string {
  return attempt > 0 ? `bulk-${bulkId}-${order}-a${attempt}` : `bulk-${bulkId}-${order}`;
}
