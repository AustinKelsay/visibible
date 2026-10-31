# Source-context diagnostic — local only

This paired diagnostic tests whether supplying the existing planner and its existing review with the complete same-section source preserves temporary scene state. It does not change production prompts, canon, reference sheets or active data. No extracted facts or additional model stage is introduced.

The baseline receives the current focal moment and bounded immediate neighbours. The candidate receives those identical inputs plus the whole section, separated into before, focal and after. Both arms use the same model/settings and the same frozen guide per case. They make three independent plans each for six predeclared moments across Alice, the Bible and Holmes. Twelve image trials draw the corresponding frozen plans for Alice's giant-size scene and the house-entry transition control, from the same reference pool; existing cast selection determines attachment inclusion and order. All samples, failures and retries are retained.

The cases, source boundaries and acceptance questions are frozen in `plan.json`, `scenes.json` and `inputs.json`. This is a small diagnostic, not the multi-work release gate. The Bible and Holmes inputs reuse the retained snapshot; Alice uses the local candidate from the previous diagnostic. Same-section context cannot recover facts outside that section. Initial inspection and scoring are unblinded model review, not human acceptance.

The follow-up has a $2 hard cap within the original $6 allowance: $2.88026715 already conservatively accounted plus at most $2 here. The shared account must still retain $5 for readers. The extra $0.10 scoring allowance is reserved and may remain unused. Each phase is one-shot; an interrupted phase keeps its costs and results and is not automatically retried.

## Verification

`npx tsx scripts/evals/source-context.mts --offline` rehearses both phases in a temporary directory after `npm run works:import`. The rehearsal checks 36 plans and 12 images, one shared guide version per case, paired first-plan requests differing only by added source, and zero planning calls during rendering. A regression test covers seeding only a guide in the text tier; the suite previously mislabeled those fresh text plans as stale image seeds. Image-seed protection remains covered by its existing tests.

Live execution requires the committed contract, a clean tracked checkout and `VISIBIBLE_EVAL_ENV_FILE`, then `--execute --phase text` or `--execute --phase images`. Image execution pins the completed text artifacts by hash. Provider logs retain the actual requests, responses and cost reservations. No phase is permission to activate a candidate.

Local CodeRabbit review inspected the tracked suite-run/test changes and repeated the old seeded-text guard finding. The working tree already uses `drawsSeeds`, and the regression test fails before that change and passes afterward. The new diagnostic script remains in scope for the final independent review.

## Result: do not promote this candidate

The diagnostic completed **36 plans and 12 image trials (14 saved attempts)**. Complete same-section source helped the house-entry transition in this small sample, but did not reliably preserve Alice's giant state in the gloves scene. One candidate final plan lost the height detail during feedback re-planning even though the full source remained available; its image showed ordinary child scale. The predeclared all-three requirement fails. Production prompts, canon, sheets and active data stay unchanged.

Read [text inspection](TEXT-REVIEW.md) and [image inspection](IMAGE-REVIEW.md) for every case, ambiguities, the two lettering retries and residual control defects. These are unblinded model judgments, not independent blind scores or human acceptance. Reference assets are fixed, but the plans change actual sheet selection/order in three image pairs. The sample cannot isolate attachment effects or establish overall quality improvement.

Mechanical verification confirms all 18 first-plan request pairs differ only by the appended source block, each case reuses one guide version, and images reuse the exact frozen plans/context with zero planning calls. Source and image hashes, actual sent references, provider costs and JSON/NDJSON records reconcile. All image attempts were inspected at original resolution. Pixels are retained locally; committed artifacts contain paths and hashes.

[Closed spend](funding-close.json): **$0.55873310 measured, $0 uncertain** ($0.06289470 text + $0.49583840 images/checks). The optional scoring allowance was unused. Including the prior diagnostic, the conservative cumulative total is **$3.43900025 of $6**. A closing account read confirmed the $5 reader reserve remained protected.

The reusable code change is one eval-runner guard: a text trial can reuse a frozen guide while generating a fresh plan; image trials still refuse stale seeds. Its regression failed before the fix and passes afterward. Routine verification passed: **1,052 tests, one skipped**, typecheck, and lint with three existing historical warnings. The second CodeRabbit CLI attempt skipped untracked artifacts rather than reviewing them.

## Implication

More actual source can help, but inserting it upstream does not ensure the final image retains it. The next design question is how to keep temporary source state available through the final rendering step without creating another facts store or review layer. This run does not authorize a production change or another paid experiment. Preserve the current engine until a separately frozen candidate passes its relevant quality gates.
