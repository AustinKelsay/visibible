# One scene description, and an unnamed presence

On 27 October 2026 the owner approved three general fixes after the [forgiving re-measurement](../../llm/releases/2026-10-27-forgiving-fresh-check/RESULTS.md) and [image re-check](../../llm/releases/2026-10-27-forgiving-image-check/RESULTS.md).

**One scene description.** The planner no longer returns a separate set of moment conditions (place, time, weather, light, clothing) beside its scene fields. That second description was the largest source of flawed plans: its clothing and time values added soldiers, attendants or another moment's time that the scene itself did not have. The scene fields now carry this moment's place, time, light and situational clothing. A generated section look stays a suggestion to the planner and is never rendered. Owner look constraints are still rendered verbatim, and still bind; they are read from the look record rather than restated by the planner. The plan review sees owner constraints only when they are rendered. This supersedes the moment-conditions part of [ADR 0003](0003-resolve-conditions-with-each-moment.md).

**An unnamed presence.** Image models drew God as a figure in 8 of 35 God-scene images, with or without a style reference. Their prompts named the subject and quoted bodily metaphors such as "His clothing was white as snow". When a scene includes a subject without form:

- The image prompt omits the verse text, its reference and the neighbouring verses.
- The subject's name is replaced by "the presence" in the plan, the canon text and the brief's rules.
- The subject is described only in a "presence shown only as effects" block.
- The planner is told never to name it or call it seated or standing.

Scenes with only formed cast keep the verse and neighbours.

**Watercolor edges.** Regenerating the Watercolor style reference failed the stricter edge check six times, under both the old wording and revised wording ("a finished watercolor painting… out to every edge"). The revised wording stays, because it removes "field study" and "softer surroundings", which invited vignettes. The old reference is now stale against the revised style, so Watercolor renders without a style reference until one passes.

The rejected alternative was more specific negative wording ("no head, face, torso…"), which names the very features to avoid. These changes are offline until re-measured; deployment and activation remain owner decisions.
