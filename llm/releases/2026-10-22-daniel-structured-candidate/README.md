# Daniel structured canon and isolated plan — 2026-10-22

One live Haiku 5.5 canon draft using the structured no-form contract from [#240](https://github.com/AustinKelsay/visibible/pull/240) passed agent text inspection. One subsequent ordinary scene-plan call preserved the no-form presence but repeated fixed canon appearance, so the plan was rejected on that instruction. Both first structurally valid results are retained. **No semantic retries, images, production writes or public activation.** This is diagnostic evidence for [#183](https://github.com/AustinKelsay/visibible/issues/183), under parent [#165](https://github.com/AustinKelsay/visibible/issues/165) §4–5; it does not close the release gate.

## Exact result

The provider chose `has_form: false` and four structured `showing` effects. Application code, rather than a free-prose model field, compiled:

> The Ancient of Days: brilliant white radiance; bright orange fire; soft white cloud; brilliant white light.

The [canon result](canon.json), [raw request/response trace](text-provider.ndjson) and [agent review](canon-review.json) retain the choices and three exact quotes from WEB Daniel 7:9–10. The quote and `appearance_from_text` audit fields still contain bodily source language; neither is part of this compiled stage. Orange, brightness and the use of cloud are illustrative choices within the unconditional brief, rather than literal claims fixed by those three quotes. Redundant light/radiance was accepted for this isolated plan. Schema validity alone does not establish a permitted interpretation.

The [plan](scene.json) selected Daniel and the Ancient of Days with the new stage. Its main subject begins:

> Brilliant white radiance gathered into an unoccupied throne of bright orange fire, with soft white cloud and light spreading above it

Agent inspection found no body, garment substitute, wool simile or denial for the no-form subject in the plan. However, the subject repeats the canon's fixed brightness, colors and effects despite instructions to keep fixed appearance in canon and use the plan for situational detail. The [plan review](scene-review.json) therefore records **`reject-canon-restatement`**, with the exact offending excerpt. This partial text improvement is not an accepted candidate for rendering. No favorable plan retry followed.

## Controls and limits

The [predeclared plan](plan.json) allowed at most two normal structural attempts for canon and two for planning, within a shared **$0.02 preparation subcap**. The first structurally valid semantic failure was not eligible for a retry. Image allowance for this run was zero. The exact accepted canon artifact had to be reviewed before the plan could run.

- Base: `444a231d1ef90470715d65d463b9aa87909a008a` on `dev`; canon prompt `2026-10-22-canon-showing-v3`, plan prompt `2026-10-21-formless-presence-v3`.
- Same imported work, brief, reading entry, section, era and empty canon hints as the [previous rejected context draft](../2026-10-22-daniel-context-candidate/README.md). The [draft input](draft-input.json) includes all six on-stage Daniel 7:9–14 units among 19 selected units / 4,079 source characters.
- [Before](before.json) and [after](after.json) read-only snapshots contain the same nine scoped live records and three baseline rendering packets. The work remains ready in generation 1. Those packets use the existing live canon/plan, not the isolated candidate.
- [Local overlay](overlay.mts) applies the new canon stage using the staged payload shape and normal content hashing, updates its section cast assignment, removes the local old plan, and freezes the owner's look **payload and version** `1469b2542a3afbf77ed9921c8f727f20`. Only dependency references on the local look are rebound to hold this experimental control. **The deployed path would normally invalidate the look when entry/section inputs change.** This is not evidence about deployed cache behavior or an owner correction.
- [Plan input](plan-input.json) retains the exact request/schema, context, eight local input records, original/rebound look dependencies and extra source hashes. A network-disabled capture traversed the ordinary planner's two attempts, produced no synthetic plan and made no paid calls. The paid execution then used a fresh identical overlay and ordinary `prepareMoment`, with the exact captured request checked at the adapter.
- Both requests used `anthropic/claude-haiku-5.5`, reasoning off, Anthropic routing and no provider fallback. No reading pass, reference generation, vision checker, model substitution or production mutation was performed.

This is one fresh canon/plan chain with a deliberately frozen look. It is not a paired causal experiment, a repeatability study or image evidence. The source verse and frozen look still include bodily wording/denials. Neither this result nor the earlier canon failures establishes the cause of the image-model failures. Human visual/likeness acceptance remains open; the original image matrix remains **236/324, 88 missing**. Actual-app accounting/full-request latency and explicit activation gates also remain open. The public generic engine remains disabled and non-Classical styles unavailable.

## Spend

| Bucket | This run | Cumulative measured | Uncertainty reserve | Remaining after reserve |
| --- | ---: | ---: | ---: | ---: |
| Preparation, $43 authorized | $0.00115720 | $3.63745230 | $0.03000000 | $39.33254770 |
| Evaluation, $16.50 authorized | $0 | $16.29800690 | $0.04500000 | $0.15699310 |
| Actual-app smoke, $1 authorized | $0 | $0.06852150 | $0 | $0.93147850 |

Canon cost **$0.00070530** and plan cost **$0.00045190** are explicit provider response usage, summed in the [preparation ledger](preparation-ledger.json). No allowance was transferred between buckets. Admission reserved $0.005 per call; estimates/reserves are not a provider billing guarantee. There is no unresolved usage from these two calls.

The [canon dry run](dry-run.json) estimated $0.00095615 at expected completion and $0.00235615 at maximum completion; the plan capture estimated $0.00033667 / $0.00061167 respectively. Live pricing matched the application estimator. Credits changed from $10.898975792 to $10.898270492, a $0.0007053 delta; that is not reconciled to both calls. Credit snapshots can lag, so the [summary](summary.json) uses explicit per-response costs and does not claim completed balance reconciliation.

## Offline verification

```sh
npx tsx llm/releases/2026-10-22-daniel-structured-candidate/verify.mts
```

The verifier forbids network, binds the [artifact manifest](sha256.json) and application/source hashes, replays the retained provider answers through ordinary canon drafting and scene preparation, checks exact requests/schemas/compiled results, source selection/quotes, local dependency changes, frozen look, scoped live invariants and separate budget arithmetic. It binds the recorded agent verdicts to exact excerpts; it does not prove subjective semantics or visual compliance. After later source changes, use this revision to verify these historical hashes.

The retained execution scripts require a private environment, fresh read-only snapshot, separately authorized allowance, `--execute` and an unused execution record. Their presence is **not authorization to replay**. Only the offline verifier is intended for routine reruns.

Validation: offline replay and hash verification, lint, TypeScript checks and the three focused canon suites. No application or UI behavior changes in this evidence PR.
