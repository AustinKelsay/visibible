# One scene description — paired text comparison

**Prepared, not executed.** This compares real model-authored plans under the current seven-field contract and the [approved one-paragraph candidate](../2026-10-31-scene-description/README.md). The candidate remains unapplied in the application checkout. This packet authorizes no deployment, production correction, image run or activation.

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

Before execution, commit the exact prepared inputs in each isolated arm and verify them against `preflight.json`; the candidate copy must contain only the reviewed patch beyond the control code. Use the existing `run --execute` command with the private evaluation environment file. Do not apply the candidate to the application checkout to run it. Final execution evidence and its review remain pending.

Pre-execution Sol review approved the prepared experiment; CodeRabbit completed with zero findings. S1 (nit) is deferred: an image run cannot yet chain through a paired text run to the original snapshot/reference directory. That path fails before provider calls and is outside this text-only scope. Resolve or reject that chaining before an image follow-up; do not infer image-run readiness from this approval.
