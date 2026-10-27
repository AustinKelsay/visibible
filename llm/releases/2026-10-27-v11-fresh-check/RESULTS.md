# Unseen presence and speakers: fresh text check results

**Best text result so far: 15 of 23 new verses acceptable, no refusals.** All 30 cases completed: **106 calls for $0.0459635** under the $0.15 cap, with no uncertain usage, images or production writes. Exact offline replay passes. [Tally](tally.json), [ledger](ledger.json), [budget](budget.json).

| Run (different draws) | Fresh acceptable | Retained acceptable | Refused | Speaker inside the scene |
| --- | --- | --- | --- | --- |
| 26 Oct, strict v10 | 5/23 | 1/7 | 16/30 | — |
| 27 Oct, forgiving v11 | 10/23 | 0/7 | 0 | — |
| 27 Oct, one scene description v12 | 12/23 | 1/7 | 0 | 5/30 |
| **27 Oct, unseen presence v13** | **15/23** (65%, 95% CI 45–81%) | **2/7** | **0** | **3/30** |

The predeclared diagnostic targets were at most 1 speaker-in-scene plan and no refusals. Refusals met the target. Speakers fell from 5 to 3 but missed it. The strict standard (22/23 fresh, 7/7 retained) still fails; ADR 0006 retired it as a launch gate.

## Defects (13 plans)

- **A speaker or writer inside the scene (3):**
  - Solomon as a listener in his own proverb (Proverbs 18:13).
  - Paul leading prayer in Thessalonica, to which he is writing (2 Thessalonians 3:1).
  - Jeremiah in the goldsmith's workshop (Jeremiah 10:14, retained; also failed in v12).

  Letter and proverb writers are the new form; the rule names speakers and prophets.
- **God's canon copied in, or God's glow added unselected (5):**
  - Lamentations 4:7, Numbers 19:9 and Ezekiel 40:24 add an unselected "veiled" divine glow.
  - Numbers 3:39 (restatement only) and Exodus 27:1 restate "white-gold" light.

  The planner still receives God's canon text as planning context. The [paired image check](../2026-10-27-v11-image-check/RESULTS.md) shows the same copying causing figures.
- **Identity or role (4):**
  - Aaron named for "the priest" (Numbers 5:24, retained).
  - Moses officiating as priest (Numbers 28:9).
  - The queen made the speaker of Daniel 5:14.
  - Jericho depicted but not selected (Mark 10:39).
- **Place or object state:** the bundle unburned in Numbers 19:9. The outer-court gate is called the inner court in Ezekiel 40:24. The court is already built in Exodus 27:1.
- **Uncertain (1):** the Numbers 28:17 feast set at Sinai instead of Moab.

## Scoring

Two independent model scorers labeled all 30 packets blind and agreed on 25. The operator adjudicated the five disputes before unblinding (commit `96ac927`): Numbers 3:39 flawed (canon restatement), Jeremiah 7:26 acceptable (generic clothing, presence supported by 7:2), Numbers 28:17 uncertain, and Numbers 19:9 and Ezekiel 40:24 flawed. [Packet](blind-packet.json), [scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json). These are model scorers, not human acceptance.

## Meaning

Plans keep improving on new verses. The largest remaining flaw class is the planner copying a no-form subject's canon, which it no longer needs: rendering does not use it, and the text names the effects. Removing that input should also remove the unselected glows. Letter and proverb writers should be named with speakers.
