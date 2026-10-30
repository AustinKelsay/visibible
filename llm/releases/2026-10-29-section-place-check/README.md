# Section-place A/B: a shared place did not keep neighbouring verses more alike

**Drawing each section's place as written made neighbouring-verse images agree less often, not more, so it was dropped.** The current engine drew the same place in 9 of 9 blind-scored neighbouring-verse pairs, in two independent scorings. Two candidate versions with a shared section place reached 6 of 9 each. Most of their misses were time-of-day drift that the whole-section look introduced. Recurring characters agreed whenever both images carried their reference sheet (7 of 7) and never when they had none (Daniel, 0 of 4), so reference coverage is the lever that works. [ADR 0009](../../../docs/adr/0009-reference-priority-over-a-shared-place.md) records the decisions.

The owner asked for point two of the engine critique end to end ("Okay, let's start to address number two, systematically end-to-end, full send"). The run spent **$1.29196235** of the evaluation allowance, with no uncertain usage and no production read or write.

## Results

Setting pairs compare two neighbouring verses of one story section; character pairs compare one canon entry in two verses. Pairs never cross arms. Two scorers judged each round blind to arm, verse and group, and the operator settled disagreements by viewing the pair at full size.

| Arm | Engine | Setting pairs the same | Character pairs the same |
| --- | --- | --- | --- |
| arm-a (round 1) | current `dev`, `fafd43f` | **9 of 9** | 1 of 2, 1 unclear |
| arm-a (round 2, new scorers) | current `dev`, `fafd43f` | **9 of 9** | 2 of 3 |
| arm-b (round 1) | shared place, moment-cast v16 | 6 of 9 | 1 of 2 |
| arm-c (round 2) | shared place, moment-cast v17 | 6 of 9 | 3 of 4 |

Every pair judged different:

| Arm | Pair | Why |
| --- | --- | --- |
| arm-b | Red Sea 14:22 / 14:23, 14:23 / 14:21 | Same water walls and seabed, but night beside daylight (unanimous). |
| arm-b | Lions' den 6:22 / 6:23 | A shallow ring at ground level beside a shaft several times a man's height (settled). |
| arm-c | Red Sea 14:23 / 14:21 | Day beside night, and a different coastline (unanimous). |
| arm-c | Red Sea 14:22 / 14:23 | Low walls and a walled city beside towering walls and open hills (settled). |
| arm-c | Lions' den 6:22 / 6:23 | The same depth conflict as arm-b (settled). |
| all | Daniel 6:22 / 6:23 | Different hair, beard and age; Daniel has no reference sheet in production (unanimous every time). |

[candidate-mismatches.jpg](candidate-mismatches.jpg) shows arm-b's Red Sea and den pairs.

## Why the shared place lost

- **The whole-section look carried a change of time into every plan.** To fit the whole section, the look read its whole text. Exodus 14:21–25 runs from "all night" to "the morning watch", so the look said night giving way to dawn, and every arm-b plan copied that span. The image model drew 14:23 in daylight beside a night 14:21. Arm-c told the planner to name one time, and the plans still wrote "pre-dawn darkness giving way to first light". The current engine's look read one verse, said night, and kept every Red Sea image at night.
- **One place seen from inside and outside drew two different dens.** The shared text named "a stone-walled pit den beneath a palace"; 6:22 is inside it and 6:23 at its rim, and the depth came out differently. The current engine's two den plans were both inside.
- **The current engine was already consistent here.** With Classical, no scene-check retry and one image per verse, its neighbouring verses agreed every time. The [baseline's](../2026-10-29-consistency-baseline/README.md) Red Sea differences came from other styles and retried images.

## Reference choice

[replay.mts](replay.mts) replays reference choice on all 36 plans with the sheets production holds. One plan changes: arm-c's John 21:9, whose plan lists the Sea of Galilee, the disciples, Peter and Jesus. The fixed order (first character, first place, second character) offered the disciples' and the sea's slots, neither of which has a sheet, and sent only Peter's. The ranked order passes those slots on and sends Peter's and Jesus's. Production holds only six sheets, so ranking rarely matters until the reference run covers more of the cast.

## Method

- [plan.json](plan.json) fixed the 12 verses of the five setting groups in [the consistency groups](../../../evals/images/consistency.json), the arms, the Classical style, Nano Banana 2 Lite at 1K, and the caps, before any paid call.
- [run.mts](run.mts) ran once per arm from a detached checkout of that arm's commit (`fafd43f`, `f015a6e`, `80db26f`; the last two stay reachable through [#322](https://github.com/AustinKelsay/visibible/pull/322)'s history), so its relative imports loaded that arm's engine. Each arm prepared its looks and plans cold in one in-memory store seeded from the read-only production snapshot of the [Fresco matrix](../2026-10-28-fresco-matrix/snapshot.json), with the production references it recorded, each checked against its SHA-256. Moments missing from the snapshot were built from their section's range. Each verse got one image and no scene check or retry, so each image is its plan's first rendering. Arm-c's runner differs from the others only in reading a per-arm cap.
- `npm run evals:consistency -- pairs` made the pairs, with each arm as its own "style" so pairs never cross arms. Round 1 paired arms a and b; round 2 paired arms a and c under a new seed, with two new scorers. The scorers were model agents that saw only the side-by-side pictures, the question and each side's scene description ([round-1](round-1/), [round-2](round-2/)). `report` produced each round's `report.json`. Its gate fails on sample size by design: this check runs 12 of the groups' 26 verses.
- Results, ledgers and scrubbed provider traces are kept per arm: `results-arm-*.ndjson`, `ledger-arm-*.json` and `provider-arm-*.ndjson.gz`. [snapshot.json](snapshot.json) lists each case's section cast for the pairing command. Images stay under the ignored `evals/images/runs/2026-10-29-section-place-check/`, and every result row records their SHA-256.

## Accounting

| Arm | Images | Text calls | Measured |
| --- | --- | --- | --- |
| arm-a | 12 | 37 | $0.4306787 |
| arm-b | 12 | 43 | $0.43438285 |
| arm-c | 12 | 29 | $0.4269008 |
| Total | 36 | 109 | **$1.29196235** |

The evaluation allowance had $1.3336492 left after the [Fresco matrix](../2026-10-28-fresco-matrix/budget.json). It now has **$0.04168685** left: $38.89931315 measured of $39. Scorer agents are not OpenRouter spend. The shared OpenRouter balance was $14.10 before the first arm.

## Limits

- Nine setting pairs per arm, one style, one image per verse. A 9 against 6 split is not statistically significant (Fisher's exact test, p ≈ 0.21). But both candidate versions and both scorings point the same way, and each miss has a visible cause.
- Model scorers judged likeness. They disagreed on 3 of 48 pairs; the operator chose the stricter reading each time, as in the baseline.
- The operator wrote the runner and knew which label was which arm. The scorers did not.
- Untested variants: a shared place whose look reads one verse, as today's does, and the same check in other styles or with retries. Each needs an allowance increase of about $0.45 per arm.
