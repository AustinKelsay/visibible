# One scene description: fresh re-measurement

This is the re-measurement the owner approved on 27 October 2026 ("yes continue") of planner v12, review v10 and renderer v10, merged in [PR #281](https://github.com/AustinKelsay/visibible/pull/281) ([ADR 0005](../../../docs/adr/0005-one-scene-description-unnamed-presence.md)). It repeats the [forgiving re-measurement](../2026-10-27-forgiving-fresh-check/RESULTS.md) design on a new draw. It measures only: no prompt or code changes, restart or replacement follow from its results.

The candidate is `f013250`. It covers **23 fresh verses**, drawn with seed 2026102721 and excluding every earlier sample, plus the **7 standing retained cases**. Each case gets a cold memory store, the real preparation, and reference-free text packets in all three styles. Scoring is unchanged: two independent blind model scorers using [SCORING.md](SCORING.md), operator adjudication, and everything committed before unblinding. The gate is the unchanged broad standard (22/23 fresh, 7/7 retained, zero flawed or uncertain).

The plans no longer contain a separate `situation`, so the blind packet shows the five owner conditions only when the look is owner-written (none in this sample). Scorers judge setting and time from the scene fields.

**Money:** a $0.15 cap within the remaining $1.8612889 of the $21.50 evaluation allowance, with no increase. The run uses the owner's working local OpenRouter key. No images, production writes, deployment or activation.

```sh
npx tsx llm/releases/2026-10-27-v10-fresh-check/dry-run.mts verify
npx tsx llm/releases/2026-10-27-v10-fresh-check/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-27-v10-fresh-check/run.mts --execute
npx tsx llm/releases/2026-10-27-v10-fresh-check/score.mts packet
npx tsx llm/releases/2026-10-27-v10-fresh-check/audit.mts finalize
```
