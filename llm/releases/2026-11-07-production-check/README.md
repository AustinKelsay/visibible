# Production check, 7 November 2026

The first-24-hour watches for the 28 October launches and the 1 November Storybook launch are closed. Production is healthy, and readers have made no image requests since 28 October, so the watches found nothing to act on. With the owner's approval, one owner render then took Storybook through the whole image path in production for the first time, for $0.0433. Three production writes closed stale or accepted attention items.

## What was read (16:40–17:10 UTC)

- **Site:** `/api/health` ok, `/api/readiness` ready, and `/api/image-models` serves Classical, Watercolor, Fresco and Storybook to readers, with Icon owner-only.
- **Convex logs:** no errors in the recent history; the Nostr scheduler skips each window because there is no new image.
- **Reader activity since the Storybook launch:** sessions are created every few minutes, but there are no image requests, saved images, credit purchases, invoices, refunds or reader reports. The newest saved image is from 28 October, 20:46 UTC. The only ledger rows after the launch are the launch smoke's own look and plan (1 November, 20:58 UTC).
- **OpenRouter:** the production key (ending `aac`) has used $0.0126 of its $50 limit, with nothing used this week. The account balance is **$5.25**, just above the $5 reader reserve. That leaves about $0.25 for evaluation before the reserve; the render below spent $0.04 of it.

## One owner render

Storybook's launch smoke stopped at the 402 credit check, so no Storybook image had been made in production. The owner approved one render ("Yes, one render"), knowing the Nostr scheduler would post it as the window's only new image.

- **Request:** owner session, `POST /api/generate-image` for Psalm 23:2 (WEB) in Storybook, 16:9 at 1K, request `owner-smoke-storybook-1794070688`, at 16:58:08 UTC.
- **Result:** HTTP 200 after 11.3 s on the generic engine (`2026-10-29-generic-v15`, Nano Banana 2 Lite). The request row reads `succeeded` in 8.8 s. The image was saved as `psalms-23-2` (1376×768) under brief `b00a7b21…`, with David's `david_king` sheet.
- **Check:** the scene check (`2026-10-28-scene-check-v4`) answered clean on the first image, with no retry. The look and plan were reused from the launch smoke.
- **Cost:** $0.04276156 for the image and $0.0005707 for the check, $0.04333226 in all. The account balance moved from $5.252 to $5.213.
- **Image:** [psalm-23-2-storybook.jpg](psalm-23-2-storybook.jpg). It shows a shepherd kneeling among sheep lying in a green meadow beside a slow river, with no lettering, frame or figure faults.
- **Owner tool links:** `works:correct` prints sheet and image links on `https://api.visibible.com/image/…`, which answer 404 because that domain serves the Convex API, not HTTP actions. The same files load from `https://unique-impala-244.convex.site/image/…`. Readers are unaffected: Convex builds their links from its own site URL.

## Attention list

Closed, with the reason stored on each item:

| Item | Disposition | Why |
| --- | --- | --- |
| Bible Classical style reference, 26 Oct 18:03 | dismissed | The failure was an OpenRouter 401 from a dead key. A Classical reference was made at 18:07 the same day and is current. |
| Bible Watercolor style reference (3 attempts, 20–26 Oct) | accepted limitation | Soft unpainted Watercolor edges were accepted by the owner (ADR 0006 amendment 2). The 20 October reference stays current. |
| Holmes Watercolor style reference | accepted limitation | Same reason. |

Still open, for the owner:

- **109 Bible sheet canon notes and 3 Holmes ones.** These are informational: a checker passed the sheet and noted a small difference from the canon text, such as age or complexion. None blocks an image.
- **52 Bible quote-check failures** from the 20 October analysis. Each says a stage's supporting quote was not found in, or cited no, unit. They do not stop preparation.
- **One Holmes sheet failure:** Holmes's rooms at Baker Street have no sheet, because the views showed different subjects. Holmes is not served to readers.

## Shared dev Convex

The Storybook launch left a follow-up to run the brief amendment on the shared dev deployment (`coordinated-shepherd-515`). A dry run shows that `bible-web` is not registered there at all, so there is no old brief to move. Dev previews answer generic requests as "preparing" until the work is imported on dev. Importing means a paid analysis, and it does not affect production, so it was not done.

## Record kept from `dev`

Release #345's [deployment record](../2026-10-30-suite-baseline-image/deployment.json) was committed only to `dev` (#346). It is now on `main` unchanged. `origin/dev` holds no other commit that `main` lacks; releases now merge into `main` directly.
