# Formless-subject and Elisha correction study — 21 October 2026

**Retain the baseline, keep public generic admission disabled, and leave [#183](https://github.com/AustinKelsay/visibible/issues/183) open.** The targeted study completed 72 images for $2.47322290, including three preparation calls. Elisha's baldness correction appears in all nine affected images. The joint prompt/look correction still fails the divine no-body requirement and exposes a plan-selection gap, so it does not establish an acceptable prompt release.

This follows the [funded v2 matrix and retained failures](../2026-10-20-engine-funded-evaluation/README.md), on base commit `7e2ef9b3a977adf82b69c13d13a7236d389cfba5`. Application changes are confined to the generic prompt's explicit no-form contract and its version/tests. No style file, work brief, reader translation, verse URL, legacy prompt, public configuration or saved image was changed. No deployment was made.

## Contract and owner corrections

The generic prompt version is `2026-10-21-generic-v3`. Each selected canon entry with `hasForm: false` gets a named, never-trimmed FORMLESS SUBJECTS constraint. It forbids a body, human silhouette or garment-shaped figure even when faceless or made of light, while retaining bodily metaphors in the source quotation and the forms of other characters. Such entries remain in CANON, never contribute a sheet, and are omitted from the line reserving a physical appearance. The rule is work-neutral; no Bible name or theology was added to engine code. If required content no longer fits 8,000 characters, assembly rejects before an image call.

Two ordinary version-checked owner corrections were applied to active Bible generation 1, with public admission disabled. The [before snapshot](before.json), [exact correction plan](correction-plan.json), [mutation proof](correction-proof.json) and [read-back/history proof](correction-readback.json) retain both old and new payloads:

- Elisha's `elisha_main` stage replaces “short dark hair” with “a bald head” and adds the exact imported WEB 2 Kings 2:23 quotation. Entry version `cba77de5165f13308e2cc03d132f0621` becomes `55d396a737e0eb4a8072cb8f3e3807fb`.
- Daniel 7:9's section look removes white hair and garments assigned to the formless presence, retaining clothing for Daniel and attendants. Look version `12d398821f2ecb47f9edf7ea075349b6` becomes `1469b2542a3afbf77ed9921c8f727f20`.

Daniel's `editLook` wrote and closed checker attention, then its `listStaleDependents` query returned `Server Error` (request `04ec2d66be2b92b6`). Read-back confirmed the expected owner payload and retained original history. The mutation was not repeated. This is a retained operational limitation, not a claim that the whole command returned success. Reader reports were not closed. Version-dependent lazy preparation refreshed Elisha's look/plan and Daniel's plan normally; no plan was hand-edited, no reference was regenerated, and historical images and runs remain unchanged.

## Fixed targeted run and visual results

The [bounded plan](plan.json) fixes eight cases × three registered styles × three repeats, a $2.70 subcap, at most 72 image calls and eight preparation attempts. It permits only Gemini 3.1 Flash Lite Image and Claude Haiku 5.5. Four affected cases (Elisha, Isaiah, Daniel, Revelation) are accompanied by Genesis light, the sea crossing, Peter and Holmes controls. This is seven Bible cases and one Holmes case, not a representative full release matrix. Prompt wording and Daniel's look changed together, so the results cannot isolate their individual causal effects.

[Read-only preflight](preflight.json) assembled 54 packets; the other 18 were the expected cold Elisha/Daniel packets. The run used exactly three text calls ($0.00078040), then reused the prepared records across all styles. [Read-only postflight](postflight.json.gz) assembles all 72 packets without calls or mutations; maximum prompt length is 7,626 characters. Eighteen Classical/Icon control prompts for the sea crossing, Peter and Holmes are byte-identical to v2. The final packets match postflight exactly, including references and versions.

**The offline verifier exposed an additional Daniel selection failure:** the regenerated plan describes a formless divine presence but lists only Daniel in `present`. Consequently all nine Daniel packets omit the Ancient of Days canon and the new FORMLESS SUBJECTS block. Their brief and owner look still forbid a body, but these are not direct tests of the new block. The exact returned plan remains in the preparation trace; it was not edited or selectively regenerated. The block is present in the other 27 no-body examples (Genesis, Isaiah and Revelation), where five Revelation outputs still fail and one is ambiguous. The next preparation correction must distinguish “present as a non-figurative presence” from “has a physical body”; including every section cast member unconditionally would wrongly add absent subjects to other moments.

All 72 originals were inspected on uncropped contact sheets; 50 were also inspected at full resolution, including every Elisha, Isaiah, Daniel and Revelation output. [Per-image assessments](image-reviews.json) distinguish inspection scale, specific criteria, failures and uncertainty. [Scores](scores.json) are provisional agent assessments; even a criterion pass or a score of 2 is not human visual/likeness acceptance. No actor or public figure is identified by this review.

| Visual criterion | Result |
| --- | --- |
| Elisha baldness | 9 / 9 pass this criterion; Watercolor margins and Icon era failures remain |
| No-body visual criterion across four cases | 23 without a visible human-form divine subject, **12 clear failures**, 1 ambiguous |
| Daniel no-body | **7 / 9 failures**; Watercolor 2 and Icon 2 use empty thrones with radiance |
| Revelation no-body | **5 / 9 failures**; Watercolor 3 is ambiguous |
| Seraphim identity | All three style rows fail reliable six-wing / covered-face / covered-feet depiction |
| Watercolor edges | 22 clear paper-margin failures, 2 ambiguous near-full-frame edges; all eight rows fail |

Material failures are preserved, including these originals:

- [Daniel, Classical 3](outputs/daniel-7-9-ancient-of-days/generic-classical-3.jpg), [Watercolor 3](outputs/daniel-7-9-ancient-of-days/generic-watercolor-3.jpg) and [Icon 3](outputs/daniel-7-9-ancient-of-days/generic-icon-3.jpg): a seated garment-shaped human body remains despite the brief and corrected look; the regenerated plan omitted the identity and therefore the new canon-derived block. A hidden face does not satisfy the prohibition. [Icon 1](outputs/daniel-7-9-ancient-of-days/generic-icon-1.jpg) also duplicates side strips around a central panel; this is distinct from the known Icon border limitation. Icon 2 has possible signature-like marks needing human review.
- [Revelation, Classical 1](outputs/revelation-4-6-living-creatures/generic-classical-1.jpg), [Watercolor 2](outputs/revelation-4-6-living-creatures/generic-watercolor-2.jpg) and [Icon 1](outputs/revelation-4-6-living-creatures/generic-icon-1.jpg): seated human figures or human-shaped drapery remain. Creature types/eyes are present, but six wings and eye coverage are not confidently correct for each creature.
- [Isaiah, Classical 1](outputs/isaiah-6-2-seraphim/generic-classical-1.jpg) and [Icon 2](outputs/isaiah-6-2-seraphim/generic-icon-2.jpg): exposed angel faces/feet and unreliable wing counts. No clear human-form divine subject is visible in this set; that narrow result does not make the seraphim rows pass.
- [Elisha, Classical 2](outputs/2-kings-2-23-bears/generic-classical-2.jpg): the source correction works. [Icon 1](outputs/2-kings-2-23-bears/generic-icon-1.jpg) and Icon 3 add cross-topped domed churches to ancient Bethel, so that style row fails despite baldness.
- Holmes repeat 3 has apparent rows of pseudo-writing on papers in [Classical](outputs/holmes-scandal-the-woman/generic-classical-3.jpg), [Watercolor](outputs/holmes-scandal-the-woman/generic-watercolor-3.jpg) and [Icon](outputs/holmes-scandal-the-woman/generic-icon-3.jpg); conservatively rejected under the no-text rule. Likeness remains a human gate. Peter retains normal human characters, but the frozen step over the boat's gunwale does not confidently show sustained walking; that action is an explicit limitation.

| Style | Provisional case rows: pass / limitation / fail | All repeats |
| --- | --- | --- |
| Classical | 3 / 1 / 4 | [Cases 1–4](contacts/classical-1.jpg), [5–8](contacts/classical-2.jpg) |
| Watercolor | 0 / 0 / 8 | [Cases 1–4](contacts/watercolor-1.jpg), [5–8](contacts/watercolor-2.jpg) |
| Icon | 0 / 3 / 5 | [Cases 1–4](contacts/icon-1.jpg), [5–8](contacts/icon-2.jpg) |

The [offline gallery](gallery.html) links every unchanged full-resolution original. This study uses registered Watercolor, with stale references omitted through normal validity checks, and does not reuse or promote the rejected underwash style. The original v2 matrix remains **236 / 324**; neither these 72 changed-version samples nor the prior nine trial images fill its 88 missing slots. No case failure is averaged away into a release pass.

## Accounting and reproducibility

All **75 provider responses** returned HTTP 200 and measured usage: images $2.47244250, preparation $0.00078040. No new uncertainty arose. [Execution counters](execution.json), the exact [sanitized trace](provider.ndjson.gz), [state](state.json.gz) and [summary](summary.json) reconcile to **$2.47322290**. New preparation is counted only in the $16 evaluation bucket, not again in the separate $43 preparation bucket.

| Separate authorized bucket | Measured cumulative | Uncertainty reserved | Remaining after reserve |
| --- | ---: | ---: | ---: |
| Preparation, $43 | $3.63511920 | $0.03000000 | $39.33488080 |
| All evaluation, $16 | **$15.47747170** | $0.04500000 | **$0.47752830** |
| Actual-app smoke, $1 | $0.06852150 | $0 | $0.93147850 |

The account balance moved from $4.193909792 to [$1.720686892](provider-balance.after.json). These are account snapshots, separate from task authorization. No account purchase or model substitution was made, and no more paid calls are made by this bundle. The remaining evaluation allowance cannot fund a corrected full matrix.

The [wrapper](run.mts) enforces fixed model/count/scope guards, the per-call reserve and the subcap, stops further calls on unknown usage, and forbids replay over existing state. It was executed once against live prepared analysis through the normal shared assembly and evaluation CLI. The [exact executed wrapper](run.executed.mts.gz) is retained: `run.mts` differs only by an equivalent image-data regex written without the ES2018 `s` flag so the repository's older TypeScript target can typecheck it. Verification checks that equivalence. Its execution flag and environment path are prerequisites, not new paid-run authorization; do not replay it as part of routine verification.

Native [report](report.raw.json.gz) and [score template](scores.template.json.gz) remain untouched. The [derived report](report.json.gz) corrects only the legacy reproducibility header to v3; actual rendering packets already carry v3. Native run/sample legacy header fields do not override packet provenance. “8 ready” means sampling completion, not visual acceptance. CLI timing is not actual-app full-request p90 and does not satisfy the 10-second prepared / 20-second cold gate.

Run without keys, network, models or deployment:

```sh
node llm/releases/2026-10-21-formless-corrections/verify.mjs
```

[Hashes](sha256.json) cover this directory except the hash list itself. Verification checks all 72 source bytes against retained response hashes, prompt/reference/version binding, unchanged control prompts, owner correction/history/source quotations, all per-call costs and reserves, assessments and separate budgets. Sanitized traces replace image data with MIME/bytes/SHA-256, replace opaque encrypted reasoning with bytes/SHA-256, and omit account `user_id`; exact request/response text, request IDs and usage remain. Private raw traces stay outside git.

The plan-selection gap and no-body rendering problem need different demonstrated corrections; repeating this wording unchanged is unsupported. Remaining gates are human visual/likeness, compatibility/accounting and actual-app latency acceptance, a named first-24-hour follow-up owner/outcome, and the deliberate public switch. The [release runbook](../../workflow/ENGINE_RELEASE.md) and prior disabled rollback proof remain in force. Legacy retirement is separate. This PR makes the constraint explicit and records a bounded failed study; it does not authorize deployment or public activation.
