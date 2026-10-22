# Daniel canon with section context — 22 October 2026 UTC

**The new draft quotes Daniel 7:9 correctly but still fails the no-form drafting instructions.** One Haiku 5.5 call cost **$0.0006111** in preparation spend. The first structurally valid draft was rejected before any scene plan or image call. Retain production canon and keep [#183](https://github.com/AustinKelsay/visibible/issues/183) open with public generic admission disabled.

This follows the [previous rejected draft](../2026-10-21-daniel-canon-candidate/README.md) and the source-context fix in [#238](https://github.com/AustinKelsay/visibible/pull/238), based on `761051927f84d8116228390291b601e9309e91e9`. It exercises the ordinary `draftCanonEntry` implementation with prompt version `2026-10-21-canon-context-v2`. It is one fresh text observation, not a paired causal experiment, image test or demonstration of repeatability.

## Request, response and stop decision

The [draft input](draft-input.json) preserves the same original reading entry, on-stage section, section era and empty owner hints as the previous run. The imported WEB, approved brief, rendering rules and registered styles are unchanged. The new selector supplies **19 whole units / 4,079 source characters** under its 14,000-character cap. It adds Daniel 7:9–12 and 7:14 to the previous name matches; all six units of the on-stage section are now present. Context can describe other subjects, and the request explicitly warns against attributing every description to this entry.

The [sanitized provider trace](text-provider.ndjson) retains the exact system instructions, user prompt, schema, model settings, raw JSON response and measured usage. [canon.json](canon.json) is the checked result without editorial changes. It has `hasForm: false`, no structural problems and one stage. The drafter made **one attempt** without a structural or semantic retry. Its prompt-ready stage is:

> The Ancient of Days: a presence of pure white radiance, luminous as snow and wool, enthroned within a vast seat of fierce flame whose wheels burn with fire, with a fiery stream issuing forth before him. No human face or body; only light, cloud and fire.

The [agent inspection](canon-review.json) rejects these exact excerpts:

| Excerpt | Contract problem |
| --- | --- |
| “luminous as snow and wool” | Retains source material similes instead of only permitted effects. |
| “enthroned within a vast seat of fierce flame” | Gives the no-form subject a seated/posture cue and embeds a situational throne in fixed identity. |
| “No human face or body” | Repeats prohibited features as denials in prompt-ready text. |

The three supporting quotes are exact supplied passages: clothing/hair and throne/fire from Daniel 7:9, and the fiery stream from 7:10. This fixes the verified evidence omission, but does not make the returned stage compliant. Neither this observation nor the prior omission establishes the cause of the retained image failures. Supporting quotes remain audit text and are not image-prompt content.

The [predeclared plan](plan.json) permitted a separate text-only scene plan only after an acceptable exact canon. The first semantic failure was not eligible for a favorable retry. Consequently no local replacement analysis, frozen-owner-look overlay, scene plan, rendering, reading pass, reference generation, vision checker, production correction or public activation was executed. The [before](before.json) and [after](after.json) read-only snapshots retain the same nine scoped production records and three baseline rendering packets, all requiring zero preparation calls. These scoped checks are not a full-production state audit.

## Accounting and limits

The [dry run](dry-run.json) records live catalog prices, the $0.0009341481 expected estimate and the $0.0023341481 estimate at the 4,000-token completion limit. Both fit the $0.005 per-call reserve and **$0.02 preparation subcap** under the existing $43 authorization. The estimate is not a billing guarantee; actual accounting uses the explicit provider response cost. [preparation-ledger.json](preparation-ledger.json) and [canon-execution.json](canon-execution.json) record one successful known-cost response and zero new uncertainty. The adapter blocks further calls after unknown usage or provider failure and admits at most two normal structural attempts per phase / four total. No images were permitted in this run. Retained scripts and `--execute` are not replay authorization.

| Separate authorized bucket | Cumulative measured | Uncertainty retained | Remaining after reserve |
| --- | ---: | ---: | ---: |
| Preparation, $43 | **$3.63629510** | $0.03000000 | **$39.33370490** |
| Evaluation, $16.50 | $16.29800690 | $0.04500000 | $0.15699310 |
| Actual-app smoke, $1 | $0.06852150 | $0 | $0.93147850 |

Both credit snapshots reported $10.899586892. This is **not a completed per-call balance reconciliation or evidence of free usage**; the response explicitly reports the cost above. No allowance moves between buckets. The [summary](summary.json) retains these limits and totals. The original image matrix remains **236/324**, with 88 slots missing. Human visual/likeness acceptance, actual-app reservation/settlement and full-request latency, explicit activation and the first-24-hour outcome remain pending.

Before spending more on images, the next correction should address the prompt-ready no-form stage contract itself and be tested against this retained response. Additional source context alone did not resolve its noncompliance in this attempt. Do not hand-edit this candidate, replace production canon with it or erase the previous visual failures.

## Offline verification

Run without credentials or network:

```sh
npx tsx llm/releases/2026-10-22-daniel-context-candidate/verify.mts
```

The verifier checks every artifact hash, reconstructs the exact request and source selection from retained metadata/current imported work, verifies supplied quotes and structure, and replays the retained response through the ordinary drafter without a provider call. It checks ledger arithmetic, reviewed excerpts, the stop decision and unchanged scoped records. It verifies audit bindings rather than automating semantic judgment. App source hashes are historical: use this revision if later code changes them. Live snapshot assembly reuses the retained read-only packet helper; credentials remain outside git, account identifiers are omitted and any image/encrypted payloads are hashed.
