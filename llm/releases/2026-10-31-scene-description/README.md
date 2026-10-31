# One scene description — offline implementation candidate

**Status: implemented and tested in an isolated copy; unapplied here. No model calls, generated images, deployment, or production data writes.** This package follows the [input-conflict audit](../2026-10-31-scene-input-conflicts/README.md) and the [unsuccessful ownership-wording trial](../2026-10-31-ownership-visuals/README.md). It simplifies the scene contract; it does not claim better pictures.

The model currently describes one moment in seven fields and a separate audit `instant`. Rendering reads all seven, the image checker reads two, and reference ranking searches subject/action text for names. These representations can disagree. The candidate lets the model write one scene paragraph and explicitly order its selected cast.

```text
BEFORE                                    CANDIDATE
Source → model → 7 scene fields + instant  Source → model → scene paragraph
                 ├ rendering: 7 fields                      ├ rendering
                 ├ checking: 2 fields                       ├ checking
                 └ sheet priority: name search              └ plan review

Selected cast → canon + sheets            Ordered selected cast → canon + sheets
Style + provider settings stay separate    Style + provider settings stay separate
```

## Contract

The new planner reply has three fields:

```ts
{ focusQuote: string, selectedCast: [{ entryId, evidence }], scene: string }
```

- `focusQuote` and selection evidence remain model assertions recorded for audit, not extracted facts or proof of fidelity.
- `scene` describes one visible instant, including action, placement and changing state. The planner leaves recurring appearance to canon and artistic treatment to style. New records store only `plan: { scene }`, with no duplicate `grounding.instant`.
- Review, rendering and finished-image checking consume that same description. Existing effects-mode name substitution still applies when rendering; this patch does not change depiction policy or source suppression.
- Selected cast order supplies reference priority within each kind. The existing character/place/object slot policy and three-reference cap remain. New scenes use no prose name matching. A reviewer-added cast entry is still appended, as today.
- The paragraph must be nonblank and at most 2,800 characters, the former seven-field total. Invalid paragraphs use the existing malformed-reply retry and then stop preparation. Accepted paragraphs are never clipped. The existing final-prompt cap still rejects overflow.

This is a replacement contract, without an additional planner, review pass, feature flag, table, or version entity. Source windows, ownership/precedence wording, owner constraints, canon, reference bytes, styles, depiction profiles, preparation accounting, image admission and settlement are not redesigned. In particular, this does **not** combine the failed full-source or ownership-wording candidates with the new scene format.

## Compatibility and limits

The patch changes planner, review and rendering prompt versions. If eventually activated, future preparation refreshes plans lazily through the existing claims and owner-funded ledger; it does not rewrite old images or analysis history. Looks do not refresh solely for this contract change. Existing accepted generation packets remain immutable. Activation would need a funding check for refreshed plans and deployment-specific inspection of owner corrections/pins.

The storage validator, pure packet builder and consistency reader retain the legacy shape. Historical packet rendering retains its old labels and name-based reference priority. That compatibility code is read support, not a second production planner. Old records are not mechanically converted into purported new model results. Ten historical runner call sites are adjusted only because they call current preparation and must compile with its new return type; reproduce old experiments at their recorded commits, not against this candidate's changed planner.

The six core engine/schema files change by **42 added / 55 removed lines (net −13)**. Including fixture migrations, assertions, eval consumers and golden request snapshots, the patch changes **43 files, 268 added / 193 removed lines (net +75)**. This is a smaller model interface and a modest core reduction, not a large repository-size reduction. Most patch bytes are existing long golden-request strings being updated.

## Verification

[verification.json](verification.json) binds the patch to base commit `30b397303a88e71f754633a5fc75a131293a30b3`, file hashes and observed checks. The implementation was exercised in a disposable copy of that commit, with imported local work fixtures and scripted providers:

- Full suite: **1,057 passed, one existing skipped test**; 110 passing test files.
- CodeRabbit reviewed all 43 applied candidate files and raised zero issues.
- Typecheck passed. Lint: zero errors, three existing warnings. Diff whitespace and patch applicability passed.
- Real Convex test storage accepts new scenes, preserves legacy records, refreshes stale plans and reuses new plans across styles.
- Empty, whitespace-only and oversized descriptions stop after the existing retry without storing a plan or loading image references. A long valid description is retained exactly.
- A scene mentioning Aaron first still uses the model's explicit Moses-first selection for sheet priority; missing/stale sheets and slot limits retain their behavior.
- The suite prepares one paragraph, renders it and checks the exact same paragraph; stored output has no seven-field plan or duplicate instant. Existing tests retain owner-constraint, source-grounding, effects/symbol, billing and replay checks.
- Blind scorer packs retain the paragraph for new text/image results and the seven original fields for historical results. Two actual-CLI tests reproduced the missing description before the review fix and pass afterward with networking blocked.
- Bible, Holmes and Alice golden requests are regenerated deliberately. Many unrelated tests mechanically join their old seven-field fixtures to exercise plumbing. Those joined fixtures are **not model-authored candidates or visual-quality evidence**.

Reproduce in a disposable checkout at the base commit with dependencies installed:

```sh
git apply --check /absolute/path/to/candidate.patch
git apply /absolute/path/to/candidate.patch
npm run works:import
npm run typecheck
npm run lint
npm test -- --run
```

The [patch](candidate.patch) includes all test and golden updates; no regeneration command or production credentials are needed. The source checkout's runtime remains unchanged because the patch is stored as an artifact, not applied.

## Decision before activation

This removes the opportunity for different fields to give different poses; it cannot stop a single paragraph from being wrong or internally contradictory. Ordering cast explicitly may change which reference sheets win scarce slots. Supplying the full scene to the image checker changes its evidence and may change retries. These are quality changes that offline tests do not settle.

The next useful experiment is a paired text comparison using the existing suite: fresh model-authored descriptions under this contract versus the current contract, with source, canon, guides and model settings held fixed. Examine scene fidelity, contradictory poses, cast selection and sheet priority; preserve weak outputs. Proceed to paired images and the existing release gates only if that evidence supports it. No new paid runner or run is included here. The previous cumulative evaluation spend remains **$6.31691115 of the $7 cap**, with the $5 reader reserve protected; this candidate has spent **$0** of it.

Sol round one found S1: the current blind-scoring CLI still extracted only the seven legacy fields. The candidate now selects the new scene when present and retains the historical fallback. This is verified by the real CLI for both tiers; Sol round two independently reproduced the two passing CLI checks and verified all patch/file/log hashes. S1 is resolved; the offline candidate is approved, with no unresolved or declined findings. This approval does not activate the patch or authorize further spend.
