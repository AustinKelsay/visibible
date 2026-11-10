# Removing the full engine's preparation storage (10 November 2026)

The owner chose to give up rollback to the full engine and remove its Convex preparation functions ("let's continue with one and two now"). Before this, production still held what the full engine's lazy preparation made, kept so that promoting `dpl_fVVRrsY5DS3kZvetCpPMRUbiJv6W` would work:

- 165 look and plan rows in `analysisRecords`: Bible 63 looks and 84 plans, Holmes 9 and 9. All were generated except one superseded owner look, and 131 were current. They are archived here in [`looks-and-plans.jsonl`](looks-and-plans.jsonl), one row per line as exported.
- 231 rows in `preparationLedger`, 20 October to 9 November: 140 plan calls, 71 look calls and 20 image checks on Claude Haiku 5.5, $0.1226 in all. They are archived in [`preparation-ledger.jsonl`](preparation-ledger.jsonl).
- No rows in `preparationClaims`.
- `look` and `plan` tallies in the Bible generation's `recordCounts`.

Convex checks stored rows against the schema on every deploy, so the schema cannot stop accepting these rows while any remain. The removal therefore takes two deploys:

1. Ship `convex/retirePreparation.ts`, a one-off internal mutation that deletes the rows above in batches and drops the tallies, then run it once with `npx convex run retirePreparation:run --prod`.
2. Remove the preparation functions (`putDerivedRecord`, `clearRecord`, `claimPreparation`, `releasePreparation`, `recordPreparationSpend`, `getPreparationSpend`, `getPreparationStatus`), the look and plan record kinds, the two preparation tables, `src/lib/engine/situation.ts` and the cleanup itself.

Saved images keep their `lookVersion` and `planVersion` provenance; lean images record `none`.
