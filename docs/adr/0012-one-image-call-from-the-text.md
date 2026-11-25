---
status: accepted
date: 2026-11-09
---

# One image call from the text

On 9 November 2026 the owner asked whether the consistency pipeline had grown too bloated, approved a measured comparison, and on its result chose the lean engine ("Yep, let's go with the slim pipeline"). This record replaces the per-moment preparation of [ADR 0002](0002-consistent-images-from-canon-and-reference-images.md) and its successors. The reading pass, canon, reference sheets, briefs, styles and depiction profiles of those records stand.

## Decision

- **One paid call per image.** A new image is one request to the image model. Nothing is prepared for a moment first: no section look, no scene plan, no plan review, and no finished-image check or retry.
- **The model reads the text.** The prompt carries the moment's own reference text and its in-section neighbours, the work brief, the art style, and the fixed canon of the section's cast. The image model chooses the instant and the composition.
- **No model selects the cast.** Every member of the section's cast is offered with the canon stage the section assigns. Members the moment or a neighbouring verse names come first; the rest are listed as cast the moment may involve. Matching names alone finds only 60% of the cast a planner selects, because verses say "he" and "they", so nobody is dropped.
- **Places have their own block.** The section's places are listed as the setting, to be kept unless the moment is plainly elsewhere. Listed with the optional cast, they were redrawn from scratch each time.
- **Subjects without form keep their work's wording** ([ADR 0010](0010-work-depiction-profiles.md)). Their names are replaced in every text the prompt carries, including other entries' canon and captions, and a rule tells the model that words giving such a subject a seat, clothing or a body are imagery.
- **References:** the style reference and up to four sheets, for the best-ranked character, the best-ranked place, then the rest in rank order. A reference is used only when it is current for its inputs and its bytes load.
- **Nano Banana 2.1 is the image model.** It follows reference sheets where Nano Banana 2 Lite drifts. Sheets and style references are still made on Lite.
- **Same engine identity.** Requests stay `engine: "generic"`; the prompt version (`lean-v6` at this decision) tells the pipelines apart. The stored packet and provenance kept their shape, with `lookVersion` and `planVersion` reading `none`; since 10 November 2026 new packets leave both out.

## Why

The [comparison](../../llm/releases/2026-11-09-lean-engine/README.md) scored 206 lean images blind beside 204 from the full engine, on the same suite, canon and sheets, judged against the text.

| | Full engine, Lite | Lean, 2.1 |
| --- | --- | --- |
| Acceptable images | 123 of 204 | 130 of 206 |
| Bible | 107 of 144 | 113 of 144 |
| Same person across images | 86% | 97% |
| Same place across images | 93% | 76% |
| God figure drawn | 1 of 42 | 2 of 42 |

The suite gate passed with the full engine as baseline. The [setting block](../../llm/releases/2026-11-09-lean-setting/README.md) then raised same place from 30 of 38 pairs to 35 of 39, with the Bible at 27 of 27.

Earlier attempts to simplify removed parts of the full engine while keeping Lite, and failed their gates ([closed investigation](../../llm/releases/2026-11-01-correction-final-review/REVIEW.md)). The plan, review and check each worked around what Lite could not do with a long text and several references. A model that can read the passage makes them unnecessary.

## Consequences

- **Price.** An image costs about $0.043 at the provider: 6 credits against 5. The quote allows 600 response text tokens for the reasoning 2.1 bills with every image.
- **Speed.** About 10 s median and 15 s at p90 for every image. A new moment no longer waits for preparation; a moment that had cached preparation is about 4 s slower.
- **No preparation failures.** "Preparing scene" now means only that the work's analysis or inputs are not ready. There is no owner spend per moment.
- **No second look.** A faulty image is shown as made. Readers regenerate; nothing retries for them. The two God figures the comparison found drove the imagery rule and the renaming in other entries' canon; a six-image check afterwards showed none, unscored.
- **More narrator figures.** With no planner, a prophet or author appears beside their own words more often (18 images against 13).
- **Owner looks are no longer read.** Production held none at the switch (52 looks and 65 plans, all generated). The stored looks and plans were archived and deleted on 10 November 2026 ([record](../../llm/releases/2026-11-10-remove-preparation/README.md)); saved images keep the versions they were made from.
- **Bulk jobs** bound to the generic engine continue on the lean pipeline. None was running at the switch.
- **No rollback.** Until 10 November 2026 promoting `dpl_fVVRrsY5DS3kZvetCpPMRUbiJv6W` (main `b69b40c`) would have restored the full engine. The owner then gave that up: its app code (PR #395) and its Convex functions, record kinds and tables were removed ([record](../../llm/releases/2026-11-10-remove-preparation/README.md)). Restoring it now means reverting those changes from git history, and it would remake every look and plan.
- **What is measured.** The comparison changed pipeline and model together, its scorers were models, and its holdout is 49 images. Holmes and Alice, which are not served, did worse on places and on Alice's card people than the Bible did.

## Amendment: words that tell of another time or place (24 November 2026)

Reading Acts 13, the owner found eleven of twelve images of Paul's synagogue speech (13:16-27) to be the same scene of Paul talking, while the words told of Egypt, the wilderness, the judges, Saul, David and John. The lean prompt had said "when someone speaks, show the speaker and listeners; never paint the content of the speech". That reversed the speaker rule of [ADR 0006](0006-unseen-presence-speakers-and-launch-bar.md) without a decision. The owner asked for a general rule.

- **Judge the words by what they do.** Words that tell of events, people or places away from where they are said (history, a memory, a story or parable, a dream, vision or prophecy) are painted as what they tell, in its own time, place and dress, even when they also address the listeners. The teller and listeners stay out unless the text puts them in that scene. Anyone quoted inside the telling belongs to the told scene.
- **The speaker scene stays for words about the people present:** a greeting, question, reply, command, warning or appeal, or a moment that only says someone spoke. A speech therefore often opens and closes on its speaker, with what it recounts shown between.
- **One picture, never both.** No inset, bubble or second scene beside the speaker; rule 2 already forbids collage.
- **The era rule follows the picture.** Rule 3 reads "Nothing from outside the era of what is painted", so the rules no longer hold a told event to the section's era (David need not wear Acts' Roman-era dress). This is intent; the measurement could not see dress.
- **Each moment decides alone.** The rule reads only the moment and its two neighbours, like everything else in the lean prompt. It needs no record of which scenes earlier images showed.

Measured in the [told-events record](../../llm/releases/2026-11-24-told-events/README.md). A text preview of what the model would paint read 40 verses, the same ones the wording was tuned on. It moved told events from 7 and 6 of 26 to 23 and 22 (raw), or 7 and 8 to 24 and 24 when descriptions are read the same way every round. All 10 speeches to the people present kept the speaker. Six real images on Nano Banana 2.1 showed the intended scene. The prompt version is `2026-11-24-lean-v7`. Of 14 verses held out from tuning, it changed four told scenes and missed Acts 7:2 and Mark 13:2. The owner waived the release gates of the [eval workflow](../../llm/workflow/IMAGE_EVAL_AND_RELEASE.md) (suite image run, consistency pairing) on 24 November 2026 and signed off on these results; the suite run remained a follow-up.

Follow-up suite measurement (`2026-11-24-lean-v8`, adding work-wide unseen-subject name scrubbing): recorded in [2026-11-24-lean-v8](../../llm/releases/2026-11-24-lean-v8/README.md). Run via Gemini Batch (`--provider gemini-batch`) plus one live retry for $5.51 total (38% below the $8.87 OpenRouter baseline). Against the `2026-11-09` lean baseline: overall strict acceptability rose from 63% to 71% (launch bar 75% to 78%; Bible 83% to 85%; holdout launch bar 65% to 73%), extra figures fell from 9% to 3% (0/49 on holdout), readable lettering was 0/206, unseen-subject figures fell from 2/42 to 1/42, and the Bible consistency gate passed at 100% character (78/78) and 93% setting (25/27). A paired 98-image holdout check against `lean-v6` ([2026-11-25-holdout-paired](../../llm/releases/2026-11-25-holdout-paired/report.json), $1.29) confirmed `lean-v8` improved Bible (81% vs 78% launch bar, 74% vs 70% strict), Holmes (75% vs 63% launch bar), and extra figures (1/49 vs 5/49), while failing the formal holdout gate on `incoherent` (9/49 vs 3/49) and strict acceptability (24/49 vs 30/49), driven largely by Alice (5/14 vs 10/14 launch bar).

Known gaps: in the preview, a vision the teller sees as he speaks (Acts 7:56) loses the teller, and "away from where they are said" does not plainly cover a prophecy about the same place (Mark 13:2). People who are only told of (David, Moses, Samuel) are not in the section's cast, so they are drawn as unnamed figures and do not match their look in their own books. The name matcher also offers Paul's canon ("Saul/Paul") for King Saul in Acts 13:20-22.
