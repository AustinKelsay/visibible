# One scene description — paired text comparison

**Completed; do not activate or broaden to an image trial on this evidence.** This compares real model-authored plans under the current seven-field contract and the [approved one-paragraph candidate](../2026-10-31-scene-description/README.md). The candidate remains unapplied in the application checkout. This packet authorizes no deployment, production correction, image run or activation.

## Fixed comparison

Use the existing suite once per arm: **113 cases** across the Bible, Holmes and Alice, including its 20 named holdout cases. These cases have been examined in earlier experiments, so “holdout” is a stored suite partition, not a fresh unseen test set. One sample per case cannot establish a universal improvement.

Both arms reuse the same source snapshot and **98 generated section guides** from [review-only-text](../2026-10-30-review-only-text/README.md). That historical experiment disabled plan review; its plans are deliberately not reused. Both new arms use their respective current planner and advisory review, including the ordinary re-plan behavior. The source run's guide records retain their original dependencies; their compatibility is exercised by preparation rather than inferred from its older pipeline metadata.

The main runner adds `plan --tier text --from <text run>` to expose frozen-guide support that already exists in `runSuite`. It seeds guides only, refuses to generate a missing/stale guide, and reads the source snapshot when constructing scorer packs. Paid provenance includes the source plan and results in addition to its snapshot. Normal text runs and frozen-plan image runs keep their existing paths.

| Arm | Plans made by | Changes from control |
| --- | --- | --- |
| [Control](../2026-10-31-scene-description-control/plan.json) | Current seven-field planner and review | None |
| [Candidate](../2026-10-31-scene-description-candidate/plan.json) | Approved scene-paragraph planner and review | The existing candidate patch only |

Work text, briefs, depiction profiles, canon, guides, neighboring source context, provider model/settings, available reference bytes and suite cases stay fixed. The candidate changes planner/schema instructions, gives the paragraph to review/rendering/checking, and uses cast order for reference priority. This experiment tests that combined contract; it does not isolate wording, schema shape or reference ranking individually. Review/re-plan requests naturally depend on each arm's new output. Actual selected entries, stages and attached references may differ and must be reported.

## Funding and stop rules

The user approved the **$7 cumulative cap** and subsequently instructed us to continue with the recommended paired text comparison. Prior conservative spend is **$6.31691115**. Each arm has a **$0.30 hard cap**, at most **$0.60 combined**, bounding cumulative spend at **$6.91691115**. The **$5 reader reserve** remains protected. The latest read-only funding check found $9.165930938 available and $24.165564146 remaining on the key; the existing runner rechecks before each arm.

Each arm requires its committed [control funding](../2026-10-31-scene-description-control/funding.json) or [candidate funding](../2026-10-31-scene-description-candidate/funding.json), a clean tracked checkout and frozen source hashes. Its ledger reserves every request's catalog-price ceiling and stops new work when blocked. Partial results, refusals, malformed answers, retries and uncertain costs stay recorded. Do not restart either paid arm. Do not start the second arm if the first leaves unsettled or uncertain calls, a provider/funding block, or changed frozen inputs. No paid scoring or images are included.

## Assessment declared before execution

Inspect all paired outputs against their supplied source, using the existing [text fault definitions](../../../evals/images/faults.json). Record acceptability separately from the narrower questions below, preserve disagreements and ambiguous cases, and retain every failed/refused case in the denominator.

- Does the candidate describe one coherent instant without conflicting poses, scales, positions or timing? A paragraph can still contradict itself.
- Does it preserve the focal event and changing state, without importing an adjacent event or an incidental person? Examine the already documented Alice and cellar conflicts explicitly.
- Does selected cast agree with the described scene and depiction rules? Record differences in cast, stages and reference attachment priority, including potentially lost sheets.
- Does the simpler contract introduce malformed outputs, extra retries, refusals, prompt overflow or more preparation spend?

This is an exploratory, unblinded model assessment followed by independent Sol evidence review. It is **not** the two-scorer blind release gate or human acceptance. Store the ordinary blind packs for later inspection, but do not label an unblinded judgment blind. The most it can justify is proposing a separately budgeted image comparison. Require complete coverage, no systematic fidelity/cast regression in any work or the named holdout partition, and evidence that the simpler contract retains useful scene detail before that proposal. Otherwise retain the negative or inconclusive result. Neither outcome activates the patch.

## Mechanical verification

[preflight.json](preflight.json) binds the two arm plans, approved patch, applied candidate files, source inputs and all **55 local reference images**. The reference pixels stay in the existing ignored evaluation directory. Two offline replays each produced 113 plans, with 226 synthetic text calls, zero guide calls and zero image/check calls. All 113 initial planner user messages and provider settings match between arms; only the reviewed system/schema contract differs. Every saved guide and source context matches.

The actual-CLI regression test fails against the unchanged runner and passes with paired text support. It checks fresh planning, exact guide reuse, refusal of stale guides without provider calls, source-snapshot scorer construction, and source-version/snapshot rejection. Main checks: **1,053 tests passed, one existing skipped**, typecheck passed, lint zero errors and three existing warnings. Candidate focused checks: **17 passed**, including its new/historical blind-pack checks and suite runner tests. These scripted results establish mechanics only.

Rehearse the control from this checkout:

```sh
node --import tsx scripts/evals/suite.mts run --run 2026-10-31-scene-description-control --offline
```

In a disposable copy of the same checkout, apply the unchanged candidate patch, import the work fixtures, and supply the same local reference directory. Then rehearse the candidate:

```sh
git apply llm/releases/2026-10-31-scene-description/candidate.patch
npm run works:import
node --import tsx scripts/evals/suite.mts run --run 2026-10-31-scene-description-candidate --offline
```

The paid arms executed once from committed isolated copies: control `cb1ac40` and candidate `45d4cc4`. The candidate copy contained the exact applied files in `preflight.json`; its shared CLI used the reviewed integration, including the candidate’s new/historical blind-description extraction. All other application files remained unchanged in the control checkout. Both completed. Do not repeat their `run --execute` commands; the artifacts are single-use. Final independent Sol evidence review approved preservation of the completed trial and its negative conclusion, with no new findings; it does not approve activation or further spending.

Pre-execution Sol review approved the prepared experiment; CodeRabbit completed with zero findings. S1 (nit) is deferred: an image run cannot yet chain through a paired text run to the original snapshot/reference directory. That path fails before provider calls and is outside this text-only scope. Resolve or reject that chaining before an image follow-up; do not infer image-run readiness from this approval.

## Completed result

Both arms returned **113/113 plans**. [report.json](report.json) contains the counts; [inspection.json](inspection.json) records every unblinded observation and uncertainty. These observations do **not** implement the formal suite gate or certify every cast selection. Fault lists identify observed problems rather than exhaustive yes/no answers to all fault questions.

| Measure | Seven-field control | One-paragraph candidate |
| --- | ---: | ---: |
| Observed acceptable / flawed / uncertain | 64 / 40 / 9 | 56 / 45 / 12 |
| Definite one-instant conflicts | 8 | 12 |
| Named holdout acceptable / flawed / uncertain | 13 / 7 / 0 | 10 / 9 / 1 |
| Bible acceptable / total | 48 / 77 | 44 / 77 |
| Holmes acceptable / total | 7 / 18 | 7 / 18 |
| Alice acceptable / total | 9 / 18 | 5 / 18 |
| Median scene-description characters (field values joined for control) | 686 | 900 |
| Plans needing a second review round | 33 | 48 |
| Planner / review calls | 146 / 147 | 161 / 163 |
| Measured spend | $0.15025140 | $0.16338630 |

The candidate is structurally simpler, but these outputs are longer and required more re-planning. Fourteen control-acceptable scenes became flawed in the candidate, while eleven control-flawed scenes became acceptable. One sample per case, shared faulty inputs, unblinded judgment and borderline staging interpretations prevent a causal or statistical claim about the format. The evidence does not meet the declared requirement for broadening: it offers no reliable fidelity advantage and contains regressions in the already examined holdout and Alice samples.

Concrete improvements include the prodigal father's completed embrace, David selecting stones without simultaneously advancing, Holmes throwing papers without the notebook-on-knee conflict, and the bottle being only in Alice's hand. Concrete failures remain: Saul's spear leaves his hand while already striking the wall; Daniel is extracted from a still-sealed den; a sea remains in the new-earth scene that says there is no sea; and the Queen throws ink while Bill already writes with it. The candidate adds new conflicts such as Daniel outside the den while its entrance is being sealed. See each case's notes and preserved source context rather than treating a count as a definitive quality score.

The early and late cellar plans have the intended lit and shuttered lantern states in **both fresh arms**. This does not reproduce the old problematic frozen plan, or prove those states survive rendering. The earlier Alice gloves, house-entry and grown-house fixtures are **not in this suite**, so this run cannot answer their specific failures. Its Alice cases cover other scale, costume and court-state problems.

## What this exposes about the inputs

Changing the shape of the scene description does not settle conflicting ownership. In `alice-cat-head-talks`, the candidate initially gives the Queen a smile. The [saved review response](../2026-10-31-scene-description-candidate/provider.ndjson#L308) rejects that expression because canon fixes a stern, frowning face. The [re-plan](../2026-10-31-scene-description-candidate/provider.ndjson#L311) then uses the source quote “The Queen smiled and passed on” while describing a frown. This is a directly recorded conflict between temporary expression and saved appearance. It is not proof that review is generally harmful or that another global prompt rewrite will fix it.

The same frozen inputs also contain source/canon disagreements about age, clothing and location. The Eyford night judgment uses the additional frozen source paragraphs listed in `inspection.json`: the morning trip establishes a daytime return outside the individual planner window. That applies equally to both arms. Animal-costume judgments follow the work's rule that dress needs textual support, even when inherited canon supplies clothing. A cross-arm audit corrected the control's Hatter-witness verdict for this reason; ambiguous poses, labels and poetic staging remain uncertain.

The next useful design question is how to keep **lasting identity** separate from **the current scene's expression, pose, age/state and conditions**, within the existing model-authored canon and review. The saved counterexample makes that question concrete. This packet proposes no new store, rule engine, paid run or production correction. Preserve the candidate as an experiment and stop this format trial here.

## Cast, references and provider behavior

[cast-reference-differences.json](cast-reference-differences.json) lists the selected entries, stages and ordered attachments for every pair. Selection sets differ in **40** cases; another **27** keep the set but change order. No shared selected entry changes its assigned life stage. Ordered reference metadata differs in **18** cases; **8** lose at least one reference and **9** gain one (these groups can overlap). Loss is not automatically a defect: dropping an invented Paul, Watson or Moab also removes its inappropriate sheet. Conversely, the Psalm 23 candidate still describes David but selects nobody, losing his sheet. No images were generated, so attachment changes are not visual consistency measurements.

All **616 successful responses** are parseable JSON and report the requested `anthropic/claude-haiku-5.5` model. There were no failed final cases or token-limit finishes. There was **one zero-charge HTTP 403 moderation refusal**, during the candidate review of Judges 19:29; the existing review retry succeeded. One invalid semantic-review response in each arm also used the existing retry (control Luke 22:61; candidate Blue Carbuncle ¶73). Every original reply, including rejected judgments and that provider refusal, remains in the raw logs. Final success does not erase those attempts. No new retries, fallback models or guard bypasses were added.

## Final reconciliation

[verification.json](verification.json) binds all final artifacts. Offline replays rebuilt both arms through the existing `runSuite` and real text adapter, returned each captured HTTP response through a fake fetch, and matched **all 617 outgoing requests** and **all 226 result rows**, excluding only elapsed time. They also reproduced plan payload versions and every recorded request ceiling using the separately recorded closing catalog. Global network fetch and image/check providers were forbidden in these replays. This establishes mechanical reproducibility, not quality.

All shared source files, **55 reference-byte hashes** in both copies, **43 applied candidate file hashes**, frozen committed source hashes, source contexts and guide records match. Ordinary [control](../2026-10-31-scene-description-control/scoring/SCORING.md) and [candidate](../2026-10-31-scene-description-candidate/scoring/SCORING.md) blind packs preserve the correct respective descriptions, but no blind scores were commissioned. Main runtime, schema, work inputs, styles and package files match the base.

[funding-close.json](funding-close.json) records **$0.31363770** for this comparison, zero uncertainty, and **$6.63054885 cumulative / $7 approved**. The account and key deltas reconcile to that spend; the recorded closing balance is **$8.852293238**, preserving the **$5 reader reserve**. Remaining authorization is **$0.36945115**. The catalog was captured at close, not before each call; it reproduces all saved ceilings and every measured charge stayed within its recorded reservation. No further spend follows from this conclusion.

## Review disposition

The final CodeRabbit CLI review completed with nine findings and two files unreviewed. Its seven findings asking to repair or regenerate saved scene results identify evidence already retained in this trial (riddle answer, notice ownership in both arms, underwater dance, Daniel outside the den, the forbidden sea and early Lazarus emergence). Those requested edits are declined: altering captured outputs would invalidate the experiment, and regeneration would be another paid sample. The riddle remains an explicitly uncertain interpretation; the other listed scene faults are recorded as flawed.

Two findings concern the unchanged suite scoring template: whether neighbours may establish continuity, and the inconsistency between “every fault” and “only faults in ask.” They are deferred before any formal blind-scoring follow-up. This trial commissioned no blind scores and does not use that template as a release gate. For this unblinded inspection, neighbours establish continuing identities, place and state; they do not license bringing a later event into an earlier instant. The broader Eyford source check is separately disclosed above. Required formal fault-key coverage must follow each item's `ask`.

Final Sol review independently reproduced both replays, all three aggregate artifacts, source/reference/candidate hashes, provider accounting and the Queen expression trace. Package and candidate snapshots were unchanged before and after review. S1 remains deferred; no new blocker, should or nit findings were raised. Across preparation and final evidence, two GPT-6.1 Sol reviews approved their bounded scopes.
