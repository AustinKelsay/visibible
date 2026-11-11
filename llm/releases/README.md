# Release records

Each folder records one dated experiment or release check: its write-up (`README.md`, `RESULTS.md`, `REVIEW.md`) and its small result files, such as scores, keys and reports. [STATUS.md](STATUS.md) summarizes them, newest first. `npm run evals:lean` writes new runs here.

On 11 November 2026 the raw bulk of older runs was removed from the tree: provider traces, `results.ndjson`, images and contact sheets, snapshots, copied runner scripts and any JSON over 64 KB. Links to those files in older write-ups no longer resolve. Every file is still in git history; browse a folder as it was at [commit a984191](https://github.com/AustinKelsay/visibible/tree/a984191889da82d103b2678240f110d07b57a6f8/llm/releases), or restore one with `git checkout a984191 -- llm/releases/<folder>`.

These folders are kept whole (apart from runner scripts) because current workflows and tests read them:

- [2026-11-01-storybook-consistency](2026-11-01-storybook-consistency/README.md): the Bible's consistency release baseline (`report.json`).
- [2026-11-07-suite-v3-text](2026-11-07-suite-v3-text/README.md) and [2026-11-07-suite-v3-image](2026-11-07-suite-v3-image/README.md): the v3 suite baselines; the lean-engine golden test reads the text run's snapshot.
- [2026-11-09-lean-engine](2026-11-09-lean-engine/README.md): the lean-engine comparison behind ADR 0012.
- [2026-11-10-lean-snapshot](2026-11-10-lean-snapshot/README.md): the snapshot the [image eval runbook](../workflow/IMAGE_EVAL_AND_RELEASE.md) suggests reusing as `--from`.
- [2026-11-10-holmes-alice-snapshot-2](2026-11-10-holmes-alice-snapshot-2/): the snapshot the suite test checks consistency groups against.
- [2026-11-11-chat-admission](2026-11-11-chat-admission/README.md) and [2026-11-11-chat-model-comparison](2026-11-11-chat-model-comparison/README.md): the chat eval records; the chat code and tests cite the comparison's `guarded.txt`.
