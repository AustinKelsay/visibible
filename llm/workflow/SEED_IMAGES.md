# Seeding images for the most-read chapters

`npm run seed:images` ([scripts/seed/images.mts](../../scripts/seed/images.mts) over [images.ts](../../src/lib/seed/images.ts)) gives the verses of the most-read chapters a saved image, so a first-time reader does not land on an empty stage. It makes each image through the site's own request path as the owner: a guest session, the admin login, then one `POST /api/generate-image` per verse ([image generation](../context/IMAGE-GENERATION.md)). Saved images are shared, so every reader sees them.

The chapters are in [chapters.ts](../../src/lib/seed/chapters.ts), highest priority first: 53 chapters, 1,410 verses. A run walks them in that order; the budget decides where it stops. Only the Bible is ever targeted: every request names `bible-web`, and `--work` accepts nothing else.

Nothing here authorizes spend. A paid run is the owner's decision, under the budget it names.

## Before a paid run

- The owner's approval as a dollar figure, and the production admin password.
- Provider balance for that figure. The images are paid from the site's OpenRouter key, whose balance and limit the tool cannot see; a key that runs dry shows up as five failures in a row.
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

Start with a small `--limit` and look at the images before funding the rest. Flags: `--style` (default `classical`), `--translation` (default `web`; saved Bible images carry the WEB text whatever is asked), `--limit` (verses this run; it does not narrow the dry run), `--concurrency` (default 2, at most 4), `--max-consecutive-failures` (default 5).

A verse is skipped when the site or the ledger shows it has an image in that style; it is never drawn twice. Each chapter's saved images are read just before its first verse is drawn.

**The budget.** `--budget-usd` is the most the ledger for that site may hold, across runs. A request is sent only if the ledger's total, plus $0.10 for it and for each request in flight, stays within the budget, so a run stops with up to $0.10 unspent rather than passing it. $0.10 is above any quote the engine admits. Each image is then counted at the provider's reported cost. A failure after the request was admitted (a 500, a timeout, no answer) reports no cost, so it stays counted at $0.10 and is shown as held at the ceiling. To spend more later, raise `--budget-usd`.

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

A 429 rate limit is waited out by its `Retry-After` and the same request is sent again. A failed verse is tried once more in the same run; a verse whose request got no definite answer is asked about again under the same request id, which the site replays without paying twice. The summary counts declined scenes apart from failures, and failures by 402, 429, 5xx and other.

## Stopping and resuming

Press Ctrl-C once and wait for the summary. Run the same command again to continue: verses already drawn are skipped and the ledger's spend counts against the budget. If a run was killed outright, the requests it had sent are counted at $0.10 each and their verses are checked on the site before anything is drawn.

## The ledger

`output/seed-images/<site>/ledger.ndjson`, outside git, one JSON line per event. Keep it: it is what makes a run resumable and what the budget counts.

- `start`: written before a request is sent, with `reference`, `style`, `requestId`, `attempt`.
- `result`: `outcome` (`rendered`, `declined`, `failed`), HTTP `status`, `credits`, `usd`, `usdSource` (`provider` for reported usage, `billed`, `ceiling` when nothing was reported, `none`), `durationMs` (the site's), `elapsedMs`, `imageId`, and `error`.

```bash
L=output/seed-images/visibible.com/ledger.ndjson
jq -s '[.[] | select(.event == "result")] | group_by(.outcome) | map({outcome: .[0].outcome, count: length, usd: (map(.usd) | add)})' $L
jq -c 'select(.event == "result" and .outcome != "rendered") | {reference, status, error}' $L
```

## Afterwards

- Run the dry run again. The public API is cached for up to about six minutes, so recent images may not show at once.
- Open a few seeded verses in the reader (`https://visibible.com/john/1/1`) and judge the images.
- Compare the ledger's `usd` total with the OpenRouter key's activity for the same hours. Amounts held at the ceiling were probably not charged.
- Read the `declined` and `failed` rows. A scene declined as "Scene unavailable" also leaves an attention item ([owner corrections runbook](OWNER-CORRECTIONS.md)).
- Every owner render is in Convex's `adminAuditLog`; [Nostr](../context/NOSTR.md) posts at most one image per four-hour window when publishing is configured.
