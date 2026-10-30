# Regression suite baseline: scene plans

**69 of 113 scene plans are acceptable (61%); on the holdout, 9 of 20 (45%).** This is the text tier of the suite's first baseline ([ADR 0011](../../../docs/adr/0011-frozen-multi-work-regression-suite.md)). Every case's section look, scene plan and plan review were prepared fresh, from a read-only production snapshot (Bible and Holmes) and the committed Alice fixture. Nothing was refused.

The run made **404 text calls for $0.1782921**, under its $0.22 cap. That cap is what was left of $0.25 after the [stopped first attempt](../2026-10-30-suite-baseline-text/README.md). It had no uncertain usage and no production write. Links: [funding](funding.json), [plan](plan.json), [snapshot](snapshot.json), [report](report.json), [items](items.json). The [image baseline](../2026-10-30-suite-baseline-image/README.md) rendered these plans.

| Work | Dev | Holdout | All |
| --- | --- | --- | --- |
| Bible | 48 of 68 | 6 of 9 | 54 of 77 (70%) |
| Holmes | 7 of 14 | 1 of 4 | 8 of 18 (44%) |
| Alice | 5 of 11 | 2 of 7 | 7 of 18 (39%) |
| **All** | 60 of 93 | **9 of 20** | **69 of 113 (61%)** |

| Fault | Bible | Holmes | Alice | All |
| --- | --- | --- | --- | --- |
| Wrong moment | 8 | 4 | 2 | 14 |
| Speaker drawn inside their words | 12 | 0 | 0 | 12 |
| Unsupported figure | 5 | 1 | 1 | 7 |
| Writing asked for | 1 | 4 | 2 | 7 |
| Missing subject | 0 | 3 | 3 | 6 |
| Depiction rule broken | 0 | 0 | 3 | 3 |
| Unseen subject given a body | 1 of 21 | n/a | n/a | 1 of 21 |

What the numbers show:
- **The holdout scores below dev**, at 45% against 65%. Dev holds the 33 Bible cases the prompts were tuned on, and 11 of the 20 holdout cases are Holmes or Alice.
- **Holmes and Alice fail differently from the Bible.**
  - The Bible's main fault is a speaker or writer placed inside their own words.
  - Holmes and Alice plans miss a subject the moment names, or ask for writing (letters, notes, newspapers).
  - Alice's three broken rules are about Alice herself. Two plans carry her canon's "plain blue Victorian child's dress with a white pinafore", which the scorers read as the Disney costume; the text gives no colour. The third plan makes her small where the King and Queen call her "a mile high".

**Scoring.** Two independent model scorers judged every plan blind, in two batches each ([SCORING.md](scoring/SCORING.md), [fault questions](../../../evals/images/faults.json)). The operator ruled on the 12 plans they disagreed on ([operator.json](scoring/operator.json)) and re-settled ([scores.json](scoring/scores.json)).
