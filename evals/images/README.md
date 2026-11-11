# Image evaluation fixtures

The regression suite ([ADR 0011](../../docs/adr/0011-frozen-multi-work-regression-suite.md), run with `npm run evals:lean` since [ADR 0012](../../docs/adr/0012-one-image-call-from-the-text.md)) reads four things here:

- `suite.json`: the suite's version, seed, holdout share, works (where each analysis comes from, its image styles and consistency groups), random draws and gate.
- `cases.json`: every case. `tuned` marks a case that shaped the engine before the suite (always dev), `drawn` one picked by a seeded draw, and `tiers` a case that takes part in only one tier.
- `faults.json`: the questions scorers answer for plans and for images.
- `analyses/alice-in-wonderland-v3.json`: Alice's current analysis revision, prepared locally for evaluation only. The Bible's and Holmes's come from production, read-only, into each run's snapshot.

Add cases rather than replacing them, and bump the suite version when they change. A random case comes from a draw in `suite.json`, never by hand; the tests replay every draw.

Revision 2 removes the Queen of Hearts' frown from her stage text, since the source gives her both a smile and a frown in different moments ([canon review](../../llm/releases/2026-10-31-canon-review-boundary/REVIEW.md)). Revision 3 replaces Alice's film-costume outfit with the coloured 1890 Nursery edition's ([suite baseline](../../llm/releases/2026-10-30-suite-baseline-image/README.md)); both corrections are listed under `preparation.corrections` with their parent hashes.

The [original](analyses/alice-in-wonderland.json) and [v2](analyses/alice-in-wonderland-v2.json) fixtures stay for the frozen runs that name them; suite `2026-11-01-suite-v3` selects the [corrected fixture](analyses/alice-in-wonderland-v3.json) with v1's seed, cases and holdout split, and rejects v1 and v2 `--from` runs. The v3 baselines are [2026-11-07-suite-v3-text](../../llm/releases/2026-11-07-suite-v3-text/README.md) and [2026-11-07-suite-v3-image](../../llm/releases/2026-11-07-suite-v3-image/README.md).

Each case in `cases.json` fixes a reference, genre, settings and the visual behaviour a reviewer expects; `work`, `unitId` and `styles` place it in the suite. Runs write their images to `runs/<name>/` (ignored by git).

Keep the Peter, Red Sea, Genesis and Holmes continuity cases; add cases rather than replacing them so baseline and candidate runs stay comparable.

`consistency.json` names the Bible's fixed groups for `npm run evals:consistency`, and `consistency.holmes-adventures.json` and `consistency.alice-in-wonderland.json` the other works' (pass one with `--groups`) ([ADR 0008](../../docs/adr/0008-consistency-in-the-launch-bar.md)). Character groups cover one canon entry across stories; setting groups cover neighbouring verses of one section. Scorers follow `consistency-scoring.md`. Add groups and verses rather than replacing them, and render every named verse in each launch matrix.

`style-trials/watercolor-full-frame.json` is an unapproved Watercolor rendering trial, separate from the shared library; it was [rejected](../../llm/releases/2026-10-20-engine-funded-evaluation/README.md#watercolor-correction-rejected).
