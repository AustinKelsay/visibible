# Combined rendering review comparison: incomplete at citation validation

The owner approved the quoted **$0.30 evaluation increase / $0.30 single-run cap** by replying “continue” on 25 October 2026. [Funding](funding.json) was committed at `bf34049` before any paid request. The unchanged frozen runner started at 22:46:24 UTC and stopped after **3/92 operations and four model calls**, spending **$0.00148710** with **zero new uncertain usage**, images or production mutations. [Exact start](run-started.json), [finish](run-finished.json), [ledger](ledger.json) and [pre-call commit](frozen-commit.json) are retained.

**The comparison is incomplete and its gate fails.** No cold preparation ran, no scene was stored, none of the seven clean controls ran, and the remaining 89 operations were not executed. There is no measured pipeline acceptance, false-alarm rate, semantic improvement or release-readiness result. A stop on an unavailable review was a predeclared technical rule; it is not permission to resume or replace a case.

## First outcomes

| Operation | Calls | First outcome |
| --- | ---: | --- |
| Look-place baseline v5 | 1 | No problems; misses the look conflict because v5 does not receive the look. |
| Look-place candidate v6 | 1 | Valid `look_conflict` report quoting the conflicting shore look. |
| Look-time candidate v6 | 2 | Both permitted attempts identify night versus midday, but quote serialized JSON syntax; value-only citation validation rejects both. Review becomes unavailable and the run stops. |

The actual time-control replies retain these `planQuote` values:

```text
"timeOfDay":"night"
timeOfDay":"night
```

Both are contiguous text in the serialized look supplied to review. Neither is a substring of the plain field value `night`, which is what `invalidReview` checks. The reasons correctly identify the isolated night-versus-midday conflict. That narrow observation does not turn the unavailable result into a passing control or establish semantic reliability. [Provider requests/replies](provider.ndjson), [request hashes](inputs.ndjson) and [operation results](results.ndjson) remain unchanged, including the existing malformed-review retry.

The offline scripted rehearsal used a plain value citation and therefore did not reproduce this provider output form. The next offline repair should test these exact two replies at the review/preparation seam, accepting only citations supported by one actual input field. It must retain quote/ID checks and bounded refusal, with no fuzzy matching, semantic waiver, source edit or look rewrite. Any subsequent paid comparison needs its own explicit one-shot authorization; this attempt cannot resume.

## Replay, scoring and accounting

`dry-run.mts verify` reproduces the frozen requests and hashes. `audit.mts` replays all four charged replies through the actual pinned baseline/candidate implementations, reproducing all three results and exact usage. The pre-call grant, git/source hashes and operation order remain verified. A second execution was refused at the existing marker before reading a nonexistent credential file; every paid artifact hash stayed unchanged. [Validation](execution-validation.json) retains those hashes.

`blind-packet.json` contains zero stored scenes. The empty `operator-scores.json` explicitly records that no scene was assessed; it is not a masked semantic pass. Packet and scores are committed before the scored audit opens the arm key. The final tally retains 30 incomplete pairs and zero completed pipeline operations; its planned-denominator intervals are not empirical acceptance estimates for this unexecuted cohort. The one-operator/familiarity limitation remains, although there were no scene judgments to mask.

[Budget](budget.json): total evaluation authorization **$17.50**, measured total **$17.05672590**, retained uncertainty **$0.045**, remaining **$0.39827410**. Preparation remains **$39.31319680 / $43** and smoke **$0.31420500 / $1**. Remaining allowance does not authorize another run of this one-shot protocol. Shared account-balance deltas are not used as evaluation cost.

The original frozen protocol, sample, scripts, dry run and offline rehearsal remain unchanged. Their README is the original awaiting-funding proposal; this result and the committed grant supersede that historical status. No prompt tuning, paid rerun, production deployment or activation follows. The earlier text and visual release failures remain outstanding.
