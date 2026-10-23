# First live v3 source-grounded plans

**Daniel 7:9 passes its text check; Luke 10:33 is held and Daniel 7:10 was refused. Release remains held.** The v3 grounding contract removed both retained cast-presence failures: Luke 10:33 selects only the parable's actors, and Daniel 7:9 no longer places the narrator or attendants inside the vision. Luke 10:33 still contradicts itself on the Samaritan's pose while reporting a single instant. Daniel 7:10's reply was refused by the deterministic evidence check because it stitched two separate parts of 7:9 into one quote. Luke 10:34 was not attempted. There were no images, semantic retries or response edits.

Bounded continuation of [#183](https://github.com/AustinKelsay/visibible/issues/183) on reviewed engine [PR #255](https://github.com/AustinKelsay/visibible/pull/255), merged as `296df4219e61da29d31052d7d9b348e4c75fd0fd`, run locally against production analysis generation 1. This is agent preparation within the existing $43 allowance, not human release acceptance or public activation. No canon/section edit, whole-work reading, reference generation, guest grant, frontend deployment or admission change occurred.

## Backend schema deployment

V3 plans store an optional `grounding` audit object, which production Convex did not yet accept. The [deployment record](deployment.json) covers a backend-only `convex deploy` of `296df42` to `unique-impala-244`. Its only Convex difference from the previously deployed `66d09cc` is that optional field. The dry run passed typecheck and schema validation, with no index deletions and no auth, definition or component differences. A first dry run from a `git archive` export with a symlinked `node_modules` bundled an absolute component path; it was discarded and the deploy ran from the clean worktree. [Before](before-deploy.json) and [after](after-deploy.json) snapshots agree on sources, status, all 29 scoped records, preparation spend and the public catalog. Production `visibible.com` still serves disabled frontend deployment `dpl_4FE7JeXKq853nCxsrN2NYZYFdYjj` at `ecd58e0`, which never writes the field. Rollback is a redeploy of `66d09cc`'s `convex/`, possible only after removing stored `grounding` fields.

## First ordinary v3 outcomes

[Pre-declared criteria](plan.json) were committed to before the first call. Each moment ran once, after a fresh snapshot and a [dry run](dry-run-luke-10-33.json) that captured the exact request with no paid call or write. Each was a plan refresh only: both section looks stayed current.

| Moment | First outcome | Decision |
| --- | --- | --- |
| [Luke 10:33](scene-luke-10-33.json) | Samaritan, wounded traveler and road, each quoted from 10:33 and `in_scene`. No Jesus, lawyer, priest, Levite, robbers, innkeeper, inn or mount. The subject has the Samaritan “kneeling beside” the man; the action has him “halting his steps and turning toward him”. `singleInstant: true`. | [Hold](review-luke-10-33.json). Successive poses fail the single-instant criterion; the model misreported them as simultaneous. The Samaritan's neighbor quote is the Levite verse: an exact but irrelevant quote, as the contract documents. |
| Luke 10:34 | Not attempted. | Conditional on accepting the exact 10:33 artifact. |
| [Daniel 7:9](scene-daniel-7-9.json) | Only the Ancient of Days, anchored by “one who was Ancient of Days sat”. Radiance and fire in an unoccupied seat; thrones in ranks. No narrator, attendants, body, face, hair, clothing or fixed canon colour. | [Accept for next text check](review-daniel-7-9.json). Still names a figure to deny it (“empty of any figure”); the river of fire reaches 7:9 from the shared look's 7:10 scenery. |
| [Daniel 7:10](scene-daniel-7-10.json) | Refused before storage: `cast the_ancient_of_days has invalid previous evidence`. | Held. The reply's previous-verse quote joined “one who was Ancient of Days sat.” to “His throne was fiery flames…”, skipping the clothing/hair sentence. The refused scene fields (assembly present, no narrator, effects-only presence, one instant) would have met the declared criterion, but a refusal stores nothing and cannot render. |

The retained [provider replies](provider.ndjson) and [exact inputs](input-1.json) are the evidence. Account identifiers and encrypted reasoning are excluded. [Six read-only rendering packets](packets.json), one per stored plan and style, rebuild the full prompts with zero model calls, writes or images. They carry the stored plans unchanged and contain none of the grounding audit fields. A packet faithfully carrying a held plan does not make it acceptable. Optional reference sheets for the Luke cast are still absent.

These are three single text results, not visual, repeatability or human acceptance. They show the v3 contract fixing cast presence in both retained failures. They also show two gaps a stronger contract must close: field-level pose contradictions that the model's own `singleInstant` report does not catch, and an exact-contiguity rule that refuses a legitimate elided quote. In production a refusal is retryable, so the next request would make another paid call rather than stop permanently.

## Cost, tokens and latency

| Call | Prompt tokens | Completion tokens | Cost | Provider round trip |
| --- | ---: | ---: | ---: | ---: |
| Luke 10:33 | 3,867 | 621 | $0.0006972 | 6.48 s |
| Daniel 7:9 | 4,766 | 474 | $0.0007136 | 6.20 s |
| Daniel 7:10 | 4,819 | 571 | $0.0007674 | 3.98 s |

The larger v3 response stays well inside its 2,400-token ceiling and under the 900-token expected allowance. Local `prepareMoment` times were 8.0, 7.5 and 5.0 s. These are descriptive local measurements, not the app's full-request p90.

## Separate allowances

| Bucket | Authorized | Measured cumulative | Retained uncertainty | Remaining after uncertainty |
| --- | ---: | ---: | ---: | ---: |
| Preparation | $43 | $3.65516350 | $0.03 | $39.31483650 |
| Evaluation | $16.50 | $16.29800690 | $0.045 | $0.15699310 |
| Owner production smoke | $1 | $0.68579500 | $0 | $0.31420500 |

This operation spent **$0.0021782** in three calls under its **$0.05** cap, with $0.005 reserved before each call and zero uncertain usage. The production preparation ledger rose from 109 to 112 calls by exactly that amount (two `ok`, one `unavailable`). The OpenRouter balance fell by the same amount. Only `plan:luke-10-33` and `plan:daniel-7-9` changed; the Luke 10:34 and Daniel 7:10 plans, both looks, sections, entries and moments are unchanged. [Summary](summary.json), [ledger](ledger.json) and [final read-back](final.json) retain the arithmetic. Preparation headroom does not fund evaluation or smoke.

## Offline audit

Run `npm run works:import`, then:

```sh
npx tsx llm/releases/2026-10-23-grounded-plan-check/verify.mts
```

The audit forbids network access. It checks the [hash manifest](sha256.json) and source files against `296df42`. It confirms the deploy changed no record, then replays all three retained replies through the real adapter and `prepareMoment`. The replay must reproduce both stored plans, their versions, zero-call reuse and the exact 7:10 refusal. It then compares every final record and checks gating order, the one-shot rule, ledger, account and allowance arithmetic. Finally it rebuilds all six packets and confirms no audit field reaches a prompt. The execution scripts are evidence of this completed operation, not permission to repeat paid calls; `prepare.mts` refuses any moment that has already started.
