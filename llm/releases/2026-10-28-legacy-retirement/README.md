# Legacy retirement cutoff (#184)

**The cutoff is live in production since 28 October 2026, 21:28 UTC** ([deployment record](deployment.json), [inventory after](inventory-after-cutoff.json)). No legacy admission has been logged since, and the legacy request counts are unchanged. `LEGACY_ENGINE=retired` stops all new legacy admissions while accepted legacy requests keep replaying. It is a production switch: merging the code changes nothing until the switch is set.

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

1. **Done:** the owner chose to turn the cutoff on, and it is live. The refused-Classical legacy fallback is gone, and `GENERIC_ENGINE_MODE=disabled` would now stop all new images.
2. **After a quiet period**, re-run the inventory and remove the legacy route adapter, its Bible-only prompt strings and its plan cache. That is the rest of #184.
