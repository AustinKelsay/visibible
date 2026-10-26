# One scene description: fresh re-measurement results

**Best text result so far; the gate still fails.** All 30 cases completed: **102 calls for $0.0444884** under the $0.15 cap, with no uncertain usage, images or production writes. Exact offline replay passes. This re-runs the [stopped first attempt](../2026-10-27-v10-fresh-check/RESULTS.md) ($0.002635, no outcomes) on the same draw. [Tally](tally.json), [ledger](ledger.json), [budget](budget.json).

| Run (different draws) | Fresh acceptable | Retained acceptable | Refused | Condition contradictions |
| --- | --- | --- | --- | --- |
| 26 Oct, strict v10 | 5/23 | 1/7 | 16/30 | 4 |
| 27 Oct, forgiving v11 | 10/23 | 0/7 | 0 | 9 |
| **27 Oct, one scene description v12** | **12/23** (52%, 95% CI 33–71%) | **1/7** | **0** | **1** |
| v12, excluding canon-restatement-only flaws | 17/23 | 2/7 | 0 | 1 |

Removing the separate conditions removed the largest flaw source: one place contradiction remains, down from 9. Six plans are flawed only because they copy a fixed canon description into the scene fields, mostly God's "white-gold light… fire-like glow at its heart". The scoring rules count that as a defect, but it does not change what is drawn. Both scorers flagged the same six. The v12 planner instruction to "write the effect itself" likely encourages this copying.

## Substantive defects (9 plans)

- **A speaker, prophet or narrator acting inside the scene (5):**
  - Ezekiel on Tyre's quay with Jerusalem's ruins in view (Ezekiel 26:2), the one place contradiction.
  - Ezekiel standing in the gap himself (Ezekiel 22:30).
  - Eliphaz as an armed attacker over Job (Job 15:24).
  - Zerubbabel receiving the word directly (Haggai 2:21).
  - Jeremiah in the goldsmith's doorway (Jeremiah 10:14).
- **Identity or state:** Aaron for "the priest" (Numbers 5:24); Aaron in plain linen and high-priestly garments at once (Numbers 3:39); the nobles shown ruined instead of in their former purity (Lamentations 4:7).
- **Anachronism:** a "distant mud-brick settlement" in Genesis 3:18.
- **Uncertain (2):** a wealthy man among coin chests in the temple court (Psalm 73:12), and an unexplained faint radiance with God unselected (Ezekiel 40:24).

## Scoring

Two independent model scorers labeled all 30 packets blind, with the scorer note that `conditions` is null since v12. They agreed on 29 of 30 verdicts. The operator adjudicated the dispute (Ezekiel 40:24) as uncertain before unblinding (commit `3f92546`). [Packet](blind-packet.json), [scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json). These are model scorers, not human acceptance.

## Meaning

Every verse gets a plan, and about half are acceptable under the strict rules (three-quarters if canon copying is tolerated). The main remaining text failure is one general pattern: the speaker or prophet of a text placed inside the scene they describe.
