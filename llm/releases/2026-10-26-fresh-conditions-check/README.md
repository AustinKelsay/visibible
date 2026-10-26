# Moment conditions: broad fresh measurement

This is step 2 of the owner's 26 October 2026 instruction, "Ok do 1-3 end to end". It measures the merged pipeline on new random verses against the unchanged broad release standard. It is a measurement, not tuning: no prompt or code changes, restart or replacement follow from its results.

## What runs

The candidate is the merged pipeline at immutable commit `28b1d6e`: planner `moment-cast-v10` / `formless-effects-v10`, review `rendering-review-v8` and renderer `generic-v8`. There is no baseline arm. The previous pipeline's complete-packet results (3–4/30 acceptable, 0/7 retained) and the [step 1 diagnostic](../2026-10-26-moment-conditions-check/RESULTS.md) supply the context.

There are **30 cases**:

- **23 fresh verses** drawn uniformly with seed 2026102611, excluding all 146 moments sampled by earlier checks. They come from one read-only production snapshot with no replacements: [sample-set.json](sample-set.json).
- **7 standing retained cases** (`r001`, `r027`, `r034`, `r035`, `r059`, `r067`, `r074`) with their exact earlier snapshots.

Each case gets a cold memory store, the real preparation (section guide, plan, review and at most one re-plan), and reference-free text packets in classical, watercolor and icon. Any packet refusal counts as a refusal. Every first outcome is kept.

## Scoring and gate

Stored, renderable packets are seed-shuffled into opaque labels with stratum, version, review and outcome labels removed. Two model scorers independently label each packet acceptable, flawed or uncertain using the [criteria in plan.json](plan.json). The operator adjudicates disagreements and commits all three files before unblinding. This is not human acceptance.

The gate is the unchanged broad standard: **at least 22/23 fresh and 7/7 retained acceptable, zero flawed or uncertain stores**, and all 30 cases complete without a global stop. Refusal is never a repair.

## Money

The cap is **$0.20 within the existing $17.50 evaluation allowance, with $0 increase**. Before this run: measured $17.2435676, retained uncertainty $0.045, remaining $0.2114324. The adapter reserves $0.005 per request, allows at most 300 calls, and stops globally on provider errors, missing usage, request drift or cap exhaustion. Estimates are in [dry-run.json](dry-run.json). No images, production writes, deployment or activation.

```sh
npx tsx llm/releases/2026-10-26-fresh-conditions-check/dry-run.mts verify
npx tsx llm/releases/2026-10-26-fresh-conditions-check/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-26-fresh-conditions-check/run.mts --execute
npx tsx llm/releases/2026-10-26-fresh-conditions-check/score.mts packet
npx tsx llm/releases/2026-10-26-fresh-conditions-check/audit.mts finalize
```
