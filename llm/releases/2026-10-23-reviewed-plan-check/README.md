# Held-out test of the reviewed planning pipeline

**The review makes planning much safer but not more available.** Across 20 fresh samples, only 1 flawed plan was stored, against 7 for v3 and 3 for v4. The review refused 9 plans, all correctly, and refused no clean plan. But the pipeline still produced an acceptable stored plan only 10 times out of 20. Daniel 7:9 never succeeded (0/5), and Luke 10:34 succeeded 2/5. Per the [pre-declared rule](plan.json) the verdict is **not converging**. No images, no production writes.

This is the held-out test of option (b) under [#183](https://github.com/AustinKelsay/visibible/issues/183): plan, review, and at most one re-plan, merged in [PR #260](https://github.com/AustinKelsay/visibible/pull/260) and [PR #261](https://github.com/AustinKelsay/visibible/pull/261) (`144b79a`). The [checker benchmark](../2026-10-23-plan-review-check/README.md) tuned the review on earlier replies; these 20 are new.

## Method

The plan, scripts, read-only [snapshot](snapshot.json) and [dry run](dry-run.json) were committed before any paid call. Each sample is one ordinary `prepareMoment` over a fresh in-memory store seeded from production generation 1, with the four moments' plans removed, so looks were reused. Production adapter, routing and default sampling; planning reasoning off, review reasoning low (asserted per request).

Scoring used the [same rubric](../2026-10-23-grounding-rate-check/plan.json) as the v3/v4 baseline. Each scorer saw the stored plan, or the last plan reply for a refused sample, with the outcome, rounds, review problems and grounding audit withheld. A fresh subagent ([scores](scores-subagent.json)) and the operator ([scores](scores-operator.json)) agreed on every flag for all 20, so no [adjudication](adjudication.json) decision was needed. The subagent's instructions spelled out that radiance "seated" counts as seated, as both scorers had already applied it in the baseline. A sample passes when it stored a plan with no blocker.

## Results

[Tally](tally.json), passes out of 5:

| Moment | Reviewed | v3 | v4 | Stored | Refused | Re-planned |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Luke 10:33 | 3 | 2 | 2 | 4 | 1 | 4 |
| Luke 10:34 | 2 | 1 | 1 | 2 | 3 | 4 |
| Daniel 7:9 | **0** | 4 | 1 | 0 | 5 | 5 |
| Daniel 7:10 | **5** | 3 | 4 | 5 | 0 | 0 |
| **Total** | **10 / 20** | 10 / 20 | 8 / 20 | 11 | 9 | 13 |

| Outcome | Reviewed | v3 | v4 |
| --- | ---: | ---: | ---: |
| Stored with a blocker (would render a defect) | **1** | 7 | 3 |
| Refused with a blocker (correct refusal) | 9 | 1 | 4 |
| Refused but clean (false refusal) | **0** | 2 | 5 |

The single stored defect is a Luke 10:33 plan whose Samaritan "kneels or leans", an instant conflict; the review is weakest on that kind.

**The re-plan rarely repairs the plan.** Only 7 of 20 first plans passed review, and 13 were re-planned, but most second plans traded one problem for another:

- **Luke 10:34:** dropping the distant inn led to describing the donkey without selecting it.
- **Daniel 7:9:** removing seated wording brought back Daniel or the attendants.

The Daniel section's shared look names both ("formed attendants wear priestly linen…; Daniel in his ordinary tunic and cloak"). That is the likely prime: the planner keeps importing them despite feedback.

## Cost and latency

| Measure | Value |
| --- | ---: |
| Calls / cost | 58 / $0.0406900 |
| Cost per sample | median $0.0021, max $0.0029 |
| Text preparation per sample | median 11.9 s, p90 18.5 s, max 21.4 s |
| One round (plan and review) | median 8.3 s (n=7) |
| With a re-plan | median 15.1 s, p90 18.9 s (n=13) |
| Review call | median 4.9 s |

These are local text-preparation times with the look already stored. A reader's cold request also waits for an uncached look and the image (about 5.5 s). Re-planned moments would therefore exceed the 20 s cold target.

## Separate allowances

| Bucket | Authorized | Measured cumulative | Retained uncertainty | Remaining after uncertainty |
| --- | ---: | ---: | ---: | ---: |
| Preparation | $43 | $3.65680320 | $0.03 | $39.31319680 |
| Evaluation | $16.50 | $16.42155880 | $0.045 | $0.03344120 |
| Owner production smoke | $1 | $0.68579500 | $0 | $0.31420500 |

This run spent **$0.04069** of evaluation in 58 calls under its $0.06 cap, with zero uncertain usage and no production writes. The [ledger](ledger.json) and [provider replies](provider.ndjson) are authoritative.

## Offline audit

Run at the merge commit that introduces this directory, after `npm run works:import`:

```sh
npx tsx llm/releases/2026-10-23-reviewed-plan-check/verify.mts
```

The audit forbids network access. It checks the [hash manifest](sha256.json) and the source files against `144b79a`, including per-call reasoning and token limits. It replays all 58 retained replies through `prepareMoment`, reproducing every stored plan, refusal, call count and spend outcome. It checks that the blind packet carries exactly the rendering-bound text with no outcome leak, recounts every pass from both score files and the key, and checks ledger and cap arithmetic.
