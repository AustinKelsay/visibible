# Suite v3 baseline: scene plans

**78 of 113 scene plans are acceptable (69%); on the holdout, 13 of 20 (65%).** This is the text tier of the first suite `2026-11-01-suite-v3` baseline ([ADR 0011](../../../docs/adr/0011-frozen-multi-work-regression-suite.md)). It is the first measurement with production's remade Holmes and Watson sheets ([record](../2026-11-01-holmes-sheets/README.md)) and Alice's v3 fixture, which dresses her from the 1890 Nursery edition instead of the Disney film ([fixture notes](../../../evals/images/README.md)). Every case's section look, scene plan and plan review were prepared fresh from a read-only production snapshot.

The run made **407 text calls for $0.1807873** under its $0.25 cap, with no uncertain usage, no refusal and no production write. Links: [funding](funding.json), [plan](plan.json), [snapshot](snapshot.json), [report](report.json).

| Work | Dev | Holdout | All | v1 baseline |
| --- | --- | --- | --- | --- |
| Bible | 47 of 68 | 6 of 9 | 53 of 77 (69%) | 54 of 77 |
| Holmes | 9 of 14 | 2 of 4 | 11 of 18 (61%) | 8 of 18 |
| Alice | 9 of 11 | 5 of 7 | 14 of 18 (78%) | 7 of 18 |
| **All** | 65 of 93 | **13 of 20** | **78 of 113 (69%)** | 69 of 113 |

| Fault | Bible | Holmes | Alice | All |
| --- | --- | --- | --- | --- |
| Speaker drawn inside their words | 13 | 0 | 0 | 13 |
| Wrong moment | 8 | 5 | 1 | 14 |
| Unsupported figure | 8 | 1 | 0 | 9 |
| Writing asked for | 2 | 0 | 2 | 4 |
| Missing subject | 1 | 1 | 1 | 3 |
| Depiction rule broken | 0 | 0 | 1 | 1 |
| Unseen subject given a body | 1 of 21 | n/a | n/a | 1 of 21 |

- **Alice doubles.** The v1 plans carried her drafted canon's "plain blue Victorian child's dress with a white pinafore", which the scorers read as Disney's costume. With the Nursery-edition outfit, one Alice plan breaks a rule.
- **Holmes gains three.** The Holmes plans no longer inherit the actor-likeness canon; the remaining misses are mostly the wrong instant of a moment.
- **The Bible holds.** Its faults are the known ones: the speaker or listener staged inside the words (Naomi in the field she speaks of, Moses and Aaron as the subject of a law verse), and figures from neighbouring verses.

Comparison with v1 is descriptive only: v1 and v3 are different suite versions, so the gate cannot compare them. This run is now the v3 text reference.

**Scoring.** Two independent model scorers judged every plan blind, in two batches each ([SCORING.md](scoring/SCORING.md)). They disagreed on 15 plans. The operator ruled on those against the fault questions' wording and the v1 operator's precedents ([operator.json](scoring/operator.json)) and re-settled ([scores.json](scoring/scores.json)). Before the rulings the score was 70 of 113. Scoring ran on agents with no OpenRouter spend.
