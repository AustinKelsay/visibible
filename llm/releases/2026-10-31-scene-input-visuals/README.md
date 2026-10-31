# Corrected scene inputs — bounded visual comparison

**Status: completed; the candidate failed the declared criterion. Do not activate or broaden on this evidence.** This follows the [prepared corrections](../2026-10-31-scene-input-corrections/README.md) and tests them with the current rendering prompt. It does not use the earlier whole-source/precedence candidate, change production, or activate corrected analysis.

The question is whether removing the demonstrated input conflicts helps before changing generic prompt ownership. [plan.json](plan.json) fixes three scenes, two arms and three independent renders per arm: **18 scheduled images**, with the existing finished-image check and at most one automatic retry per case. The model is `google/gemini-3.1-flash-lite-image`, Classical, with the suite’s 1K resolution label and 16:9 aspect ratio. The existing adapter omits `image_size` for this fixed-resolution model; every returned image is 1376 × 768. Each scene reuses its retained section-arm plan 1 for all three repeats; these are repeated image samples, not three independent plans.

| Scene | Candidate change | Other inputs |
|---|---|---|
| House entry | Remove the house canon's premature grown-Alice clause | Original plan unchanged; three ordered reference images |
| Grown house | Same canon removal; remove the competing earlier pose from the action | Other six scene fields unchanged; two ordered reference images |
| Bank cellar | Remove permanent wall tunnel; choose the floor-light instant and concealed Merryweather | Other five scene fields unchanged; no reference images |

Source excerpts, ownership/precedence wording, brief, other canon, style, selected cast, composition and render settings stay fixed between arms. Arm order alternates by repeat. There is no shared image seed. The candidate bundles canon and plan corrections for two scenes; this cannot isolate their separate contributions. The house-entry control changes canon only. All attempts, including failed and rejected ones, must remain in the evidence.

## Diagnostic binding, not cache activation

The small [driver](../../../scripts/evals/scene-input-visuals.mts) uses the existing `runSuite`, provider adapters, cost ledger, checker and retry policy. It reconstructs the retained baseline packets, then substitutes only unique full canon/plan lines from the corrected payloads. [packets.json](packets.json) freezes both actual prompts, ordered reference hashes, original/corrected payload versions and checker descriptions. [inputs.json](inputs.json) binds these to 29 file hashes.

The suite admits **the original frozen preparation**. The corrected prompt is an explicit late diagnostic substitution; it is not a correctly admitted cached plan for new canon. No guide, plan or sheet is rewritten or marked fresh. Results call the retained preparation `baselinePrepared`, record the arm and actual prompt, and include the diagnostic version bindings. The generated guide is not rendered and is not revalidated. There is no location sheet for either correction in the retained manifest. Alice's character/style reference pixels are held exact; Holmes retains the earlier diagnostic's absence of references.

The finished-image checker receives each arm's actual primary-subject/secondary-elements description. Only the cellar candidate changes that description. Other checker instructions and selection policy stay fixed. These checks select on lettering/edges and related existing faults; they do not certify the corrected source state. The interpretation must compare first attempts and chosen attempts separately.

## Funding and stopping

[funding.json](funding.json) records the existing authorization and the read-only balance check. The **$1.40 operation cap** plus the previous **$4.56553530 conservative total** is **$5.96553530**, below the original $6 grant. The account had $10.917306788; execution must recheck that at least the $5 reader reserve plus the operation cap remains, along with the key allowance and actual model prices. No new money is requested or assumed.

Every paid call uses the existing ledger's pre-call price ceiling. A missing price, exhausted cap, unknown cost, provider failure, invalid frozen prompt/reference, failed checker or failed retry stops the run. Unknown costs retain their reserved ceilings. The checker timeout is 25 seconds, before the suite's 30-second timeout, and any unsettled call prevents a finished marker. No resume or manual reroll is provided. A partial run stays partial and inconclusive.

The live run requires a clean committed checkout and uses an exclusive start marker. Provider logs are scrubbed, image bytes are stored outside tracked evidence, and the private environment file must keep the production engine disabled and omit an owner session. No deployment client is used.

## Offline proof and interpretation

[preflight.json](preflight.json) records the network-free rehearsal: 18 completed rows, 26 fake image calls, 52 fake checker calls and zero planning calls. All 78 transmitted fake requests were checked against the actual frozen prompts and arm-specific checker descriptions. The candidate alters exactly one, two and three prompt lines respectively; all 29 hashes match. Simulating unavailable reference bytes after the run starts produces one failed row, zero provider calls and no finished marker, rather than continuing to later cases. The existing delayed-check reproduction also retains uncertain ceilings and disallows completion while sibling calls remain unsettled.

Typecheck and focused lint passed. The existing suite-runner tests passed all 14 tests; repository lint has zero errors and three pre-existing warnings. No runtime code or shared test framework changed. The first test invocation used a nonexistent filename and found no tests; the corrected invocation passed the actual suite.

The pre-execution plan and runner received Sol approval with no findings; CodeRabbit raised zero issues. All 26 original-resolution attempts have now been inspected, including eight retries. [inspection.json](inspection.json) preserves each judgment and its image hash; [report.json](report.json) aggregates first and chosen attempts separately. These assess giant size, a coherent body, the chosen cellar instant and the entry control alongside remaining spatial/anatomical, identity and lettering faults. Earlier valid cellar preparation is a different source-supported instant, not automatically a baseline failure for lacking the later floor glint. A visible wall tunnel, premature thieves, or incompatible lantern state is a separate source-state question.

These are unblinded model observations on three selected scenes, not human acceptance, independent blind scoring, evidence for all books, or permission to activate the candidate. Even a clean small result would justify only further consideration, not a production correction or broader prompt change.

## Results

The first and chosen images have the same scene-criterion counts. Two entry retries removed checker-reported lettering; every cellar retry retained lettering, so the checker kept the first attempts. No grown-house image was retried. “Pass” below means only the named criterion, not complete source fidelity or acceptable overall quality.

| Narrow criterion, chosen images | Original | Corrected |
|---|---|---|
| Entry: no premature growth | 3 pass | 3 pass |
| Grown house: clearly giant and one coherent body | 2 pass, 1 fail | 1 pass, 1 fail, 1 unclear |
| Cellar: selected later waiting/floor-light instant | 0 pass, 2 fail, 1 unclear | 0 pass, 3 fail |

All six grown-house images clearly depict a giant. The narrower single-body test separates that success from extra or ambiguous limbs. None faithfully establishes the requested arm-out-window/foot-up-chimney arrangement: even the body passes retain spatial/pose errors. Candidate repeat 3 still has an extra arm, and repeat 1 has an ambiguous toe-like shape under the hem. The corrected cellar first attempts all retain a visibly open lantern; two retries are less clear, but were not selected and are not promoted into successes. These small samples do not establish a statistical regression or identify which input causes the failures.

The entry control also retains unrequested mushrooms/maze scenery, variation in apparent age and cottage design, and one replacement's small black square artifact. Holmes identity and beard/costume details vary without reference attachments. No independent identity or adaptation-likeness score is claimed. The judgments are unblinded model observations, with ambiguous limbs and lighting kept explicit. The original early cellar preparations can be source-supported even when they fail the specifically selected late-instant criterion.

[verification.json](verification.json) reconciles all 29 frozen input hashes, 26 image signatures/hashes, all actual prompt/reference attachments, 52 raw checker responses, and all 78 settled ledger exchanges. The full pre-execution test suite passed 1,052 tests with one skipped; runtime code, work data, styles, schemas and dependencies still match the base. [REVIEW.md](REVIEW.md) records the evidence and limitations.

[funding-close.json](funding-close.json): images **$0.89539125** + checks **$0.01601030** = **$0.91140155**, with no new uncertainty. Conservative cumulative spend is **$5.47693685 / $6**, leaving **$0.52306315** of the original allowance. The ending balance is **$10.005905238**, preserving the $5 reader reserve. Account and key-allowance deltas match the ledger within stored-number precision. There were no production mutations, planning calls or paid scoring calls.

The useful result is bounded: removing these textual conflicts alone did not deliver the intended visual states under the existing prompt. Keep the correction copies offline. This does not prove that the text corrections are wrong, that stronger instructions would work, or that generic prompt ownership should change without separate evidence. No additional paid run is part of this package.

Review complete: GPT-6.1 Sol on xhigh approved preparation and final evidence in two rounds with no findings. It independently inspected all 26 images and reconciled provenance, raw responses, aggregates and funding. CodeRabbit CLI raised zero issues in both passes. This approves the evidence record and negative conclusion, not activation.
