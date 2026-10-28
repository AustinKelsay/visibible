# Forgiving pipeline: image re-check

This is the image half of the re-measurement the owner approved on 27 October 2026 ("Ok do 1 and 2 now! Reloading budget"). It re-checks the [26 October image check](../2026-10-26-image-check/RESULTS.md) blockers on the merged forgiving pipeline ([PR #279](https://github.com/AustinKelsay/visibible/pull/279)) with the new production Classical style reference. It measures only: no tuning, reruns or replacements follow from its results.

## What runs

All eight cases from 26 October: Numbers 3:39, Daniel 7:9, Exodus 16:15, Exodus 14:22, Luke 10:34, Exodus 40:34, Exodus 19:18 and Isaiah 6:1 ([plan.json](plan.json)). Each case is prepared once, cold, in a memory store seeded from one read-only production snapshot ([snapshot.json](snapshot.json)), which now includes the Classical style reference made on 27 October. A refused preparation stops that case before any image.

Each stored case renders classical twice, watercolor twice and icon once, with the references production would send. For the five cases where God appears or acts, one more classical image drops only the style reference (control). That is at most 45 images, at Nano Banana 2 Lite, 16:9, 1K. Full-size images stay in the ignored `evals/images/runs/2026-10-27-forgiving-image-check/` directory, with hashes committed.

## Scoring

Scoring is unchanged from 26 October: two independent blind model scorers ([SCORING.md](SCORING.md)), operator adjudication, and everything committed before unblinding. Blocker 1 clears only with zero no-form figures in production-like God-case images. Blocker 2 clears only if every Watercolor image is full-bleed and no stored case refuses for prompt length. This is not human acceptance.

## Money

The cap is **$2.00 within the evaluation allowance after the owner-approved $2.00 increase (to $21.50)**; this run's plan reserves the concurrent fresh re-measurement's full $0.25 cap. Expected cost is about $1.55 for 45 images. The production OpenRouter key returned 401 on 27 October, so the run uses the owner's working local key. No production writes, deployment or activation.

```sh
npx tsx llm/releases/2026-10-27-forgiving-image-check/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-27-forgiving-image-check/run.mts --execute
```
