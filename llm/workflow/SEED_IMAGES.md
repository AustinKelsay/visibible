# Seeding images for the most-read chapters

`npm run seed:images` ([scripts/seed/images.mts](../../scripts/seed/images.mts) over [images.ts](../../src/lib/seed/images.ts)) gives the verses of the most-read chapters a saved image, so a first-time reader does not land on an empty stage. It makes each image through the site's own request path as the owner: a guest session, the admin login, then one `POST /api/generate-image` per verse ([image generation](../context/IMAGE-GENERATION.md)). Saved images are shared, so every reader sees them.

The chapters are in [chapters.ts](../../src/lib/seed/chapters.ts), highest priority first: 53 chapters, 1,410 verses. A run walks them in that order; the budget decides where it stops. Only the Bible is ever targeted: every request names `bible-web`, and `--work` accepts nothing else.

Nothing here authorizes spend. A paid run is the owner's decision, under the budget it names.

## Before a paid run

- The owner's approval as a dollar figure, and the production admin password.
- Provider balance for that figure, and a limit on the key. The images are paid from the site's OpenRouter key, whose balance and limit the tool cannot see; a key that runs dry shows up as five failures in a row. **The key's own spending limit at OpenRouter is the only hard cap.** The tool's budget is its own accounting: it counts each request at a ceiling that is above every measured image, but the provider call has no cost cap of its own. Set the key's limit to no more than you are willing to lose before a paid run.
- Production admitting images: `ENABLE_IMAGE_GENERATION=true` and `GENERIC_ENGINE_MODE` not `disabled` ([release runbook](ENGINE_RELEASE.md#engine-modes)).
- Time. The site admits five image requests a minute for one session ([rateLimit.ts](../../convex/rateLimit.ts)), admin included, and the run paces itself to that: about 300 images an hour, so 1,000 images take about three and a half hours. `--concurrency` above 2 buys nothing.

## The dry run

```bash
npm run seed:images -- --base-url https://visibible.com --dry-run
```

It reads which listed verses already have an image in the style (`--style`, default `classical`) from the [public image API](../context/PUBLIC-IMAGE-API.md), and prints verses, present, missing and projected cost per chapter, with totals. It needs no password, makes no login and no image. It takes about two minutes, because the public API admits 20 chapter reads a minute. The projection uses $0.045 an image; the provider's measured price is about $0.043 ([ADR 0012](../../docs/adr/0012-one-image-call-from-the-text.md)). With `--budget-usd` it also says how many images that budget covers.

There is no default site: `--base-url` must be the site's own origin (`https://visibible.com`, not `www`).

## The paid run

```bash
read -rs SEED_ADMIN_PASSWORD && export SEED_ADMIN_PASSWORD
npm run seed:images -- --base-url https://visibible.com --budget-usd 2 --limit 20
unset SEED_ADMIN_PASSWORD
```

The password is read only from `SEED_ADMIN_PASSWORD`. There is no flag for it, and it is never logged or written to the ledger. The login is tried once: five wrong passwords lock the address out for an hour, then longer.

Start with a small `--limit` and look at the images before funding the rest. Flags: `--style` (default `classical`), `--translation` (default `web`; saved Bible images carry the WEB text whatever is asked), `--limit` (verses this run; it does not narrow the dry run), `--concurrency` (default 2, at most 4), `--max-consecutive-failures` (default 5), `--redraw-unresolved` (see [Unresolved requests](#unresolved-requests)).

Only one paid run per site can hold the ledger. A second is refused and names the lock file, `output/seed-images/<site>/ledger.lock`; delete it only when no run is active (a killed run leaves it behind).

A verse is skipped when the site or the ledger shows it has an image in that style. Each chapter's saved images are read just before its first verse is drawn; that answer is cached for up to about six minutes, so a verse a reader drew moments earlier can still get a second image.

**The budget.** `--budget-usd` is the most the ledger for that site may hold, across runs. A request is sent only if the ledger's total, plus $0.10 for it and for each request in flight, stays within the budget, so a run stops with up to $0.10 unspent. $0.10 is the ceiling: above any quote the engine admits and more than twice the measured price. An image is counted at the provider's reported cost when the site passes one on, and at the ceiling otherwise: when the site reports only what it billed (which is the engine's own estimate), when a request failed after it was admitted, and when a request got no definite answer. The summary shows these as held at the ceiling. An image reported above the ceiling stops the run (`cost-above-ceiling`), because every reservation assumed the ceiling. To spend more later, raise `--budget-usd`.

## What stops a run

| Stop | Meaning |
| --- | --- |
| `complete` | Every listed verse has an image, or was tried. |
| `budget`, `limit` | The budget has no room for one more image, or `--limit` verses were tried. |
| `interrupted` | Ctrl-C. Requests in flight finish first; a second Ctrl-C quits at once. |
| `consecutive-failures` | Five attempts in a row, failed or declined, without an image. Read the last log lines before resuming. |
| `daily-limit`, `insufficient-credits`, `not-authorized` | The site refused the session (429 daily limit, 402, 401 or 403). An admin session has no daily limit and pays no credits, so these mean the session is not the owner's or image generation is off. |
| `rate-limited` | A rate limit did not lift after five waits. Something else is using the session's allowance. |
| `site-unreadable` | The saved images of the next chapter could not be read. Nothing is drawn on a guess. |
| `cost-above-ceiling` | The provider reported an image above $0.10. Find out why before running again; the budget's arithmetic assumes it cannot happen. |
| `ledger-error` | The ledger could not be written. Requests already sent finished; the command exits with the error. Repair the file or the disk first. |

A 429 rate limit is waited out by its `Retry-After` and the same request is sent again. A verse the site refused before admitting anything (a lookup that was down, a scene that could not be prepared) is tried once more in the same run. The summary counts declined scenes apart from failures, and failures by 402, 429, 5xx and other.

## Unresolved requests

A request is unresolved when it may have made an image and nothing the site said settled it: no answer after four re-sends under the same request id, a 5xx after the request was admitted, a success that could not be read, or any refusal that arrived after an earlier answer went missing. Re-sends keep the request id, which the site replays without paying twice; a new id is never used for such a request.

An unresolved request stays counted at $0.10, and its verse is left alone by every later run, because a missing image on the site is not proof: the request may still finish, and the public API answers from a cache. The run lists these verses. Look at them in the reader. Once the site shows the image, the verse is simply skipped. If one still has no image after ten minutes, draw it with `--redraw-unresolved`; its earlier $0.10 stays in the ledger.

## Stopping and resuming

Press Ctrl-C once and wait for the summary. Run the same command again to continue: verses already drawn are skipped and the ledger's spend counts against the budget. If a run was killed outright, delete its `ledger.lock`; the requests it had sent are counted at $0.10 each and their verses are [unresolved](#unresolved-requests).

## The ledger

`output/seed-images/<site>/ledger.ndjson`, outside git, one JSON line per event. Keep it: it is what makes a run resumable and what the budget counts.

- `start`: written before a request is sent, with `reference`, `style`, `requestId`, `attempt`.
- `result`: `outcome` (`rendered`, `declined`, `failed`, `unresolved`), HTTP `status`, `credits`, `usd`, `usdSource` (`provider` for the provider's reported usage, `ceiling` when it is not known, `none` when nothing was admitted), `durationMs` (the site's), `elapsedMs`, `imageId`, and `error`.

A line that is not JSON, or a result without an outcome or an amount, stops the next run before it sends anything.

```bash
L=output/seed-images/visibible.com/ledger.ndjson
jq -s '[.[] | select(.event == "result")] | group_by(.outcome) | map({outcome: .[0].outcome, count: length, usd: (map(.usd) | add)})' $L
jq -c 'select(.event == "result" and .outcome != "rendered") | {reference, outcome, status, error}' $L
```

## Afterwards

- Run the dry run again. The public API is cached for up to about six minutes, so recent images may not show at once.
- Open a few seeded verses in the reader (`https://visibible.com/john/1/1`) and judge the images.
- Compare the ledger's `usd` total with the OpenRouter key's activity for the same hours. Amounts held at the ceiling overstate what was charged: a rendered image held there cost about $0.04, and a request that failed may have cost nothing.
- Read the `declined` and `failed` rows. A scene declined as "Scene unavailable" also leaves an attention item ([owner corrections runbook](OWNER-CORRECTIONS.md)).
- Every owner render is in Convex's `adminAuditLog`; [Nostr](../context/NOSTR.md) posts at most one image per four-hour window when publishing is configured.
