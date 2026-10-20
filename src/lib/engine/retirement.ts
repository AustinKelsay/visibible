/**
 * Retirement inventory (#182, spec #165 §9): a dry-run classification of what each engine still
 * owes before legacy execution can be retired. Accepted obligations are requests that were
 * admitted and have not ended, plus bulk items whose request record is accepted; cancellation
 * candidates are bulk items never admitted on jobs the retirement would close. An uncertain paid
 * attempt (a request in flight) is never a cancellation candidate. Nothing here deletes anything.
 */
export type RequestCounts = Record<string, { queued: number; planning: number; generating: number; succeeded: number; failed: number }>;
export type BulkCounts = { byEngine: Record<string, { jobs: number; unstarted: number; accepted: number; succeeded: number; failed: number }>; pausedForEngine: number };

export type RetirementInventory = {
  acceptedObligations: Record<string, { requestsInFlight: number; requestsQueued: number; bulkItemsAccepted: number; total: number }>;
  cancellationCandidates: { engine: string; unstartedBulkItems: number; jobs: number }[];
  uncertain: Record<string, number>;
  readyToRetire: { legacy: boolean; reasons: string[] };
};

const engines = (requests: RequestCounts, bulk: BulkCounts) => [...new Set([...Object.keys(requests), ...Object.keys(bulk.byEngine)])].sort();

export function classifyForRetirement(requests: RequestCounts, bulk: BulkCounts, options: { retiring?: string } = {}): RetirementInventory {
  const retiring = options.retiring ?? "legacy";
  const acceptedObligations: RetirementInventory["acceptedObligations"] = {};
  const uncertain: Record<string, number> = {};
  const cancellationCandidates: RetirementInventory["cancellationCandidates"] = [];
  for (const engine of engines(requests, bulk)) {
    const r = requests[engine] ?? { queued: 0, planning: 0, generating: 0, succeeded: 0, failed: 0 };
    const b = bulk.byEngine[engine] ?? { jobs: 0, unstarted: 0, accepted: 0, succeeded: 0, failed: 0 };
    const requestsInFlight = r.planning + r.generating;
    acceptedObligations[engine] = { requestsInFlight, requestsQueued: r.queued, bulkItemsAccepted: b.accepted, total: requestsInFlight + r.queued + b.accepted };
    uncertain[engine] = r.generating;
    // The retiring engine is always listed; an unbound bucket only when something is actually unbound.
    if (engine === retiring || (engine === "unbound" && (b.jobs > 0 || b.unstarted > 0))) cancellationCandidates.push({ engine, unstartedBulkItems: b.unstarted, jobs: b.jobs });
  }
  const legacy = acceptedObligations[retiring];
  const unbound = acceptedObligations.unbound;
  const reasons: string[] = [];
  if (legacy && legacy.total > 0) reasons.push(`${retiring} still has ${legacy.total} accepted obligation(s) to finish or reconcile`);
  if (unbound && unbound.total > 0) reasons.push(`${unbound.total} obligation(s) are not bound to an engine; run the legacy backfill first`);
  if ((bulk.byEngine.unbound?.jobs ?? 0) > 0) reasons.push(`${bulk.byEngine.unbound.jobs} bulk job(s) are not bound to an engine; run bindLegacyJobs`);
  return { acceptedObligations, cancellationCandidates, uncertain, readyToRetire: { legacy: reasons.length === 0, reasons } };
}
