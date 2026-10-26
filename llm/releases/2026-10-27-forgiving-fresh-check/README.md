# Forgiving preparation: fresh re-measurement

This is the re-measurement the owner approved on 27 October 2026 ("Ok do 1 and 2 now! Reloading budget") of the forgiving preparation merged in [PR #279](https://github.com/AustinKelsay/visibible/pull/279) ([ADR 0004](../../../docs/adr/0004-forgiving-scene-preparation.md)). It repeats the [26 October fresh measurement](../2026-10-26-fresh-conditions-check/README.md) design on a new draw. It measures only: no prompt or code changes, restart or replacement follow from its results.

## What runs

The candidate is the merged pipeline at `71d0e24`: planner `moment-cast-v11` / `formless-effects-v11`, review `plan-review-v9` and renderer `generic-v9`. There is no baseline arm; the 26 October results (5/23 fresh, 1/7 retained, 16/30 refused) give the comparison, on a different draw.

There are **30 cases**:

- **23 fresh verses** drawn with seed 2026102711, excluding every moment sampled earlier (including the 26 October draw), from one read-only production snapshot: [sample-set.json](sample-set.json).
- **7 standing retained cases** with their exact earlier snapshots.

Each case gets a cold memory store, the real forgiving preparation and reference-free text packets in classical, watercolor and icon. Every first outcome is kept.

## Scoring and gate

Scoring is unchanged: two independent blind model scorers using [SCORING.md](SCORING.md), operator adjudication, and all files committed before unblinding. The results also count stored plans that carry review notes. The gate is the unchanged broad standard: **at least 22/23 fresh and 7/7 retained acceptable, with zero flawed or uncertain stores**.

## Money

The owner approved a budget top-up for this re-measurement. Evaluation rises by **$2.00 to $21.50** to cover this run and the paired image check. This run's cap is **$0.25**. Before it: measured $17.9781125, retained uncertainty $0.045. The production OpenRouter key returned 401 on 27 October, so the run uses the owner's working local key through the same private environment file pattern. No images, production writes, deployment or activation.

```sh
npx tsx llm/releases/2026-10-27-forgiving-fresh-check/dry-run.mts verify
npx tsx llm/releases/2026-10-27-forgiving-fresh-check/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-27-forgiving-fresh-check/run.mts --execute
npx tsx llm/releases/2026-10-27-forgiving-fresh-check/score.mts packet
npx tsx llm/releases/2026-10-27-forgiving-fresh-check/audit.mts finalize
```
