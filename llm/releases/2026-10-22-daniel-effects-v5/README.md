# Daniel v5 effect-input evaluation — 2026-10-22

One live Haiku 5.5 plan using the effect-name projection from [#244](https://github.com/AustinKelsay/visibible/pull/244) passed narrow agent text inspection for no-form depiction and fixed-appearance separation. It did not copy the four fixed canon effect phrases. However, it also described visible attendants without a matching cast entry or selected canon. The first structurally valid result is retained as **`hold-unlisted-attendants`**, with whole-plan/image acceptance held for source/cast review. **No canon redraft, semantic retry, images, production writes or public activation.** This is diagnostic evidence for [#183](https://github.com/AustinKelsay/visibible/issues/183), under parent [#165](https://github.com/AustinKelsay/visibible/issues/165) §4–5; it does not close a release gate or add a manual approval requirement.

## Exact result

The [carried canon](canon.json) is byte-for-byte identical to the accepted artifact used in the [v4 evaluation](../2026-10-22-daniel-placement-v4/README.md):

> The Ancient of Days: brilliant white radiance; bright orange fire; soft white cloud; brilliant white light.

The local entry now retains its exact structured `showing` choices, as newly staged records do. V5 compiles those choices to verify they still match the authoritative text, then supplies only this constraint to planning:

> effect names for placement: radiance, fire, cloud, light

The [plan](scene.json) begins:

> Radiance and fire rising above an unoccupied throne; Daniel stands at a distance, gazing upward with reverent stillness.

Agent inspection found no body, garment substitute, wool simile or prohibited-feature denial for the no-form subject, and no copied fixed canon effect phrase in any plan field. The plan selects Daniel and the Ancient of Days with their assigned stages. Its structure, field lengths and style neutrality pass. This is one narrow text result, not reliable correction or visual acceptance.

The same plan's `secondaryElements` includes:

> plain-robed attendants faint at the margins.

The supplied section cast contains only Daniel, the Ancient of Days, one like a son of man, and Babylon. Neither that cast nor the selected `present` IDs includes an attendant group, so rendering cannot supply canon for those figures. The unchanged owner look mentions court attendants, and the next unit, Daniel 7:10, describes a ministering crowd. That is relevant context, rather than a complete canon assignment or proof that every described figure belongs in this fixed 7:9 moment. The [agent review](scene-review.json) retains the exact phrase, cast and related context, and holds images for source/cast review. The response was not silently edited or selectively retried.

## Controls and limits

The [predeclared plan](plan.json) allowed at most two ordinary structural attempts for one plan within a **$0.01 preparation subcap**, reserving $0.005 per call. The first structurally valid semantic concern was not eligible for a retry. Canon and image call allowances were zero.

- Base: `07cbdc7c6e0592017ae436ead3fabfc92e10b688` on `dev`; plan prompt `2026-10-22-formless-effects-v5`.
- Canon wording, structured choices, quotes, work/brief versions, moment context, owner look payload/version and response schema match v4. The **complete user input and local records are not identical**: system guidance changes, one no-form constraint line becomes effect names, the local entry gains `showing` and a new content hash, and its local look dependency reference changes. The verifier checks precisely those differences against the retained v4 input.
- [Canon](canon.json) retains its original timestamps and source hashes; it is not a new draft. A fresh [agent review](canon-review.json) accepts that same artifact for this separately capped isolated plan before capture. It is not human or visual acceptance.
- The [overlay](overlay.mts) follows the new staged entry shape and ordinary content hashing. Its local entry version is `b8a8fc156d96244e56b7783d2bbab681`. It freezes the owner's look **payload and version** `1469b2542a3afbf77ed9921c8f727f20` by rebinding only local dependency references. **Normal deployed invalidation would remake the look when entry/section inputs change.** This control bypasses that path only in memory; no live schema deployment, restaging or correction occurred.
- A network-disabled ordinary preparation capture retained the [exact request/schema](plan-input.json), traversed two structural attempts, and produced no synthetic plan or paid call. The [dry run](dry-run.json) records estimates before execution. The paid run used a fresh identical overlay and ordinary `prepareMoment`, checking the exact captured request at the adapter.
- Fresh [before](before.json) and [after](after.json) read-only snapshots contain the same nine scoped live records. The work remains ready in generation 1. They reference three **historical** packets in the earlier structured-candidate snapshot; **no packets were assembled this run**. Current code would invalidate the live v3 plan, and fresh live assembly would require preparation outside this local-only run.
- The [provider trace](text-provider.ndjson) contains one `anthropic/claude-haiku-5.5` plan request, reasoning off, Anthropic routing and no fallback. No reading pass, references, vision checker or model substitution occurred.

This is one fresh response with a deliberately frozen look, not a repeatability study or randomized paired comparison. It does not establish why previous image models failed. Source/owner-look bodily wording remains, and the observed cast gap remains unresolved. Human visual/likeness acceptance, actual-app accounting/full-request latency and explicit activation gates are open. The original matrix stays **236/324 completed, 88 missing**; completion does not mean passing. Public generic admission remains disabled and non-Classical styles unavailable.

## Spend

| Bucket | This run | Cumulative measured | Uncertainty reserve | Remaining after reserve |
| --- | ---: | ---: | ---: | ---: |
| Preparation, $43 authorized | $0.00047940 | $3.63838540 | $0.03000000 | $39.33161460 |
| Evaluation, $16.50 authorized | $0 | $16.29800690 | $0.04500000 | $0.15699310 |
| Actual-app smoke, $1 authorized | $0 | $0.06852150 | $0 | $0.93147850 |

The single plan's **$0.00047940** is explicit provider response usage, retained in the [preparation ledger](preparation-ledger.json), [execution record](plan-execution.json) and [summary](summary.json). No new usage is unresolved, and no allowance moved between buckets. The unused run subcap is $0.00952060, not additional authorization.

The dry run estimated $0.00036504 at expected completion and $0.00064004 at maximum completion. Live pricing matched the application estimator; estimates/reserves do not guarantee billing. Both credit snapshots report $10.897364892. Their zero delta is **not reconciled to this call**; accounting uses the explicit response usage because snapshots may lag.

## Offline verification

```sh
npx tsx llm/releases/2026-10-22-daniel-effects-v5/verify.mts
```

The verifier forbids network, binds the [artifact manifest](sha256.json) and application/source hashes, reconstructs the local overlay and replays the retained provider answer through ordinary preparation. It checks exact request/schema/result, carried canon, precise v4 input differences, structured metadata, source quotes, frozen look, scoped live invariants and separate budget arithmetic. It binds recorded agent judgments to exact evidence; literal phrase checks do not establish broader semantic or visual correctness. Use this revision to verify historical hashes after later source changes.

Retained execution scripts require a private environment, fresh snapshot, separately authorized allowance, `--execute` and an unused execution record. Their presence is **not authorization to replay**. Only the offline verifier is intended for routine reruns.

Validation: offline replay/hash verification, lint, TypeScript checks and focused canon, plan/canon separation, presence and preparation tests. No application or UI behavior changes in this evidence PR.
