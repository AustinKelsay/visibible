# Forgiving preparation: fresh re-measurement results

**Every verse now gets a plan, but the quality gate still fails.** All 30 cases completed: **104 calls for $0.0506315** under the $0.25 cap, with no uncertain usage, images or production writes. Exact offline replay passes. [Tally](tally.json), [ledger](ledger.json), [budget](budget.json).

| Stratum | Acceptable | Flawed | Uncertain | Refused | Required |
| --- | --- | --- | --- | --- | --- |
| Fresh (23) | **10** (43%, 95% CI 26–63%) | 11 | 2 | **0** | 22 |
| Retained (7) | **0** | 5 | 2 | **0** | 7 |
| All (30) | **10** | 16 | 4 | **0** | — |
| 26 October, strict v10 (different draw) | 6 | 5 | 3 | 16 | — |

Forgiving preparation fixed availability: no refusals, against 16 of 30 the day before. Acceptable fresh plans rose from 5/23 to 10/23, though the draws differ and the intervals overlap. Most cases the strict contract used to refuse are now stored with flaws. Nine stored plans carry review notes: cast auto-selected because the review found them depicted, noted canon gaps, or one problem kept after the re-plan.

## Stored defects (16 flawed, 4 uncertain)

Some plans have more than one defect.

- **Moment conditions contradict the scene (9).**
  - The clothing condition adds people: Roman soldiers for Acts 17:5, disciples and soldiers for Mark 14:52, robed attendants for Ezekiel 10:4, attackers and mourners for Lamentations 4:7.
  - The time condition leaks another moment: the catch for Luke 5:1, evening shadows at midday for Jeremiah 44:24, a night enrollment for Luke 2:5.
  - Place: Judges 19:29 is set in the Gibeah lodging house instead of the Levite's home.
- **Speaker or narrator drawn into the scene (3):** Paul preaching for Romans 4:2, Jeremiah watching the goldsmith for Jeremiah 10:14, and Moses presiding over the law for Exodus 21:14.
- **God's light where the verse does not show God (2):** Deuteronomy 32:46 and Ezekiel 40:24.
- **Wrong identity or instant (4):**
  - Aaron for "the priest" in Numbers 5:24.
  - The priests instead of "her nobles" in Lamentations 4:7.
  - Pharaoh already overlooking Israel's camp in Exodus 14:5, which was acceptable in two earlier runs.
  - Eliphaz instead of Job as the speaker in Job 6:27.
- **Uncertain:** Aaron's clothing in Numbers 3:39; Bathsheba standing rather than seated in 1 Kings 2:21; "not yet pressing in" in Luke 5:2; unexplained divine radiance in Isaiah 10:31.

## Scoring

Two independent model scorers labeled all 30 packets blind. Each found 12 acceptable, 16 flawed and 2 uncertain, and they agreed on 24 of 30 verdicts. The operator adjudicated the six disputes before unblinding (commit `9d0f16d`):

- Four became uncertain.
- p030 (Romans 4:2) became flawed, the same author-as-actor defect scored flawed on 26 October.
- p023 (Exodus 21:14) kept scorer A's flawed label, for the same framing reason.

The committed adjudication note says 25 of 30 and omits p023; the correct figure is 24. [Instructions](SCORING.md), [packet](blind-packet.json), [scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json). These are model scorers, not human acceptance.

## Meaning

The refusal problem is solved. The remaining text problems fall into three generic groups:

1. The separate moment-conditions block, the largest single source of flaws. Its clothing and time values add people or moments that the scene fields do not have.
2. Speakers and narrators placed inside what they describe.
3. God's light, or a named person, appearing without support in the verse.

The owner decides the next structural step; see the canonical [release status](../STATUS.md).
