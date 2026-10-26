# Unnamed presence: image re-check

This is the image half of the 27 October 2026 re-measurement ("yes continue") of renderer v10 ([PR #281](https://github.com/AustinKelsay/visibible/pull/281)). It re-checks the [forgiving image re-check](../2026-10-27-forgiving-image-check/RESULTS.md) blockers: God drawn as a figure, which renderer v10 now addresses by never naming or quoting the subject, and Watercolor margins, which the revised style wording addresses. It measures only.

The same eight cases are each prepared once, cold, from one read-only production snapshot. Each stored case renders classical twice, watercolor twice and icon once, at most 40 images. Classical and Icon send their style references. The Watercolor reference is stale against the revised style and is skipped, because a replacement failed the edge check six times. Scoring is unchanged: two independent blind scorers ([SCORING.md](SCORING.md)), operator adjudication, and everything committed before unblinding.

**Money:** a $1.65 cap within the remaining evaluation allowance, reserving the concurrent text run's $0.15 cap, with no increase. The run uses the owner's working local OpenRouter key. No production writes, deployment or activation.

```sh
npx tsx llm/releases/2026-10-27-v10-image-check/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-27-v10-image-check/run.mts --execute
```
