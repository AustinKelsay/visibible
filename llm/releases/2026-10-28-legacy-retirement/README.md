# Legacy retirement cutoff (#184)

**The cutoff is built and tested, and production is ready for it.** `LEGACY_ENGINE=retired` stops all new legacy admissions while accepted legacy requests keep replaying. It is a production switch: merging the code changes nothing until the switch is set.

## Production inventory before the cutoff

[inventory-before-cutoff.json](inventory-before-cutoff.json) was taken on 28 October from `api.visibible.com` (read-only dry run):

| Engine | In flight | Queued | Bulk items accepted | Succeeded | Failed |
| --- | --- | --- | --- | --- | --- |
| legacy | 0 | 0 | 0 | 166 | 16 |
| generic | 0 | 0 | 0 | 33 | 2 |

There are no bulk jobs and nothing unbound, so there are no cancellation candidates. `readyToRetire.legacy` is true.

## What the cutoff changes

| Situation | Before | After `LEGACY_ENGINE=retired` |
| --- | --- | --- |
| New Classical request, generic engine public | generic | generic (unchanged) |
| Classical scene the generic engine refuses | legacy fallback image | retryable "Preparing scene" decline |
| New Classical request, generic engine disabled or owner-only (non-owner) | legacy | "Art style unavailable", retryable |
| Job item bound to legacy | legacy | refused before any record; the job pauses |
| Replay of an accepted legacy request | saved result | saved result (unchanged) |

## Proof

Tests cover each row:
- `engine-admission.test.ts` covers the decision.
- `credit-flow.test.ts` covers replay after the cutoff, a refused Classical scene with no fallback, and legacy-bound items.
- `image-models/route.test.ts` covers the reader's style list.

With the switch logic removed, the three route and style-list tests fail.

## Next

1. **Turning the cutoff on in production** is an owner decision. It removes the legacy fallback for refused Classical scenes and makes `GENERIC_ENGINE_MODE=disabled` stop all new images.
2. **After a quiet period**, re-run the inventory and remove the legacy route adapter, its Bible-only prompt strings and its plan cache. That is the rest of #184.
