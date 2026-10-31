# Corrected scene inputs — bounded visual comparison

**Status: prepared and rehearsed offline; no paid images yet.** This follows the [prepared corrections](../2026-10-31-scene-input-corrections/README.md) and tests them with the current rendering prompt. It does not use the earlier whole-source/precedence candidate, change production, or activate corrected analysis.

The question is whether removing the demonstrated input conflicts helps before changing generic prompt ownership. [plan.json](plan.json) fixes three scenes, two arms and three independent renders per arm: **18 scheduled images**, with the existing finished-image check and at most one automatic retry per case. The model is `google/gemini-3.1-flash-lite-image`, Classical, 1K, 16:9. Each scene reuses its retained section-arm plan 1 for all three repeats; these are repeated image samples, not three independent plans.

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

Before any paid execution, review this frozen plan and runner. Afterwards inspect every original-resolution attempt and retain uncertain judgments. Report whether giant size, a coherent pose, the chosen cellar instant and the entry control meet the declared criterion, alongside remaining spatial/anatomical, identity and lettering faults. Earlier valid cellar preparation is a different source-supported instant, not automatically a baseline failure for lacking the later floor glint. A visible wall tunnel, premature thieves, or incompatible lantern state is a separate source-state question.

These are unblinded model observations on three selected scenes, not human acceptance, independent blind scoring, evidence for all books, or permission to activate the candidate. Even a clean small result would justify only further consideration, not a production correction or broader prompt change.
