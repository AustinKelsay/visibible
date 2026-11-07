# Lettering diagnostic: a reworded no-text rule

**Not adopted.** Rewording the prompt's no-text rule cut lettering only slightly in a paired test, from 8 of 12 images to 5 of 11, and made one case worse. With 11 pairs that is within noise, so the engine keeps its current rule. Lettering is the largest single fault in the [v3 suite baseline](../2026-11-07-suite-v3-image/README.md) (51 of 205 images).

## Why this test

In the v3 baseline, lettering came from papers, newspapers, playing-card corner indices, clock numerals, plaques, carved markers and the writing on the wall in Daniel 5, plus corner signatures. The scene check flagged lettering 36 times, but 37 of the 51 lettering images passed it clean, and 14 shipped still flagged after the one retry. Stopping the image model from drawing marks looked like the cheapest lever.

The candidate replaced only rule 1 of the image prompt:

> No text or symbols anywhere. Keep every surface that could carry writing plain and unmarked: *(the work's writing surfaces)*, papers, cards, walls, plaques, stones and clock faces show no letters, numerals, glyphs or pseudo-script. Where the moment involves writing, show the act, the glow or the blank surface, never marks. No signage, logos, or artist's signature or initials in a corner.

The current rule 1 is in [plan.json](plan.json).

## Method

- **Cases.** 12 writing-prone items from the v3 image run: six Alice scenes with cards or papers, and six Bible scenes whose images had lettering (Daniel 5:17 twice, the crucifixion, the Matthew 1 genealogy, 1 Corinthians 13:12, Proverbs 8:21). Holmes was left out because it is parked.
- **Arms.** Each case's stored v3 prompt was rendered once unchanged and once with only rule 1 replaced. Both arms used the same production reference images, one attempt and no scene check. Because both arms are fresh renders, picking cases that had lettering before does not favour either arm. Prompt hashes are in [plan.json](plan.json); the script is [run.mts](run.mts).
- **Scoring.** The 23 images were shuffled into blind copies and judged by two independent model scorers on lettering and on whether the scene was still shown ([SCORING.md](SCORING.md), [scorer-a](scorer-a.json), [scorer-b](scorer-b.json), [key](blind-key.json)). They agreed on 22 of 23 items for lettering and on all 23 for the scene.

## Results

| | Lettering (both scorers) | Scene shown |
| --- | --- | --- |
| Current rule | 8 of 12 | 12 of 12 |
| Candidate rule | 5 of 11, plus 1 split | 11 of 11 |

By case (current → candidate):
- **Fixed:** Alice drink-me (paper label), the crucifixion (marks on the plaque), and possibly Alice's evidence (one scorer still saw faint strokes on papers on the floor).
- **Unchanged with lettering:** the croquet game, the Cat's head and the Queen's court (card corner indices), and the Matthew 1 genealogy (carved pseudo-letters on the stone markers).
- **Unchanged without lettering:** 1 Corinthians 13:12, Daniel 5:17 in Fresco, Proverbs 8:21.
- **Worse:** Daniel 5:17 in Classical gained letters on the wall under the candidate's "show the act or the glow" wording.
- **Failed:** the Hatter in court returned no image under the candidate. The same case also failed in the v3 suite run under the current prompt.

## Cost

24 image calls for $0.788822 measured, under a $0.95 cap. The account moved by exactly that amount. No text calls, no checks and no production writes. Balance afterwards $6.08; the dev key has $1.94 left of its $50 limit. [Funding](funding.json), [ledger](ledger.ndjson).

## What this means

Prompt wording is a weak lever on this model. The marks that survive are the ones the scene itself asks for: playing cards with faces, a wall being written on, carved markers. Better levers, none of them tested yet:

1. **Plan less writing.** Steer the planner and plan review away from foregrounding papers, cards with faces showing and carved markers when the text does not need them. This is text-only, so it costs cents to test.
2. **Raise the check's recall.** The check missed 37 of 51. A stricter lettering question would trigger more retries, but in the v3 run 19 of the 28 retried images were still scored with lettering, so retries alone do not fix it.
3. **Accept small marks in some works.** For Alice, card indices may be better treated as an accepted limitation than fought image by image.
