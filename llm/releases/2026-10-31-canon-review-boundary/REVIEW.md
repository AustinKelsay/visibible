# Completed reviewer-boundary comparison

**The narrow target criterion passed; activation is not supported by this diagnostic.** The rule candidate avoided the captured expression error and retained the intended positive controls. The current rule also answered most targets correctly, the data-only correction worked on the captured case, and other judgments remained variable.

I inspected all **42 responses and all 37 reported problems**, including their quotations and reasons. This is unblinded model inspection of fixtures chosen after observing a failure, not independent blind scoring or human acceptance. Counts below concern the declared target only; a matching target does not make the whole review correct.

## Observed target judgments

| Fixture | Current rule, original canon | Candidate rule, original canon | Current rule, cleaned canon | Candidate rule, cleaned canon |
|---|---:|---:|---:|---:|
| Captured Queen paragraph: correctly allows smile | 2/3 | 3/3 | 3/3 | 3/3 |
| Current seven-field Queen: correctly allows smile | 3/3 | 3/3 | — | — |
| Current seven-field Queen: catches changed hair | 3/3 | 3/3 | — | — |
| Generic passage: allows explicit coat removal | 3/3 | 3/3 | — | — |
| Generic passage: catches changed hair and eyes | 3/3 | 3/3 | — | — |
| Owner constraint: catches instruction to keep coat on | 3/3 | 3/3 | — | — |

The [complete answers](answers.ndjson) and [raw exchanges](provider.ndjson) preserve each response. The [report](report.json) reproduces these counts and records **21/21 candidate target matches**, including the three combined rule-and-data trials. This is not a score for scene quality or general reviewer accuracy.

In `queen-retained-paragraph/baseline/original/1`, the reviewer again rejected “eyes narrowed in a pleased, attentive smile” because the saved canon says stern and frowning. The focal source explicitly includes the Queen smiling. The other two identical baseline requests did not report that conflict. This reproduces the failure once in three trials; it does not establish a stable baseline failure rate or a reliable treatment effect.

Removing the frown clause alone avoided this target error in all three trials, as did changing the rule alone. The combined arm also avoided it, but this sample establishes no additional benefit from combining them. The current seven-field smile control passed with both rules, so the observed improvement is confined to the retained paragraph request in this sample.

The Queen hair control and the invented hair/eye control contain genuine unsupported design changes; every arm detected them. The coat-removal passage explicitly supplies a temporary state change, and every arm allowed it. All owner-constraint replies quoted the exact requirement to keep the coat on and correctly identified its conflict with the source and plan. Thus the candidate did not simply stop reporting all canon conflicts or erase the separate owner-constraint category in these fixtures.

## Other findings matter

Both rules still overinterpreted clothing once. `queen-current-design/baseline/original/1` combined its valid silver-hair objection with a distinction between a heart-patterned robe and the saved crimson gown. `queen-current-design/rule/original/2` reported that garment distinction as a separate canon conflict, in addition to correctly catching silver hair. The short robe description does not establish a contradiction with a gown trimmed with hearts. I do not count that extra distinction as a supported identity fault. The target flag remains true because the separate hair objection is valid; the flag cannot reveal this overreach.

The retained paragraph's card-soldier `missing_canon` finding appeared in **2/3 current/original**, **1/3 candidate/original**, **2/3 current/cleaned**, and **0/3 candidate/cleaned** replies. These figures are explicitly depicted without a matching section cast entry. Some reasons also asserted source absence; the target comparison does not validate that broader assertion. The variation warns against treating an empty review as proof that the scene is sound, and the sample is too small to attribute a general regression to the rule or the canon edit.

Every current seven-field Queen reply still identified the unselected hedgehogs. No other problems were reported in the invented controls. All reported quotations and cast IDs pass the applicable mechanical checks; that check does not validate their meanings.

## Integrity and limits

All 40 frozen input hashes match. All 42 outgoing request hashes match the pre-execution rehearsal, all 42 saved answers match the raw provider responses, and all 42 ledger charges reconcile to provider usage. Each call settled within its reserved ceiling; there were no retries, errors, refusals, unresolved reservations or uncertain charges. The approved runner and candidate patch are unchanged. Production source, settings and inputs remain at the base revision.

Spend was **$0.01711370** against the **$0.15** operation cap; cumulative conservative spend is **$6.64766255 / $7**, leaving **$0.35233745** authorized. The later [funding close](funding-close.json) records **$8.835179538** remaining in the account, preserving the **$5** reserve. Account and key-allowance deltas match measured spend within floating-point precision. The earlier `run-finished.json` balances remain intact and reflect propagation delay.

This test isolates a reviewer decision. It neither repairs existing canon, refreshes reference images, exercises replan behavior, evaluates rendered identity, nor passes the project's broader quality/consistency gates. The one-line rule remains an **unapplied candidate**. Preserve this evidence, keep production unchanged, and require broader current-protocol regression evidence and deployment-specific inspection before any activation or saved-canon correction. No additional run is scheduled by this package.
