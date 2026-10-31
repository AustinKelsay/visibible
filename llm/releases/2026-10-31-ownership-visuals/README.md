# Ownership wording — bounded visual comparison

**Status: complete; do not activate or broaden on this evidence.** The [two-line ownership candidate](../2026-10-31-scene-input-ownership/README.md) did not satisfy the declared visual criterion with the other inputs held fixed. The run completed 18 scheduled cases and 24 saved images, including six automatic retries. Production is unchanged.

[REVIEW.md](REVIEW.md) records the result and limits. The chosen-image narrow passes were 3/3 versus 3/3 for the pre-growth control, 2/3 versus 1/3 for giant size plus one coherent body, and 0/3 versus 0/3 for the selected late cellar instant (baseline versus candidate). These are small, unblinded model observations, not comparative-quality estimates or human acceptance.

## Frozen comparison

[plan.json](plan.json) specifies three scenes, two arms and three independent image samples per arm: **18 scheduled images**. Each scene reuses its original retained section-arm plan 1. Baseline uses the current prompt; candidate replaces only its precedence sentence and scene-plan heading. Both arms retain the original source excerpt, seven plan fields, canon, selected cast, brief, depiction rules, style, model/settings, checker description and ordered reference bytes. The previously prepared canon/plan corrections are not applied.

| Scene | Narrow question | Ordered references |
|---|---|---|
| Alice receives the errand / enters the house | Does she remain small before drinking? | Three |
| Alice grown inside the house | Is she clearly giant with one coherent body? Record the window/chimney pose separately. | Two |
| Holmes's bank cellar | Is the selected waiting/floor-light instant readable without a wall tunnel, premature thieves or a bright open lantern? | None |

The model remains `google/gemini-3.1-flash-lite-image`, Classical, 16:9. The suite labels resolution 1K; the existing adapter sends no `image_size` to this fixed-resolution model. Arm order alternates by repeat. There is no shared image seed, replanning, new sheet, manual reroll or paid scoring. The existing finished-image check may retry each case once, for at most 36 image attempts and 72 checker calls.

The criterion and interpretation limits are fixed in the plan. All three chosen candidate images in each scene must satisfy its narrow criterion before considering further study; an ambiguous or incomplete result is inconclusive, and a clear failure rejects broadening. Report first and chosen attempts separately. The checker selects on its existing faults; it does not judge these source-state criteria. Inspect every saved image at original resolution and retain failures and retries. Even a clean small result does not approve activation.

Original input conflicts intentionally remain in both arms, including the house's later-growth canon and the cellar's wall-opening canon. Earlier cellar preparations can be valid source instants while failing the specifically selected late-instant criterion. The grown-house plan still mixes poses. The experiment isolates wording over these inputs; it cannot establish that wording repairs bad saved content, that all Bible depictions are safe, or that identity survives other models/styles. Judgments are unblinded model observations, not independent blind scoring or human acceptance.

## Execution and provenance

The [driver](../../../scripts/evals/ownership-visuals.mts) reuses the existing suite, provider adapters, financial ledger, checker and retry policy. It reconstructs the original frozen packets through the reviewed ownership replay and requires the committed report to match. [packets.json](packets.json) holds the three actual prompt pairs and ordered reference metadata/hashes; [inputs.json](inputs.json) freezes 33 files.

The suite admits the original preparation. Candidate wording is a late diagnostic substitution, recorded with the actual prompt and the ownership replay's identity. `baselinePrepared` is retained evidence, not candidate cache admission. No guide, plan, canon, sheet or production prompt version is rewritten. Checker instructions are unchanged between arms.

Every paid call uses the existing ledger's pre-call price ceiling. Exhausted caps, missing prices, unknown costs, provider failures, invalid frozen inputs/references, checker errors and failed retries stop later cases. Uncertain costs retain their ceilings. The checker timeout precedes the suite timeout; any unsettled ledger call prevents a finished marker. An exclusive start marker prevents rerunning this one-shot experiment. Partial execution remains partial and inconclusive.

## Funding decision

The [previous close](../2026-10-31-scene-input-visuals/funding-close.json) records **$5.47693685** conservative cumulative spend against the user's explicit **$6 hard cap**, leaving **$0.52306315**. That authorization does not cover this proposed $1.40 operation cap.

[funding.json](funding.json) records the user's explicit approval to raise the cumulative cap to **$7** and run this comparison with a **$1.40 operation cap**. The operation maximum would reach **$6.87693685**, below $7. A fresh read-only account check found $10.005905238 available and $25.005538446 key allowance. No top-up is needed at that balance; the $5 reader reserve remains protected. Execution rechecks account funds, key allowance and current pricing immediately before starting.

Approval changed only the funding authorization record and its manifest hash; the runner, plan, prompts and reference hashes remain fixed. All inputs must be committed before spending. The preparation check demonstrated that `--execute` rejects pending authorization before reading credentials, calling the network or writing a start marker.

## Offline verification

With dependencies and the retained local reference files available, run `npm run works:import`, then `node --import tsx scripts/evals/ownership-visuals.mts --offline`. It regenerates ignored ownership-replay outputs and writes rehearsal artifacts into a temporary directory. No credentials or live provider calls are required. `--prepare` is for initial input freezing only and refuses to replace the existing manifest.

[preflight.json](preflight.json) records 18 successful fake cases, 26 fake image calls and 52 fake checker calls, with zero planning calls. All 78 outgoing fake requests match the frozen arm prompt, image settings, ordered reference bytes and unchanged per-scene checker questions. Each candidate changes exactly two lines and is 59 characters shorter. All 33 frozen hashes match.

An unavailable-reference injection after the start marker yields one failed row, zero provider calls and no finished marker. The existing delayed-check reproduction confirms retained uncertainty/in-flight reservations and prevents completion. Attempting unapproved execution fails immediately. Typecheck, focused lint and all 14 suite-runner tests pass. The full suite passed 1,052 tests with one skipped; repository lint reported zero errors and three existing warnings. These checks establish mechanics; the separate visual observations are in [inspection.json](inspection.json).

Preparation review: GPT-6.1 Sol on xhigh approved in one round with no findings, independently verifying all frozen hashes and 78 fake requests. CodeRabbit CLI raised zero issues. This approves the pre-execution package only, not spending, activation or visual quality. Final evidence review also approved with no findings: GPT-6.1 Sol independently inspected all 24 images, reconciled all 72 exchanges and request ceilings, and reproduced the four reports without writing files. The whole working tree remained unchanged during review. CodeRabbit CLI reported zero issues on the completed evidence. Both approvals cover preservation of this negative diagnostic only; neither approves activation or another run.

## Completed execution

The approved inputs were committed at `6207b13b344bee7a038a5367f676ae4048f0f945`. [started.json](started.json) and [finished.json](finished.json) bound the one-shot execution. All 18 rows succeeded; all 72 provider calls settled, with zero uncertain costs and no blocked ledger. All six cellar cases retried for lettering, which persisted; the checker retained attempt 1 in every case. First and chosen source-state counts therefore match.

[funding-close.json](funding-close.json) reconciles **$0.82552200** for 24 image attempts and **$0.01445230** for 48 checker calls: **$0.83997430** total, below the $1.40 operation cap. Conservative cumulative spend is **$6.31691115 / $7**, leaving **$0.68308885** authorized. The ending account balance was **$9.165930938**, preserving the $5 reader reserve; account and key-allowance deltas match measured spend. No planning, paid scoring or production mutation occurred.

[verification.json](verification.json) records 33 matching frozen hashes; exact original preparations and source contexts for all 18 rows; actual prompts and ordered reference bytes for all 24 images; all saved image hashes, signatures and dimensions; replay of all 48 checker answers; and reconciliation of all 72 exchanges and their recomputed pre-call ceilings. [report.json](report.json) aggregates every inspection, with first and chosen attempts separate.

Raw evidence is retained in [requests.ndjson](requests.ndjson), [results.ndjson](results.ndjson), [provider.ndjson](provider.ndjson) and [ledger.json](ledger.json). Image bytes remain in the ignored local `evals/images/runs/2026-10-31-ownership-visuals/` directory; their hashes and filenames are recorded in the results and inspection. A fresh checkout has the text evidence but not those pixels or the earlier local reference images. No rerender is a substitute for the original bytes.
