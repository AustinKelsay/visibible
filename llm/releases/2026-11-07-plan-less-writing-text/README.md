# Plan less writing: planner sentence not adopted

**No effect, so reverted.** A planner sentence telling the scene planner to leave out writing-prone objects did not change what the plans ask for. It was the text-only follow-up to the [lettering diagnostic](../2026-11-07-lettering-rule/README.md), which found that the marks that survive are the ones the scene asks for.

## The candidate

Commit `ae7ccfe` added one sentence to the planner's general contract (moment-cast v16), after the work's closed-documents wording:

> Bring in papers, books, cards, signs, plaques, carved stones or clocks only when the text needs them, and then keep them small, closed or turned away rather than in the foreground.

Only the six planner requests in the engine golden fixtures changed, each by exactly that sentence. Looks, reviews, rendering prompts and checks were byte-for-byte unchanged, and all 1,161 tests passed. The sentence avoids "scroll" and "tablet" so Holmes's prompts carry no Bible wording.

## Run

A full v3 suite text run on the candidate: 113 cases prepared fresh from a read-only production snapshot, 392 text calls for **$0.172889** measured, under a $0.25 cap. No uncertain usage, no refusal and no production write. [Funding](funding.json), [plan](plan.json), [snapshot](snapshot.json), [results](results.ndjson), [ledger](ledger.json).

## Result

Plans were compared with the [v3 baseline's](../2026-11-07-suite-v3-text/README.md) by searching their scene fields for objects that carry writing: papers, newspapers, letters, books, scrolls, tablets, cards, clocks, signs, slates, notices, plaques, markers, maps and the like.

| | Plans naming such objects | Object phrases (excluding card courtiers) | Of those, marked closed, blank, small or turned away |
| --- | --- | --- | --- |
| v3 baseline | 23 of 113 (Holmes 9, Alice 9, Bible 5) | 35 | 16 |
| Candidate | 23 of 113 (Holmes 9, Alice 11, Bible 3) | 28 | 10 |

The same number of plans name such objects, and fewer of the mentions are qualified: the opposite of the sentence's intent. The test compares one candidate run with one baseline run, so it cannot separate these small shifts from sampling noise between fresh text runs. The plans show no improvement, so an image test could not show one either. None was run, and the plans were not scored blind.

The candidate commit is reverted on the same branch, so the engine stays at moment-cast v15.

## What this leaves

Two prompt-level attempts, the [image rule](../2026-11-07-lettering-rule/README.md) and this planner sentence, have not moved lettering. The objects come from the passages themselves: court papers, card soldiers, the writing on the wall. The remaining options are a stricter scene check with more retries (costly, and retries often keep the marks) or accepting small marks as a limitation for some works. Both need an owner decision and, for a check change, a funded suite run.
