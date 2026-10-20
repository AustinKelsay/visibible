# Owner corrections runbook

`npm run works:correct -- <work-id> <command>` ([correct.mts](../../scripts/works/correct.mts), over [corrections.ts](../../src/lib/engine/corrections.ts)) is how the owner inspects and corrects a work's analysis after the fact. Every command runs with the deployment's server secret from `.env.local`; nothing here is reachable from a browser. Saved images and accounting are never changed by any command.

| Command | What it does |
| --- | --- |
| `attention [--closed]` | Lists open (or closed) attention items with reason, source (`checker` or `reader`), record, count, latest activity, detail and the image URL for sheets and style references. Checker reasons: `sheet_failed`, `style_reference_failed`, `canon_note`, `canon_check`, `quote_check_failed`, `unmatched_owner_edit`. Reader reports (`reader_report`) are listed apart and are never closed by an input change. |
| `inspect <entryId>` | The entry's current version and payload, its version history across generations, the sheet per stage with its pin state and URL, records that are stale against it, and its open attention. |
| `edit-stage <entryId> <stageId> --text "…" [--expect <version>]` | Writes an owner version of the entry with that stage's text replaced. The command names the version it saw (`--expect`, defaulting to the current one at read time); a newer current version makes it refuse as stale, while a retry of the same edit is harmless. Closes the entry's checker items as "source corrected" and prints the dependents (sheets, looks, plans) now stale. |
| `edit-look <sectionId> [--place …] [--time …] [--weather …] [--light …] [--clothing …] [--expect <version>]` | Writes an owner version of the section look; dependent plans show as stale and replan lazily. |
| `pin sheet\|style <recordId>`, `unpin …` | A pinned reference ignores staleness and cannot be replaced; unpinning restores the dependency check. |
| `redo-sheet <entryId:stageId>`, `redo-style <styleId>` | Remakes one reference through the normal check loop (owner-funded, three attempts); refuses a pinned one. Closes its checker items when it succeeds. |
| `redraft <entryId>` | Runs the canon step with `--redraft` and `--activate` for one entry; the store carries every owner version forward, so a redraft never overwrites an owner edit. |
| `clear-plan <momentId>` | Removes the moment's plan so the next image replans. Plans are never edited. |
| `dismiss <attentionId> [--disposition …]` | Closes one item with a disposition (`dismissed` by default; reader reports take `source corrected`, `isolated rendering error`, `accepted limitation` or `dismissed`). |
| `wipe [--including-owner] [--confirm-production]` | Deletes the work's generated analysis: records, generations, reference records and blobs, preparation claims and open checker items. Owner versions stay unless `--including-owner`, and the next activation carries them forward. The work becomes not ready. A deployment that looks like production needs `--confirm-production`; the mutation also requires the work id as confirmation. |

Corrections invalidate only actual dependents: a changed canon stage makes that entry's sheets, its sections' looks and their plans stale, and nothing else; nothing is regenerated until it is next needed or the owner reruns a preparation command. The analysis keeps every version, so the inputs behind a saved image stay inspectable after any correction ([Analysis storage](../context/ANALYSIS-STORAGE.md)).
