# Lean-engine snapshot, 10 November 2026

The first snapshot taken by `npm run evals:lean -- snapshot` ([lean.mts](../../../scripts/evals/lean.mts)), which replaces the exporter that left with `evals:suite` in PR #395. Use it as `--from` for the next suite run unless canon or sheets have changed since.

- **What it holds.** The 79 image cases of suite `2026-11-01-suite-v3`, each with its moment, its section and the canon of the section's whole cast, and the reference images production would consider: 337 records and 46 references (41 Bible, 5 Holmes; Alice's analysis is a committed fixture with no references). The blobs are in `evals/images/runs/2026-11-10-lean-snapshot/references` (ignored by git).
- **How it was taken.** 02:00 UTC, against production's active analysis generation (Bible and Holmes, generation 1): 419 read-only queries, no paid calls, no writes.
- **Checked against the 7 November snapshot** ([2026-11-07-suite-v3-text](../2026-11-07-suite-v3-text/README.md)), which the lean comparison used: every image case names the same moment, section and cast; every record either holds has the same version; every reference either holds has the same blob, byte for byte. The older one holds more because it also served the text tier's cases. Offline rehearsals from the two snapshots built the same 206 prompts and reference lists, byte for byte.
