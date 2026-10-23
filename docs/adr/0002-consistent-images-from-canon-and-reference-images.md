---
status: accepted
date: 2026-10-17
updated: 2026-10-23
---

# A generic image engine uses shared canon and optional reference images

Visibible needs consistent characters, locations and story sections across three art styles. [Map: An image engine for any work, with the Bible as its first](https://github.com/AustinKelsay/visibible/issues/152) extends the original Bible-only design to any work, with the Bible as data and Sherlock Holmes as the second-work proof. We keep independent image generation on the existing OpenRouter request path and derive consistency from shared, versioned inputs.

[A generic image engine with shared canon and art styles](https://github.com/AustinKelsay/visibible/issues/165) is the implementation contract; this record explains the architectural tradeoffs. Accepted design does not mean these changes are already shipped.

- **Work boundary:** import a work's reference text once. An automatic reading pass derives its story sections, moments, cast and canon. The owner approves one work brief containing tone, depiction rules, eras and the style set. The Bible reader, translations, URLs, chat and Nostr remain Bible-shaped.
- **Consistency:** canon text fixes identity; section looks describe episode-specific conditions; one style-neutral scene plan describes each moment. Those inputs are shared across art styles and reader translations. Every image can be generated independently and in any order, without using a previous moment image as input.
- **Rendering:** work-neutral art styles are repo data. The prompt carries the brief, canon and plan plus up to three optional references: sheets for selected canon entries and a style reference for a non-Classical style. The work brief owns content and depiction; the art style owns rendering. Entries forbidden a form retain their text constraints but get no sheet.
- **Ownership:** imported text, approved briefs and style files live in the repo. Generated analysis and reference blobs live in each deployment's Convex storage. Generated records have content versions; owner corrections survive rereads. Saved images retain their original provenance and are never regenerated automatically.
- **Preparation:** recurring entries get Lite reference sheets in the background, checked for hard faults. Missing sheets do not delay images. Required section looks and scene plans are prepared on demand and cached. Canon and individual sheets need no human approval; system changes still receive release review.
- **Models and cost:** the accepted defaults are Claude Haiku 5.5 for text preparation and Nano Banana 2 Lite for moment images and sheets. Visibible pays for shared preparation, including looks and plans; the image's Lite target remains five credits. Quotes and fallback settlement account for prompt length and supplied reference images.

## Why this shape

The [recorded engine research](https://github.com/AustinKelsay/visibible/issues/136) found cost, latency and licensing tradeoffs in ComfyUI/self-hosted workflows and alternatives. The prototypes established useful consistency without adding GPU operations or chaining generated images. A generic work model removes the Bible-specific prompting while keeping the app's existing generation and billing boundary.

Automatic analysis replaces the earlier proposal to approve every canon entry and sheet. [Can reference sheets be made and checked without the owner?](https://github.com/AustinKelsay/visibible/issues/159) showed that a vision checker was useful for text, borders and malformed view sets but over-rejected subjective likeness differences. Hard faults can trigger bounded retries; canon concerns belong in the owner's attention list. This preserves automatic preparation while retaining targeted correction.

[Does the whole engine hold up on Sherlock Holmes and the Bible?](https://github.com/AustinKelsay/visibible/issues/161#issuecomment-6271908477) produced 62 moment images across the Bible and Holmes. Image calls averaged 5.51 seconds, with p90 7.5 seconds. Plans and looks were precomputed; the run did not measure cold end-to-end latency or exercise production credit charges. [How does the Bible move onto the generic image engine?](https://github.com/AustinKelsay/visibible/issues/164#issuecomment-6275356863) therefore sets release targets of p90 at most 10 seconds with preparation cached and 20 seconds when a look and plan are needed, subject to actual measurement.

## Consequences

- This narrows the continuity-engine exclusion in [S07](https://github.com/AustinKelsay/visibible/issues/51). Consistency spans all on-stage canon entries, including minor figures, while images remain independent. The app is not being turned into a multiwork host.
- One reference text simplifies planning and cache identity. New Bible-engine images record WEB as their source; the selected reader translation is separate request context, and Nostr quotes the saved WEB text.
- Owner-funded shared preparation avoids a surcharge for the first reader. It introduces operating spend and preparation latency that must be measured separately from image generation.
- Full rereads become active only when structurally complete and compatible. Content versions drive targeted invalidation; saved images and owner corrections remain stable.
- The engine transition preserves accepted generations and bulk jobs through explicit engine binding, rollback and retirement. It does not require the separate durable-executor migration.
- Quality remains evidence-driven: the selected proof was accepted, but it was not exhaustive. Icon borders remain a known limitation. Automatic no-form exclusion, actor/public-figure likeness restrictions and coarser retry after empty reading results are approved follow-ups, not demonstrated fixes in that run. Use [How are quality problems noticed and corrected after launch?](https://github.com/AustinKelsay/visibible/issues/163#issuecomment-6275088126) for release evaluation and reader-report handling.

This amendment replaces the earlier manual-approval, repo-sheet and free-planner assumptions in this unmerged ADR. The [archived experiment](https://github.com/AustinKelsay/visibible/blob/82591cf926e2872d789a85f7fbf86e050529e55b/src/lib/engine.prototype/README.md) remains evidence, never production code to merge wholesale.

## Amendment: plan review before storage (23 October 2026)

Single-reply prompt contracts did not make scene plans reliable. [Blind-scored repeated samples](../../llm/releases/2026-10-23-grounding-rate-check/README.md) found 10/20 and 8/20 acceptable plans across two contract versions on the retained Luke and Daniel moments. The owner therefore approved a semantic plan check, replacing the earlier "no semantic validator or retry" rule for plans:

- **Check:** each new plan is reviewed against its moment by a second Claude Haiku 5.5 call with low reasoning. The review sees only rendering-bound plan text, moment context, the cast and depiction rules. Code accepts its report only when each problem quotes the plan and names a fitting cast ID.
- **Re-plan:** a plan rejected by the evidence checks or the review gets exactly one re-plan with the problems as feedback. A second rejection stops preparation as a retryable error before any image cost. Source gaps (`missingCast`) are never re-planned.
- **Evidence list:** the planner may document excluded cast; order is free. An unselected entry claimed `in_scene` is still refused.
- **Cost and latency:** about $0.0005 and 4.7 s median per review call; a plan and its review took 8.3 s median in the held-out run. Cold preparation gains one call, two after a re-plan. This likely exceeds the 20 s cold full-request target, which needs re-measurement and an owner decision at release.

The checker configuration was selected on a [pre-declared benchmark](../../llm/releases/2026-10-23-plan-review-check/README.md) (13/15 defective plans caught, 3/25 false alarms after two rejected arms). The [held-out run](../../llm/releases/2026-10-23-reviewed-plan-check/README.md) of the full pipeline stored 1 flawed plan in 20 and refused no clean plan, but produced 10 acceptable stored plans (Daniel 7:9 refused 5/5): safer, not yet more available, with a pre-declared "not converging" verdict. The review is a model judgment, not a guarantee; visual evaluation and human acceptance remain release gates.
