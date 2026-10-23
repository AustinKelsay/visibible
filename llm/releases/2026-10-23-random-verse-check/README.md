# Random-verse sample of the planning pipeline

**About half of ordinary verses get a usable plan.** On 100 random verses, the shipped pipeline stored an acceptable plan for **53** (95% interval 43–62%), stored a flawed plan for 6 (3–12%) and refused 41 (32–51%). Most refusals are not quality catches:

- **23 missing cast:** the planner wanted a figure without a cast entry, usually a generic role such as "a lender" or "goldsmith".
- **12 evidence checks:** 10 of these had a scene the blind scorers judged acceptable.
- **6 review:** 5 of these were also judged acceptable.

Compared with the first plan reply of the same samples (the same planner without review), the review raised acceptance from 48 to 53 and did not lower flawed plans (5 versus 6). No images, no production writes.

The owner chose option (a) on 23 October 2026, approving about 100 random verses for roughly $0.20–0.30 under [#183](https://github.com/AustinKelsay/visibible/issues/183). It is recorded as a $0.30 evaluation increase. This measures the pipeline at `9349d7d` (plan review [PR #260](https://github.com/AustinKelsay/visibible/pull/260) and [PR #261](https://github.com/AustinKelsay/visibible/pull/261)). The earlier [hard-case runs](../2026-10-23-reviewed-plan-check/README.md) used four deliberately difficult moments; this sample is what readers would meet.

## Method

The [plan](plan.json) fixed the sampling seed, rubric, budget and reporting before the draw or any paid call. [`draw.mts`](draw.mts) mapped every one of the 31,102 WEB verses to its generation-1 moment; here each verse is its own moment. It then drew 100 verses uniformly with seed 20261023 and snapshotted each sample's moment, section, cast entries and stored look read-only into the [sample set](sample-set.json). The draw reproduces from the seed, and it spans 35 books.

Each sample ran one ordinary `prepareMoment` over its own in-memory store, with the production adapter, routing and sampling. 98 of the 100 sections had no stored look, so a look was prepared first, as on a reader's first request.

Scoring was blind. [`blind.mts`](blind.mts) shuffled each sample's final plan together with its first plan reply, 137 unique replies. It withheld outcome, round, role, review problems and grounding. The generic rubric adds a mis-depiction flag (M) and the brief's other depiction rules (R) to the hard-case flags (U, X, I, F).

Two fresh subagents scored all 137 independently ([A](scores-a.json), [B](scores-b.json)). They agreed on every flag for 129 replies and on pass or fail for 132. The operator settled the 8 differences blind, with recorded reasons ([adjudication](adjudication.json)). Counted: two no-form Satan bodies, a law's field fire set at Sinai, a letter's recipients beside the earthly Jesus, and a seated-versus-reclining pose. Not counted: an illustrated instruction and two denial notes.

## Results

[Tally](tally.json), with 95% Wilson intervals:

| Measure | Pipeline (plan, review, one re-plan) | Same planner without review (first reply) |
| --- | --- | --- |
| Acceptable stored plan | **53** (43–62%) | 48 (38–58%) |
| Flawed plan stored | 6 (3–12%) | 5 (2–11%) |
| Refused | 41 (32–51%) | 47 (38–57%) |
| Re-planned | 37 | — |

By book group, acceptable stored plans:

| Group | n | Pipeline | Without review |
| --- | ---: | ---: | ---: |
| Law | 19 | 11 | 9 |
| History | 24 | 16 | 14 |
| Wisdom | 13 | 6 | 5 |
| Prophets | 21 | 11 | 10 |
| Gospels and Acts | 11 | 5 | 6 |
| Letters and Revelation | 12 | 4 | 4 |

Group sizes are small; their intervals overlap.

### Why verses are refused

| Cause | Refused | Of which the last scene was acceptable |
| --- | ---: | ---: |
| Missing cast: the planner reports a required figure without a cast entry; never re-planned | 23 | — (no scene) |
| Evidence checks, after the re-plan | 12 | 10 |
| Plan review, after the re-plan | 6 | 5 |

[Operator classification](missing-cast-classification.json) of the 23 missing-cast reports (after the fact):

| Kind | Count | Examples |
| --- | ---: | --- |
| Generic role or group | 13 | "a lender", "goldsmith", "a wise person", "Roman magistrate", "festival-goers", "wild ox" |
| Named figure not in the section cast | 5 | genealogy names (Maaseiah, Joiada), Sihon and Og, a parable's king, Jeremiah with mourners |
| Speaker in the cast, reported missing because presence was uncertain | 4 | Isaiah, Jesus (twice), David as psalmist |
| No scene to draw | 1 | a list of town names |

Evidence refusals of acceptable scenes mostly failed "lacks current-moment evidence" for a selected place or group (Megiddo, the tabernacle, the disciples) or classed God or a prison as framing.

### Flaws in stored plans

The six stored flaws, by kind:

| Kind | Count |
| --- | ---: |
| Outside the moment (framing places inside told content, a later figure) | 5 |
| Unselected described figure | 1 |
| Embodied no-form subject, mis-depiction, depiction rule or instant | 0 |

The two embodied no-form plans (Satan as a serpent) were the first plan and re-plan of one verse, Revelation 20:10. The evidence checks refused the first and the review rejected the re-plan, so nothing was stored.

## Cost and latency

| Measure | Value |
| --- | ---: |
| Calls / cost | 313 / $0.1530697 |
| Per verse | median $0.0014, max $0.0033 |
| Preparation per verse, look included (98/100) | median 12.9 s, p90 19.1 s, max 30.1 s |

A reader's first request also waits for the image (about 5.5 s). With the measured p90, the cold full request would be about 25 s, over the 20 s target; once a verse's plan is stored, later requests skip this. At the measured means ($0.00131 per verse for plans and reviews, $0.00022 per look), preparing every verse lazily would cost roughly $41 of owner preparation spend, with looks shared by about 2,790 sections.

## Separate allowances

| Bucket | Authorized | Measured cumulative | Retained uncertainty | Remaining after uncertainty |
| --- | ---: | ---: | ---: | ---: |
| Preparation | $43 | $3.65680320 | $0.03 | $39.31319680 |
| Evaluation | $16.80 | $16.57462850 | $0.045 | $0.18037150 |
| Owner production smoke | $1 | $0.68579500 | $0 | $0.31420500 |

This run spent **$0.1530697** of evaluation in 313 calls under its $0.30 cap, with zero uncertain usage and no production writes. The [ledger](ledger.json) and [provider replies](provider.ndjson) are authoritative.

## Offline audit

Run at the merge commit that introduces this directory, after `npm run works:import`:

```sh
npx tsx llm/releases/2026-10-23-random-verse-check/verify.mts
```

The audit forbids network access and checks the [hash manifest](sha256.json) and the sources at `9349d7d`. It re-derives the draw from the seed, checks per-call reasoning and token limits, and replays all 313 retained replies through `prepareMoment`. The replay reproduces every stored plan, refusal, call count, spend outcome and look preparation. The audit also checks that the blind packet carries no outcome or role and that every final stored plan reached the scorers verbatim. [`tally.mts`](tally.mts) recomputes the rates from both score files, the adjudication and the key. Its first run counted missing-cast refusals, whose plans are blank, as clean false refusals; blank scenes are now treated as no plan, and the tally was regenerated from unchanged inputs.
