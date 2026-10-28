# Unseen presence: image check

This is the image half of the 27 October 2026 check of renderer v11 and planner v13 ([ADR 0006](../../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md)), decided by the operator under the owner's delegation ("ok continue. Your call on all of these"). It measures one blocker left by the [v10 image re-check](../2026-10-27-v10-image-check/RESULTS.md): God drawn as a figure in Sinai and throne scenes. The image prompt no longer carries the subject's canon, and plans show only witnesses, the place and plain effects.

Eight God-appearance cases are each prepared once, cold, from one read-only production snapshot. Four repeat v10 failures (Exodus 19:18, Isaiah 6:1, Daniel 7:9, Exodus 14:22). Four were never used for tuning (Ezekiel 1:26, 1 Kings 22:19, Exodus 24:10, Genesis 28:13). The 1 Kings 22:19 section has no God entry in its production cast, so it measures a cast gap and is reported separately. Each stored case renders Classical, Watercolor and Icon once each, at most 24 images. Classical and Icon send their style references; the Watercolor reference is stale and skipped. Scoring is unchanged: two independent blind scorers ([SCORING.md](SCORING.md)), operator adjudication, and everything committed before unblinding. The gate is predeclared in [plan.json](plan.json).

**Money:** a $0.94 cap. Together with the paired [text check](../2026-10-27-v11-fresh-check/README.md), it uses a $0.50 evaluation increase to $22.00. The run uses the owner's working local OpenRouter key. No production writes, deployment or activation.

```sh
npx tsx llm/releases/2026-10-27-v11-image-check/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-27-v11-image-check/run.mts --execute
```
