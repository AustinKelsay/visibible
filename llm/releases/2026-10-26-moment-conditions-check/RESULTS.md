# Moment conditions diagnostic: results

**Gate failed.** The owner authorized this one-shot run on 26 October 2026 ("Ok do 1-3 end to end"). It completed all **42 operations / 71 calls for $0.0419565** under its $0.10 cap, with no uncertain usage, images, production queries or writes. Exact offline replay passes. [Tally](tally.json), [ledger](ledger.json), [budget](budget.json).

## Five retained hard cases

| Arm | Acceptable | Flawed | Uncertain | Refused | Condition contradictions |
| --- | --- | --- | --- | --- | --- |
| Baseline (v9/v7/v7) | 0 | 2 | 1 | 2 | 2 |
| Candidate (v10/v8/v8) | **2** | **0** | **0** | 3 | **0** |

The targeted defect is gone in this sample. No candidate case refused or stored a scene because of mismatched place, time or weather. The baseline still refused Exodus 14:5 and Exodus 23:16 for look conflicts and stored two scenes whose rendered conditions contradict them: Romans 4:7 adds "Roman soldiers in military dress nearby" to a figure-free scene, and Judges 5:12 renders a "storm-darkened sky over the Kishon river" against a clear-morning scene. The candidate stored Exodus 14:5 (Pharaoh told in his palace) and Revelation 3:12 (the overcomer as a pillar), both acceptable.

The three candidate refusals are cast and evidence failures, not condition failures:

- Exodus 23:16: the re-plan selected Mount Sinai without current-moment evidence.
- Romans 4:7: the planner twice depicted Paul, the letter's author, and review twice rejected him as outside the instant. This is correct containment of the earlier stored flaw, not a repair.
- Judges 5:12: the planner twice left the river Kishon unselected while depicting it.

Paired acceptable discordance is 2 candidate-only versus 0 baseline-only (exact p = 0.5). Five selected known failures cannot establish a fresh-case rate.

## Controls

Candidate passes **11/16** strict controls; baseline passes 12/16. Candidate misses the unsupported-Aaron substitution entirely and cites Moses on `action` instead of the required `primarySubject`. It also raises one clean-control false alarm (a royal-guard wardrobe note it describes as "not blocking") and an undisposed God-clothing report on the embodiment control. The control gate fails.

## Scoring

The five stored packets were scored before unblinding and committed at `bc9585e`. One familiar operator scored them, and condition wording can reveal the arm, so the masking is procedural only. [Packet](blind-packet.json), [scores](operator-scores.json), [key](blind-key.json).

## Meaning

Resolving conditions per moment works as designed: zero condition contradictions and zero flawed candidate stores, against two contradictions and three bad baseline stores. Availability is still blocked by cast selection and evidence, and the reviewer still misses an identity substitution. The owner's instruction continues to step 2, a broad fresh measurement with no tuning.
