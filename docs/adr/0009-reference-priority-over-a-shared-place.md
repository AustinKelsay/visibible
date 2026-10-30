# Reference sheets, not a shared place, carry consistency

On 29 October 2026 the owner asked for point two of the engine critique end to end ("Okay, let's start to address number two, systematically end-to-end, full send"). Point two said the engine had weakened its own consistency tools. The section look no longer reached the image, sheet slots went by plan order, the reference cap and the Classical-only sheets were unmeasured, and the sheet threshold counted sections rather than appearances. The decisions below are the operator's under that delegation, measured against the [consistency gate](0008-consistency-in-the-launch-bar.md).

## Decisions

- **No shared section place.** A [blind A/B](../../llm/releases/2026-10-29-section-place-check/README.md) drew each section look's place verbatim wherever the plan put the moment there. Neighbouring verses then agreed in 6 of 9 pairs, in two candidate versions, against 9 of 9 for the current engine in two scorings. Most misses were time of day. To describe the whole section, the look read the section's text. Exodus 14:21–25 spans night into the morning watch, and the plans copied that span into single instants, so verses were drawn by night and by day. Telling the planner to name one time did not stop it. The other misses were one den seen from inside and from its rim. The code was removed, and [ADR 0005](0005-one-scene-description-unnamed-presence.md) still stands: a generated look is a suggestion that is never rendered.
- **Sheet slots go to the plan's main figures, and an empty slot passes on.** Sheet candidates rank in this order: characters the plan's primary subject names, then those its action names, then plan order. After the best character comes the best place, then the remaining characters, places and objects. A candidate without a current sheet no longer holds its slot. Before, the first character, the first place and the second character were the only candidates, so a group or place without a sheet could block a recurring character's. Replayed on the A/B's 36 plans, this changes one: John 21:9 now sends Jesus's sheet beside Peter's. Prompt version `2026-10-29-generic-v15` records the change. Assembly reads references in that order and stops once the three slots are full.
- **The reference cap stays at three.** Google documents the default model, Gemini 3.1 Flash Lite Image, as "not optimized for multiple reference inputs", with no character-reference support. It documents up to four character images for Gemini 3.1 Flash Image ([image generation guide](https://ai.google.dev/gemini-api/docs/image-generation), read 29 October 2026). Raising the cap would add inputs the default model is not built to use. A per-model cap is possible later if Nano Banana 2 becomes common.
- **Sheets stay Classical.** No measurement shows per-style sheets would help, and each style would multiply the sheet cost. In the A/B, all in Classical, every judged character pair with sheets agreed (7 of 7). The [baseline's](../../llm/releases/2026-10-29-consistency-baseline/README.md) drifts with sheets attached were in Watercolor, Icon and Fresco. The next launch matrix reports character agreement per style, which is the measurement this needs.
- **The sheet threshold stays at two sections; the reference run's order changes.** Counting verses would add about 300 subjects to the 775 the current rule names, mostly names that appear once in long list sections (Ezra's Levites, genealogies). The gap is elsewhere: production holds six sheets, for Moses, David, Peter and Jesus at three ages, which cover 12.8% of the cast's section appearances. Daniel has none, and his images disagreed in every A/B pair (0 of 4). `works:references` now makes style references first, then sheets in order of the sections that use them. Its dry run prints the cumulative cost, so a budgeted run covers the most-reused figures and places first.

## Sheet coverage by budget

The 775 sheet subjects, most-reused first, from the production reading pass (one attempt each at the $0.045 estimate; checker retries add more):

| Sheets | Share of section appearances | Estimate |
| --- | --- | --- |
| 25 | 42% | $1.13 |
| 50 | 53% | $2.25 |
| 100 | 65% | $4.50 |
| 200 | 78% | $9.00 |
| 775 | 100% | $34.88 |

The first are Jesus (adult), Jerusalem, Moses (elder), the twelve disciples, Paul, the Israelite people and David (youth).

## Consequences

- Making production's sheets is an owner decision: it writes to production storage and spends from the preparation allowance. The next step is `npm run works:references -- bible-web --dry-run`, then a run with `--budget` set to cover about the first 100.
- The ranked slots change which sheets reach the image model, so they ship through a launch matrix with the consistency gate, like any rendering change.
- The A/B spent $1.29 of the evaluation allowance, leaving $0.04. A shared place whose look reads only one verse is untested, and so are other styles. Each costs about $0.45 per arm and needs an allowance increase.
