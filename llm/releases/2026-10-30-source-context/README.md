# Source-context diagnostic — local only

This paired diagnostic tests whether supplying the existing planner and its existing review with the complete same-section source preserves temporary scene state. It does not change production prompts, canon, reference sheets or active data. No extracted facts or additional model stage is introduced.

The baseline receives the current focal moment and bounded immediate neighbours. The candidate receives those identical inputs plus the whole section, separated into before, focal and after. Both arms use the same model/settings and the same frozen guide per case. They make three independent plans each for six predeclared moments across Alice, the Bible and Holmes. Twelve image trials draw the corresponding frozen plans for Alice's giant-size scene and the house-entry transition control, with identical references. All samples, failures and retries are retained.

The cases, source boundaries and acceptance questions are frozen in `plan.json`, `scenes.json` and `inputs.json`. This is a small diagnostic, not the multi-work release gate. The Bible and Holmes inputs reuse the retained snapshot; Alice uses the local candidate from the previous diagnostic. Same-section context cannot recover facts outside that section. Initial inspection and scoring are unblinded model review, not human acceptance.

The follow-up has a $2 hard cap within the original $6 allowance: $2.88026715 already conservatively accounted plus at most $2 here. The shared account must still retain $5 for readers. The extra $0.10 scoring allowance is reserved and may remain unused. Each phase is one-shot; an interrupted phase keeps its costs and results and is not automatically retried.

## Verification

`npx tsx scripts/evals/source-context.mts --offline` rehearses both phases in a temporary directory after `npm run works:import`. The rehearsal checks 36 plans and 12 images, one shared guide version per case, paired first-plan requests differing only by added source, and zero planning calls during rendering. A regression test covers seeding only a guide in the text tier; the suite previously mislabeled those fresh text plans as stale image seeds. Image-seed protection remains covered by its existing tests.

Live execution requires the committed contract, a clean tracked checkout and `VISIBIBLE_EVAL_ENV_FILE`, then `--execute --phase text` or `--execute --phase images`. Image execution pins the completed text artifacts by hash. Provider logs retain the actual requests, responses and cost reservations. No phase is permission to activate a candidate.

Local CodeRabbit review inspected the tracked suite-run/test changes and repeated the old seeded-text guard finding. The working tree already uses `drawsSeeds`, and the regression test fails before that change and passes afterward. The new diagnostic script remains in scope for the final independent review.

Results pending.
