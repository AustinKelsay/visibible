# No-form canon out of preparation: image check

This is the image half of the 27 October 2026 check of planner v14, look v2, review v12 and renderer v12 (the [ADR 0006 amendment](../../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md#amendment-no-canon-for-a-no-form-subject-anywhere-in-preparation)), decided by the operator under the owner's delegation ("ok continue. Your call on all of these"). The [v11 check](../2026-10-27-v11-image-check/RESULTS.md) traced its remaining God figures to plans that copied God's canon. The section look and planner now receive none.

Eight God-appearance cases are each prepared once, cold, from one read-only production snapshot. Three repeat the v11 figures (Daniel 7:9, Ezekiel 1:26, Isaiah 6:1). Sinai (Exodus 19:18) checks for regression. Four were never used for tuning: Revelation 4:2, Exodus 33:22, Exodus 34:5 and Numbers 12:5. Every case's section cast has a God entry. Each stored case renders Classical, Watercolor and Icon once each, at most 24 images. Classical and Icon send their style references; the Watercolor reference is stale and skipped. Scoring is unchanged: two independent blind scorers ([SCORING.md](SCORING.md)), operator adjudication, and everything committed before unblinding. The gate is predeclared in [plan.json](plan.json).

**Money:** a $0.94 cap. Together with the paired [text check](../2026-10-27-v12-fresh-check/README.md), it uses a $1.00 evaluation increase to $23.00. The run uses the owner's working local OpenRouter key. No production writes, deployment or activation.

```sh
npx tsx llm/releases/2026-10-27-v12-image-check/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-27-v12-image-check/run.mts --execute
```
