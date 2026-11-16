# Capturing the reader

`npm run capture:reader` ([capture.mts](../../scripts/capture/capture.mts)) screenshots every reader state at desktop (1440×900) and phone (390×844, a touch screen at twice the density) size, from an app running on this machine. Its pictures are the ones interface pull requests attach and the set the owner approves at the reader's cutover ([#434](https://github.com/AustinKelsay/visibible/issues/434)). It is not part of the test suite: `npm test` never runs it.

## What it expects

- **The app, running locally** with `next dev` (production's content security policy blocks a loopback Convex address) and `OPENROUTER_API_KEY` empty, on a **local Convex backend**: `NEXT_PUBLIC_CONVEX_URL` must be a `127.0.0.1` or `localhost` address. The page may not reach a hosted deployment, so against one it shows no pictures and no verse marks.
- **Seeded pictures.** The states assume John 1:1–5, 9 and 14 painted in Classical and the rest of John 1 unpainted. On other data the pictures still come out, showing whatever that data holds.
- **A video of John 1:5** for `play-mark` and `video-playing`: a finished row in `videoJobs` with a stored MP4 on the local backend. Making one would need a paid provider, and no public function uploads one, so seed it by hand on your own local backend (for instance a small public sample clip stored by a throwaway internal action you push only there and delete after). Without it those two states fail at their first step. `contents` shows the play mark on that verse's tile too.
- **A browser that plays H.264** for `video-playing`: the open-source Chromium build cannot decode MP4 video and shows a blank player, so point `CAPTURE_BROWSER` at Chrome or Chrome for Testing.
- **Chrome or Chromium on the machine.** It uses `CAPTURE_BROWSER` (a path to the browser's executable) when set, else Google Chrome or Chromium in `/Applications` or `~/Applications` (macOS) or `/usr/bin` and `/snap/bin` (Linux), else the newest Chromium a Playwright install has already downloaded (`~/Library/Caches/ms-playwright`, `~/.cache/ms-playwright`) ([findBrowser](../../scripts/capture/plan.ts)). It never downloads a browser. Its only dependency, `playwright-core`, is development-only, pinned exactly, has no install script and downloads nothing.

## Running it

```bash
npm run capture:reader -- --base http://localhost:3000
npm run capture:reader -- --base http://localhost:3101 --only reading,marks --sizes phone --out output/captures/436
```

- `--base`: the app's origin. Default `CAPTURE_BASE_URL`, else `http://localhost:3000`. Only `localhost`, `127.0.0.1` and `[::1]` are accepted.
- `--out`: default `output/captures`, which git ignores. Pictures are `<state>-desktop.png` and `<state>-phone.png`, overwritten on each run.
- `--only`: comma-separated state names. `--sizes`: `desktop`, `phone` or both.
- A state that fails writes `<state>-<size>-ERROR.png`, the run goes on to the next, and the command exits 1. A step that finds nothing fails the state, and so does a picture still loading 15 seconds after a page or step.
- One run creates one guest session and reuses it for every picture, because `/api/session` allows ten new sessions a minute.
- The run takes about 5 seconds a picture. Open the pictures and look at them: a state that loaded is not necessarily a state that looks right.

## It cannot spend

- It refuses a base address that is not on this machine, so it cannot open the live site.
- Before opening a browser it asks the app's `/api/chat-models`, and refuses an app that reports an OpenRouter key.
- In the browser it refuses every request and WebSocket that leaves this machine, and every post to `/api/chat`, `/api/generate-image`, `/api/generate-video` and `/api/invoice` on any local address, so no click can paint, ask or buy ([allowsRequest](../../scripts/capture/plan.ts)). Quotes stay allowed: quoting is free. Each refused request is printed. A state that needs an answer, a painting or an invoice must stub the response; it never unblocks the route.

## Adding a state

Each state is one entry in [states.ts](../../scripts/capture/states.ts): a name for its pictures (lowercase words joined by `-`), the address, and the steps that reach it. A ticket that adds a reader state adds its entry in the same pull request.

```ts
{ name: "contents", path: "/john/1/5", steps: ["click:button:John 1:5, Contents", "wait:1200"], sizes: ["desktop"] },
```

Steps run in order after the page and its pictures load ([parseStep](../../scripts/capture/plan.ts)):

- `click:<role>:<name>`, `hover:<role>:<name>` and `waitfor:<role>:<name>` find an element by accessible name, exactly first, then as a case-insensitive part of the name. `css:<selector>` and `text:<visible text>` work in place of a role.
- `wait:<ms>`, `scroll:<pixels>` (the mouse wheel where the pointer is), `press:<key>` and `goto:<path>`.
- `sizes` limits a state to `desktop` or `phone`. A state whose steps differ by size is two entries.
- `stubs` answers responses a local app without an OpenRouter key cannot give ([CAPTURE_STUBS](../../scripts/capture/plan.ts)). `priced` makes the image catalog report every model available at about 6 credits a picture and every public style open, so prices show (`pricedCatalog`). Nothing can be painted with it: the spending routes stay refused. `video-priced` makes `GET /api/generate-video` answer as an app with video generation on (`VIDEO_PRICING`: a 5-second 768p clip at 50 credits among others), so the picture menu offers Make a video; making one stays refused. A stubbed state's pictures carry a yellow corner label naming what was faked (`stubLabel`), so nobody mistakes them for the real service.
- A state that shows a picture starts by waiting for it by name (`waitfor:img:Picture of John 1:5`), so a slow read fails the state rather than shooting a blank.
- On a computer the dock and verse marks fade after 3 seconds without activity, so a state that shows them ends by hovering the words page (`hover:css:article p:nth-of-type(2)`); `wait:4200` shoots them faded.
- `plan.test.ts` checks that every entry's name is unique and its steps parse.

States so far: `reading`, `marks` (a chapter with painted and unpainted verses), `idle-faded`, `long-verse` (scrolled inside the words page), `unpainted` (as a local app without an OpenRouter key shows it), `whole-picture`, `ask` (phone: the turned-over words page), `contents`, `paint-chapter` (Contents offering to paint the chapter's unpainted verses, priced by the `priced` stub; the run's guest has no credits, so the balance note shows), `corner-menu`, `feedback`, `advanced` (Advanced opened at the foot of the corner menu, priced so the model is named), `welcome` (the welcome, opened from Advanced), `picture-menu` (the menu on a verse with one picture), `picture-details`, `report-picture`, `look` (Look open over the dock, a sheet on a phone), `play-mark`, `video-playing`, `make-video` (video pricing stubbed by `video-priced`; with no credits it reads "Get credits to make a video") and `other-style` (John 4:7, painted only in Watercolor, with the picture rule's note and its offer; priced by the `priced` stub, so with no credits it reads "Get credits to paint"). States that need credits, an answer or a painting in progress (such as a running chapter job) are not listed: the run's one guest has no credits, and those states need stubs this command does not have yet.
