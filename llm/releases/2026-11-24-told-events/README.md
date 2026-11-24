# Told events: paint what a speech tells, not the speaker again

**Prompt `2026-11-24-lean-v7` paints words that tell of another time or place as what they tell.** It keeps the speaker scene for words addressed to the people present. Over 40 verses, told events rose from 6-7 of 26 to 24 of 26, and every speech to the people present still shows the speaker. Six real images came out as intended. $0.48 of the owner's $0.50 OpenRouter budget, on the dev key. No production write.

![Acts 13 before (production) and after (v7)](before-after.jpg)

*Left: production's lean-v6 images. Right: v7, same prompts otherwise. Rows: Acts 13:17 (the exodus), 13:21 (Saul made king), 13:22 (David), 13:26 ("Brothers… to you is sent", which keeps Paul), 13:27 (the rulers condemn Jesus).*

## The problem

The owner, reading Acts 13 in production, found eleven of twelve images of Paul's synagogue speech (13:16-27) to be the same scene: Paul talking to the synagogue. Meanwhile the words told of Egypt, the wilderness, Canaan, the judges, Saul, David and John. The lean prompt caused it: "When someone speaks, show the speaker and listeners where they are; never paint the content of the speech as a separate scene or as figures beside them." Acts 13:22 does not even name Paul, so the neighbouring verse alone made it a speech. That sentence entered with the lean prototype (`662e39a5`) and reversed [ADR 0006](../../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md)'s speaker rule without a decision.

## The rule

In HOW TO READ IT ([lean.ts](../../../src/lib/engine/lean.ts)):

> When the moment is someone's words, including a speech, prayer or story that began before it, judge what these words do, not their neighbours. If they tell of events, people or places away from where they are said (history, a memory, a story or parable, a dream, vision or prophecy), paint what they tell, in its own time and place and its own era's dress, even when the words also address the listeners; anyone quoted inside the telling belongs to the told scene. Leave the teller and listeners out unless the text puts them inside it. Paint the speaker and listeners where they are only when the words are about those people there (a greeting, question, reply, command, warning or appeal) or the moment only says that someone spoke. Never both in one picture: no inset, bubble or second scene beside the speaker.

Rule 3 now reads "Nothing from outside the era of what is painted" (was "the moment's era"), so a told event takes its own era's dress rather than the section's.

A full picture was chosen over a bubble or inset. Rule 2 already forbids collage, a bubble reads as a comic in the painterly styles, and the reader sees the verse beside the picture, so the speech frame is not lost.

## Method

The climb had a fixed evidence set and metric.

- **Cases** ([cases.json](cases.json)): 40 Bible verses.
  - 26 told events: Acts 13:17-31, Acts 7:9 and 7:30, Peter's sheet vision retold, Paul's Damascus road retold, Pharaoh's and the cupbearer's dreams, Nathan's ewe lamb, Jotham's fable, the prodigal son, the Good Samaritan, the sower, Joshua 24:6, Nehemiah 9:11 and Daniel 2:31. Four are `told-self`, where the teller is in their own story.
  - 10 where the words concern the people present: Acts 13:16, 26, 38 and 40, Acts 7:51 and 17:22, "You are the man", "He told them this parable", "Lazarus, come out" and Pilate's question.
  - 4 controls with no speech change expected.
- **Prompts** ([harness/build.mts](harness/build.mts)): built by the checkout's own `assembleLean` from production's Bible analysis, through public reads. On the 14 verses that have a lean-v6 image in production, they match the stored prompt byte for byte. The v7 code then builds exactly the measured v3 variant for all 40.
- **Metric** ([harness/probe.mts](harness/probe.mts)): `google/gemini-3.1-flash-lite`, reasoning off, reads the full prompt and replies in JSON with what it would paint and whether the speaker and listeners are visible. A told case passes when neither is visible, or for `told-self` when no listeners are. A present case passes when the speaker is visible. Controls were read by hand. One call costs about $0.0006. On the baseline it reproduced production's choices on Acts 13, including the one exception (13:24, John at the Jordan). Nano Banana 2.1 itself in text mode cost $0.0115 a call (reasoning), too much for the budget.
- **Real images** ([harness/render.mts](harness/render.mts)): v7 prompts on `google/gemini-nano-banana-2.1` at 16:9 1K with production's reference sheets, beside production's existing lean-v6 images (free).

## Rounds

| Round | Change | Told (of 26) | Present (of 10) |
| --- | --- | --- | --- |
| 0, baseline lean-v6 | | 7, 6 (two runs) | 10, 10 |
| 1 | The rule as first proposed | 19 | 10 |
| 2 | + a speech begun earlier; "even when the words also address the listeners" | 21 | 10 |
| **3, kept** | + "judge what these words do, not their neighbours"; quoted people belong to the told scene | 23, 22 raw; **24, 24 adjudicated** | 10, 10 |
| 4 | + a moment that says someone spoke *and* gives what they told shows what they told | 22 | 10 |
| 5 | Round 3 shortened by 85 characters | 21 raw, 22 adjudicated | 10 |

Rounds 4 and 5 were reverted. "Adjudicated" corrects a grading artifact: on Acts 13:25 (John at the Jordan) and Genesis 41:17 (Pharaoh at the Nile in his dream), the preview drew the told scene correctly but named the quoted person as the speaker. Per-case answers are in [proxy/](proxy/), and the candidate texts are in [variants.json](variants.json). All four controls kept their scene in every round (Genesis 1:3 light with no figure, Moses at the sea, Saul struck on the road, the Antioch church at prayer).

The two remaining misses are arguable:
- **Acts 13:27** ("…nor the voices of the prophets which are read every Sabbath…"): the preview kept the synagogue. The real image showed the rulers condemning Jesus.
- **Genesis 40:9** ("The chief cup bearer told his dream to Joseph, and said…"): the moment narrates the telling, so the prison scene is defensible.

## Real images

All six were drawn by v7, at $0.045-0.050 each, and all came out as intended:

| Verse | Production (lean-v6) | v7 |
| --- | --- | --- |
| Acts 13:17 | Paul speaking | Israel leaving Egypt under the pillar of cloud and fire; no figure in it |
| Acts 13:21 | Paul speaking | Samuel anointing Saul on a hillside; Saul is not drawn with Paul's face |
| Acts 13:22 | Paul speaking | Samuel anointing the young David |
| Acts 13:26 | Paul speaking | Paul speaking (unchanged, as intended) |
| Acts 13:27 | the synagogue reader | Jesus bound before the rulers and Roman soldiers in Jerusalem |
| 2 Samuel 12:3 | (none in production) | [the poor man feeding his ewe lamb at his table with his children](after-2-samuel-12-3.jpg) |

That is the operator's unblinded look, not a blind score, and six images cannot show a rate.

## Known gaps

- People only told of (David, Moses, Samuel) are not in the section's cast. They are drawn as unnamed figures and will not match their look in their own books. Fixing that means the reading pass would add them to a section's cast.
- Name matching offers Paul's canon and sheet ("Saul/Paul") as "named here" for King Saul in Acts 13:20-22. The one image drawn did not give Saul Paul's face, but the risk stands.
- The suite gate ([ADR 0011](../../../docs/adr/0011-frozen-multi-work-regression-suite.md)) was not run: it costs about $9, beyond this budget. Suite cases this touches include Luke 15:20 and 15:22, Deuteronomy 1:7, Matthew 5:40, Isaiah 40:29 and Romans 8:28.

## Cost

$0.4818 by the [ledger](ledger.ndjson), on the dev key:
- $0.1954: 320 Flash Lite previews
- $0.0115: one Nano Banana 2.1 text probe
- $0.2749: six images

To rerun, copy `harness/` and `cases.json` into the ignored `evals/images/runs/told/` and run from the repository root: `npx tsx evals/images/runs/told/build.mts <out.json>` (add `--refs` for image runs), then `probe.mts` or `render.mts`.
