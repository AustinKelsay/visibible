# Daniel v4 placement evaluation — 2026-10-22

One live Haiku 5.5 scene plan using the v4 guidance from [#242](https://github.com/AustinKelsay/visibible/pull/242) still repeated fixed canon appearance. Its subject field was cleaner, but its `secondaryElements` copied two complete canon effects with their qualifiers. The first structurally valid result is retained as **`reject-canon-restatement`**. **No canon redraft, semantic retry, images, production writes or public activation.** This is diagnostic text evidence for [#183](https://github.com/AustinKelsay/visibible/issues/183), under parent [#165](https://github.com/AustinKelsay/visibible/issues/165) §4–5; it does not close the release gate.

## Exact result

The [plan](scene.json) used the exact accepted [structured canon](canon.json) from the [prior evaluation](../2026-10-22-daniel-structured-candidate/README.md):

> The Ancient of Days: brilliant white radiance; bright orange fire; soft white cloud; brilliant white light.

Its new `primarySubject` was:

> Radiance above an unoccupied fiery throne; Daniel stands below, gazing upward.

However, `secondaryElements` included both:

> soft white cloud drifting around the throne

> brilliant white light radiating outward

The [agent review](scene-review.json) binds these exact excerpts to the canon. The plan selected Daniel and the Ancient of Days and passed the agent's narrow no-form text inspection: no body, garment substitute, wool simile or denial for the no-form subject was found. Structure, field lengths and style neutrality also passed. Copying fixed appearance into another field still fails the whole-plan separation instruction. This result is not an accepted rendering candidate; no favorable retry followed.

## Controls and limits

The [predeclared plan](plan.json) allowed at most two ordinary structural attempts for one scene plan, within a **$0.01 preparation subcap**. The first structurally valid semantic failure was not eligible for a retry. Canon and image call allowances were zero.

- Base: `b89277a14b369520fc5b481006951e1376cf3503` on `dev`; plan prompt `2026-10-22-formless-placement-v4`.
- The complete user input, eight local input records and moment context are identical to the retained v3 evaluation. System guidance and schema descriptions change to v4. The [plan input](plan-input.json) retains the exact request/schema and [dry run](dry-run.json) records estimates before execution.
- [Canon](canon.json) is a byte-for-byte copy of the prior accepted artifact, including its original timestamps and source hashes. The new [canon review](canon-review.json) accepts that same text for this isolated plan, before capture; it is not a fresh canon draft or visual acceptance.
- The [local overlay](overlay.mts) uses the staged canon payload and normal entry/section hashing, removes the old local plan, and freezes the owner's look **payload and version** `1469b2542a3afbf77ed9921c8f727f20`. Only its local dependency references are rebound. **The deployed path would normally invalidate that look when entry/section inputs change.** This deliberate experimental control is not deployed cache behavior or an owner correction.
- A network-disabled capture traversed ordinary planning's two structural attempts, without producing a synthetic plan. The paid execution then used a fresh identical overlay and ordinary `prepareMoment`, checking the exact captured request at the adapter.
- [Before](before.json) and [after](after.json) fresh read-only snapshots contain the same nine scoped live records. The work remains ready in generation 1 with unchanged work/brief versions. They point to three **historical** baseline rendering packets in the prior snapshot; **no packets were assembled this run**. Current v4 code would invalidate the live v3 plan, so fresh assembly would require preparation excluded by this local-only run.
- The one request used `anthropic/claude-haiku-5.5`, reasoning off, Anthropic routing and no provider fallback. The [raw request/response](text-provider.ndjson) and [execution ledger](plan-execution.json) retain the first result. No reading pass, reference generation, vision checker or model substitution occurred.

One fresh response does not establish model reliability or a causal explanation. The prior v3 response is a retained comparison, not a newly randomized paired control. The WEB source and frozen owner look still include bodily wording/denials. V4 guidance was insufficient for this response, and improved subject wording does not establish whole-plan success or explain prior image failures.

Human visual/likeness acceptance, the original image matrix (**236/324 completed, 88 missing**), actual-app accounting/full-request latency and explicit activation gates remain open. Completed matrix cases do not mean passed cases. The public generic engine remains disabled and non-Classical styles unavailable.

## Spend

| Bucket | This run | Cumulative measured | Uncertainty reserve | Remaining after reserve |
| --- | ---: | ---: | ---: | ---: |
| Preparation, $43 authorized | $0.00045370 | $3.63790600 | $0.03000000 | $39.33209400 |
| Evaluation, $16.50 authorized | $0 | $16.29800690 | $0.04500000 | $0.15699310 |
| Actual-app smoke, $1 authorized | $0 | $0.06852150 | $0 | $0.93147850 |

The single plan cost **$0.00045370** is explicit provider response usage, retained in the [preparation ledger](preparation-ledger.json) and [summary](summary.json). No new usage is unresolved and no allowance moved between buckets. Admission reserved $0.005 per call; estimates/reserves are not a provider billing guarantee. The unused run subcap is $0.00954630, not new authorization.

The dry run estimated $0.00035848 at expected completion and $0.00063348 at maximum completion. Live pricing matched the application estimator. Before/after credit snapshots both report $10.897818592; that zero delta is **not reconciled to this call**. Snapshots may lag, so accounting uses explicit response usage.

## Offline verification

```sh
npx tsx llm/releases/2026-10-22-daniel-placement-v4/verify.mts
```

The verifier forbids network, binds the [artifact manifest](sha256.json) and application/source hashes, reconstructs the exact local overlay, and replays the retained provider answer through ordinary preparation. It checks the request/schema/result, unchanged user inputs, carried canon, frozen look, dependency rebind, source quotes, scoped live invariants and separate budget arithmetic. It binds recorded agent verdicts to exact excerpts; it does not prove subjective semantics or visual compliance. Use this revision to verify historical source hashes after later application changes.

The retained execution scripts require a private environment, fresh read-only snapshot, separately authorized allowance, `--execute` and an unused execution record. Their presence is **not authorization to replay**. Only the offline verifier is intended for routine reruns.

Validation: offline replay/hash verification, lint, TypeScript checks and focused plan/canon separation, presence and preparation tests. This evidence PR changes no application or UI behavior.
