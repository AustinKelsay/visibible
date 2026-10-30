# Second Daniel re-check: canon text edited to match his sheet

**Daniel now looks like the same man in 7 of 12 judged pairs across all three public styles, up from 3 of 12 with no sheet.** Watercolor matched in every pair, including Daniel 6:22, which the [first re-check](../2026-10-29-daniel-recheck/README.md) always missed. Classical and Fresco still drew the Daniel standing in the den (6:22) as a younger, dark-haired man. Leaving 6:22 out, he matched in 5 of 5.

| Daniel group | Classical | Watercolor | Fresco | All |
| --- | --- | --- | --- | --- |
| No sheet ([consistency verses](../2026-10-29-consistency-verses/README.md)) | 1 of 3 | 1 of 3 | 1 of 6 | 3 of 12 |
| Sheet ([first re-check](../2026-10-29-daniel-recheck/README.md)) | 3 of 6 | 3 of 6 | not run | 6 of 12 |
| Sheet and edited canon (this run) | 1 of 3 | 3 of 3 | 3 of 6 | 7 of 12 |

Classical and Watercolor have three verses here, not four. Classical's Daniel 7:9 plan drew the Ancient of Days, who has no form, as a figure. The engine refused the plan before any image, as it should, and both styles share that plan.

The lions' den pairs matched in Watercolor and Fresco. Classical again drew two different dens: dark stone with a full-height iron gate under palace buildings, then pale stone with a small barred opening under a wooden canopy and palms.

## What changed before this run

- **Canon edit.** At 01:27 UTC on 30 October the owner-correction tool (`npm run works:correct -- bible-web edit-stage`) replaced Daniel's stage text. It took his entry from version `37b250d3…` to owner version `a9ff9e07…`.
  - Before: "a lean, dignified Judean man in his youth grown to a grave, graying elder; olive-brown skin; dark hair cropped close and a short trimmed beard flecked with grey"
  - After: "a lean, dignified Judean man, grave and greying; olive-brown skin; close-cropped greying hair and a short trimmed grey beard". His eyes, outfit and props are unchanged.
- **New sheet.** The edit made his sheet stale, so `redo-sheet daniel_prophet_of_babylon:daniel_main` remade it in one attempt for $0.0341 of preparation. The new sheet shows close-cropped grey hair, a grey beard and olive-brown skin, with the same indigo cloak and scroll case.
- **A broken last step.** `edit-stage` wrote the edit, then failed at its final step: the stale-dependents query (`listStaleDependents`) returns a server error on the Bible. It reads every current record in the work, which is likely over Convex's per-query read limit. `inspect` fails the same way. The edit itself was confirmed by reading the entry.

## The run

- **Engine and inputs.** [run.mts](run.mts) is the first re-check's runner, run against a fresh read-only [snapshot](snapshot.json) that holds the edited entry and the new sheet. Daniel's entry changed, so no earlier section looks were seeded; every section that casts him got a fresh look, as production would make one.
- **Where it ran.** It ran from a scratch checkout of the first re-check's commit, because `dev` now carries an engine newer than production's. Every engine source matched `main` file by file, and [run-started.json](run-started.json) records each input's SHA-256. The local commit in [frozen-commit.json](frozen-commit.json) is not on the remote.
- **Key.** The production OpenRouter key was at its spending limit, so this run used the local dev key, ending …1292. It shares the production account. The runner now checks the key's own limit before any call; $49.48 was left on it.
- **Cost.** **12 images (10 shown, 2 retries for lettering), 34 text calls and 24 check calls for $0.4378694**, within the existing $40.30 evaluation allowance, under a $0.60 cap. There was no uncertain usage. [Funding](funding.json), [budget](budget.json).
- **Scoring.** Two independent blind model scorers judged the 15 pairs and agreed on 13 ([scorer-a.json](scorer-a.json), [scorer-b.json](scorer-b.json)). The operator settled the two Fresco disputes about skin tone as same, at full size ([operator.json](operator.json)). [report.json](report.json) has the rest; its gate fails only because this focused run covers two groups.

## Limits and next steps

- **Daniel 6:22 still drifts in two styles.** Nothing in its plans asks for dark features. All three styles had the same dawn light and a small, front-facing figure in the den. With one image per style, chance and composition can't be told apart.
- **Daniel is now an older man in every section.** His single stage also covers Daniel 1–2, where he is a youth. A youth stage for those 8 sections needs a correction command that can add a stage and reassign sections; none exists today.
- **The owner tooling bug needs a fix.** `inspect` and the last step of `edit-stage` should page or index their stale-dependents lookup, not read every record in the work.
