# Consistency joins the launch bar

On 29 October 2026 the owner asked for consistency to become a release gate ("Let's start on #1 full send"). The decisions below are the operator's under that delegation.

The engine exists to keep a work's images consistent ([ADR 0002](0002-consistent-images-from-canon-and-reference-images.md)), yet the [launch bar](0006-unseen-presence-speakers-and-launch-bar.md) judges each image alone. Nothing measured whether a character looks the same across stories or whether neighbouring verses show the same place. A prompt change could therefore trade consistency away unseen. The section look stopped reaching the image ([ADR 0005](0005-one-scene-description-unnamed-presence.md)) without any measure of that effect.

## The measure

- **Fixed groups.** [evals/images/consistency.json](../../evals/images/consistency.json) names the groups. Each character group is one canon entry across verses in different stories: Jesus, Moses, Simon Peter, David and Daniel. Each setting group is two or three neighbouring verses in one story section: the Red Sea crossing, the storm on the lake, breakfast on the shore, the prodigal's return and the lions' den. The launch matrix must render every verse the groups name. Add groups and verses rather than replacing them, so measurements stay comparable.
- **Pairs.** `npm run evals:consistency` pairs the shown images within each group, always within one art style, since a reader compares images in the style they chose. A character pair counts only when both plans selected the entry and its sections assign the same canon stage. A youth and a king are meant to look different.
- **Scoring.** Each pair is one side-by-side picture with one question: is this the same person, or the same place? It shows each side's scene description but not the style, verse or group. Two independent scorers judge every pair as `same`, `different` or `unclear`, following [the instructions](../../evals/images/consistency-scoring.md). Scorers may be people or model scorers. The operator settles disagreements by viewing the pair. The rate is the share judged the same among pairs judged same or different.

## The bar

`CONSISTENCY_BAR` in [consistency.ts](../../src/lib/image-evals/consistency.ts) holds these values, versioned `2026-10-29-consistency-v1`. The released styles are pooled, because one style's sample is too small to gate on; per-style rates are reported beside the pooled rate.

- At least 75% of judged character pairs show the same person, from at least 30 judged pairs.
- At least 50% of judged setting pairs show the same place, from at least 20 judged pairs. This floor is provisional until a run measures enough neighbouring verses.
- Every group verse attempted by the run. A refusal or an unselected subject is reported but does not fail the gate, while a verse with no result fails it.
- At most a third of either measure's pairs unclear, and no unsettled disagreement.
- Neither rate falls more than 10 points below the previous release's measurement.

These join ADR 0006's per-image bar and owner sign-off; they do not replace them. A failure here blocks a launch the same way.

## Baseline

The [baseline](../../llm/releases/2026-10-29-consistency-baseline/README.md) paired images the launch matrices had already made, at no provider cost. In the released styles, 21 of 25 character pairs showed the same person (84%) and 1 of 3 neighbouring-verse pairs showed the same place. Both measures fail on too few pairs, so the next launch matrix must add the groups' 14 new verses. The [first full measurement](../../llm/releases/2026-10-29-consistency-verses/README.md) rendered them the same day, and the gate passed: 83% of character pairs and 70% of place pairs in the released styles. Moses changed hairstyle even with his sheet attached. Daniel, who has no sheet in production, became two different men. Consecutive Red Sea verses were drawn as different places.

The 75% character floor sits about ten points below the baseline, roughly the noise in a sample of 100 or so pairs. No setting baseline exists yet, so its floor only demands better than an even chance.

## Alternatives considered

- **An automatic vision-model judge on every run.** This is deferred. It would spend from the OpenRouter account that production shares, and it needs calibrating against adjudicated pairs like the baseline's first. The scored pairs here are that calibration set.
- **Scoring identity and continuity per image.** The existing image eval asks for `identity` and `continuity` on each case, but a single image cannot show agreement. Those scores never reached a release record.
- **Comparing across styles.** Rejected, because a Classical and a Watercolor Moses are not meant to match in rendering, and readers stay in one style.

## Consequences

- The next launch matrix renders 14 more verses in each public style. At the current $0.034 per shown image, three styles add about $1.45, plus owner-funded preparation for any verse without a cached plan.
- Each launch needs pair scoring as well as image scoring. The baseline's 45 pairs took six model scorers a few minutes each.
- The gate measures agreement, not quality: a consistently wrong face passes. The per-image bar still covers quality.
