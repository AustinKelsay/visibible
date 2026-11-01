# Holmes and Watson sheets remade without the BBC cast

**Production's Sherlock Holmes and Dr. Watson reference sheets no longer show Benedict Cumberbatch and Martin Freeman, and the six Holmes character cases rendered 24 of 24 images without either likeness.** The [suite baseline](../2026-10-30-suite-baseline-image/README.md) had found Holmes at 1 of 30 acceptable because every image copied the actors on the sheets. The owner approved the remake on 1 November ("Ok let's do it!") after a quote of about $1.50 to $2.

| | Before | After |
| --- | --- | --- |
| Holmes sheet | [Cumberbatch likeness](holmes-sheet-before.jpg) | [Gaunt, hawk-nosed, receding hair](holmes-sheet-after.jpg) |
| Watson sheet | [Freeman likeness](watson-sheet-before.jpg) | [Sturdy, square-jawed, heavy moustache](watson-sheet-after.jpg) |
| Holmes images with an actor likeness | 27 of 30 (baseline) | 0 of 24 (this check) |
| Watson images with an actor likeness | 15 of 30 (baseline) | 0 of 24 (this check) |

## What changed in production

All writes used `npm run works:correct -- holmes-adventures …` against production with the owner secret, on 1 November 2026.

1. **Holmes canon edit, 19:01:41 UTC.** `edit-stage sherlock_holmes sherlock_holmes` replaced the generated text (version `de6edd15…`) with an owner version (`4f223cc1…`) describing Doyle's features more exactly: over six feet and excessively lean, hair brushed straight back from a high domed forehead, hawk-like nose, deep-set grey eyes under heavy brows, thin lips, prominent square chin, frock coat and cravat. The first [remade sheet](holmes-sheet-first-remake.jpg) ($0.0341, one attempt) was still Cumberbatch with longer hair.
2. **Holmes canon edit, 19:03:03 UTC.** A second owner version (`3d50a5a8…`) pushed further from the actor: gaunt, hollow cheeks, thin dark hair oiled flat from a receding hairline, narrow deep-set eyes, long thin aquiline nose, thin tight lips, long square jutting chin, lined and ascetic. The [remade sheet](holmes-sheet-after.jpg) ($0.0341, one attempt) is this man and not the actor. This version is current.
3. **Watson canon edit, 19:01:42 UTC.** `edit-stage dr_watson dr_watson` replaced version `da3d001d…` with owner version `8f65bd67…`, following Doyle's own description of Watson (middle-sized, strongly built, square jaw, thick neck, moustache): broad shoulders, weathered ruddy complexion, hair parted and brushed flat, a full heavy dark-brown moustache. The [remade sheet](watson-sheet-after.jpg) ($0.0341, one attempt) passed first time.

Each remake closed the entry's open `canon_note` items and left no open attention. The old sheets are superseded, not deleted; saved images keep their provenance. The entries' two looks and the plans for `a-scandal-in-bohemia-1-1`, `a-scandal-in-bohemia-1-34` and `the-red-headed-league-1` became stale and are remade lazily. [redo-sheets.log](redo-sheets.log) is the tool output.

The second Holmes text is 528 characters. `edit-stage` accepted it; the 500-character limit the runbook states applies to `add-cast` validation.

## The check

`npm run evals:images -- --run check-holmes-sheets --arms generic --analysis convex --styles classical,watercolor --cases <six Holmes character cases> --repeats 2 --budget 1.50`, 19:03:53 to 19:07:42 UTC, rendering `2026-10-29-generic-v15` on Nano Banana 2 Lite, reading production's live analysis and the new sheets. The six cases are the character consistency group: A Scandal in Bohemia ¶1, The Red-Headed League ¶1 and ¶138, The Blue Carbuncle ¶12, The Speckled Band ¶235 and The Boscombe Valley Mystery ¶9. All 24 samples completed; the stale looks and plans were remade as part of the run ($0.0094).

- [Classical contact sheet](check-classical.jpg) and [Watercolor contact sheet](check-watercolor.jpg) (four samples per case, two per style).
- [scores.json](scores.json): every row passes on identity and continuity. Six rows score artifacts 1 for lettering: a legible shop sign in one Saxe-Coburg Square sample and newspaper print in the Baker Street and railway-carriage interiors, the same fault family the baseline recorded (19 lettering faults). [report.json](report.json), [manifest.json](manifest.json), [check-run.log](check-run.log).

**Cost.** Sheets: 3 attempts, $0.1023 of preparation (allowance now $34.82738765 of $43). Check: $0.8411804 ($0.83176 images, $0.0094204 preparation), against this record's $2.00 grant. No uncertain usage, no retries. [funding.json](funding.json), [budget.json](budget.json). The local dev OpenRouter key was shared with a style bake-off in another session; funding.json reconciles the account's usage rise against both.

## Limits

- **One unblinded model inspection.** The operator judged likeness from 640-pixel contact sheets, not the two blind scorers the suite uses. The next suite run is the measurement; this check only establishes that the actor faces are gone from the inputs and from a focused sample.
- **The Holmes suite gate is still unjudged.** Only the six character cases were rendered. Holmes's 30-image baseline, its place pairs and its lettering faults are unchanged until the suite reruns.
- **The second Holmes text is severe.** He reads as older and grimmer than Doyle's late-thirties Holmes. A softer text that still avoids the actor was not tried; the first, gentler edit reproduced the likeness.
- **The generic no-likeness line did not prevent this.** The sheet template forbids actor likenesses and the checker records likeness only as a note. Both actors came from the plain description plus the character's name; a likeness check that fails a sheet remains unimplemented.
- **Alice's Disney cues** (blue dress and pinafore in her drafted canon) are the same kind of borrowing and were not touched.
