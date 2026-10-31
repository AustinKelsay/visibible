# Canon identity versus moment state: reviewer-only diagnostic

Status: prepared, not executed. The candidate is **not activated**. No production data, runtime source, defaults or schemas change in this package.

The previous paired text experiment captured a source-supported Queen smile being rejected because her saved canon says “a stern, frowning face.” The subsequent replan restored the frown. The [prior report](../2026-10-31-scene-description-text/README.md) preserves that negative result. This diagnostic asks whether the existing reviewer can enforce recurring identity without treating moment-specific state as permanent design.

## Trace and smallest candidate

The [canon drafter](../../../src/lib/reading-pass/canon.ts) already says to leave out expressions. The saved Queen description violates that instruction; another drafter prohibition would duplicate it. The [reviewer](../../../src/lib/engine/plan-review.ts) receives the complete selected canon, calls it fixed identity, and currently defines `canon_conflict` as any contradiction with that canon. The [preparation path](../../../src/lib/engine/preparation.ts) feeds that judgment into one replan. Quote validation establishes that a phrase was supplied, not that its interpretation is correct.

The [unapplied patch](candidate.patch) changes only the reviewer version and one fault definition:

> The scene changes a selected entry's recurring identity without source support. Judge enduring design, not moment-specific state. Quote the scene detail.

The definition is generic. It adds no character rules, extracted-fact store, model call or new review layer. Global ownership wording, rendering precedence, owner constraints, schemas, reasoning, provider settings, and all other fault definitions stay fixed. This tests the review decision only, not its downstream replan or rendered result. The patch remains unapplied even if this narrow test succeeds.

## Frozen comparison

[cases.json](cases.json) supplies six fixtures. Each arm runs three times, reversing arm order on the middle repeat. All 42 requests use the retained model and provider settings. There are no paid rerolls or malformed-reply retries in this diagnostic.

| Case | Provenance and change | Expected targeted judgment | Arms |
|---|---|---|---|
| Retained Queen paragraph | Exact request at row 308 of [candidate provider exchanges](../2026-10-31-scene-description-candidate/provider.ndjson) | No Queen canon conflict for the smile | Original/rule × original canon/one-clause removal |
| Current Queen smile | Row 278 of [control exchanges](../2026-10-31-scene-description-control/provider.ndjson); only “eyes narrowed in listening” becomes “smiling as she listens” | No Queen canon conflict | Original/rule |
| Current Queen design | Same control request; only long silver hair is added against saved dark hair | Queen canon conflict | Original/rule |
| Changing clothing | Invented passage explicitly removes Mara's usual red coat | No Mara canon conflict | Original/rule |
| Recurring identity | Invented passage does not support changing Mara's hair and eyes | Mara canon conflict | Original/rule |
| Binding owner constraint | Invented coat-removal passage and plan conflict with an explicit owner requirement to keep it on | Owner look conflict | Original/rule |

The data-only arm removes exactly `a stern, frowning face and ` from a diagnostic request copy. It does not edit canon records or pretend to refresh dependent sheets/plans. The owner case accepts a `look_conflict` regardless of whether its valid cast ID is supplied or left empty.

The paragraph fixture comes from an **unactivated** implementation and retains its paragraph-specific system/schema wording. The other two Queen cases use today's seven-field protocol, and generic fixtures are built by today's `planReviewUser`. This separates the narrow review-rule comparison from the larger scene-format proposal. Both literary requests contain other defects. Their complete replies remain evidence; avoiding the targeted Queen conflict cannot make the whole scene acceptable. The source span contains listening as well as smiling, so this experiment does not assert that every valid illustration must show the smile.

The predeclared [criterion](plan.json) requires every candidate repetition to avoid the false canon conflicts and catch both identity controls and the owner conflict. Target presence is a convenience flag, not an independent semantic score. After execution, inspect **every reason and quotation**, including other reported faults; invalid or ambiguous target judgments cannot count as passes. These fixtures are selected after seeing the failure, and interpretation will be unblinded. Three repetitions establish neither population accuracy nor image improvement. A successful rule would still require broader regression evidence before activation.

## Funding and failure behavior

The existing user grant is **$7 cumulative**, with **$6.63054885** conservatively spent and **$0.36945115** remaining in the [prior funding close](../2026-10-31-scene-description-text/funding-close.json). This run has a **$0.15** operation cap, bounding the cumulative total at **$6.78054885**. The **$5 reader reserve** stays protected. No top-up or budget increase is requested.

The [runner](run.mts) verifies frozen hashes and patch applicability, matches rehearsal requests, requires a clean committed preparation, checks live account/key funds, and prices all scheduled calls before creating its single-use start marker. It uses the existing suite ledger, a 25-second provider timeout, per-call funding checks and reservations. Provider errors, missing usage, invalid JSON/schema, changed inputs or unsettled accounting stop the run. Partial evidence is retained and does not meet the criterion. No image, planner, replan, persistence or activation calls are made. A model-reported fault is an observed outcome, not a runner error to retry.

## Offline reproduction

From the repository root after `npm ci --legacy-peer-deps`:

```sh
node --import tsx llm/releases/2026-10-31-canon-review-boundary/run.mts
```

Default execution is network-free and does not read credentials. It constructs the exact 42 requests, checks source hashes, rehearses the loop using fixed empty reviews, and verifies that an HTTP failure or malformed reply prevents a second call. Those empty fake replies test mechanics only. It writes [verification.json](verification.json); [manifest.json](manifest.json) records the frozen input bytes. Live execution is separate (`--execute`) and requires the reviewed preparation plus the existing authorized evaluation environment file.

Preparation checks passed: network-blocked replay on Node 20.20.2 and 26.12.1; 1,053 tests passed and one skipped with coverage thresholds satisfied; typecheck passed; repository lint had zero errors and three existing warnings; patch applicability and diff whitespace checks passed. CodeRabbit completed with zero findings across all eight files. Independent pre-execution review approved round 1 with no findings, reproduced the offline evidence, checked failure stops with fake providers, and confirmed $0.10589010 in scheduled ceilings at retained prices. Live pricing and funding must still pass. No paid execution has occurred.
