# Video generation

A verse with a finished video shows a play mark on its picture on the spread (on the unpainted picture area when the verse has a video but no saved picture, which text-to-video makes possible) and on its Contents tile, and pressing it plays the video in the whole-picture view ([Navigation](NAVIGATION.md)). Videos are made from the picture menu (below). It uses `minimax/hailuo-3-max` directly from canonical Scripture; it does not require or animate a selected image. Every saved result is public. Videos play muted initially, with standard player controls for sound, fullscreen, and seeking.

## Flow and boundaries

1. The browser reads live price quotes from `GET /api/generate-video`. Supported choices are 5 or 10 seconds, 480p or 768p, and fixed 16:9.
2. `POST /api/generate-video` validates origin, CSRF, session/IP, request size, rate limits, and settings. The browser supplies a reference and translation, never authoritative verse text or a custom provider prompt.
3. A server-side passage lookup resolves the canonical reference and surrounding verses. A fixed prompt describes one coherent, historically grounded scene.
4. `verseVideos.enqueue` atomically creates an idempotent intent, reserves credits (or audits admin use), and schedules work. A fingerprint prevents reuse of the request ID with changed intent. One job per session can be active across all verses.
5. Convex claims a lease before provider submission. After the provider ID is persisted, separate scheduled actions poll the provider and download the finished MP4 into Convex storage. Publishing and credit settlement occur in one mutation.
6. Public queries return only completed clips. Authenticated queries show the current session's pending and failed jobs. The interface loads the latest 50 public clips; older records remain stored.

The browser stores only an unacknowledged request identity for safe retry. It clears that identity after a definite rejection, but keeps it when the server reports generation disabled (`code: "generation_disabled"`), since an earlier attempt may still have created a job; while generation is off the picture menu shows no video action at all, so the retry waits until generation is back. It does not own job execution, video history, or a provider credential.

## Making a video from the picture menu

[make-video.tsx](../../src/components/spread/make-video.tsx) is a row of the picture menu ([picture-menu.tsx](../../src/components/spread/picture-menu.tsx)), mounted with the menu after its first opening on a verse and kept while the reader stays, so a request carries on after the menu closes.

- It reads the configuration (`GET /api/generate-video`) and shows nothing while generation is off. A pricing failure shows its message and "Reload video pricing".
- It makes the old tab's default clip, 5 seconds at 768p (`MENU_VIDEO`), with no length or quality choice. The row reads "Make a video · about N credits" with that quote's credits, sent as `maxCredits`; an admin sees "Make a video" without a price; a balance below the quote reads "Get credits to make a video" and opens the credits dialog.
- While the request is sent it shows "Starting your video…"; while a job of this verse is queued or running (the reader's `getMyJobs`, or the job the request just returned) it shows "Making a video…" and the picture menu's chip adds ", making a video" with a spinner. That comes from the server, so it survives a reload. A job of another verse holds the action back ("Your video of John 1:3 is still being made"), since one job per session can run.
- An unconfirmed request (kept in the browser as before) replaces the action with "Check the video request again", which resends the same request, never a second video.
- A job the reader watched fail on this verse shows its error above the action; older failures are not shown.
- When the job finishes, `getHistory` returns it and the play mark appears on the picture.

## Pricing and failure handling

Quotes use OpenRouter's resolution-specific duration SKUs and a 1.25 markup, converted to credits at $0.01 each. A missing or invalid live price disables new generation. The client sends the maximum credits it accepted; a higher quote requires an explicit new click after refreshing the price.

The job locks its quote. Actual provider usage determines settlement when available; otherwise the estimate is used. User charges are capped at the reserved credits. The job records any provider cost above the quote as absorbed cost. Existing daily spend accounting uses actual provider cost. Admin generations incur provider cost but do not charge a wallet.

A one-minute cron finds overdue jobs in bounded batches. A lease prevents overlapping workers from completing the same job twice. Poll/download failures back off up to two minutes, with bounded attempts and an overall 45-minute job deadline. The general stale-credit reconciler leaves active video holds to this lifecycle.

A worker that loses confirmation of a paid submission does **not** resubmit. It marks the job failed, refunds the user, and records `failureKind: ambiguous_submission`. An operator should check OpenRouter activity using the job's timestamp/model before arranging a manual retry. This deliberately favors avoiding duplicate spending over recovering an unknown provider ID.

If a worker crashes after uploading an MP4 but before finalizing the database mutation, an unreferenced storage object can remain. Published video objects are never deleted during a transport retry. Periodic orphan storage cleanup is a future operational improvement; it is not needed for job or billing correctness.

## Configuration and rollout

- Next.js: `ENABLE_VIDEO_GENERATION=true`, `OPENROUTER_API_KEY`, session secrets, `NEXT_PUBLIC_CONVEX_URL`, and `CONVEX_SERVER_SECRET`.
- Convex: `OPENROUTER_API_KEY` for scheduled provider work, plus the existing `CONVEX_SERVER_SECRET` and guest auth configuration.
- Deploy compatible schema/functions before the frontend: the spread (play mark), Contents and the picture menu query the backend even with admission disabled. Verify the selected deployment and additive schema/index diff before any push or deployment.
- Vercel project settings may run `convex deploy` as part of the build. Inspect those settings before pushing a branch; a preview can update shared development, and merging the production branch can release both backend and frontend. Preserve newer backend changes from other work.
- Disabling `ENABLE_VIDEO_GENERATION` stops new API submissions. On Vercel, change the variable and redeploy compatible code for it to take effect. Already accepted jobs still finish and public videos remain viewable; keep the worker, recovery cron, and history queries deployed. A rollback to code without video does not preserve that behavior.
- Monitor failed jobs, `failureKind`, provider cost, storage usage, and absorbed overruns before broad rollout. Content redirects currently allow signed `storage.googleapis.com` URLs only; a provider CDN change fails closed and requires updating the adapter.

## Source entry points

- `src/lib/video-generation.ts`: shared model/settings/types and credit conversion.
- `src/lib/video-provider.ts`: catalog quotes, submit/poll, bounded MP4 download.
- `src/lib/video-prompts.ts`: verse/context prompt.
- `src/app/api/generate-video/route.ts`: admission and canonical passage authority.
- `convex/verseVideos.ts`: durable state, publication, and settlement.
- `convex/videoWorker.ts`: scheduled provider work in the Node runtime, with enough memory for bounded MP4 downloads. See [Convex action runtime limits](https://docs.convex.dev/functions/actions#limits).
- `src/components/spread/spread-picture.tsx` and `src/components/spread/play-mark.tsx`: the play mark and playback in the whole-picture view.
- `src/components/spread/make-video.tsx`: "Make a video" in the picture menu, its progress and recovery.
- `convex/verseImages.ts` `readChapterContents`: `hasVideo` per verse for Contents.
- `src/lib/use-video-generations.ts`: configuration and idempotent browser submission.

## Local verification

Use an isolated local Convex deployment and a Node version supported by Convex Node actions (22 or 24). Keep the local backend process running for scheduled work. A hosted worker continues independently of the development machine.

`scripts/video-smoke/run.mjs` is an optional **paid** HTTP smoke test. It requires an explicit local deployment and loopback backend, creates a funded test session, and refuses a quote above $0.40 for one 5-second 768p clip. Run the app on port 3000 first. It checks idempotent admission, credit settlement, public history, and byte-range playback. Reports and media are written under ignored `output/`; they are local evidence, not repository assets. Use the hosted app separately to verify browser playback and its deployment's CSP.

Automated tests cover provider responses, admission, client retries, durable jobs, settlement, and UI states. Before release, also verify desktop/mobile navigation, refresh and browser departure during work, public playback, and image/reader regressions. Hosted evidence should name the tested commit and frontend/backend pair and use a normal credited session so billing is exercised.
