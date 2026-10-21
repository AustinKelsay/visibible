# Controlled style-reference comparison — 21 October 2026

**Omitting the style reference did not resolve the release failures.** All 12 images completed for **$0.40941850**, without preparation calls, missing usage, retries or production mutations. Both Icon modes produced a clear human-form divine figure; both Watercolor modes retained exposed paper corners. Retain the baseline, leave public generic admission disabled and keep [#183](https://github.com/AustinKelsay/visibible/issues/183) open. This is diagnostic evidence, not a default change or human release acceptance.

## Matched inputs and execution

This executes the comparison proposed by the [reference-input audit](../2026-10-21-reference-input-audit/README.md), using the evaluation control merged in [#234](https://github.com/AustinKelsay/visibible/pull/234) at `20f4595`. The owner explicitly approved an additional **$0.50 evaluation allowance**, raising the total from $16 to **$16.50**, and this 12-image comparison under a combined **$0.50 cap**. The [plan](plan.json) records that authorization, stop conditions, model and separate buckets. The [normal](manifest.normal.json) and [omission](manifest.omitted.json) dry runs each estimate six samples at $0.216; their combined estimate is $0.432. Their $0.25 costing partitions are not separate spending authorizations. The actual wrapper enforces one shared $0.50 admission cap across both runs.

The [before](before.json) and [after](after.json) snapshots retain identical nine scoped production records and all 12 preflight packets. The normal packets attach exactly the retained Watercolor or Icon style reference; omission packets remove only that image and its caption. Source, brief, registered style wording, canon, owner look `1469b2542a3afbf77ed9921c8f727f20`, v3 plan `8cd89ee4aad16a597882ff9ccf05f0f0`, variation number, trimming and image settings remain fixed. There are no character sheets in these packets. References were not cropped, corrected or replaced, and the no-form subject contributes no sheet. The normal Watercolor input still contains the previously noted white margins; its attention note never made it ineligible.

The [one-shot wrapper](run.mts) uses the ordinary evaluation runner, shared assembly and OpenRouter image adapter against read-only production analysis. It allows zero preparation calls and rejects every outgoing request that fails to match an unused preflight prompt, model, image setting or attachment hash. It reserves $0.05 before each call against the combined cap, blocks further paid calls after unknown usage or a provider failure, and forbids automatic resume. A reserve is an admission guard, not a provider billing guarantee. These retained scripts and their `--execute` flag do not authorize replay.

Three normal Watercolor variations ran first, then three normal Icon variations, followed by the corresponding omission groups. This is a matched input comparison with **three variation numbers per group**, not identical seeds or randomized ordering. The selected model remains `google/gemini-3.1-flash-lite-image`, 1K, 16:9; all returned originals are 1376×768 JPEGs. The provider uses its default 1K size, without an explicit `image_size` field.

## Observed results

Open the [paired gallery](gallery.html) for every unchanged original, [per-image observations](image-reviews.json), [normal scores](normal/scores.json) and [omission scores](omitted/scores.json). All 12 originals were inspected uncropped at full resolution. Counts below describe only this sample. A no-body **review** remains ambiguous, never a confident pass or a confirmed bodily violation. A narrow pass does not establish human likeness or release acceptance.

| Style and mode | Narrow no-body criterion | Paper corners | Other observed failures | Group verdict |
| --- | --- | --- | --- | --- |
| Watercolor, reference attached | 2 pass, 1 review | 1 fail | Draped radiance in repeat 1 remains ambiguous. Repeat 3 adds winged attendants and gives Daniel longer hair than his canon; identity fidelity needs further review. | Fail |
| Watercolor, reference omitted | 3 pass | 2 fail | Paper corners persist without the reference. | Fail |
| Icon, reference attached | 2 pass, 1 fail | 0 fail | Repeat 1 forms a faceless seated person; repeat 2 adds domed church-like buildings with cross-shaped finials, conflicting with the era and no-symbols rule. | Fail |
| Icon, reference omitted | 2 pass, 1 fail | 0 fail | Repeat 1 again forms a faceless seated person and adds gold edge bands. | Fail |

The clear Icon violations include a head, torso, arms and draped lower body made from radiance. Omitting the reference therefore does not make the no-form rule reliable, and a style reference is not necessary for this failure to occur under the retained inputs. This observation does not identify which remaining textual/model cue causes it. The source's bodily metaphors, canon's wool-like glow and plan's wool-like streams remain plausible competing cues, not established causes; none were rewritten here.

No output repeats the scene in multiple panels in either mode. The earlier triptych therefore did not recur in the normal control either, so its absence in the omission group cannot establish a fix. The cross-topped buildings occur in one normal Icon sample; although the reference contains similar motifs, this small comparison does not establish direct copying or a causal frequency difference.

Three repeats meet the harness's sample floor, but one moment cannot establish population failure rates, style-wide superiority or continuity across moments. The raw reports' sample-floor readiness is not visual acceptance. All four style/mode score rows fail because each group contains an unresolved or material observed failure. Do not promote style-reference omission as a production correction from this result.

## Accounting and reproducibility

The [execution record](execution.json), sanitized [provider trace](provider.ndjson.gz), [normal state/report](normal/state.json.gz), [omission state/report](omitted/state.json.gz), [dimensions and image hashes](dimensions.json) and [summary](summary.json) bind all 12 attempts to their exact inputs, outputs and response usage. The immediate post-run account balance reconciles the measured response total: $11.309570192 before minus $10.900151692 after equals $0.40941850. Accounting uses response usage, not the balance delta. The result is $0.02258150 below the dry-run estimate, with $0.09058150 unused in this run's cap.

| Separate authorized bucket | Cumulative measured | Uncertainty retained | Remaining after reserve |
| --- | ---: | ---: | ---: |
| Preparation, $43 | $3.63511920 | $0.03000000 | $39.33488080 |
| Evaluation, **$16.50** | **$16.29800690** | $0.04500000 | **$0.15699310** |
| Actual-app smoke, $1 | $0.06852150 | $0 | $0.93147850 |

No further paid call belongs to this run. No new reading pass, look, plan, reference, checker, model substitution or owner correction occurred. Source quotation, old plans and saved images remain unchanged. The original matrix stays **236/324**, missing 88 original slots; these targeted images do not fill them. CLI image/assembly timings and quotes do not prove actual-app reservation, settlement or full-request latency. Human visual/likeness acceptance, actual-app gates, explicit activation and the first-24-hour outcome remain pending.

Run offline without credentials, network or provider calls:

```sh
npx tsx llm/releases/2026-10-21-reference-comparison/verify.mts
```

The verifier checks every artifact hash, exact prompt/packet replay for all variations and both modes, unchanged scoped records and source inputs, actual attachment bytes, every response/output hash and dimension, per-call admission reserves, measured spend, separate bucket totals and the recorded review counts. It verifies the evidence bindings and arithmetic; it does not automate visual judgment. Run historical source comparisons at this revision when later code deliberately changes. Sanitized traces hash image payloads and encrypted reasoning, and omit account identifiers; credentials and raw traces stay outside git.
