# Holmes and Alice image quality before a reader for them (10 November 2026)

The owner chose to make Holmes and Alice readable ("ok lets go with both"), quality first, within $10 ("Up to $10 (Recommended)", "Quality first (Recommended)"). Neither book is served to readers yet; the reader is Bible-only, so nothing here changed what readers see.

## Results

Two blind scorer agents judged each image against the moment's text with the suite's rubric ([SCORING.md](../2026-11-09-lean-engine/scoring/SCORING.md)). Ranges run from "both scorers accept" to "either accepts". The launch bar accepts small unreadable marks (ADR 0006 amendment 7).

| | Strict | Launch bar | Actor likeness |
| --- | --- | --- | --- |
| Holmes, lean engine on 9 November | 10 of 30 | 21 of 30 | Peter Cushing in most images (scored as no fault then, face only) |
| Holmes now ([run](../2026-11-10-holmes-alice-check/)) | 14–18 of 30 | 19–24 of 30 | Benedict Cumberbatch drift in 2–3 images |
| Alice, lean engine on 9 November (fixture, no sheets) | 7 of 32 | 15 of 32 | |
| Alice now, prepared in production with sheets | 10–14 of 32 | 13–17 of 32 | none |

Holmes, Watson and Alice are the same people from image to image in both styles.

## Holmes

- **The sheet was the cause.** The 1 November sheet was a Cushing likeness, and every scene copied it. Remakes failed the sheet checker on likeness: given "Sherlock Holmes", Nano Banana 2 Lite drew Cumberbatch even with sandy hair and freckles, and Nano Banana 2.1 drew the same Paget-type face whatever the canon said. A [Paget-like sheet](holmes-sheet-paget-rejected.jpg) passed the checker, but the [first check](../2026-11-10-holmes-check/) found it read as Cushing in 20–25 of 30 scenes.
- **Fix:** character sheets now name neither the character nor the work (`sheetPrompt`), and `redo-sheet --image` installs an owner-chosen sheet through the same checker. The [chosen sheet](holmes-sheet-chosen.jpg) is an original, clean-shaven, dark-haired face. It is pinned, and Holmes's canon was rewritten to match it.
- **Left:** lettering on newspapers in about a third of the images (mostly unreadable); a duplicated blue carbuncle; a Lestrade that one scorer called Cushing-like.

## Alice

- **Prepared in production** (reading $0.0549, canon $0.0627, generation 2) against a brief with sharper rules: talking animals keep animal faces; no adaptation costumes. The suite now reads Alice from production like Holmes, instead of the committed fixture.
- **Canon corrected by hand:** Alice in Tenniel's yellow Nursery frock instead of the drafted blue-and-white pinafore. The Queen and King became court cards instead of a human queen and a king "drawn as a human man". The soldiers, gardeners, Knave, croquet players and court officers became cards whose whole body is the card, instead of "livery", "tabard", "smock" and "cap".
- **Sheets:** 49 made ($2.18), seven card sheets remade ($0.44), four more after the royals' second edit ($0.17).
- **Left, in court and croquet scenes:** soldiers and guards drawn as men in card tabards; wooden mallets beside the flamingos; extra human spectators; a doubled King; and, by one scorer, the Caterpillar's human face. A [re-check](../2026-11-10-alice-court-check/) of the nine worst cases after the canon edits scored 0 of 18 on both scorers.
- **The card rule overreached.** The brief's rule was widened to "All the Queen's court … are cards", but Carroll describes only the soldiers, courtiers, gardeners and royal children as flat cards, and Tenniel draws the King and Queen as people in court-card dress. Most of the scorers' card faults are human royals. Under the book's rule Alice would reach about 15–19 of 32 at the launch bar. Correcting the brief needs a reread: restaging canon from saved state renamed stage ids, which conflicted with the carried owner corrections. Generation 3 was abandoned, and the active generation and its brief were restored.

## Spend

**$9.17 of the $10**, by the production key's usage at the end of the phase. It covers:

- Holmes sheet attempts and probes;
- Alice's preparation, sheets and remakes;
- the three image checks, ledgered at $1.33, $2.90 and $0.91;
- the abandoned generation-3 restage, which redrafted some canon and is not separately ledgered.

The "spent before this run" figures in each `funding.json` were running estimates made at the time. The key's usage is the authority.

## Scoring packs

The blind packs (`scoring/items.json` in each run) were built by hand in the suite's rubric format rather than by `evals:lean -- blind`, since there was no second arm to mix in. Image paths are relative to the repository root and point into the ignored `evals/images/runs/` folder; copies of the images are kept outside the repository.

## Next

1. Alice: correct the card rule to the book (soldiers, courtiers, gardeners and royal children are cards; the King, Queen and Knave dress like court cards) with a fresh reread and canon. Then make croquet mallets flamingos in the croquet-ground canon, and keep the court crowd to birds and beasts.
2. A reader for prose works. It is needed before either book reaches readers.
