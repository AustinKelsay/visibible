# Resetting the image library

[libraryReset.ts](../../convex/libraryReset.ts) empties a deployment's shared image library: every verse image with its full picture and thumbnail files, and every video job with its video file. The Nostr scheduler's state, which points at images, goes with them. It keeps reference sheets and style references, analysis, works, sessions, credits, quotes, invoices, image request records and bulk jobs.

It cannot be undone except from a backup, and it is the owner's decision each time.

## Run it

From a checkout without a `.env.local` (the Convex CLI's deployment flags break on a local one), back up first, files included:

```bash
CONVEX_DEPLOYMENT=dev:coordinated-shepherd-515 npx convex export --prod --include-file-storage --path output/backups/<date>/prod.zip
```

Check what would go with a dry run, then run pages of 50 until one reports `done: true`:

```bash
BEFORE=$(($(date +%s) * 1000))
npx convex run libraryReset:resetLibraryPage "{\"confirm\":\"delete every picture and video\",\"before\":$BEFORE,\"dryRun\":true}" --prod
while out=$(npx convex run libraryReset:resetLibraryPage "{\"confirm\":\"delete every picture and video\",\"before\":$BEFORE}" --prod); do
  echo "$out"; grep -q '"done": true' <<<"$out" && break
done
```

`before` is when the reset started: anything made after it is kept. A dry run counts up to 2,000 rows and says `truncated: true` if there are more. The loop stops on the first page that fails.

Use `--deployment <name>` instead of `--prod` for another deployment. A page refuses while a video is still being made; wait for it to finish. A picture saved during the reset is kept, because it was saved after `before`. A video counts from when it was requested, so one requested before `before` that finishes during the reset is still deleted; let running videos finish before the backup and the cutoff if they should be in the backup.

## Afterwards

- Old Nostr posts keep their image links, which stop loading once the files are deleted.
- `seed:images` counts its budget from its ledger (`output/seed-images/<site>/ledger.ndjson`); move the old ledger aside to start the budget again.
