# Source-first comparison: gate failed

All **66 operations / 253 provider calls** completed for **$0.15406550**, under the owner-approved **$0.25** operation cap. There was no uncertain usage, provider-error stop, paid rerun, image generation, production access/write, deployment or activation. Public release remains on hold.

The owner replied “continue” to the concrete $0.25 evaluation-increase request after PR #270 merged. [Funding](funding.json) records that instruction and its scope. It raises evaluation from $16.95 to **$17.20**, not preparation or smoke. Funding and every frozen input were committed at `812e8e5ce3a94bb6b0b148c016a35daba5a63b93` before calls. The original [README](README.md), [plan](plan.json) and dry manifest remain unchanged as the pre-call protocol; their proposal language is historical. This file records the completed outcome.

## Measured outcomes

The primary score includes the generated shared look and final stored scene. Refusal never counts as an acceptable scene or a repair. Uncertainty counts against acceptance.

| Cohort / version | Acceptable | Flawed stored | Uncertain stored | Refused | Look contradictions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fresh, v8 baseline (23) | 6 | 5 | 2 | 10 | 3 |
| Fresh, v9 candidate (23) | 7 | 4 | 1 | 11 | 4 |
| Retained, v8 baseline (7) | 0 | 3 | 0 | 4 | 3 |
| Retained, v9 candidate (7) | 0 | 6 | 0 | 1 | 6 |
| Overall baseline (30) | **6** | **8** | **2** | **14** | **6** |
| Overall candidate (30) | **7** | **10** | **1** | **12** | **10** |

The overall paired table has five both-acceptable cases, two candidate-only, one baseline-only and 22 neither. Exact two-sided discordance p = **1.0**. Baseline acceptable rate is 20.0% (95% Wilson interval **9.5–37.3%**); candidate is 23.3% (**11.8–40.9%**). Fresh discordance p = 1.0; retained has no acceptable discordant pairs. [Tally](tally.json) contains the frozen gate result and cohort intervals; [analysis](analysis.json) adds overall and sensitivity tables. This small, failure-enriched paired diagnostic does not establish a population improvement and is not directly comparable with earlier scene-only random-verse rates.

**The strict gate fails.** Candidate misses the fresh and retained acceptance thresholds, stores flawed/uncertain packets, retains look contradictions and does not improve retained acceptance. All operations and pairs completed, and all six direct review controls pass. The two extra location reports on the second negative priest control are explicitly justified in [review disposition](review-disposition.json). A clean control draw here does not erase the preceding diagnostic's recorded false alarm.

## What remains wrong

Removing shared-look text from planning does not make the rendered input coherent. Examples below use the first masked scores; no response was repaired or selectively replaced.

- **Numbers 5:24, candidate `p010`:** the generic ritual priest is identified as Aaron without source support. The water visibly darkens, and the meal offering is already on the altar even though the next unit takes it from the woman's hand. Review returns clean. The shared look adds an unselected divine presence and evening/night light while the plan uses daylight.
- **Leviticus 26:2, candidate `p012`:** after review rejects the initial unselected manifestation, the replacement puts Moses in front of an assembly although the bounded text is God's command. The replacement review is clean. The unchanged look still depicts the mountain manifestation.
- **Psalms 95:3, candidate `p033`:** the section has no God entry, yet the scene invents a visible representation of the sovereign God with an empty selected roster. It also uses bodily denials and morning light against an afternoon look. Review is clean. This needs required canon or another permissible instant, rather than an unbound recurring identity.
- **Exodus 14:5, candidate `p025`:** a source-compatible Egyptian court plan is combined with a shared sea-camp/pursuit look, a different time and an unselected divine effect.
- **Jeremiah 10:14 and Ezekiel 40:24, both arms:** a goldsmith or measurement scene can be sound while shared lighting supplies cloud/fire-like radiance absent from the selected cast. Candidate Jeremiah also changes midday against the look's late afternoon.
- **Lamentations 4:7, candidate:** the first attempt still substitutes priests even without access to shared-look values. Review catches that identity error; the re-plan refuses for an omitted city-street entry. Request isolation does not remove all sources of identity substitution.

The source-first planner has **13/30 acceptable scene fields/selections** versus baseline **10/30**, when shared-look defects are excluded. This descriptive split was recorded as `plannerVerdict` before unblinding; it is not a replacement for the frozen complete-packet gate. Paired discordance is six candidate-only versus three baseline-only (p = **0.5078125**). Independent cold look draws and single-operator judgments prevent attributing a pure causal planner effect. The candidate still has four flawed and one uncertain stored plans, apart from looks. There is no justification for images or rollout.

## Masking and sensitivity

The operator read the opaque [packet](blind-packet.json), including source, available cast and selected assigned canon, before inspecting the arm key, review, grounding or version labels. Execution progress had exposed operation IDs and stored/refused outcomes; retained cases were familiar and duplicate verses recognizable. This is procedural masking by one operator, not independent adjudication. All first [scores](operator-scores.json) and the packet were committed at `7be55d9` before unblinding or running the scored audit. The masked-file CodeRabbit review raised zero issues; it is not independent semantic scoring.

The score reasons preserve material interpretation limits: `p006` leaves reclining/seated alternatives; `p019`/`p024` may permit representative epistolary teaching; `p013` may permit Sinai as a sacred-setting illustration; `p016` may be read as a list of separate section settings rather than a Jerusalem harbor; `p031` could be read as literal poetic personification, despite conflicting city canon. Accepted borderline readings include ambient dawn glow in `p008`, local disciples standing while travelers kneel in `p018`, varied group prayer postures in `p020`, situational mourning clothes in `p026`, village alternatives in `p027`/`p032`, and incidental roadside props in `p030`.

Post-unblinding sensitivity, without changing first scores:

- Accepting all three uncertain complete packets gives **8/30 for each arm**.
- Ignoring every look defect and accepting every uncertain planner interpretation gives **14/30 candidate vs 13/30 baseline** (paired p = 1.0).
- Even accepting **every candidate stored packet**, including all disputed and definite defects, gives at most **12/23 fresh and 6/7 retained**. Refusals alone make the required 22/23 and 7/7 impossible. Any individual disputed score therefore leaves the gate failed.

Look contradictions here are conflicts in the supplied text. No images were generated, so their actual rendering influence is unmeasured. Listing clothing for an unselected actor or alternative locations across a section was not automatically scored as a contradiction; active incompatible effects, fixed times/places and canon conflicts were assessed explicitly.

## Reproduction and accounting

A fresh clone must retain or fetch the evidence PR head so the pre-call and masked-score commit objects are available; a squash merge alone does not make those intermediate commits ancestors of `dev`.

`audit.mts finalize` forbids network and replays all 253 saved requests/responses through both actual implementations. It verifies request hashes, schemas, source/git provenance, results, charges, cap and score coverage against the pre-call commit. `dry-run.mts verify` still passes. A second execution was refused at the existing one-shot marker before credentials/network, leaving all paid artifacts unchanged. [Execution validation](execution-validation.json) records these checks. The API-key leak scan passes.

[Budget](budget.json): evaluation measured total **$17.05523880**, retained uncertainty **$0.045**, remaining **$0.09976120 / $17.20**. This operation has zero new uncertainty. Preparation remains **$39.31319680 / $43**, smoke **$0.31420500 / $1**. Shared account-balance deltas are not used as operation cost. The grant funded this single frozen comparison, with no iterative rerun or transfer.

The final full-branch CodeRabbit attempt returned **0 issues** with **one unreviewed file** (`completed_with_warnings`, exit 1); the CLI did not identify that file. This is incomplete coverage, not a clean full-branch review. [Review metadata](results-review.json) and the raw log preserve the warning. The earlier funding-only attempt skipped the untracked file and is not counted as a review.

No application code changed in this evidence branch. Candidate verification from PR #270 remains **987 tests passed, one existing skip**, with lint/typecheck passing. The meaningful new checks are complete offline replay, frozen-input verification, score coverage, accounting and one-shot refusal. The frozen scripts and protocol remain untouched so replay can continue to verify their recorded hashes.

## Next decision

The [next-step proposal](next-step.json) recommends reviewing the final combined rendering input contract before another prompt-only tuning cycle. The reviewer currently sees scene fields and cast identity/form, but not the shared look or complete selected canon. It therefore cannot reject a correct scene paired with a conflicting look or every fixed-appearance substitution. Merely giving the same reviewer more context would detect failures but cannot repair an unchanged bad look; any bounded repair must identify which artifact owns the conflict and invalidate/version it coherently. Original generated and owner-authored prose should remain intact in evidence; no string-based name removal or silent canon rewrite is proposed.

Source/cast identity and missing-canon failures also remain independent blockers. A proposed contract should first replay these retained exact failures offline, then freeze a new ordinary/hard-case text evaluation with current pricing and a concrete cost cap before paid execution. The remaining allowance does not authorize a tuning loop. The $2 visual pilot, broad visual matrix, current full-request latency/accounting, human acceptance, activation and named first-24-hour follow-up remain outstanding.
