# Broad fresh measurement: results

**Gate failed.** All 30 cases completed: **119 calls for $0.0918616** under the $0.20 cap, with no uncertain usage, images or production writes. Exact offline replay passes. [Tally](tally.json), [ledger](ledger.json), [budget](budget.json).

| Stratum | Acceptable | Flawed | Uncertain | Refused | Required |
| --- | --- | --- | --- | --- | --- |
| Fresh (23) | **5** (22%, 95% CI 10–42%) | 4 | 3 | 11 | 22 |
| Retained (7) | **1** | 1 | 0 | 5 | 7 |
| All (30) | **6** | 5 | 3 | 16 | — |

For comparison, the previous complete-packet validation scored 3/30 for its candidate and 4/30 for its baseline, on a different fresh draw. The direction is better, but the samples differ and the intervals overlap, so the improvement is unconfirmed. The pipeline is far from the 22/23 standard. Even counting every stored plan as acceptable gives 12/23 fresh, so availability alone fails.

## Refusals (16)

The preparation refuses about half of all verses. No refusal was a condition conflict. The causes:

- **A depicted place or object not selected (4):** the tabernacle, Jerusalem twice and the court of Caiaphas. The planner describes a recurring location without selecting it, review rejects it twice, and the verse gets no image.
- **Evidence failures (4):** God selected without current-moment evidence or with invalid neighbor evidence (twice), the Acts crowd without evidence, and a re-plan whose focus was not quoted from the verse.
- **Required canon missing (3):** a named group or person depicted with no cast entry: the villagers of Madmenah, "her nobles" and Azarel.
- **Review rejections (5):** God outside the instant twice, the Israelites and Mount Tabor outside the instant, and the Philistines in more than one instant.

## Stored defects (5 flawed, 3 uncertain)

- **Conditions still contradict scenes in 4 stores.** Acts 13:21 conditions add "Roman soldiers in red-trimmed military dress", the same import seen before. Genesis 18:1 and 2 Chronicles 32:11 mix midday with long late-afternoon shadows. Ezekiel 40:24 adds a radiant cloud veil for God, who is unselected.
- **Wrong instant:** 2 Chronicles 32:11 shows Hezekiah encouraging his people instead of the envoys' taunt the verse records.
- **Unsupported symbol:** Genesis 17:20 places an empty seat in the sky over a "mud-brick tent encampment".
- **Uncertain:** Judges 15:20 names an unselected location (Timnah) as the setting. Exodus 34:8 and Deuteronomy 5:9 restate God's fixed canon almost word for word.

## Post-scoring review notes

A CodeRabbit review of this branch, after unblinding, raised three points about stored plans. First scores are unchanged.

- **Acts 13:21** also confuses identities. The verse concerns Saul son of Kish becoming king, but the plan depicts Saul of Tarsus (Paul) preaching, citing the king's words as evidence. Review returned no problems. The packet was already scored flawed for the Roman soldiers.
- **Ezekiel 40:24:** the unselected temple and the unsupported cloud veil match the existing flawed score.
- **Exodus 34:8:** God's radiance is anchored only by "and worshiped." plus previous-verse context. Under that stricter reading the uncertain score becomes flawed: fresh results would be 5 acceptable, 5 flawed and 2 uncertain, and the gate still fails.

## Scoring

Two independent model scorers labeled the 14 stored packets blind. They agreed on 13 of 14 verdicts and on all five flawed packets. The operator adjudicated the one dispute (Judges 15:20) as uncertain. All files were committed at `4490896` before unblinding. [Instructions](SCORING.md), [packet](blind-packet.json), [scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json). These are model scorers, not human acceptance.

## Meaning

Per-moment conditions help, but strict refusal policies and planner cast selection now dominate. The planner is Claude Haiku 5.5 with reasoning off. It often describes a recurring place without selecting it, and that single structural miss refuses the whole verse. Further prompt-wording iterations have not converged across twelve rounds. The next decision is structural, so it belongs to the owner: see the canonical [release status](../STATUS.md).
