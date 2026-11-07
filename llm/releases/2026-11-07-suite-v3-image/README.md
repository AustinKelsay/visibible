# Suite v3 baseline: images and consistency

**This is the first suite `2026-11-01-suite-v3` image baseline ([ADR 0011](../../../docs/adr/0011-frozen-multi-work-regression-suite.md)).** It measured the remade Holmes and Watson sheets ([record](../2026-11-01-holmes-sheets/README.md)) and Alice's corrected outfit. In short:

- **112 of 205 shown images are acceptable (55%)**; on the holdout, 21 of 49 (43%).
- **The Bible holds:** 105 of 144 (73%), against 106 in v1, with no God figure (v1: 4 of 30). Same person 94%; same place fell to 67%.
- **Holmes still fails, 0 of 30.** The actor changed. The remade Holmes sheet itself reads as **Peter Cushing**, and 21 images carry an actor likeness (Cushing in most; a few drift back to Benedict Cumberbatch, one Watson to Martin Freeman). Watson's identity is now unstable: 5 of 20 pairs the same person (v1: 15 of 20).
- **Alice falls to 7 of 31.** Her own outfit no longer reads as Disney's, and she is the same person in 20 of 20 pairs. The misses are lettering (18 images: card indices, court papers) and other adaptation borrowings: a Disney-style Queen of Hearts in five images and a human-faced, bowler-hatted Caterpillar in two.

The run drew the plans of the [v3 text run](../2026-11-07-suite-v3-text/README.md) in each work's image styles, through the same scene check and retry readers get. It made **234 image calls and 466 check calls for $8.1600166 measured**, plus $0.12455525 reserved for calls whose usage the provider did not report, under its $9.00 cap. The account and the dev key both moved $8.341 across the two runs, matching the measured total. One Alice item (the Hatter in court, Classical, dev split) failed when the provider returned no image. No refusal and no production write. Links: [funding](funding.json), [plan](plan.json), [report](report.json), [items](items.json).

## Images

| Work | Dev | Holdout | All | v1 baseline |
| --- | --- | --- | --- | --- |
| Bible (Classical, Watercolor, Fresco) | 87 of 117 | 18 of 27 | 105 of 144 (73%) | 106 of 144 |
| Holmes (Classical, Watercolor) | 0 of 22 | 0 of 8 | 0 of 30 | 1 of 30 |
| Alice (Classical, Watercolor) | 4 of 17 | 3 of 14 | 7 of 31 (23%) | 14 of 32 |
| **All** | 91 of 156 | **21 of 49** | **112 of 205 (55%)** | 121 of 206 |

By style: Fresco 31 of 48, Watercolor 41 of 79, Classical 40 of 78.

| Fault | Bible | Holmes | Alice | All |
| --- | --- | --- | --- | --- |
| Lettering | 11 | 22 | 18 | 51 (25%) |
| Depiction rule broken | 2 | 21 | 9 | 32 (16%) |
| Incoherent | 16 | 5 | 2 | 23 (11%) |
| Scene not shown | 14 | 1 | 2 | 17 (8%) |
| Extra figure | 3 | 1 | 3 | 7 |
| Anatomy | 1 | 0 | 2 | 3 |
| Unseen subject drawn | 0 of 41 | n/a | n/a | 0 of 41 |
| Painted frame | 0 | 0 | 0 | 0 |

Accepted Watercolor paper edges are recorded in the scores and count as 0.

### What fails

- **Holmes: the sheet moved from one actor to another.** The 1 November canon edit described Doyle's Holmes: gaunt, receding hair oiled flat, high domed forehead, hollow cheeks, aquiline nose. The sheet made from it ([left top](holmes-likeness.jpg)) is a close likeness of Peter Cushing, and images that follow it inherit the face (i073, right top; i204, left bottom). The sheet checker's new likeness question passed it on 1 November. Some images ignore the sheet and return the curly-haired Cumberbatch face (i021, right bottom). The 24-image check on 1 November looked only for the BBC actors, so it did not catch this.
- **Watson drifts.** His new canon ("strongly built, broad shoulders, ruddy") renders sometimes lean and sometimes heavy, with brown, near-black or greying hair, and one image reads as Martin Freeman.
- **Lettering rose to a quarter of images.** It is concentrated in Holmes's Baker Street interiors (papers, newspapers, notices) and Alice's court (card indices, papers). Some of the rise over v1 may be scorer strictness: the faint pseudo-text and corner glyphs the scorers counted are easy to miss.
- **The Bible's faults are the known kinds:** contradictory places (stairs out of the lions' den Daniel is hauled from by rope; the den sealed with a stone yet still open), wrong action (David walking away from Goliath), and Isaiah's seraphim drawn as ordinary four-winged angels.

## Consistency

Pairs of shown images that should agree, judged blind ([ADR 0008](../../../docs/adr/0008-consistency-in-the-launch-bar.md)).

| Work | Same person | Same place | Gate |
| --- | --- | --- | --- |
| Bible (3 styles) | 91 of 97 (94%); 17 unclear | 18 of 27 (67%) | **fail**: character passes; place fell from 89% |
| Holmes (2 styles) | 28 of 50 (56%) | 2 of 4; 4 unclear | fail: 56% (bar 75%), and too few place pairs |
| Alice (2 styles) | 23 of 23 | 8 of 12 (67%) | fail: too few pairs (23 of 30, 12 of 20) |

By group:
- **Bible characters:** David 18 of 18, Moses 27 of 30 (bald with a fringe in one scene), Peter 18 of 18 (12 unclear: the shore plan names only "several disciples"), Daniel 15 of 18, Jesus 13 of 13 (5 unclear).
- **Bible places:** storm 8 of 9, breakfast on the shore 3 of 3, prodigal's return 3 of 3, Red Sea 4 of 9, lions' den 0 of 3 (v1 also 0 of 3).
- **Holmes:** Holmes 23 of 30, Watson 5 of 20, bank cellar 2 of 2, Eyford fire 0 of 2 (4 unclear).
- **Alice:** Alice 20 of 20, Cheshire Cat 2 of 2, Hatter 1 of 1, croquet-ground 6 of 6, tea table 2 of 6 (the house behind changes from brick to timber).

The Bible engine did not change between v1 and v3. Its drop in same place (Red Sea 9 of 9 to 4 of 9) is a fresh sample of the same requests and a different pair of scorers. That shows how wide the place measurement's variance is at 27 pairs.

## Method

- **Images.** The 205 images went blind to two independent model scorers in 8 batches each, following [SCORING.md](scoring/SCORING.md). They agreed on 146 items. Two adjudicator agents drafted rulings on the 59 disputed items, each viewing only the image, its item and both scorers' answers ([adjudication-1.json](scoring/adjudication-1.json), [-2](scoring/adjudication-2.json) and their drafts). The operator viewed the Holmes sheet and i021, i073, i155 and i204 against the likeness calls, adopted all 59 ([operator.json](scoring/operator.json)) and re-settled ([scores.json](scoring/scores.json)).
- **Consistency.** `npm run evals:consistency -- pairs` built 141 Bible, 58 Holmes and 35 Alice pairs. Two blind scorers judged every pair, in chunks, and agreed on 211 of 234. One adjudicator agent drafted the 23 rulings, which the operator adopted. Each work's pairs, key, scorer files, operator file and report are under [consistency/](consistency/).
- **Incident.** During scoring, a helper script one scorer left in the shared scratch folder overwrote two blind copies (i053, i054). Both scorers of that batch had already viewed the originals. The operator verified all 205 blind copies against the run's recorded SHA-256 and restored the two from the untouched originals. No score was affected. Later agents worked in separate folders.
- Scorers and adjudicators are models. The Holmes likeness calls rest on the agreed calls plus the operator's own look at the sheet and four images.

## Next

Holmes and Alice are not served to readers, so none of this changes production. The Bible remains as measured.

1. **Holmes needs a decision, not another sheet redo.** Doyle's description is close to Cushing's famous look, and the model also reaches for Cumberbatch with or without the sheet. Options: (a) remake the sheet with deliberately non-actor features (fuller hair, a different face shape), accepting less fidelity to the book; (b) add a stronger "no screen Holmes" rule to the renderer and recheck; (c) park Holmes. Each paid try is about $1 for the sheets plus a Holmes-only check.
2. **Make the likeness check name the right actors.** The sheet checker passed a Cushing likeness. It cannot be told "no Cushing" without naming him, so the check works best as a second-opinion step across known screen versions of a character before a sheet is pinned.
3. **Alice:** add the Queen of Hearts and the Caterpillar to the adaptation review that fixed Alice's outfit.
4. **Lettering in cluttered interiors** is now the largest single fault and the next engine fix for any work with papers on desks.
5. **Grow the Holmes and Alice consistency groups** before the next run, so their gates can be judged.
