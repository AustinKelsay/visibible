# Paired re-run of moment-cast v6 on the random verses

**The new rules raised usable plans from 52 to 74 of the same 98 verses, with no rise in flawed plans.** Under moment-cast v6, the pipeline stored an acceptable plan for **74** verses (76%, 95% interval 66–83%), against 52 for the [v5 baseline](../2026-10-23-random-verse-check/README.md) on the same verses. 30 verses improved and 8 regressed (McNemar exact p = 0.0005). Flawed stored plans stayed at 6, and refusals fell from 40 to 18. No images, no production writes.

The owner approved the rule changes and this paired re-run on 23 October 2026 under [#183](https://github.com/AustinKelsay/visibible/issues/183). The changes, merged in [PR #264](https://github.com/AustinKelsay/visibible/pull/264) (`baabd86`), are:

- Plans may describe uncast incidental figures.
- `missingCast` is reserved for recurring named characters.
- A selected location or object may continue from a neighbor verse.
- Quotes ignore letter case.
- Rendering prompt `generic-v5` no longer forbids the plan's incidental figures.

## Method

The [plan](plan.json) was committed before any paid call. [`snapshot.mts`](snapshot.mts) re-read the baseline's 100 verses' production records read-only; none had changed since the baseline. Each sample ran one ordinary `prepareMoment`, exactly as in the baseline.

The run took **98 of 100** verses: the pre-declared stop rule kept $0.012 of headroom under the $0.175 cap and ended the run before sample 99. The comparison uses those 98 pairs.

Scoring repeated the baseline: two fresh blind subagents ([A](scores-a.json), [B](scores-b.json)) used the same rubric and instructions, and the operator settled differences blind ([adjudication](adjudication.json)). The packet held 128 unique new replies (final plans and first replies) plus **40 baseline replies as calibration**, all shuffled under new ids. The scorers agreed on every flag for 164 of 168 replies. The 4 differences were settled to match the baseline's decisions on identical cases.

## Results

[Tally](tally.json), same 98 verses:

| Measure | v6 | v5 baseline (same verses) |
| --- | --- | --- |
| Acceptable stored plan | **74** (66–83%) | 52 |
| Flawed plan stored | 6 | 6 |
| Refused | 18 | 40 |
| — missing cast | 1 | 22 |
| — evidence checks | 16 | 12 |
| — plan review | 1 | 6 |
| Refused although the last scene was acceptable | 10 | — |

Paired by verse: **30 improved, 8 regressed** (McNemar exact p = 0.0005). Of the 22 baseline missing-cast refusals, 17 now store a plan, 4 fail the evidence checks, and 1 is still reported missing: Shallum, a named king. Eight verses stored in the baseline failed the evidence checks this time. No check got stricter for them, so these reflect different replies under the new prompt and ordinary reply-to-reply variation.

The same planner without the review (first reply) reached 67 acceptable and 9 flawed. The review again raised acceptance and kept flaws lower.

By book group:

| Group | n | Accepted | Flawed stored |
| --- | ---: | ---: | ---: |
| Law | 19 | 14 | 1 |
| History | 23 | 20 | 2 |
| Wisdom | 13 | 8 | 2 |
| Prophets | 21 | 18 | 1 |
| Gospels and Acts | 10 | 6 | 0 |
| Letters and Revelation | 12 | 8 | 0 |

### Scoring drift

37 of the 40 calibration replies got the same pass or fail as in the baseline. All three differences went from flawed then to clean now:

- Two describe God's radiance while God's no-form entry is unselected. The baseline scorers counted these as an unselected figure; this round's treated the radiance as light.
- One sets a law scene at Sinai.

The [sensitivity check](sensitivity.json) re-applies the stricter reading to every accepted plan this round. It does so by keyword, which makes it an upper bound on the effect. Under that reading, v6 has **67 acceptable** plans: 26 improved, 11 regressed, p = 0.02. The improvement holds.

The drift also exposes a real gap. When a plan shows God through radiance without selecting God's entry, the no-form canon constraints don't reach rendering. Neither the planner rule nor the review currently treats that radiance as a described figure.

## Remaining refusals

16 of the 18 refusals are evidence checks. As in the [retained-reply analysis](../STATUS.md), most select an entry and also classify it as framing, mentioned or uncertain (God as speaker of a law, a prophet's prison), or give a current-verse quote that is not in the verse. Groups and people still need a current-verse anchor.

## Cost and latency

| Measure | Value |
| --- | ---: |
| Calls / cost | 330 / $0.1631122 |
| Per verse | median $0.0015, max $0.0030 |
| Preparation per verse, look included (96 of 98) | median 11.3 s, p90 19.0 s, max 23.6 s |

## Separate allowances

| Bucket | Authorized | Measured cumulative | Retained uncertainty | Remaining after uncertainty |
| --- | ---: | ---: | ---: | ---: |
| Preparation | $43 | $3.65680320 | $0.03 | $39.31319680 |
| Evaluation | $16.80 | $16.73774070 | $0.045 | $0.01725930 |
| Owner production smoke | $1 | $0.68579500 | $0 | $0.31420500 |

This run spent **$0.1631122** of evaluation in 330 calls under its $0.175 cap, with zero uncertain usage and no production writes. The [ledger](ledger.json) and [provider replies](provider.ndjson) are authoritative.

## Offline audit

Run at the merge commit that introduces this directory, after `npm run works:import`:

```sh
npx tsx llm/releases/2026-10-23-cast-policy-check/verify.mts
```

The audit forbids network access and checks the [hash manifest](sha256.json) and the sources at `baabd86`. It also checks:

- The verse list matches the baseline and no record changed.
- Per-call reasoning and token limits.
- All 330 retained replies replay through `prepareMoment`, reproducing every plan, refusal, call count, spend outcome and look.
- The 40 calibration replies are exact baseline packets.
- The blind packet leaks no outcome or role.
- The paired counts follow from both tallies.

The manifest excludes the CodeRabbit log and [review disposition](review-disposition.json), which were written after it. Review added one guard: [`tally.mts`](tally.mts) now fails on any operational outcome (stopped, blocked or invalid) instead of counting it as a refusal. The retained run has none, and the regenerated tally matched exactly.
