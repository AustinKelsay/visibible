# Video generation

A video is a **moving picture** ([#478](https://github.com/AustinKelsay/visibible/issues/478)): it is made from one saved picture, which is its first frame, and belongs to that picture, sharing its art style. The reader still opens on the still picture. Play shows on the spread only when the picture on screen has its own finished video, and pressing it plays that video in the whole-picture view, starting from the picture ([Navigation](NAVIGATION.md)). Videos are made from the picture menu (below) with `minimax/hailuo-3-max`. Every saved result is public to readers who may see its style. Videos play muted initially, with standard player controls for sound, fullscreen, and seeking.

Videos made before #479 came from the verse text alone and have no source picture. Readers never see them (spread, Contents, picture menu); their rows and files stay untouched, and no migration is planned because the owner will reset pictures and videos.

## Flow and boundaries

1. The browser reads live price quotes from `GET /api/generate-video`. Supported choices are 5 or 10 seconds, 480p or 768p, and fixed 16:9. The catalog entry must list `first_frame` in `supported_frame_images`, or quotes fail closed.
2. `POST /api/generate-video` validates origin, CSRF, session/IP, request size, rate limits, and settings. The browser supplies the saved picture's id (`imageId`), a reference and translation, never authoritative verse text, a picture address, or a custom provider prompt. The picture is part of the request fingerprint.
3. A server-side passage lookup resolves the canonical reference and surrounding verses. Then `verseVideos.checkVideoSource` loads the picture and refuses it, before any price is quoted or credits held, unless it is a picture of that verse, in a style the session may see (owner-only styles for admins only), and 16:9 (`isVideoFrame` in `video-generation.ts`: its recorded aspect ratio, else its size within 2%). A refused picture answers 400 (`PICTURE_UNAVAILABLE`, which never says whether the picture exists, or `PICTURE_SHAPE`).
4. The image-to-video prompt (`buildVideoPrompt`) asks to animate this painting: keep its art style's rendering, palette and materials from the shared style description (`styles/*.json`), keep the same composition and subjects, restrained motion, no text, with the verse and its neighbours as context. It never uses live-action wording.
5. `verseVideos.enqueue` checks the picture again in the same transaction, atomically creates an idempotent intent with the source picture (`sourceImageId`) and its style (`sourceArtStyle`) copied from it, reserves credits (or audits admin use), and schedules work. A fingerprint prevents reuse of the request ID with changed intent. One job per session can be active across all verses.
6. Convex claims a lease before provider submission. The worker sends the picture's stable public address (`getPublicImageUrl`: `NOSTR_IMAGE_BASE_URL` or the Convex site URL plus `/image/<storageId>`, served by `convex/http.ts` without a session) as the first frame (`frame_images: [{ type: "image_url", image_url: { url }, frame_type: "first_frame" }]`). If the picture is gone by then, the job fails with `failureKind: source_missing` and its credits are returned, without calling the provider. After the provider ID is persisted, separate scheduled actions poll the provider and download the finished MP4 into Convex storage. Publishing and credit settlement occur in one mutation.
7. Public reads return only completed clips with a source picture, and only in styles the caller may see: `getPictureVideo({ imageId })` is a picture's newest finished video (index `by_source_status`), `getPicturesWithVideo({ imageIds })` which of the given pictures have one (one indexed read per picture, at most 200 pictures; the picture menu's thumbnail badges), `getHistory({ verseId })` a verse's finished videos with the picture each belongs to (at most 50; used by the video smoke script). Authenticated `getMyJobs` shows the current session's pending and failed jobs, with their source picture. Contents' `readChapterContents` marks a tile's `hasVideo` only when the tile's own picture has a finished video: one indexed read per tile, so its cost does not grow with the number of videos.

The browser stores only an unacknowledged request identity for safe retry. It clears that identity after a definite rejection, but keeps it when the server reports generation disabled (`code: "generation_disabled"`), since an earlier attempt may still have created a job; while generation is off the picture menu shows no video action at all, so the retry waits until generation is back. It does not own job execution, video history, or a provider credential.

## Making a video from the picture menu

[make-video.tsx](../../src/components/spread/make-video.tsx) is a row of the picture menu ([picture-menu.tsx](../../src/components/spread/picture-menu.tsx)), mounted with the menu after its first opening on a verse and kept while the reader stays, so a request carries on after the menu closes. It acts on the picture shown (a version chosen in the menu, else the newest).

- It reads the configuration (`GET /api/generate-video`) and shows nothing while generation is off. A pricing failure shows its message and "Reload video pricing".
- The row "Make this picture move…" is absent when the shown picture already has a finished video, when it is not 16:9, on prose works, and until the verse's videos are read. Pressing it (`aria-expanded`) opens an inline review, a group named "Make this picture move": the source thumbnail, "<Style> · 5 seconds · starts from this picture", the note "The video is added to the shared library: anyone reading John 1:5 in <Style> can watch it.", "Not now" (folds it away) and "Make the video · N credits". Video quotes authorise exactly the shown price, sent as `maxCredits`; an admin sees "Make the video" without a price; a balance below the quote turns the confirm into "Get credits · needs N credits", which opens the credits dialog. Choosing another version folds the review.
- It makes the old tab's default clip, 5 seconds at 768p (`MENU_VIDEO`), with no length or quality choice, from the shown picture's id.
- While the request is sent it shows "Starting your video…"; while a job of the shown picture is queued or running (the reader's `getMyJobs`, or the job the request just returned) it shows "Making this picture move…" and the picture menu's chip adds ", making a video" with a spinner. That comes from the server, so it survives a reload. A job of another picture holds the action back ("Your video of John 1:3 is still being made"), since one job per session can run.
- An unconfirmed request (kept in the browser per verse, with its picture) replaces the action with "Check the video request again", which resends the same request, never a second video.
- A job the reader watched fail on this verse shows its error above the action; older failures are not shown.
- When the job finishes, `getPictureVideo` returns it and Play appears on the picture; the thumbnail gains its play badge.

## Pricing and failure handling

Quotes use OpenRouter's resolution-specific duration SKUs and a 1.25 markup, converted to credits at $0.01 each. A missing or invalid live price disables new generation. The client sends the maximum credits it accepted; a higher quote requires an explicit new click after refreshing the price.

The job locks its quote. Actual provider usage determines settlement when available; otherwise the estimate is used. User charges are capped at the reserved credits. The job records any provider cost above the quote as absorbed cost. Existing daily spend accounting uses actual provider cost. Admin generations incur provider cost but do not charge a wallet.

A one-minute cron finds overdue jobs in bounded batches. A lease prevents overlapping workers from completing the same job twice. Poll/download failures back off up to two minutes, with bounded attempts and an overall 45-minute job deadline. The general stale-credit reconciler leaves active video holds to this lifecycle.

A worker that loses confirmation of a paid submission does **not** resubmit. It marks the job failed, refunds the user, and records `failureKind: ambiguous_submission`. An operator should check OpenRouter activity using the job's timestamp/model before arranging a manual retry. This deliberately favors avoiding duplicate spending over recovering an unknown provider ID.

If a worker crashes after uploading an MP4 but before finalizing the database mutation, an unreferenced storage object can remain. Published video objects are never deleted during a transport retry. Periodic orphan storage cleanup is a future operational improvement; it is not needed for job or billing correctness.

## Configuration and rollout

- Next.js: `ENABLE_VIDEO_GENERATION=true`, `OPENROUTER_API_KEY`, session secrets, `NEXT_PUBLIC_CONVEX_URL`, and `CONVEX_SERVER_SECRET`.
- Convex: `OPENROUTER_API_KEY` for scheduled provider work, plus the existing `CONVEX_SERVER_SECRET` and guest auth configuration.
- Deploy compatible schema/functions before the frontend: the spread (Play), Contents and the picture menu query the backend even with admission disabled. The #479 schema change is additive (two optional `videoJobs` fields and the `by_source_status` index). Verify the selected deployment and additive schema/index diff before any push or deployment.
- Vercel project settings may run `convex deploy` as part of the build. Inspect those settings before pushing a branch; a preview can update shared development, and merging the production branch can release both backend and frontend. Preserve newer backend changes from other work.
- Disabling `ENABLE_VIDEO_GENERATION` stops new API submissions. On Vercel, change the variable and redeploy compatible code for it to take effect. Already accepted jobs still finish and public videos remain viewable; keep the worker, recovery cron, and history queries deployed. A rollback to code without video does not preserve that behavior.
- Monitor failed jobs, `failureKind`, provider cost, storage usage, and absorbed overruns before broad rollout. Content redirects currently allow signed `storage.googleapis.com` URLs only; a provider CDN change fails closed and requires updating the adapter.

## Source entry points

- `src/lib/video-generation.ts`: shared model/settings/types, credit conversion, and `isVideoFrame` (the 16:9 rule).
- `src/lib/video-provider.ts`: catalog quotes, submit with the first frame, poll, bounded MP4 download.
- `src/lib/video-prompts.ts`: the image-to-video prompt in the picture's art style.
- `src/app/api/generate-video/route.ts`: admission, the picture check, and canonical passage authority.
- `convex/verseVideos.ts`: the picture check (`checkVideoSource`), durable state, per-picture reads, publication, and settlement.
- `convex/videoWorker.ts`: scheduled provider work in the Node runtime, with enough memory for bounded MP4 downloads. See [Convex action runtime limits](https://docs.convex.dev/functions/actions#limits).
- `src/components/spread/spread-picture.tsx` and `src/components/spread/play-mark.tsx`: Play for the shown picture and playback in the whole-picture view.
- `src/components/spread/make-video.tsx`: "Make this picture move…", its review, progress and recovery.
- `convex/verseImages.ts` `readChapterContents`: `hasVideo` per tile picture for Contents.
- `src/lib/use-video-generations.ts`: configuration and idempotent browser submission.

## Local verification

Use an isolated local Convex deployment and a Node version supported by Convex Node actions (22 or 24). Keep the local backend process running for scheduled work. A hosted worker continues independently of the development machine.

`scripts/video-smoke/run.mjs` is an optional **paid** HTTP smoke test. It requires an explicit local deployment and loopback backend, creates a funded test session, and refuses a quote above $0.40 for one 5-second 768p clip. It needs `VIDEO_SMOKE_IMAGE_ID`, a saved 16:9 picture of `VIDEO_SMOKE_REFERENCE` (default Psalms 23:2), and the provider must be able to fetch that picture's public address, so a loopback-only backend cannot complete it. Run the app on port 3000 first. It checks idempotent admission, credit settlement, public history, and byte-range playback. Reports and media are written under ignored `output/`; they are local evidence, not repository assets. Use the hosted app separately to verify browser playback and its deployment's CSP.

Automated tests cover provider responses, admission, client retries, durable jobs, settlement, and UI states. Before release, also verify desktop/mobile navigation, refresh and browser departure during work, public playback, and image/reader regressions. Hosted evidence should name the tested commit and frontend/backend pair and use a normal credited session so billing is exercised.
