# Resetting the image library

[libraryReset.ts](../../convex/libraryReset.ts) empties a deployment's shared image library: every verse image with its full picture and thumbnail files, and every video job with its video file. The Nostr scheduler's state, which points at images, goes with them. It keeps reference sheets and style references, analysis, works, sessions, credits, quotes, invoices, image request records and bulk jobs.

It cannot be undone except from a backup, and it is the owner's decision each time.

## Run it

From a checkout without a `.env.local` (the Convex CLI's deployment flags break on a local one), back up first, files included:

```bash
CONVEX_DEPLOYMENT=dev:coordinated-shepherd-515 npx convex export --prod --include-file-storage --path output/backups/<date>/prod.zip
```

Check what would go (the dry run counts everything), then run pages of 50 until one reports `done: true`:

```bash
npx convex run libraryReset:resetLibraryPage '{"confirm":"delete every picture and video","dryRun":true}' --prod
ARGS='{"confirm":"delete every picture and video"}'
until npx convex run libraryReset:resetLibraryPage "$ARGS" --prod | grep -q '"done": true'; do :; done
```

Use `--deployment <name>` instead of `--prod` for another deployment. A page refuses while a video is still being made; wait for it to finish. An image being painted during the reset is saved after it, as a new picture.

## Afterwards

- Old Nostr posts keep their image links, which stop loading once the files are deleted.
- `seed:images` counts its budget from its ledger (`output/seed-images/<site>/ledger.ndjson`); move the old ledger aside to start the budget again.
