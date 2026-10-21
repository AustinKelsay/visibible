# Daniel canon-aware planning pilot — 21 October 2026

**The v2 planner still misses its scene-language instructions. The pilot stopped before all image calls. Keep public generic admission disabled and [#183](https://github.com/AustinKelsay/visibible/issues/183) open.** One normal lazy plan refresh cost **$0.00038420**; there was no semantic retry, manual plan edit or image generation.

This follows [planner correction #230](https://github.com/AustinKelsay/visibible/pull/230), merged at `1220c4c`, and the [earlier nine-image Daniel retest](../2026-10-21-daniel-presence-retest/README.md). The local engine assembly uses presence prompt `2026-10-21-formless-presence-v2` and rendering prompt `2026-10-21-generic-v3`. This evidence changes no application code, brief, registered style, model, public routing or saved image. No deployment or public switch occurred.

## Fixed scope and execution

The [plan](plan.json) fixes Daniel 7:9 once each in Classical, Watercolor and Icon: at most three images, two schema/error preparation attempts and a **$0.16 subcap from the existing $0.16975435 evaluation remainder**. It assumes no increase to the $16 allowance from the owner's account top-up. The [dry-run manifest](manifest.json) estimates about $0.11. Single samples would provide a pilot signal, not repeated-case acceptance or coverage for the missing original matrix slots.

The [before snapshot](before.json) shows ready Bible generation 1, the retained owner look, existing v1 plan and unavailable public Watercolor/Icon. The [two-stage wrapper](run.mts) first permits only normal lazy Daniel scene planning, then assembles all three packets read-only. Its image phase separately requires a positive review bound to the exact retained plan. That phase was never invoked. Per-call reserves are admission guards, not provider billing guarantees; missing usage stops all further calls. Original traces and credentials stay outside git.

The single returned plan `575c1a3d622656802a52fa15001b77d9` selects both the Ancient of Days and Daniel, sees the assigned no-form canon text and carries the v2 input marker. The [response trace](provider.ndjson.gz), [prepared packet](preparation.json) and [after/history snapshot](after.json) bind the result to its exact request and stored version. The old v1 plan remains in history. All captured non-plan records, including the owner look and Elisha correction, are unchanged. No look, reference, reading pass or checker was regenerated.

[Read-only preflight](preflight.json) validates three packets with quotes, full selected no-form canon, the protected FORMLESS SUBJECTS block, no no-form sheet and prompts below 8,000 characters. These are unsent inputs, not images or visual results. The [preparation execution record](preparation-execution.json) records one text call, zero image calls and no unknown usage.

## Why image calls were blocked

The [agent plan review](plan-review.json) rejects the response against the new planning guidance:

- The primary subject repeats the prohibited features as a denial: “with no human face or body”. The system specifically instructed the planner not to repeat those features as denials or substitutes in scene fields.
- It describes “white radiance and cloud enthroned over a seat of fiery flame”. This does not explicitly make the seat unoccupied and retains an ambiguous enthronement metaphor instead of the requested unoccupied-seat description.
- The primary subject restates much of the fixed no-form canon rather than using it only to constrain situational effects and placement.

The response **does not explicitly assign a human body**. This is a conservative pre-image instruction-compliance decision, not an observed depiction-rule violation in an image. It removes the prior plan's garment suggestion and explicit “seated presence”, but one improved yet noncompliant text response does not demonstrate reliable correction. There are no new images to score and no basis for an image-model quality or latency conclusion. Human visual and likeness acceptance remains pending.

The schema-valid response is retained verbatim. It was not hand-edited, cleared or selectively retried. The wrapper's unused image phase remains as the planned execution path; its presence is not authorization to replay this run. Further work should address how planning constraints are expressed or enforced before another paid trial, rather than repeating this wording unchanged or weakening the review criterion.

## Accounting and verification

All new spend belongs only to the existing $16 evaluation bucket. Preparation and actual-app smoke allowances are unchanged.

| Separate authorized bucket | Cumulative measured | Uncertainty reserved | Remaining after reserve |
| --- | ---: | ---: | ---: |
| Preparation, $43 | $3.63511920 | $0.03000000 | $39.33488080 |
| Evaluation, $16 | **$15.78562985** | $0.04500000 | **$0.16937015** |
| Actual-app smoke, $1 | $0.06852150 | $0 | $0.93147850 |

Account snapshots confirm the additional funds are present; response usage, not account balance changes, determines task spend. The [summary](summary.json) reconciles this response and the prior evidence. The original matrix remains **236 / 324**, with all previously retained Watercolor, seraphim, Daniel and Revelation failures unresolved by this pilot.

Run offline, without credentials, network or provider calls:

```sh
node llm/releases/2026-10-21-daniel-canon-pilot/verify.mjs
```

The verifier checks every [artifact hash](sha256.json), exact executed source inputs, provider response/usage, v2 request and stage text, stored plan/history, unchanged owner records, all three unsent packets, failed review, zero image calls and separate budgets. Source-file comparisons require the recorded application source; verify historical bundles on their recorded commits rather than rewriting their hashes after later code changes. Sanitized traces omit account identifiers and hash opaque encrypted reasoning.

The [release runbook](../../workflow/ENGINE_RELEASE.md) still requires visual/likeness acceptance, compatibility/accounting evidence, actual-app latency, named follow-up ownership, an explicit public switch and the first-24-hour outcome. None is inferred from successful plan storage or a passing offline verifier.
